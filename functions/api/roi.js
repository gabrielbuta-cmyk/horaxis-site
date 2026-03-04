// functions/api/roi.js

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" }
  });
}

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") {
    return json({ ok: false }, 405);
  }

  const body = await request.json();

  const name = body.name || "Executive";
  const email = body.email;
  const company = body.company || "Your Organization";

  const spend = Number(body.spend || 0);
  const lateRate = Number(body.lateRate || 0);

  // === REALISTIC ENTERPRISE MODEL ===
  const processSavings = spend * 0.015;
  const deliverySavings = spend * (lateRate / 100) * 0.25;
  const riskSavings = spend * 0.01;
  const workingCapitalSavings = spend * 0.005;

  const totalSavings =
    processSavings +
    deliverySavings +
    riskSavings +
    workingCapitalSavings;

  const riskExposure = spend * 0.08;

  // ===============================
  // CREATE PDF
  // ===============================

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;

  page.drawText("ProcureAI ROI Impact Report", {
    x: 50,
    y,
    size: 20,
    font: boldFont
  });

  y -= 40;

  page.drawText(`Prepared for: ${company}`, { x: 50, y, size: 12, font });
  y -= 20;

  page.drawText(`Projected Annual Impact: €${totalSavings.toLocaleString()}`, {
    x: 50,
    y,
    size: 14,
    font: boldFont,
    color: rgb(0.15, 0.35, 0.9)
  });

  y -= 40;

  const lines = [
    "Executive Summary:",
    "",
    `Total Annual Value Creation: €${totalSavings.toLocaleString()}`,
    "",
    "Operational Breakdown:",
    `Process Efficiency: €${processSavings.toLocaleString()}`,
    `Delivery Gains: €${deliverySavings.toLocaleString()}`,
    `Risk Avoidance: €${riskSavings.toLocaleString()}`,
    `Working Capital: €${workingCapitalSavings.toLocaleString()}`,
    "",
    "AI Risk Intelligence:",
    `Estimated Disruption Exposure: €${riskExposure.toLocaleString()}`,
    "Predictive alerts reduce exposure by 35–60%.",
    "",
    "Key Features:",
    "• Predictive supplier risk scoring",
    "• ERP anomaly detection",
    "• Executive dashboards",
    "• Early disruption alerts",
    "",
    "Next Step:",
    "Schedule Executive Validation Session:",
    "https://horaxis.com/contact.html#demo"
  ];

  lines.forEach(line => {
    y -= 18;
    page.drawText(line, { x: 50, y, size: 11, font });
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

  // ===============================
  // SEND EMAIL VIA RESEND
  // ===============================

  const userHtml = `
  <div style="font-family:Arial;padding:30px;background:#f4f6f8;">
    <div style="max-width:600px;margin:auto;background:white;padding:30px;border-radius:10px;">
      <h2>Hi ${name},</h2>
      <p>Your ProcureAI executive ROI assessment is attached.</p>
      <h3 style="color:#2563eb;">Projected Annual Impact: €${totalSavings.toLocaleString()}</h3>
      <p>
        This includes automation, delivery performance, risk reduction,
        and working capital optimization.
      </p>
      <p>
        <a href="https://horaxis.com/contact.html#demo"
           style="background:#2563eb;color:white;padding:12px 20px;text-decoration:none;border-radius:6px;">
           Schedule Executive Review
        </a>
      </p>
      <p style="font-size:12px;color:#666;">ProcureAI — Enterprise Procurement Intelligence</p>
    </div>
  </div>
  `;

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "ProcureAI <info@horaxis.com>",
      to: [email],
      subject: "Your ProcureAI Executive ROI Report",
      html: userHtml,
      attachments: [
        {
          filename: "ProcureAI_ROI_Report.pdf",
          content: pdfBase64
        }
      ]
    })
  });

  if (!resendResponse.ok) {
    return json({ ok: false, error: "Email failed" }, 500);
  }

  return json({ ok: true, totalSavings });
};