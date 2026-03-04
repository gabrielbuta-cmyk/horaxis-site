import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const onRequest = async (context) => {
  try {

    const { request, env } = context;

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const data = await request.json();

    const total = Number(data.total || 0);
    const roi = Number(data.roi || 0);
    const payback = Number(data.payback || 0);

    const delivery = Number(data.breakdown?.delivery || 0);
    const process = Number(data.breakdown?.process || 0);
    const risk = Number(data.breakdown?.risk || 0);
    const workingCapital = Number(data.breakdown?.workingCapital || 0);

    // ---------- CREATE PDF ----------

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);

    const { width, height } = page.getSize();

    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Colors
    const dark = rgb(0.06, 0.09, 0.16); // #0f172a
    const blue = rgb(0.12, 0.23, 0.54); // #1e3a8a
    const green = rgb(0.29, 0.87, 0.50); // #4ade80
    const lightBlue = rgb(0.58, 0.77, 0.99); // #93c5fd

    // Header
    page.drawRectangle({
      x: 0,
      y: height - 80,
      width: width,
      height: 80,
      color: dark,
    });

    page.drawText("ProcureAI Executive Financial Impact Assessment", {
      x: 40,
      y: height - 50,
      size: 18,
      font: fontBold,
      color: rgb(1,1,1),
    });

    page.drawText("Confidential – CFO Strategic Briefing", {
      x: 40,
      y: height - 68,
      size: 11,
      font,
      color: lightBlue,
    });

    let y = height - 120;

    // Executive Summary
    page.drawText("Executive Summary", {
      x: 40,
      y,
      size: 16,
      font: fontBold,
      color: blue
    });

    y -= 25;

    page.drawText(
      `Projected Annual Financial Impact: €${total.toLocaleString()}`,
      { x: 40, y, size: 15, font: fontBold, color: green }
    );

    y -= 20;

    page.drawText(
      `ROI Multiple: ${roi.toFixed(1)}x`,
      { x: 40, y, size: 13, font }
    );

    y -= 18;

    page.drawText(
      `Estimated Payback Period: ${Math.ceil(payback)} months`,
      { x: 40, y, size: 13, font }
    );

    y -= 35;

    // Breakdown
    page.drawText("Annual Value Breakdown", {
      x: 40,
      y,
      size: 14,
      font: fontBold,
      color: blue
    });

    y -= 25;

    const rows = [
      ["Delivery Performance Gains", delivery],
      ["Process Automation Efficiency", process],
      ["Risk Avoidance & Disruption Mitigation", risk],
      ["Working Capital Optimization", workingCapital],
    ];

    rows.forEach(([label, value]) => {
      page.drawText(label, { x: 50, y, size: 12, font });
      page.drawText(`€${value.toLocaleString()}`, {
        x: 420,
        y,
        size: 12,
        font: fontBold
      });
      y -= 18;
    });

    y -= 30;

    // AI Section
    page.drawText("AI Risk Intelligence Impact", {
      x: 40,
      y,
      size: 14,
      font: fontBold,
      color: blue
    });

    y -= 20;

    page.drawText(
      "ProcureAI applies predictive AI to supplier risk signals,",
      { x: 40, y, size: 12, font }
    );

    y -= 16;

    page.drawText(
      "shipment patterns, ERP signals and external disruption data",
      { x: 40, y, size: 12, font }
    );

    y -= 16;

    page.drawText(
      "to reduce exposure by 35–60% before material impact occurs.",
      { x: 40, y, size: 12, font }
    );

    y -= 30;

    // Business Narrative
    page.drawText("Strategic Value Drivers", {
      x: 40,
      y,
      size: 14,
      font: fontBold,
      color: blue
    });

    y -= 20;

    page.drawText(
      "• Reduced late delivery penalties and expediting costs",
      { x: 40, y, size: 12, font }
    );

    y -= 16;

    page.drawText(
      "• Improved supplier collaboration efficiency",
      { x: 40, y, size: 12, font }
    );

    y -= 16;

    page.drawText(
      "• Enhanced working capital visibility",
      { x: 40, y, size: 12, font }
    );

    y -= 16;

    page.drawText(
      "• AI-driven early warning for procurement disruptions",
      { x: 40, y, size: 12, font }
    );

    y -= 40;

    // CTA
    page.drawText("Next Step:", {
      x: 40,
      y,
      size: 13,
      font: fontBold
    });

    y -= 18;

    page.drawText(
      "Schedule an Executive Strategy Session at www.horaxis.com",
      { x: 40, y, size: 12, font }
    );

    // Footer
    page.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: 30,
      color: dark,
    });

    page.drawText("© 2026 Horaxis — ProcureAI Enterprise Intelligence Platform", {
      x: 40,
      y: 10,
      size: 9,
      font,
      color: rgb(1,1,1)
    });

    const pdfBytes = await pdfDoc.save();

    // convert
    const pdfBase64 = btoa(
      String.fromCharCode(...new Uint8Array(pdfBytes))
    );

    // ---------- SEND EMAIL ----------

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Horaxis Executive Reports <info@horaxis.com>",
        to: [data.email],
        subject: "Your ProcureAI Executive Financial Impact Report",
        html: `
        <div style="font-family:Inter,Arial,sans-serif;background:#0f172a;padding:40px;color:white;">
          <h1 style="margin:0;color:#93c5fd;">ProcureAI Executive ROI Report</h1>
          <p style="margin-top:20px;font-size:16px;">
            Your customized executive financial assessment is attached.
          </p>
          <p style="margin-top:10px;color:#cbd5e1;">
            Projected Annual Impact: <strong>€${total.toLocaleString()}</strong>
          </p>
          <p style="margin-top:30px;">
            To review implementation scenarios or request a strategic briefing,
            schedule a session at <a href="https://horaxis.com" style="color:#4ade80;">horaxis.com</a>
          </p>
        </div>
        `,
        attachments: [
          {
            filename: "ProcureAI_Executive_ROI_Report.pdf",
            content: pdfBase64,
            type: "application/pdf"
          }
        ]
      })
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });

  } catch (err) {
    console.error("ROI ERROR:", err);
    return new Response(JSON.stringify({ ok:false }), {
      status: 500,
      headers: { "content-type":"application/json" }
    });
  }
};