// Horaxis Admin — Delete ticket from KV
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
  const pwd = body.password || body.admin_password;

  if (!env.ADMIN_PASSWORD || pwd !== env.ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const { ticket_id } = body;
  if (!ticket_id) {
    return new Response(JSON.stringify({ error: "ticket_id required" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  if (env.TICKETS) {
    try {
      await env.TICKETS.delete(`ticket:${ticket_id}`);
      const indexRaw = await env.TICKETS.get("ticket:index");
      if (indexRaw) {
        const index = JSON.parse(indexRaw).filter(id => id !== ticket_id);
        await env.TICKETS.put("ticket:index", JSON.stringify(index));
      }
    } catch (e) {
      console.error("KV delete error:", e);
    }
  }

  return new Response(JSON.stringify({ status: "deleted" }), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
};
