import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
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

  let deliveryFactor, automationFactor, riskFactor, wcFactor;

  if (scenario === "conservative") {
    deliveryFactor = 0.20;
    automationFactor = 0.40;
    riskFactor = 0.01;
    wcFactor = 0.05;
  }

  if (scenario === "base") {
    deliveryFactor = 0.30;
    automationFactor = 0.60;
    riskFactor = 0.02;
    wcFactor = 0.10;
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

  // ----------- CREATE PDF --------------

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  function addFooter(page) {
    const { width } = page.getSize();
    page.drawText("CONFIDENTIAL – ProcureAI Board Financial Assessment", {
      x: 40,
      y: 30,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  // COVER PAGE
  let page = pdfDoc.addPage();
  let { width, height } = page.getSize();

  page.drawText("ProcureAI", {
    x: 50,
    y: height - 80,
    size: 28,
    font: bold,
  });

  page.drawText("Board-Level Financial Impact Report", {
    x: 50,
    y: height - 120,
    size: 18,
    font,
  });

  page.drawText(`Scenario: ${scenario.toUpperCase()}`, {
    x: 50,
    y: height - 150,
    size: 12,
    font,
  });

  page.drawText(`Projected Annual Value: €${Math.round(total).toLocaleString()}`, {
    x: 50,
    y: height - 200,
    size: 16,
    font: bold,
  });

  addFooter(page);

  // EXECUTIVE SUMMARY PAGE
  page = pdfDoc.addPage();
  height = page.getSize().height;

  page.drawText("Executive Summary", { x: 50, y: height - 60, size: 18, font: bold });

  const summaryLines = [
    `Annual Value Creation: €${Math.round(total).toLocaleString()}`,
    `Annual Platform Investment: €${Math.round(platformCost).toLocaleString()}`,
    `ROI Multiple: ${roi.toFixed(1)}x`,
    `Capital Payback Period: ${Math.ceil(paybackMonths)} months`,
    "",
    "ProcureAI transforms procurement from reactive cost center",
    "into predictive margin protection and resilience engine.",
  ];

  let y = height - 100;
  summaryLines.forEach(line => {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 18;
  });

  addFooter(page);

  // FINANCIAL BREAKDOWN
  page = pdfDoc.addPage();
  height = page.getSize().height;

  page.drawText("Annual Value Breakdown", { x: 50, y: height - 60, size: 18, font: bold });

  const breakdown = [
    ["Delivery Performance Gains", deliverySave],
    ["Operational Automation", processSave],
    ["Risk Mitigation", riskSave],
    ["Working Capital Optimization", workingCapitalSave],
  ];

  y = height - 100;
  breakdown.forEach(item => {
    page.drawText(item[0], { x: 50, y, size: 12, font });
    page.drawText(`€${Math.round(item[1]).toLocaleString()}`, {
      x: 400,
      y,
      size: 12,
      font,
    });
    y -= 20;
  });

  addFooter(page);

  // 3 YEAR PROJECTION
  page = pdfDoc.addPage();
  height = page.getSize().height;

  page.drawText("3-Year Strategic Projection", { x: 50, y: height - 60, size: 18, font: bold });

  const projectionLines = [
    `Total 3-Year Value: €${Math.round(threeYearValue).toLocaleString()}`,
    `Total 3-Year Investment: €${Math.round(threeYearInvestment).toLocaleString()}`,
    `Net Financial Contribution (3 Years): €${Math.round(net3Year).toLocaleString()}`,
    "",
    "ProcureAI positions procurement as a long-term margin",
    "protection and capital efficiency lever.",
  ];

  y = height - 100;
  projectionLines.forEach(line => {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 18;
  });

  addFooter(page);

  const pdfBytes = await pdfDoc.save();
  const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

  // ---------- SEND EMAIL ------------

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
          <h2>ProcureAI Board-Level Financial Assessment</h2>
          <p>Projected Annual Value: <strong>€${Math.round(total).toLocaleString()}</strong></p>
          <p>ROI: <strong>${roi.toFixed(1)}x</strong></p>
          <p>Payback: <strong>${Math.ceil(paybackMonths)} months</strong></p>
          <p>The full executive PDF report is attached.</p>
        </div>
      `,
      attachments: [
        {
          filename: "ProcureAI_Board_Financial_Report.pdf",
          content: pdfBase64,
          type: "application/pdf",
        },
      ],
    }),
  });

  if (!resendResponse.ok) {
    return json({ ok: false }, 500);
  }

  return json({ ok: true });
};