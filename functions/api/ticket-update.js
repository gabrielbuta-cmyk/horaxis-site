// Horaxis Enterprise — Ticket Update Receiver
// Cloudflare Pages Function
// Receives ticket updates (comments, status changes) from customer Horaxis instances

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

  const { ticket_id, update_type, comment_text, new_status, timestamp, signature } = body;

  // Validate required fields
  if (!ticket_id || !update_type || !timestamp || !signature) {
    return json({ error: "Missing required fields: ticket_id, update_type, timestamp, signature" }, 400);
  }

  // Check timestamp freshness (reject if older than 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return json({ error: "Request timestamp expired" }, 401);
  }

  // Verify HMAC-SHA256 signature: sign(ticket_id + update_type + timestamp)
  const secret = env.SUPPORT_JWT_SECRET;
  if (!secret) {
    return json({ error: "Support system not configured" }, 500);
  }

  const signedMessage = `${ticket_id}${update_type}${timestamp}`;
  const valid = await verifySignature(signedMessage, signature, secret);
  if (!valid) {
    return json({ error: "Invalid signature" }, 401);
  }

  // Update ticket in KV
  if (!env.TICKETS) {
    return json({ error: "KV storage not configured" }, 500);
  }

  try {
    const ticketRaw = await env.TICKETS.get(`ticket:${ticket_id}`);
    if (!ticketRaw) {
      return json({ error: "Ticket not found" }, 404);
    }

    const ticket = JSON.parse(ticketRaw);

    switch (update_type) {
      case "comment": {
        if (!comment_text) {
          return json({ error: "comment_text is required for comment updates" }, 400);
        }
        // Initialize comments array if it doesn't exist
        if (!Array.isArray(ticket.comments)) {
          ticket.comments = [];
        }
        ticket.comments.push({
          author: "Customer",
          message: comment_text,
          timestamp: new Date(Number(timestamp) * 1000).toISOString(),
        });
        break;
      }

      case "status_change": {
        if (!new_status) {
          return json({ error: "new_status is required for status_change updates" }, 400);
        }
        ticket.status = new_status;
        break;
      }

      case "closed": {
        ticket.status = "closed";
        break;
      }

      default:
        return json({ error: `Unknown update_type: ${update_type}` }, 400);
    }

    // Persist updated ticket
    await env.TICKETS.put(`ticket:${ticket_id}`, JSON.stringify(ticket));
  } catch (e) {
    console.error("KV update error:", e);
    return json({ error: "Failed to update ticket" }, 500);
  }

  return json({ status: "received" });
};
