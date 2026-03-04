import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ✅ WORKERS SAFE BASE64 CONVERTER
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

  if (request.method !== "POST") {
    return json({ ok: false }, 405);
  }

  const data = await request.json();

  const spend = Number(data.spend || 0);
  const pos = Number(data.pos || 0);
  const lateRate = Number(data.lateRate || 0) / 100;
  const lateCost = Number(data.lateCost || 0);
  const hours = Number(data.hours || 0);
  const rate = Number(data.rate || 0);
  const suppliers = Number(data.suppliers || 0);
  const scenario = data.scenario || "base";
  const email = data.email;

  if (!email) return json({ ok: false }, 400);

  let deliveryFactor = 0.3;
  let automationFactor = 0.6;
  let riskFactor = 0.02;
  let wcFactor = 0.10;

  if (scenario === "conservative") {
    deliveryFactor = 0.20;
    automationFactor = 0.40;
    riskFactor = 0.01;
    wcFactor = 0.05;
  }

  if (scenario === "optimistic") {
    deliveryFactor = 0.40;
    automationFactor = 0.75;
    riskFactor = 0.03;
    wcFactor = 0.15;
  }

  const latePOs = pos * lateRate;
  const deliverySave = latePOs * lateCost * deliveryFactor;
  const processSave = hours * rate * 52 * automationFactor;
  const riskSave = spend * lateRate * riskFactor;
  const workingCapitalSave = spend * 0.02 * wcFactor;

  const total = deliverySave + processSave + riskSave + workingCapitalSave;
  const platformCost = 20000 + suppliers * 60;
  const roi = total / platformCost;
  const paybackMonths = (platformCost / total) * 12;

  const threeYearValue = total * 3;
  const threeYearInvestment = platformCost * 3;
  const net3Year = threeYearValue - threeYearInvestment;

  // ---------------- PDF GENERATION ----------------

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  function footer(page) {
    page.drawText("CONFIDENTIAL – ProcureAI Board Financial Assessment", {
      x: 40,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  let page = pdfDoc.addPage();
  let { height } = page.getSize();

  page.drawText("ProcureAI Board Financial Impact Report", {
    x: 50,
    y: height - 80,
    size: 22,
    font: bold,
  });

  page.drawText(`Scenario: ${scenario.toUpperCase()}`, {
    x: 50,
    y: height - 120,
    size: 12,
    font,
  });

  page.drawText(`Projected Annual Value: €${Math.round(total).toLocaleString()}`, {
    x: 50,
    y: height - 160,
    size: 16,
    font: bold,
  });

  footer(page);

  // PAGE 2 – EXECUTIVE SUMMARY
  page = pdfDoc.addPage();
  height = page.getSize().height;

  page.drawText("Executive Summary", { x: 50, y: height - 60, size: 18, font: bold });

  let y = height - 100;

  [
    `Annual Value Creation: €${Math.round(total).toLocaleString()}`,
    `Annual Platform Investment: €${Math.round(platformCost).toLocaleString()}`,
    `ROI Multiple: ${roi.toFixed(1)}x`,
    `Capital Payback Period: ${Math.ceil(paybackMonths)} months`,
    "",
    "ProcureAI enables predictive margin protection,",
    "supplier risk visibility, and capital efficiency."
  ].forEach(line => {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 18;
  });

  footer(page);

  // PAGE 3 – 3 YEAR PROJECTION
  page = pdfDoc.addPage();
  height = page.getSize().height;

  page.drawText("3-Year Strategic Projection", { x: 50, y: height - 60, size: 18, font: bold });

  y = height - 100;

  [
    `Total 3-Year Value: €${Math.round(threeYearValue).toLocaleString()}`,
    `Total 3-Year Investment: €${Math.round(threeYearInvestment).toLocaleString()}`,
    `Net Contribution: €${Math.round(net3Year).toLocaleString()}`,
  ].forEach(line => {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 18;
  });

  footer(page);

  const pdfBytes = await pdfDoc.save();

  // ✅ SAFE BASE64 CONVERSION
  const pdfBase64 = arrayBufferToBase64(pdfBytes);

  // ---------------- EMAIL ----------------

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis Executive Reports <info@horaxis.com>",
      to: [email],
      subject: "ProcureAI Board Financial Impact Report",
      html: `
        <div style="font-family:Arial;padding:30px;background:#f8fafc">
          <h2>ProcureAI Board Financial Assessment</h2>
          <p><strong>Projected Annual Value:</strong> €${Math.round(total).toLocaleString()}</p>
          <p><strong>ROI:</strong> ${roi.toFixed(1)}x</p>
          <p><strong>Payback:</strong> ${Math.ceil(paybackMonths)} months</p>
          <p>The full executive report is attached as PDF.</p>
        </div>
      `,
      attachments: [
        {
          filename: "ProcureAI_Board_Report.pdf",
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    }),
  });

  if (!resendResponse.ok) {
    const err = await resendResponse.text();
    console.log(err);
    return json({ ok: false }, 500);
  }

  return json({ ok: true });
};