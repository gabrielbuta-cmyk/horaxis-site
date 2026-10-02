// POST /api/support-relay — live support chat through the customer's firewall (2026-10-01).
// Contract: docs/support-relay.md.
//
// The installation only makes OUTBOUND calls here, identified by its signed licence
// (verified with the product's public key; blocked customers are refused). Tickets
// are owned by "<product>:<customer>", so a renewed licence keeps its tickets.
// Replies typed by Horaxis on the admin page are queued per owner and picked up by
// the installation's poll — nothing ever has to reach into the customer's network.
import { verifyLicence, sha256Hex, isBlocked, ticketPutOptions, relayOwner } from "../../lib/axis.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

const STATUSES = new Set(["open", "in_progress", "waiting_on_customer", "resolved", "closed"]);
const PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const RATE_PER_HOUR = 120;
const REPLY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const UUIDISH = /^[0-9a-zA-Z-]{8,64}$/;

const clip = (v, n) => String(v == null ? "" : v).slice(0, n);

async function rateLimited(env, owner) {
  const key = `relay-rate:${owner}:${new Date().toISOString().slice(0, 13)}`;
  const n = parseInt((await env.SUPPORT_KV.get(key)) || "0", 10);
  if (n >= RATE_PER_HOUR) return true;
  await env.SUPPORT_KV.put(key, String(n + 1), { expirationTtl: 7200 });
  return false;
}

async function loadOwned(env, owner, ticketId) {
  if (!UUIDISH.test(String(ticketId || ""))) return { error: json({ error: "Bad ticket id" }, 400) };
  const raw = await env.TICKETS.get(`ticket:${ticketId}`);
  if (!raw) return { ticket: null };
  const t = JSON.parse(raw);
  if (t.owner !== owner) return { error: json({ error: "Not your ticket" }, 403) };
  return { ticket: t };
}

async function saveTicket(env, t) {
  await env.TICKETS.put(`ticket:${t.ticket_id}`, JSON.stringify(t), ticketPutOptions(t));
}

async function addToIndex(env, id) {
  const raw = await env.TICKETS.get("ticket:index");
  const index = raw ? JSON.parse(raw) : [];
  if (!index.includes(id)) {
    index.unshift(id);
    if (index.length > 500) index.length = 500;
    await env.TICKETS.put("ticket:index", JSON.stringify(index));
  }
}

async function notifyHoraxis(env, t, what) {
  if (!env.RESEND_API_KEY) return;
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Horaxis Support <support@horaxis.com>",
        to: ["support@horaxis.com"],
        subject: `[${String(t.priority || "medium").toUpperCase()}] ${what}: ${t.subject} (${t.company})`,
        html: `<p><b>${esc(what)}</b> — ${esc(t.product_name)} · ${esc(t.company)}</p>
               <p><b>Subject:</b> ${esc(t.subject)}</p>
               <p>Answer it on the <a href="https://horaxis.com/admin">support admin page</a>.</p>`,
      }),
    });
  } catch (e) { console.error("relay notify failed", e); }
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.SUPPORT_KV || !env.TICKETS) return json({ error: "Not configured" }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "Invalid JSON" }, 400); }

  const licence = String(body.licence || "").trim();
  const lic = licence && licence.length <= 8192 ? await verifyLicence(licence) : null;
  if (!lic) return json({ error: "Licence invalid or expired" }, 401);
  if (await isBlocked(env, await sha256Hex(licence), lic.customer)) return json({ error: "Blocked" }, 403);
  const owner = relayOwner(lic);
  // The rate counter is a KV WRITE. A poll changes nothing and comes every minute from
  // each install with an open ticket (1,440 a day) - counting it used up the free
  // tier's 1,000 writes a day on its own (2026-10-02). Polls cost reads only.
  if (body.action !== "poll" && await rateLimited(env, owner)) return json({ error: "Too many requests" }, 429);
  const productName = lic.product === "riskguard" ? "RiskGuard" : "Horaxis Enterprise";

  switch (body.action) {
    case "upsert_ticket": {
      const t0 = body.ticket || {};
      const got = await loadOwned(env, owner, t0.id);
      if (got.error) return got.error;
      const now = new Date().toISOString();
      const isNew = !got.ticket;
      const t = got.ticket || {
        ticket_id: t0.id, owner, relay: true, product: lic.product, product_name: productName,
        company: lic.customer, plan: lic.plan, received_at: now, comments: [], responded_at: null,
        callback_url: null,
      };
      t.subject = clip(t0.subject || t.subject || "(no subject)", 300);
      t.description = clip(t0.description != null ? t0.description : t.description, 8000);
      t.category = clip(t0.category || t.category || "question", 40);
      t.priority = PRIORITIES.has(t0.priority) ? t0.priority : (t.priority || "medium");
      if (STATUSES.has(t0.status)) t.status = t0.status; else if (!t.status) t.status = "open";
      t.version = clip(t0.app_version || t.version || "", 40);
      t.support = clip(t0.support_tier || t.support || "included", 40);
      t.sla_hours = typeof t0.sla_hours === "number" ? t0.sla_hours : (t.sla_hours || 24);
      await saveTicket(env, t);
      if (isNew) { await addToIndex(env, t.ticket_id); await notifyHoraxis(env, t, "New ticket"); }
      return json({ ok: true });
    }

    case "comment": {
      const got = await loadOwned(env, owner, body.ticket_id);
      if (got.error) return got.error;
      if (!got.ticket) return json({ error: "Unknown ticket" }, 404);
      const t = got.ticket, c = body.comment || {};
      if (!UUIDISH.test(String(c.id || ""))) return json({ error: "Bad comment id" }, 400);
      t.comments = Array.isArray(t.comments) ? t.comments : [];
      if (!t.comments.some((x) => x.id === c.id)) {
        t.comments.push({ id: c.id, author: clip(c.author_name || "Customer", 120),
                          message: clip(c.message, 8000), timestamp: clip(c.created_at || new Date().toISOString(), 40) });
        if (t.status === "resolved" || t.status === "waiting_on_customer") t.status = "open";
        await saveTicket(env, t);
        await notifyHoraxis(env, t, "Customer replied");
      }
      return json({ ok: true });
    }

    case "status": {
      const got = await loadOwned(env, owner, body.ticket_id);
      if (got.error) return got.error;
      if (!got.ticket) return json({ error: "Unknown ticket" }, 404);
      if (!STATUSES.has(body.status)) return json({ error: "Bad status" }, 400);
      got.ticket.status = body.status;
      await saveTicket(env, got.ticket);
      return json({ ok: true });
    }

    case "poll": {
      const raw = await env.TICKETS.get(`replies:${owner}`);
      const log = raw ? JSON.parse(raw) : [];
      const since = parseInt(String(body.since || "0"), 10) || 0;
      const cutoff = Date.now() - REPLY_WINDOW_MS;
      const replies = log.filter((r) => r.seq > since && Date.parse(r.created_at) >= cutoff);
      const cursor = String(log.length ? log[log.length - 1].seq : since);
      return json({ replies: replies.map(({ seq, ...r }) => r), cursor });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
};
