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

  if (req.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405, corsHeaders);
  }

  // Same-site protection
  if (origin) {
    let originHost = "";
    try { originHost = new URL(origin).host; } catch {}
    const reqHost = url.host;

    if (normalizeHost(originHost) !== normalizeHost(reqHost)) {
      return json(
        { ok: false, error: "Origin not allowed" },
        403,
        corsHeaders
      );
    }
  }

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return json({ ok: false, error: "Invalid content-type" }, 400, corsHeaders);
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

  try {
    const mailResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: "demo@horaxis.com" }]
          }
        ],
        from: {
          email: "demo@horaxis.com",
          name: "Horaxis Website"
        },
        reply_to: {
          email: email,
          name: name
        },
        subject: `New Contact from ${name}`,
        content: [
          {
            type: "text/plain",
            value: `
Name: ${name}
Email: ${email}
Company: ${company}
ERP: ${erp}

Message:
${message}
`
          }
        ]
      })
    });

    if (!mailResponse.ok) {
      const errorText = await mailResponse.text();
      console.error("MailChannels error:", errorText);
      return json({ ok: false, error: "Email failed" }, 500, corsHeaders);
    }

    return json({ ok: true }, 200, corsHeaders);

  } catch (err) {
    console.error("Mail send exception:", err);
    return json({ ok: false, error: "Server error" }, 500, corsHeaders);
  }
};