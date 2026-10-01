// GET /api/axis-session — what the Axis page shows about the current session (2026-10-01).
// Counts and names only; the licence never leaves KV (only its hash is there anyway).
import { getSession, SESSION_SECONDS } from "../../lib/axis.js";

export const onRequestGet = async ({ request, env }) => {
  const s = await getSession(request, env);
  if (!s) {
    return new Response(JSON.stringify({ error: "no session" }), {
      status: 401, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  const left = Math.max(0, Math.round((s.created + SESSION_SECONDS * 1000 - Date.now()) / 60000));
  return new Response(JSON.stringify({
    product: s.product, customer: s.customer, plan: s.plan, minutes_left: left,
  }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
};
