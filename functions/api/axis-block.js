// POST /api/axis-block — Horaxis admin: block or unblock Axis for a customer or for one
// leaked licence (2026-10-01). Takes effect at once, including sessions already open,
// because every Axis request re-checks the block list.
//
// Body: { admin_password, action: "block" | "unblock" | "list",
//         customer?: "<customer code as in the licence>", licence_hash?: "<sha256 hex>" }
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

async function timingSafeEqual(a, b) {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(String(a))),
                                      crypto.subtle.digest("SHA-256", enc.encode(String(b)))]);
  const x = new Uint8Array(ha), y = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.SUPPORT_KV || !env.ADMIN_PASSWORD) return json({ error: "Not configured" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }
  if (!(await timingSafeEqual(body.admin_password || "", env.ADMIN_PASSWORD))) {
    return json({ error: "Invalid admin password" }, 401);
  }

  if (body.action === "list") {
    const out = [];
    let cursor;
    do {
      const page = await env.SUPPORT_KV.list({ prefix: "block:", cursor });
      for (const k of page.keys) out.push({ key: k.name, ...(await env.SUPPORT_KV.get(k.name, "json") || {}) });
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return json({ blocked: out });
  }

  const keys = [];
  if (body.customer) keys.push(`block:cust:${String(body.customer).trim().toLowerCase()}`);
  if (body.licence_hash && /^[0-9a-f]{64}$/.test(body.licence_hash)) keys.push(`block:lic:${body.licence_hash}`);
  if (!keys.length) return json({ error: "Give a customer code or a licence_hash" }, 400);

  if (body.action === "block") {
    const note = JSON.stringify({ blocked_at: new Date().toISOString(), reason: String(body.reason || "").slice(0, 300) });
    await Promise.all(keys.map((k) => env.SUPPORT_KV.put(k, note)));
    return json({ blocked: keys });
  }
  if (body.action === "unblock") {
    await Promise.all(keys.map((k) => env.SUPPORT_KV.delete(k)));
    return json({ unblocked: keys });
  }
  return json({ error: "action must be block, unblock or list" }, 400);
};
