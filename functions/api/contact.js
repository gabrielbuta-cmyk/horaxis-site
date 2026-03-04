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

function emailTemplate(content) {
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:40px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            
            <!-- Header -->
            <tr>
              <td style="background:#0f172a;padding:24px;text-align:center;">
                <img src="https://horaxis.com/assets/img/horaxis-logo.png" width="140" alt="Horaxis Logo" style="display:block;margin:0 auto;">
              </td>
            </tr>

            <!-- Content -->
            <tr>
              <td style="padding:32px;color:#111827;font-size:15px;line-height:1.6;">
                ${content}
              </td>
            </tr>

            <!-- Footer -->
            <tr>
  <td style="background:#0f172a;padding:24px;text-align:center;">
    <img 
      src="data:image/png;base64,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"
      width="140"
      alt="Horaxis"
      style="display:block;margin:0 auto;"
    >
  </td>
</tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;
}

export const onRequest = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method !== "POST") {
    return json({ ok: false }, 405);
  }

  const origin = request.headers.get("origin") || "";
  if (origin) {
    try {
      const originHost = new URL(origin).host;
      if (normalizeHost(originHost) !== normalizeHost(url.host)) {
        return json({ ok: false }, 403);
      }
    } catch {}
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const name = body.name?.trim();
  const email = body.email?.trim();
  const company = body.company?.trim();
  const erp = body.erp?.trim();
  const message = body.message?.trim();

  if (!name || !email || !company || !erp) {
    return json({ ok: false }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ ok: false }, 500);
  }

  // INTERNAL EMAIL
  await fetch("https://api.resend.com/emails", {
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
      html: emailTemplate(`
        <h2 style="margin-top:0;">New Contact Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>ERP:</strong> ${erp}</p>
        <p><strong>Message:</strong><br>${message || "-"}</p>
      `),
    }),
  });

  // USER CONFIRMATION EMAIL
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis <info@horaxis.com>",
      to: [email],
      subject: "We received your request — Horaxis",
      html: emailTemplate(`
        <h2 style="margin-top:0;">Hi ${name},</h2>
        <p>Thank you for contacting Horaxis.</p>
        <p>We received your request and will respond within 1 business day.</p>
        <hr style="margin:24px 0;">
        <p><strong>Your submission:</strong></p>
        <p><strong>Company:</strong> ${company}</p>
        <p><strong>ERP:</strong> ${erp}</p>
        <p><strong>Message:</strong><br>${message || "-"}</p>
        <br>
        <p>Best regards,<br><strong>Horaxis Team</strong></p>
      `),
    }),
  });

  return json({ ok: true });
};