// Axis access gate (2026-10-01) — shared by the middleware, /support/start and the
// Axis APIs.
//
// The Axis page is reachable ONLY from inside a licensed installation:
//   1. The app POSTs its signed licence to /support/start (never in a URL, so it is
//      not in browser history, proxy logs or a Referer header).
//   2. We verify the Ed25519 signature with the product's PUBLIC key, check expiry and
//      the block list, and open a 2-hour session: a random id in an HttpOnly cookie,
//      the details in KV. The cookie is new on every visit.
//   3. /support (and /support.html) answer 404 to anyone without a live session.
//
// Each product signs its licences with its own key, so the key that verifies a licence
// also tells us which product it is — and which knowledge base Axis answers from.

const HORAXIS_PUBLIC_KEY_HEX = "db01f095fd4ad77bd1eeaf4f2922646053b87f12a825fe0657c791b108ac041e";
const RISKGUARD_PUBLIC_KEY_HEX = "f62c94d9cf9cc5bba3b0eb2df659051b9e50765d7a5a643e30ad142aa933addd";

export const SESSION_COOKIE = "axis_sid";
export const SESSION_SECONDS = 2 * 60 * 60;

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function hexToBytes(hex) {
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyWith(keyHex, blob) {
  // Trimmed (licences pasted from e-mail carry whitespace) and split on the FIRST dot
  // only, exactly like the products' own verifiers.
  const s = String(blob || "").trim();
  const dot = s.indexOf(".");
  if (dot <= 0) return null;
  const payloadB64 = s.slice(0, dot), sigB64 = s.slice(dot + 1);
  if (!payloadB64 || !sigB64) return null;
  const key = await crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "Ed25519" }, false, ["verify"]);
  // The signature covers the payload JSON bytes as signed, not the base64.
  const payloadBytes = b64urlToBytes(payloadB64);
  const ok = await crypto.subtle.verify("Ed25519", key, b64urlToBytes(sigB64), payloadBytes);
  if (!ok) return null;
  return JSON.parse(new TextDecoder().decode(payloadBytes));
}

// Returns {product, customer, plan, expires} for a valid, unexpired licence, else null.
export async function verifyLicence(blob) {
  try {
    const hx = await verifyWith(HORAXIS_PUBLIC_KEY_HEX, blob);
    if (hx) {
      if (hx.expires_at && new Date(hx.expires_at) < new Date()) return null;
      return { product: "horaxis", customer: String(hx.customer_code || "unknown"),
               plan: String(hx.plan || "licensed"), expires: hx.expires_at || null };
    }
    const rg = await verifyWith(RISKGUARD_PUBLIC_KEY_HEX, blob);
    if (rg) {
      // RiskGuard expiry is a date: valid through the end of that day (UTC).
      if (rg.expires && new Date(rg.expires + "T23:59:59Z") < new Date()) return null;
      if (!["org", "plant", "user"].includes(rg.edition)) return null;
      return { product: "riskguard", customer: String(rg.customer || "unknown"),
               plan: String(rg.edition), expires: rg.expires || null };
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Block list: a leaked licence, or a customer who should no longer have Axis.
//   SUPPORT_KV  block:lic:<sha256 of the licence>   or   block:cust:<customer code>
export async function isBlocked(env, licenceHash, customer) {
  if (!env.SUPPORT_KV) return false;
  const [a, b] = await Promise.all([
    env.SUPPORT_KV.get(`block:lic:${licenceHash}`),
    env.SUPPORT_KV.get(`block:cust:${String(customer).toLowerCase()}`),
  ]);
  return !!(a || b);
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export async function createSession(env, info) {
  const id = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.SUPPORT_KV.put(`sess:${id}`, JSON.stringify({ ...info, created: Date.now() }),
                           { expirationTtl: SESSION_SECONDS });
  return id;
}

export function sessionCookie(id) {
  return `${SESSION_COOKIE}=${id}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

// The live session for this request, or null. Re-checks the block list, so blocking a
// customer ends sessions that are already open, not only new ones.
export async function getSession(request, env) {
  if (!env.SUPPORT_KV) return null;
  const id = readCookie(request, SESSION_COOKIE);
  if (!id || !/^[0-9a-f]{64}$/.test(id)) return null;
  const raw = await env.SUPPORT_KV.get(`sess:${id}`);
  if (!raw) return null;
  let s;
  try { s = JSON.parse(raw); } catch (e) { return null; }
  if (!s.created || Date.now() - s.created > SESSION_SECONDS * 1000) return null;
  if (await isBlocked(env, s.licence_hash, s.customer)) return null;
  return s;
}

// Plain 404, indistinguishable from any other missing page: no hint that something
// exists here.
export async function notFound(env, request) {
  try {
    if (env.ASSETS) {
      const r = await env.ASSETS.fetch(new URL("/404.html", request.url).toString());
      if (r.status === 200) {
        return new Response(r.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
      }
    }
  } catch (e) { /* fall through */ }
  return new Response("<!doctype html><title>404 Not Found</title><h1>404 Not Found</h1>",
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
                              "X-Robots-Tag": "noindex" } });
}

// Support tickets are kept for 24 months after they are closed or resolved, then KV
// deletes them by itself (Data Processing Agreement §9). Open tickets do not expire.
const TICKET_RETENTION_SECONDS = 24 * 30 * 24 * 60 * 60 + 12 * 24 * 60 * 60;   // ~24 months (730 days)
export function ticketPutOptions(ticket) {
  const st = String((ticket && ticket.status) || "").toLowerCase();
  return (st === "closed" || st === "resolved") ? { expirationTtl: TICKET_RETENTION_SECONDS } : {};
}

// Support relay (2026-10-01, docs/support-relay.md): who owns a relay ticket, and the
// per-owner queue of Horaxis replies that the installation picks up by polling.
export function relayOwner(lic) {
  return `${lic.product}:${String(lic.customer).toLowerCase()}`;
}

export async function queueRelayReply(env, ticket, { message, new_status }) {
  const key = `replies:${ticket.owner}`;
  const raw = await env.TICKETS.get(key);
  const log = raw ? JSON.parse(raw) : [];
  const seq = (log.length ? log[log.length - 1].seq : 0) + 1;
  const created_at = new Date().toISOString();
  log.push({
    seq, reply_id: `${ticket.ticket_id}-${seq}`, ticket_id: ticket.ticket_id,
    message: String(message || "").slice(0, 8000), author_name: "Horaxis Support",
    created_at, new_status: new_status || null,
  });
  // Keep 30 days, at most 1000 entries.
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const kept = log.filter((r) => Date.parse(r.created_at) >= cutoff).slice(-1000);
  await env.TICKETS.put(key, JSON.stringify(kept));
  return { seq, created_at };
}
