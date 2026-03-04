function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") return json({ ok: false }, 405);

  const data = await request.json();
  const { name, email, company, erp, message } = data;

  const emailHtml = `
    <div style="font-family:sans-serif; background:#f1f5f9; padding:40px;">
      <div style="background:#ffffff; max-width:600px; margin:0 auto; border-radius:4px; overflow:hidden; border:1px solid #e2e8f0;">
        <div style="background:#0f172a; padding:20px; text-align:center;">
          <img src="https://horaxis.com/assets/img/horaxis-logo.png" width="150" alt="Horaxis">
        </div>
        <div style="padding:40px;">
          <h2 style="margin-top:0; color:#0f172a;">New Pilot Proposal Request</h2>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
          <p><strong>Lead Name:</strong> ${name}</p>
          <p><strong>Company:</strong> ${company}</p>
          <p><strong>ERP System:</strong> ${erp}</p>
          <p><strong>Work Email:</strong> ${email}</p>
          <p><strong>Inquiry Details:</strong></p>
          <p style="background:#f8fafc; padding:15px; border-radius:4px;">${message}</p>
        </div>
      </div>
    </div>
  `;

  // 1. Send Notification to You
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis System <info@horaxis.com>",
      to: ["demo@horaxis.com"],
      subject: `PROPOSAL REQUEST: ${company} (${name})`,
      html: emailHtml,
    }),
  });

  // 2. Send Professional Confirmation to Lead
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis Enterprise <info@horaxis.com>",
      to: [email],
      subject: "We received your request — Horaxis",
      html: `<p>Hi ${name},</p><p>Thank you for requesting a Pilot Proposal. An account executive will review your ERP requirements (${erp}) and contact you within 1 business day.</p>`,
    }),
  });

  return json({ ok: true });
};