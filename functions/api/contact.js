// /functions/api/contact.js

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function normalizeHost(host) {
  return String(host || "").replace(/^www\./, "");
}

export const onRequest = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method Not Allowed" }, 405);
  }

  const origin = request.headers.get("origin") || "";
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (normalizeHost(originHost) !== normalizeHost(url.host)) {
        return json({ ok: false, error: "Origin not allowed" }, 403);
      }
    } catch {}
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }

  const name = String(body.name || "").trim();
  const email = String(body.email || "").trim();
  const company = String(body.company || "").trim();
  const erp = String(body.erp || "").trim();
  const message = String(body.message || "").trim();

  if (!name || !email || !company || !erp) {
    return json({ ok: false, error: "Missing required fields" }, 400);
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ ok: false, error: "Invalid email" }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ ok: false, error: "Missing RESEND_API_KEY secret" }, 500);
  }

  // 1️⃣ SEND INTERNAL EMAIL (to you)
  const internalEmail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis <info@horaxis.com>",
      to: ["demo@horaxis.com"],
      reply_to: email,
      subject: `New Contact from ${name}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>ERP:</strong> ${erp}</p>
        <p><strong>Message:</strong></p>
        <p>${message || "-"}</p>
      `,
    }),
  });

  if (!internalEmail.ok) {
    const errorText = await internalEmail.text();
    console.error("Internal email error:", errorText);
    return json({ ok: false, error: "Internal email failed" }, 500);
  }

  // 2️⃣ SEND CONFIRMATION TO USER
  const userEmail = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis <info@horaxis.com>",
      to: [email],
      subject: "We received your request — Horaxis",
      html: `
        <h2>Hi ${name},</h2>
        <p>Thanks for reaching out to Horaxis.</p>
        <p>We received your request and will respond within 1 business day.</p>
        <hr>
        <p><strong>Your submission:</strong></p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>ERP:</strong> ${erp}</p>
        <p><strong>Message:</strong></p>
        <p>${message || "-"}</p>
        <br>
        <p>Best regards,<br>Horaxis Team</p>
      `,
    }),
  });

  if (!userEmail.ok) {
    const errorText = await userEmail.text();
    console.error("User confirmation error:", errorText);
    return json({ ok: false, error: "User email failed" }, 500);
  }

  return json({ ok: true });
};