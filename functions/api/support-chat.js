// Horaxis Enterprise — Support Chat API
// Cloudflare Pages Function
// Verifies JWT from Horaxis app, streams Claude responses

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Licence verification (Ed25519).
//
// The shared HMAC secret below has a distribution problem: it must exist in the
// customer's .env AND here, it ships blank in .env.template (so Ask Axis has
// never worked at a customer install), and one value for everyone means a leak
// rotates every customer at once.
//
// A Horaxis licence is already a customer-specific credential signed by us with
// a key we never ship. Verifying it here needs only the PUBLIC key, so there is
// nothing per-customer to generate, distribute or store — and an expired
// licence loses support access on its own.
const LICENSE_PUBLIC_KEY_HEX =
  "db01f095fd4ad77bd1eeaf4f2922646053b87f12a825fe0657c791b108ac041e";

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function verifyLicence(blob) {
  try {
    const [payloadB64, sigB64] = blob.split(".");
    if (!payloadB64 || !sigB64) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      Uint8Array.from(LICENSE_PUBLIC_KEY_HEX.match(/../g), (h) => parseInt(h, 16)),
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    // The signature covers the payload JSON as it was signed, not the base64.
    const payloadBytes = b64urlToBytes(payloadB64);
    const ok = await crypto.subtle.verify("Ed25519", key, b64urlToBytes(sigB64), payloadBytes);
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (claims.expires_at && new Date(claims.expires_at) < new Date()) return null;
    return {
      customer_id: claims.customer_code || "unknown",
      company: claims.customer_code || "unknown",
      license: claims.plan || "licensed",
      version: String(claims.version || ""),
      via: "licence",
    };
  } catch (e) {
    return null;
  }
}

// Per-customer quota. Costs roughly EUR 0.01 per message, so this exists to stop
// a runaway loop or a leaked credential running up an unbounded bill, not to
// ration support. A real troubleshooting session is 10-20 messages.
const MONTHLY_QUOTA = { site: 300, small: 750, network: 2000, large: 4000, group: 8000 };
const DEFAULT_MONTHLY = 300;
const HOURLY_BURST = 30;

async function checkQuota(env, customerId, plan) {
  // No KV bound yet -> allow, so enabling the binding is what turns this on and
  // a misconfiguration cannot silently lock every customer out of support.
  if (!env.SUPPORT_KV) return { allowed: true, note: "no KV bound" };
  const month = new Date().toISOString().slice(0, 7);
  const hour = new Date().toISOString().slice(0, 13);
  const mKey = `q:${customerId}:${month}`;
  const hKey = `b:${customerId}:${hour}`;
  const [mRaw, hRaw] = await Promise.all([env.SUPPORT_KV.get(mKey), env.SUPPORT_KV.get(hKey)]);
  const used = parseInt(mRaw || "0", 10);
  const burst = parseInt(hRaw || "0", 10);
  const limit = MONTHLY_QUOTA[plan] || DEFAULT_MONTHLY;
  if (burst >= HOURLY_BURST) {
    return { allowed: false, reason: `Too many messages this hour (${HOURLY_BURST}). Please wait, or create a support ticket.` };
  }
  if (used >= limit) {
    return { allowed: false, reason: `Monthly support-chat limit reached (${limit}). Create a support ticket and the Horaxis team will follow up.` };
  }
  // 40 days / 2 hours: long enough to outlive the window, short enough to expire.
  await Promise.all([
    env.SUPPORT_KV.put(mKey, String(used + 1), { expirationTtl: 3456000 }),
    env.SUPPORT_KV.put(hKey, String(burst + 1), { expirationTtl: 7200 }),
  ]);
  return { allowed: true, used: used + 1, limit };
}

// Simple JWT verification (HS256)
async function verifyJWT(token, secret) {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    // Verify signature
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid) return null;

    // Decode payload
    const payload = JSON.parse(
      atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"))
    );

    // Check expiry
    if (payload.exp && payload.exp < Date.now() / 1000) return null;

    return payload;
  } catch (e) {
    return null;
  }
}

// System prompt with knowledge base (loaded from env or inline)
function getSystemPrompt(knowledgeBase) {
  return `You are the Horaxis Enterprise technical support assistant. You help customers troubleshoot issues with their on-premise Horaxis Enterprise deployment.

IMPORTANT RULES:
- NEVER say there is a "bug in the code" or "code issue" or "error in the backend". Instead say "I've identified the issue" and provide a fix or workaround.
- If you identify a code-level bug that requires a patch, say: "This is a known issue that will be resolved in the next update. In the meantime, here's a workaround..."
- If you cannot resolve the issue, say: "I was unable to resolve this issue. Please create a support ticket using the button below so the Horaxis team can investigate and follow up with a fix."
- NEVER say you created a ticket, documented the issue, or notified anyone. You cannot do any of that. The customer must create the ticket themselves.
- NEVER generate fake ticket numbers like HRX-1234. You have no ticket system access.
- NEVER say the Horaxis team can access customer logs, systems, or data. Horaxis is on-premise — the team has ZERO access to customer infrastructure.
- Be direct, helpful, and concise. No corporate fluff.
- When a customer shares a screenshot, analyze it carefully for error messages, empty states, broken UI elements, or incorrect data.
- Guide customers through configuration fixes (.env changes, Docker commands, ERP settings) step by step.
- Never suggest the customer edit source code files inside Docker containers.

PRODUCT OVERVIEW:
Horaxis Enterprise is an AI-powered procurement risk intelligence platform deployed on-premise via Docker. It connects to SAP S/4HANA, SAP ECC, Oracle, and Dynamics 365 via OData.

ARCHITECTURE:
- Backend: FastAPI (Python 3.11) with Gunicorn + Uvicorn workers
- Frontend: React + Nginx
- Database: PostgreSQL 15 with PgBouncer connection pooler
- Cache: Redis 7 (two instances: broker for Celery tasks, cache for app)
- Task Queue: Celery with dedicated workers (default, ML, ERP/email)
- ML: scikit-learn + XGBoost for delivery prediction
- Reverse Proxy: Nginx with SSL termination

COMMON ISSUES AND FIXES:

${knowledgeBase}

ESCALATION:
You cannot create tickets. When an issue needs the Horaxis team, tell the customer
to click the "Create Support Ticket" button and list exactly what to include
(symptom, error text, screenshot, when it started). Never state or imply that a
ticket exists, that anyone has been notified, or that a fix is scheduled.`;
}

export const onRequest = async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Get token from Authorization header
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json({ error: "Unauthorized — valid support token required" }, 401);
  }

  const token = authHeader.replace("Bearer ", "");
  const jwtSecret = env.SUPPORT_JWT_SECRET;

  // No hard failure when the shared secret is absent: a licence-bearing request
  // does not need it, and this is exactly the case that never worked before.

  // Verify JWT
  // Two credentials accepted during the transition: a signed licence (preferred,
  // nothing to distribute) or the legacy shared-secret JWT. The legacy path stays
  // until every install is on a licence, so deploying this cannot break anyone.
  let payload = await verifyLicence(token);
  if (!payload && jwtSecret) {
    payload = await verifyJWT(token, jwtSecret);
  }
  if (!payload) {
    return json({ error: "Invalid or expired support token. Please access support from within the Horaxis app." }, 401);
  }

  const quota = await checkQuota(env, payload.customer_id || "unknown", payload.license);
  if (!quota.allowed) {
    return json({ error: quota.reason }, 429);
  }

  // Parse request body
  const body = await request.json();
  const { messages, screenshot } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: "Messages required" }, 400);
  }

  // Quota is enforced above, in checkQuota, before any spend on the model.

  // Build Claude messages
  const claudeMessages = messages.map((msg) => {
    if (msg.screenshot) {
      return {
        role: msg.role,
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: msg.screenshot,
            },
          },
          { type: "text", text: msg.content || "Please analyze this screenshot and help me troubleshoot the issue." },
        ],
      };
    }
    return { role: msg.role, content: msg.content };
  });

  // Knowledge base — embedded directly for reliability
  const knowledgeBase = `## Container and command reference (EXACT names — never guess)
Containers in a standard install: procurement-api, procurement-celery-beat, procurement-celery-worker-default, procurement-celery-worker-erp-email, procurement-celery-worker-ml, procurement-db, procurement-frontend, procurement-nginx, procurement-pgbouncer, procurement-redis-broker, procurement-redis-cache, procurement-ssl-init
Backend/API: procurement-api   Database: procurement-db   Frontend: procurement-frontend
Celery workers: procurement-celery-beat, procurement-celery-worker-default, procurement-celery-worker-erp-email, procurement-celery-worker-ml
- Backend logs:   docker logs procurement-api --tail 200
- Worker logs:    docker logs procurement-celery-worker-default --tail 200
- Restart all:    docker compose down && docker compose up -d
- Health (deep):  curl -k https://localhost/api/health/deep
There is NO container called "horaxis-backend". If a customer reports
"No such container", they were given a wrong name — correct it and apologise.

## What you can and cannot see (HARD RULE)
Horaxis Enterprise is on-premise. Horaxis staff have ZERO access to customer
systems, databases, logs, or data — no exceptions, no "on their end". Never say
or imply that anyone will look at their logs, has looked, or can. Everything you
need must be pasted in by the customer. Say so plainly when you ask for it.

## Licensing
Licences are Ed25519-signed blobs issued by Horaxis and installed in the app.
The app verifies with an embedded public key; entitlements come from the
verified signature, not from the database, so editing the database changes
nothing. An invalid or missing licence does NOT lock the app — it falls back to
trial limits, and the reason is shown in the licence status.
Scope: a licence covers a number of plants (organisational scope). Users,
purchase orders and suppliers are NOT capped.
- "Invalid license signature" -> the key was edited, or it was issued for a
  different product. Ask them to re-paste it exactly as delivered.
- "License expired" -> the app keeps working; renewal is a commercial matter.
- NEVER quote prices or plan names. Licensing and pricing questions go to
  Horaxis: the customer should create a ticket or email their contact.

## Authentication
- Login: POST /api/auth/login. Account locks after 5 failed attempts for 15 min.
  Password: min 8 chars, upper + lower + number + special.
- MFA: 6-digit TOTP, +/-60s tolerance. MFA is REQUIRED for admin accounts when
  MFA_REQUIRED_FOR_ADMIN=true — first login forces enrolment before access.
- Roles: admin (full), planner (data management), viewer (read-only).
- Fixes: "Account locked" -> wait 15 min. "Session expired" -> re-login, or
  raise SESSION_INACTIVITY_TIMEOUT. "Insufficient permissions" -> an admin
  changes the role. "MFA required" -> Settings > Security > Enable MFA.

## SAP integration
Supported: SAP S/4HANA and ECC (OData, plus RFC where the connector is
installed), Dynamics 365 (OAuth2), Oracle Cloud (REST), Business Central.
Required OData services: API_PURCHASEORDER_PROCESS_SRV, API_BUSINESS_PARTNER,
API_MATERIAL_DOCUMENT_SRV, API_SUPPLIERINVOICE_PROCESS_SRV, API_SALES_ORDER_SRV,
API_PRODUCT_SRV, API_PURCHASING_CONTRACT_SRV, API_MATERIAL_STOCK_SRV,
API_BILL_OF_MATERIAL_SRV, API_INFORECORD_PROCESS_SRV.
- HTTP 403 from the SAP gateway is ambiguous: not activated, not published, not
  permitted, or the service name does not exist all return /IWFND/MED/170.
  Check /IWFND/MAINT_SERVICE in SAP before assuming a permissions problem.
- "Failed to connect" -> host, port, client, credentials, firewall.
- "Password decrypt failed" -> SECRET_KEY changed; re-enter the ERP password.
- Only one sync runs per customer at a time. It is held with a PostgreSQL
  advisory lock on a direct connection (NOT through PgBouncer, and NOT a Redis
  TTL). If syncs are refused as already running, check that DB_DIRECT_HOST and
  DB_DIRECT_PORT point at PostgreSQL directly, and see preflight section 7.
- Org codes (plant, company code, purchasing org) are character keys. Leading
  zeros are significant and are never stripped.
- Deleted SAP lines: a PO line removed in SAP is kept for traceability, marked
  as no longer in SAP, and excluded from counts. It is not deleted locally.

## SAP write-back
Confirmed working against S/4HANA 2025: delivery-date and quantity changes are
written back to the purchase order. Status: Y = success, E = retries exhausted
(needs manual action in SAP), null = still pending. 5 retries with exponential
backoff, 2 to 32 minutes.
- PO cancellation write-back is NOT verified end-to-end. If a customer asks
  whether cancelling in Horaxis cancels in SAP, say it is not confirmed and
  they should verify in SAP.

## Predictions
Gradient-boosted model over historical purchase-order delivery outcomes.
Minimum 50 delivered records to train. Retrain runs daily; predictions refresh
hourly. Risk levels: CRITICAL, HIGH, MEDIUM, LOW.
- "Insufficient data" -> import more PO history with actual delivery dates.
- "No model" -> Predictions > Retrain.
- All predictions HIGH/CRITICAL is usually correct, not a bug: if most open
  lines are already past their delivery date, high risk is the right answer.
  Check the delivery dates before treating it as a defect.
- Predictions run in the ML Celery worker. If nothing appears, check that
  worker is up before anything else — a task added without restarting the
  workers will never run, because workers cache the task list at startup.

## Supply chain risk and scope
Risk score 0-100 from days late, finished goods at risk, customer orders
affected and value. CRITICAL >= 70, HIGH >= 45, MEDIUM >= 20, LOW < 20.
Traces through the bill of materials up to 10 levels to reach sales orders.
Facts are shown separately from forecasts: confirmed lateness is presented as
fact, model output as forecast. A PO that is on time counts as on track.
Users only see the company codes and plants their licence and their user scope
allow. "Data missing" is often scope, not loss — check the scope selector.

## Supplier portal, inventory, imports
- Portal links expire after 7 days. "Invalid/expired link" -> generate a new
  one. Workflow: create link -> email -> supplier submits -> planner approves.
- Inventory CSV: Material_Number (required), Description, Plant, Unrestricted,
  Quality, Blocked, In_Transit, UoM. Status: Zero (red), Low (orange), OK.
- Imports are CSV, UTF-8. The response lists the first errors; caches are
  invalidated and MRP recomputed afterwards.

## Health and infrastructure
Endpoints: /api/health (liveness), /api/health/ready (readiness),
/api/health/deep (all components including Celery).
Stack: PostgreSQL 15, PgBouncer, Redis 7 (separate broker and cache), Celery
workers and beat, FastAPI backend, React frontend, Nginx with SSL.
- The SSL certificate is generated per install on first start; none is shipped.
- Nginx resolves backend and frontend names at request time, so recreating a
  container does not require an nginx restart.
- A read-only SAP preflight image can be run BEFORE installing the product to
  confirm connectivity and service activation.

## Settings (.env)
- ADMIN_EMAIL (default: admin@yourcompany.com)
- ADMIN_PASSWORD
- DB_PASSWORD
- REDIS_PASSWORD
- REDIS_CACHE_PASSWORD
- SECRET_KEY
- LICENSE_KEY (default: TRIAL-0000-0000-0000)
- COMPANY_NAME (default: Your Company Name)
- HTTPS_PORT (default: 443)
- HTTP_PORT (default: 80)
- INTERNAL_URL (default: https://localhost)
- SUPPLIER_PORTAL_URL (default: https://localhost)
- CORS_ORIGINS (default: https://localhost)
- SMTP_HOST (default: smtp.gmail.com)
- SMTP_PORT (default: 587)
- SMTP_USERNAME (default: your-email@gmail.com)
- SMTP_PASSWORD (default: your-app-password)
- SMTP_FROM_EMAIL (default: noreply@yourcompany.com)
- SMTP_FROM_NAME (default: ProcureAI)
- ERP_TYPE (default: csv)
- METEOSOURCE_KEY
- ALPHAVANTAGE_KEY
- AISSTREAM_KEY
- METALS_DEV_KEY
- EIA_KEY
- GDELT_CLOUD_KEY
- ALGORITHM (default: HS256)
- ACCESS_TOKEN_EXPIRE_HOURS (default: 8)
- MFA_REQUIRED_FOR_ADMIN (default: true)
- RATE_LIMIT_PER_MINUTE (default: 100)
- LOGIN_RATE_LIMIT_PER_MINUTE (default: 10)
- PASSWORD_RESET_RATE_LIMIT_PER_HOUR (default: 5)
- SUPPLIER_PORTAL_RATE_LIMIT_PER_MINUTE (default: 20)
- DB_NAME (default: procurement)
- DB_DIRECT_HOST (default: postgres)
- DB_DIRECT_PORT (default: 5432)
- DB_USER (default: postgres)
- LOG_LEVEL (default: INFO)
- SAP_RFC_SDK_PATH
- SUPPORT_NOTIFICATION_EMAIL
- SUPPORT_JWT_SECRET
- SSL_COMMON_NAME (default: localhost)

## API surface
/api/analytics, /api/archives, /api/asn, /api/audit-logs, /api/auth, /api/auth/sso, /api/blanket-pos, /api/bom, /api/branding, /api/contracts, /api/data-health, /api/dlq, /api/erp, /api/exports, /api/external-factors, /api/imports, /api/inventory, /api/invoices, /api/license, /api/notifications, /api/overdue-alerts, /api/predictions, /api/procurement-intelligence, /api/purchase-orders, /api/sap, /api/schedule-lines, /api/scope, /api/settings, /api/setup, /api/sod, /api/spend-analytics, /api/supplier-assignments, /api/supplier-links, /api/supplier-updates, /api/suppliers, /api/supply-chain-risks, /api/support, /api/system, /api/users, /api/webhooks

## Troubleshooting order
1. Reproduce: exact page, exact error text, screenshot.
2. /api/health/deep — is anything down, especially Celery workers?
3. Backend logs for the real error; a 500 in the UI hides it.
4. Scope — is the data actually missing, or outside the selected plant?
5. Licence status — is it valid, and does it cover that plant?
6. ERP — test connection, then check the SAP gateway service is active.
7. If none of that resolves it, tell them to raise a ticket with the logs and
   screenshot attached. Do not guess at a code-level cause.`;

  // Call Claude API (streaming)
  const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      temperature: 0,
      system: getSystemPrompt(knowledgeBase),
      messages: claudeMessages,
    }),
  });

  if (!claudeResponse.ok) {
    const err = await claudeResponse.text();
    console.error("Claude API error:", err);
    return json({ error: "Support system temporarily unavailable. Please try again or email support@horaxis.com" }, 502);
  }

  const claudeData = await claudeResponse.json();
  const responseText = claudeData.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  // Check if escalation was triggered (bot created a ticket)
  if (responseText.includes("HRX-")) {
    // Send notification email to Horaxis team
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Horaxis Support Bot <support@horaxis.com>",
          to: ["support@horaxis.com"],
          subject: `SUPPORT ESCALATION — ${payload.company || "Unknown"} (License: ${payload.license || "N/A"})`,
          html: `
            <h2>Support Bot Escalation</h2>
            <p><strong>Customer:</strong> ${payload.company || "Unknown"}</p>
            <p><strong>License:</strong> ${payload.license || "N/A"}</p>
            <p><strong>Version:</strong> ${payload.version || "Unknown"}</p>
            <p><strong>User:</strong> ${payload.email || "Unknown"}</p>
            <hr>
            <h3>Conversation:</h3>
            ${messages.map((m) => `<p><strong>${m.role}:</strong> ${m.content || "[screenshot]"}</p>`).join("")}
            <hr>
            <h3>Bot Response (with escalation):</h3>
            <p>${responseText}</p>
          `,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send escalation email:", emailErr);
    }
  }

  return json({
    response: responseText,
    usage: claudeData.usage,
  });
};
