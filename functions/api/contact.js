// functions/api/contact.js

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function normalizeHost(host) {
  return String(host || "").replace(/^www\./, "");
}

export const onRequest = async (context) => {
  const req = context.request;
  const url = new URL(req.url);

  // CORS (safe defaults)
  const origin = req.headers.get("Origin") || "";
  const corsHeaders = {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };

  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405, corsHeaders);
  }

  // Same-site protection (allow www/non-www)
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    const reqHost = url.host;

    if (normalizeHost(originHost) !== normalizeHost(reqHost)) {
      return json(
        { ok: false, error: "Origin not allowed", originHost, reqHost },
        403,
        corsHeaders
      );
    }
  }

  // Read JSON
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid content-type", contentType }, 400, corsHeaders);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400, corsHeaders);
  }

  // Honeypot
  if (body.website && String(body.website).trim() !== "") {
    return json({ ok: true }, 200, corsHeaders);
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const company = String(body.company || "").trim();
  const erp = String(body.erp || "").trim();
  const message = String(body.message || "").trim();

  if (!name || !email || !company || !erp) {
    return json({ ok: false, error: "Missing required fields" }, 400, corsHeaders);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ ok: false, error: "Invalid email" }, 400, corsHeaders);
  }

  // If you haven't configured an email provider yet, just log and return success.
  console.log("CONTACT_FORM_SUBMISSION", { name, email, company, erp, message });

  return json({ ok: true, queued: false }, 200, corsHeaders);
};