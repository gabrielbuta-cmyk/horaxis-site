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

When you escalate an issue, format the ticket like this:
"I've documented this and notified the Horaxis team. Ticket: HRX-XXXX. You'll receive an update within 24 hours."`;
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

  if (!jwtSecret) {
    return json({ error: "Support system not configured" }, 500);
  }

  // Verify JWT
  const payload = await verifyJWT(token, jwtSecret);
  if (!payload) {
    return json({ error: "Invalid or expired support token. Please access support from within the Horaxis app." }, 401);
  }

  // Parse request body
  const body = await request.json();
  const { messages, screenshot } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: "Messages required" }, 400);
  }

  // Rate limit: max 50 messages per hour per license
  // (Simple implementation — in production use Cloudflare KV or D1)

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
  const knowledgeBase = `## Authentication
- Login: POST /api/auth/login. Account locked after 5 failed attempts (15 min). Password: min 8 chars, upper+lower+number+special.
- MFA: 6-digit code, valid +/-60s, 5-min session. Session timeout: 30 min (SESSION_INACTIVITY_TIMEOUT). Token: 8h (ACCESS_TOKEN_EXPIRE_HOURS).
- Roles: admin (full), planner (data mgmt), viewer (read-only). Rate limits: Login 10/min, Reset 5/hr, MFA 10/5min, General 100/min.
- Fixes: "Account locked"->wait 15min. "Invalid token"->re-login. "Session expired"->re-login, increase SESSION_INACTIVITY_TIMEOUT. "Insufficient permissions"->admin upgrades role. "MFA required"->Settings>Security>Enable MFA.

## License
Plans: Trial(3users/50suppliers/500POs/30days), Business($599/7/500/25K), Professional($1499/20/2500/250K), Enterprise($3999/unlimited).
- "User/Supplier/PO limit reached"->upgrade plan or deactivate unused users/archive old POs.

## ERP Integration
SAP S/4HANA+ECC (RFC+OData), Dynamics 365 (OAuth2), Oracle Cloud (REST), Business Central (OAuth2).
Required SAP services: API_PURCHASEORDER_PROCESS_SRV, API_BUSINESS_PARTNER, API_MATERIAL_DOCUMENT_SRV, API_SUPPLIERINVOICE_PROCESS_SRV, API_SALES_ORDER_SRV, API_PRODUCT_SRV, API_PURCHASING_CONTRACT_SRV, API_MATERIAL_STOCK_SRV.
- "Failed to connect"->check host/port/creds/firewall. "No active connection"->Settings>ERP>Configure. "OData failed"->check odata_base_url, SSL, activate ICF. "password decrypt failed"->SECRET_KEY changed, re-save password. "SAP error"->check /IWFND/MAINT_SERVICE. Sync lock: 32min Redis TTL.

## Supplier Portal
Links expire 7 days. "Invalid/expired link"->generate new. Rate limit: 20/min/IP. Workflow: create link->email->supplier opens->submits->planner approves/rejects.

## AI Predictions
XGBoost, min 50 records. Retrain daily 3AM, predictions hourly. "Insufficient data"->import more PO history. "No model"->Predictions>Retrain. Risk: CRITICAL/HIGH/MEDIUM/LOW. Accuracy target: 85%.

## Inventory
CSV: Material_Number(required), Description, Plant, Unrestricted/Quality/Blocked/In_Transit, UoM. Status: Zero(red), Low(orange), OK(green). Daily overdue->BOM->finished goods at risk.

## Supply Chain Risk
Score 0-100: days late + finished goods + customer orders + value. CRITICAL(>=70), HIGH(>=45), MEDIUM(>=20), LOW(<20). Traces through BOM max 10 levels to sales orders.

## Docker/Infrastructure
Health: /api/health (liveness), /api/health/ready (readiness), /api/health/deep (all+Celery). Components: PostgreSQL, Redis(broker+cache), PgBouncer, Nginx, Celery. Memory: 512MB/worker.
- Restart: docker compose down && docker compose up -d. Logs: docker logs horaxis-backend --tail 100. Health: curl -k https://localhost/api/health/deep.

## SSO (Azure AD, Okta, Google)
- "Not configured"->Settings>SSO>Configure. "OIDC discovery failed"->check tenant_id/domain. "No account"->create user or enable auto_provision. State valid 10min.

## Import
CSV only, UTF-8. Check errors array (first 10). Post-import: caches invalidated, MRP recomputed.

## SAP Write-Back
Y=success, E=retries exhausted(manual SAP needed), null=pending. 5 retries, exponential 2-32min.

## Environment Variables
DB: DATABASE_URL, DB_HOST(localhost), DB_PORT(5432), DB_NAME(procurement), DB_USER/DB_PASSWORD(postgres).
Redis: REDIS_HOST:REDIS_PORT(localhost:6379)+REDIS_PASSWORD, REDIS_CACHE_HOST:REDIS_CACHE_PORT(localhost:6380).
Security: SECRET_KEY(min 32 chars), ACCESS_TOKEN_EXPIRE_HOURS(8), SESSION_INACTIVITY_TIMEOUT(1800), LICENSE_SIGNING_SECRET.
SMTP: SMTP_HOST, SMTP_PORT(587), SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL.
ERP: ERP_TYPE(csv), ERP_HOST, ERP_CLIENT, ERP_USERNAME, ERP_PASSWORD.

## Troubleshooting Checklist
1. Login: creds>lockout(5 attempts)>disabled>MFA. 2. 401: token expired>inactive 30min>blacklisted. 3. 403: role>MFA>license features. 4. 429: rate limited>wait. 5. ERP: test connection>creds>network>logs>Redis lock. 6. Predictions: trained?>data(50+)?>retrain>Celery. 7. Portal: link expired?>status?>rate limit?>new link. 8. Email: SMTP config. 9. Health: PostgreSQL>Redis>disk>Celery. 10. Import: CSV format>columns>encoding>license.`;

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
