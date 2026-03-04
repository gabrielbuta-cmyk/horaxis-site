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

// Fetch logo
const logoUrl = "https://horaxis.com/assets/img/horaxis-logo.png";
const logoResponse = await fetch(logoUrl);
const logoBytes = await logoResponse.arrayBuffer();
const logoImage = await pdfDoc.embedPng(logoBytes);

function blueBackground(page) {
  const { width, height } = page.getSize();
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: rgb(0.06, 0.10, 0.20),
  });
}

function footer(page) {
  const { width } = page.getSize();
  page.drawText(
    "CONFIDENTIAL — Horaxis | ProcureAI Financial Simulation",
    {
      x: 40,
      y: 30,
      size: 9,
      font,
      color: rgb(0.7, 0.8, 1),
    }
  );
}

//
// ---------------- PAGE 1 — INTRO + INPUT DATA ----------------
//

let page = pdfDoc.addPage();
let { width, height } = page.getSize();
blueBackground(page);

page.drawImage(logoImage, {
  x: 50,
  y: height - 80,
  width: 140,
  height: 40,
});

page.drawText("ProcureAI Financial Impact Simulation", {
  x: 50,
  y: height - 130,
  size: 24,
  font: bold,
  color: rgb(1, 1, 1),
});

let y = height - 170;

[
  "This document represents a simulation of potential cost reductions",
  "and capital efficiency improvements achievable by implementing",
  "the AI-driven procurement intelligence platform ProcureAI by Horaxis.",
  "",
  "The projections below are calculated using the operational data",
  "you provided and reflect modeled financial impact under the",
  "selected strategic scenario.",
].forEach(line => {
  page.drawText(line, {
    x: 50,
    y,
    size: 13,
    font,
    color: rgb(1, 1, 1),
  });
  y -= 22;
});

y -= 20;

page.drawText("Selected Scenario & Input Parameters", {
  x: 50,
  y,
  size: 16,
  font: bold,
  color: rgb(0.6, 0.8, 1),
});

y -= 28;

[
  `Scenario: ${scenario.toUpperCase()}`,
  `Annual Procurement Spend: €${spend.toLocaleString()}`,
  `Annual Purchase Orders: ${pos.toLocaleString()}`,
  `Late Delivery Rate: ${(lateRate * 100).toFixed(1)}%`,
  `Average Cost per Late Delivery: €${lateCost.toLocaleString()}`,
  `Manual Follow-up Hours per Week: ${hours}`,
  `Average Hourly Cost: €${rate}`,
  `Active Suppliers: ${suppliers}`,
].forEach(line => {
  page.drawText(line, {
    x: 60,
    y,
    size: 12,
    font,
    color: rgb(1, 1, 1),
  });
  y -= 20;
});

y -= 20;

page.drawText(
  "See the following pages for your projected financial impact using ProcureAI.",
  {
    x: 50,
    y,
    size: 14,
    font: bold,
    color: rgb(0.8, 0.9, 1),
  }
);

footer(page);


//
// ---------------- PAGE 2 — RESULTS & CALCULATIONS ----------------
//

page = pdfDoc.addPage();
height = page.getSize().height;
blueBackground(page);

page.drawImage(logoImage, {
  x: 50,
  y: height - 80,
  width: 120,
  height: 35,
});

page.drawText("Financial Results & Calculation Breakdown", {
  x: 50,
  y: height - 130,
  size: 20,
  font: bold,
  color: rgb(1, 1, 1),
});

y = height - 170;

[
  `Delivery Performance Improvement: €${Math.round(deliverySave).toLocaleString()}`,
  `Operational Automation Savings: €${Math.round(processSave).toLocaleString()}`,
  `Risk Mitigation Value: €${Math.round(riskSave).toLocaleString()}`,
  `Working Capital Optimization: €${Math.round(workingCapitalSave).toLocaleString()}`,
  "",
  `Total Annual Value Creation: €${Math.round(total).toLocaleString()}`,
  "",
  `Annual Platform Investment: €${Math.round(platformCost).toLocaleString()}`,
  `Return on Investment: ${roi.toFixed(1)}x`,
  `Estimated Payback Period: ${Math.ceil(paybackMonths)} months`,
].forEach(line => {
  page.drawText(line, {
    x: 50,
    y,
    size: 13,
    font,
    color: rgb(1, 1, 1),
  });
  y -= 24;
});

footer(page);


//
// ---------------- PAGE 3 — EXECUTIVE SUMMARY + CTA ----------------
//

page = pdfDoc.addPage();
height = page.getSize().height;
blueBackground(page);

page.drawImage(logoImage, {
  x: 50,
  y: height - 80,
  width: 120,
  height: 35,
});

page.drawText("Executive Summary & Strategic Implications", {
  x: 50,
  y: height - 130,
  size: 20,
  font: bold,
  color: rgb(1, 1, 1),
});

y = height - 170;

[
  `Projected Annual Value Creation: €${Math.round(total).toLocaleString()}`,
  "",
  "ProcureAI transforms procurement into a predictive",
  "margin protection and capital efficiency engine.",
  "",
  "By reducing disruption exposure, improving supplier",
  "performance visibility, and automating workflows,",
  "organizations unlock structural cost improvements",
  "and measurable financial resilience.",
  "",
  "Next Step:",
  "Schedule an executive session with Horaxis",
  "to validate these projections against live data",
  "and build a tailored implementation roadmap.",
].forEach(line => {
  page.drawText(line, {
    x: 50,
    y,
    size: 13,
    font,
    color: rgb(1, 1, 1),
  });
  y -= 24;
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