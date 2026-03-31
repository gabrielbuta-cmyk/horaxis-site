// Horaxis Enterprise — Ticket Notification Receiver
// Cloudflare Pages Function
// Receives ticket notifications from customer Horaxis instances

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// HMAC-SHA256 signature verification
async function verifySignature(message, signature, secret) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = Uint8Array.from(
      atob(signature.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0)
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      new TextEncoder().encode(message)
    );
  } catch (e) {
    return false;
  }
}

export const onRequest = async (context) => {
  const { request, env } = context;

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Parse request body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { ticket_id, subject, description, priority, category, version, callback_url, signature, timestamp } = body;

  // Validate required fields
  if (!ticket_id || !subject || !signature || !timestamp) {
    return json({ error: "Missing required fields: ticket_id, subject, signature, timestamp" }, 400);
  }

  // Check timestamp freshness (reject if older than 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > 300) {
    return json({ error: "Request timestamp expired" }, 401);
  }

  // Verify HMAC-SHA256 signature
  const secret = env.SUPPORT_JWT_SECRET;
  if (!secret) {
    return json({ error: "Support system not configured" }, 500);
  }

  const signedMessage = `${ticket_id}${subject}${timestamp}`;
  const valid = await verifySignature(signedMessage, signature, secret);
  if (!valid) {
    return json({ error: "Invalid signature" }, 401);
  }

  // Build ticket record
  const ticket = {
    ticket_id,
    subject,
    description: description || "",
    priority: priority || "normal",
    category: category || "general",
    version: version || "unknown",
    callback_url: callback_url || null,
    timestamp,
    received_at: new Date().toISOString(),
    status: "open",
  };

  // Store in KV if available, otherwise log
  if (env.TICKETS) {
    try {
      // Store individual ticket
      await env.TICKETS.put(`ticket:${ticket_id}`, JSON.stringify(ticket));

      // Maintain ticket index (list of IDs)
      const indexRaw = await env.TICKETS.get("ticket:index");
      const index = indexRaw ? JSON.parse(indexRaw) : [];
      if (!index.includes(ticket_id)) {
        index.unshift(ticket_id);
        // Keep last 500 tickets in index
        if (index.length > 500) index.length = 500;
        await env.TICKETS.put("ticket:index", JSON.stringify(index));
      }
    } catch (e) {
      console.error("KV storage error:", e);
    }
  } else {
    console.log("Ticket received (no KV configured):", JSON.stringify(ticket));
  }

  // Send email notification via Resend
  if (env.RESEND_API_KEY) {
    try {
      const priorityLabel = {
        critical: "CRITICAL",
        high: "HIGH",
        normal: "NORMAL",
        low: "LOW",
      }[priority] || "NORMAL";

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Horaxis Support <support@horaxis.com>",
          to: ["support@horaxis.com"],
          subject: `[${priorityLabel}] New Ticket ${ticket_id}: ${subject}`,
          html: `
            <div style="font-family:sans-serif; background:#f1f5f9; padding:40px;">
              <div style="background:#ffffff; max-width:600px; margin:0 auto; border-radius:4px; overflow:hidden; border:1px solid #e2e8f0;">
                <div style="background:#0f172a; padding:20px; text-align:center;">
                  <span style="color:#fff; font-size:18px; font-weight:700;">Horaxis Support</span>
                </div>
                <div style="padding:30px;">
                  <h2 style="margin-top:0; color:#0f172a;">New Support Ticket</h2>
                  <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
                  <p><strong>Ticket ID:</strong> ${ticket_id}</p>
                  <p><strong>Subject:</strong> ${subject}</p>
                  <p><strong>Priority:</strong> <span style="color:${priority === "critical" ? "#dc2626" : priority === "high" ? "#ea580c" : "#64748b"}">${priorityLabel}</span></p>
                  <p><strong>Description:</strong> ${description || "No description"}</p>
                  <p><strong>Category:</strong> ${category || "General"}</p>
                  <p><strong>Version:</strong> ${version || "Unknown"}</p>
                  <p><strong>Received:</strong> ${ticket.received_at}</p>
                  <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
                  <p style="color:#64748b; font-size:12px;">Respond via the <a href="https://horaxis.com/admin">Admin Panel</a></p>
                </div>
              </div>
            </div>
          `,
        }),
      });
    } catch (emailErr) {
      console.error("Failed to send ticket notification email:", emailErr);
    }
  }

  return json({ status: "received" });
};
