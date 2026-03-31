// Horaxis Enterprise — Ticket Response Sender
// Cloudflare Pages Function
// Sends admin responses back to customer Horaxis instances

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

// Generate HMAC-SHA256 signature
async function signMessage(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );

  // Convert to base64
  return btoa(String.fromCharCode(...new Uint8Array(sigBuffer)));
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

  const { ticket_id, message, callback_url, admin_password } = body;

  // Validate required fields
  if (!ticket_id || !message || !callback_url || !admin_password) {
    return json({ error: "Missing required fields: ticket_id, message, callback_url, admin_password" }, 400);
  }

  // Verify admin password
  if (!env.ADMIN_PASSWORD || admin_password !== env.ADMIN_PASSWORD) {
    return json({ error: "Invalid admin password" }, 401);
  }

  // Verify secret is configured
  const secret = env.SUPPORT_JWT_SECRET;
  if (!secret) {
    return json({ error: "Support system not configured" }, 500);
  }

  // Build signed response payload
  const timestamp = Math.floor(Date.now() / 1000);
  const signedMessage = `${ticket_id}${message}${timestamp}`;
  const signature = await signMessage(signedMessage, secret);

  const payload = {
    ticket_id,
    message,
    signature,
    timestamp: String(timestamp),
  };

  // Return signed payload — the admin page browser will deliver it directly
  // (Cloudflare Workers can't reliably call Cloudflare Tunnel URLs)

  // Update ticket status in KV
  if (env.TICKETS) {
    try {
      const ticketRaw = await env.TICKETS.get(`ticket:${ticket_id}`);
      if (ticketRaw) {
        const ticket = JSON.parse(ticketRaw);
        ticket.status = "responded";
        ticket.responded_at = new Date().toISOString();
        ticket.last_response = message;
        await env.TICKETS.put(`ticket:${ticket_id}`, JSON.stringify(ticket));
      }
    } catch (e) {
      console.error("KV update error:", e);
    }
  }

  return json({ status: "signed", payload, callback_url });
};
