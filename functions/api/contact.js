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
      src="https://horaxis.com/assets/img/horaxis-logo.png"
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