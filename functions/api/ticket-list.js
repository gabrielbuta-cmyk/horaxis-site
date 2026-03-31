// Horaxis Admin — List tickets stored in KV
// POST /api/ticket-list (password protected)

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const body = await request.json();

  // Verify admin password
  if (!env.ADMIN_PASSWORD || body.password !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Get tickets from KV
  let tickets = [];
  if (env.TICKETS) {
    try {
      const indexJson = await env.TICKETS.get("ticket_index");
      if (indexJson) {
        const ticketIds = JSON.parse(indexJson);
        for (const id of ticketIds) {
          const ticketJson = await env.TICKETS.get(`ticket:${id}`);
          if (ticketJson) {
            tickets.push(JSON.parse(ticketJson));
          }
        }
        // Sort by received_at descending (newest first)
        tickets.sort((a, b) => new Date(b.received_at) - new Date(a.received_at));
      }
    } catch (e) {
      console.error("Failed to read tickets from KV:", e);
    }
  }

  return new Response(JSON.stringify({ tickets }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
};
