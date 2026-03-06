import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") return json({ ok: false }, 405);

  const data = await request.json();
  const email = data.email;
  const spend = Number(data.spend || 0);
  const pos = Number(data.pos || 0);

  // --- ENTERPRISE MATH (Matching Frontend) ---
  const HOURLY_DOWNTIME_COST = 125000;
  const downtimeSaved = 12 * HOURLY_DOWNTIME_COST;
  const freightSaved = (spend * 0.05) * 0.15;
  const laborSaved = ((pos * 10) / 60) * 55;
  const totalSavings = downtimeSaved + freightSaved + laborSaved;

  // --- GENERATE ENTERPRISE PDF ---
  const pdfDoc = await PDFDocument.create();
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.addPage([600, 800]);

  // Header Bar (Navy)
  page.drawRectangle({
    x: 0, y: 720, width: 600, height: 80,
    color: rgb(0.06, 0.09, 0.17), // #0F172A
  });

  page.drawText('HORAXIS | Executive Value Assessment', {
    x: 40, y: 750, size: 20, font: fontBold, color: rgb(1, 1, 1),
  });

  // ROI Content
  page.drawText('Projected Annual Economic Impact', { x: 40, y: 680, size: 16, font: fontBold });
  
  page.drawText(`Total Savings: $${Math.round(totalSavings).toLocaleString()}`, {
    x: 40, y: 640, size: 24, font: fontBold, color: rgb(0.92, 0.35, 0.05) // #EA580C
  });

  const lines = [
    `• Production Stoppage Avoidance: $${Math.round(downtimeSaved).toLocaleString()}`,
    `• Expedited Freight Reduction: $${Math.round(freightSaved).toLocaleString()}`,
    `• Administrative Labor Reclaimed: $${Math.round(laborSaved).toLocaleString()}`,
  ];

  let y = 600;
  lines.forEach(line => {
    page.drawText(line, { x: 50, y, size: 12, font: fontReg });
    y -= 25;
  });

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = arrayBufferToBase64(pdfBytes);

  // --- SEND VIA RESEND API ---
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis Intelligence <info@horaxis.com>",
      to: [email],
      subject: "Executive Report: ProcureAI Value Assessment",
      html: `
        <div style="font-family:sans-serif; padding:40px; background:#f8fafc; color:#0f172a;">
          <h2 style="color:#0f172a;">Executive Value Realization</h2>
          <p>The attached report outlines the projected financial impact of deploying ProcureAI within your supply chain infrastructure.</p>
          <div style="background:white; padding:20px; border-left:4px solid #ea580c;">
            <p><strong>Annual Projected Value:</strong> $${Math.round(totalSavings).toLocaleString()}</p>
          </div>
          <p>To discuss these findings and our ERP integration roadmap, please reply to this email.</p>
        </div>
      `,
      attachments: [{ filename: "Horaxis_Value_Assessment.pdf", content: pdfBase64 }],
    }),
  });

  return json({ ok: true });
};