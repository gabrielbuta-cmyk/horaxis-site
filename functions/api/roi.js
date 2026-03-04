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
  const { width } = page.getSize();
  page.drawLine({
    start: { x: 40, y: 50 },
    end: { x: width - 40, y: 50 },
    thickness: 0.5,
  });

  page.drawText("CONFIDENTIAL — Horaxis ProcureAI Financial Assessment", {
    x: 40,
    y: 35,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

// COVER PAGE
let page = pdfDoc.addPage();
let { width, height } = page.getSize();

page.drawRectangle({
  x: 0,
  y: 0,
  width,
  height,
  color: rgb(0.06, 0.09, 0.16),
});

page.drawText("ProcureAI", {
  x: 50,
  y: height - 100,
  size: 30,
  font: bold,
  color: rgb(1, 1, 1),
});

page.drawText("Board Financial Impact Assessment", {
  x: 50,
  y: height - 140,
  size: 18,
  font,
  color: rgb(1, 1, 1),
});

page.drawText(`Scenario: ${scenario.toUpperCase()}`, {
  x: 50,
  y: height - 180,
  size: 12,
  font,
  color: rgb(0.8, 0.85, 1),
});

page.drawText(`€${Math.round(total).toLocaleString()}`, {
  x: 50,
  y: height - 240,
  size: 40,
  font: bold,
  color: rgb(0.6, 0.8, 1),
});

page.drawText("Projected Annual Value Creation", {
  x: 50,
  y: height - 280,
  size: 14,
  font,
  color: rgb(1, 1, 1),
});

// EXECUTIVE SUMMARY
page = pdfDoc.addPage();
height = page.getSize().height;

page.drawText("Executive Financial Summary", {
  x: 50,
  y: height - 60,
  size: 20,
  font: bold,
});

let y = height - 100;

[
  `Annual Value Creation: €${Math.round(total).toLocaleString()}`,
  `Annual Platform Investment: €${Math.round(platformCost).toLocaleString()}`,
  `Return on Investment: ${roi.toFixed(1)}x`,
  `Capital Payback Period: ${Math.ceil(paybackMonths)} months`,
].forEach(line => {
  page.drawText(line, { x: 50, y, size: 13, font });
  y -= 24;
});

footer(page);

// VALUE BREAKDOWN
page = pdfDoc.addPage();
height = page.getSize().height;

page.drawText("Annual Value Breakdown", {
  x: 50,
  y: height - 60,
  size: 20,
  font: bold,
});

y = height - 100;

[
  ["Delivery Performance Gains", deliverySave],
  ["Operational Automation", processSave],
  ["Risk Mitigation & Disruption Avoidance", riskSave],
  ["Working Capital Optimization", workingCapitalSave],
].forEach(item => {
  page.drawText(item[0], { x: 50, y, size: 12, font });
  page.drawText(`€${Math.round(item[1]).toLocaleString()}`, {
    x: 400,
    y,
    size: 12,
    font: bold,
  });
  y -= 26;
});

footer(page);

// 3 YEAR STRATEGIC VIEW
page = pdfDoc.addPage();
height = page.getSize().height;

page.drawText("3-Year Strategic Capital Projection", {
  x: 50,
  y: height - 60,
  size: 20,
  font: bold,
});

y = height - 100;

[
  `Total 3-Year Value Creation: €${Math.round(threeYearValue).toLocaleString()}`,
  `Total 3-Year Investment: €${Math.round(threeYearInvestment).toLocaleString()}`,
  `Net Contribution: €${Math.round(net3Year).toLocaleString()}`,
].forEach(line => {
  page.drawText(line, { x: 50, y, size: 13, font });
  y -= 26;
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