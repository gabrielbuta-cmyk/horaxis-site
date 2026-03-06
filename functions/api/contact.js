import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ── IT Readiness Guide PDF Generator ──────────────────────────────
async function generateITGuide() {
  const pdf = await PDFDocument.create();
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);

  const navy = rgb(0.06, 0.09, 0.17);
  const orange = rgb(0.92, 0.35, 0.05);
  const dark = rgb(0.12, 0.12, 0.14);
  const gray = rgb(0.4, 0.45, 0.52);
  const white = rgb(1, 1, 1);

  // ── Helper: add a new page with header ──
  function newPage(title) {
    const page = pdf.addPage([612, 792]);
    // Navy header bar
    page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: navy });
    page.drawText("HORAXIS", { x: 40, y: 748, size: 18, font: bold, color: white });
    page.drawText(".", { x: 120, y: 748, size: 18, font: bold, color: orange });
    page.drawText("IT Readiness Guide", { x: 140, y: 748, size: 14, font: reg, color: rgb(0.58, 0.64, 0.72) });
    // Section title
    page.drawText(title, { x: 40, y: 688, size: 20, font: bold, color: dark });
    page.drawRectangle({ x: 40, y: 682, width: 80, height: 3, color: orange });
    return page;
  }

  // ── Helper: draw wrapped text ──
  function drawWrapped(page, text, x, startY, maxW, size, font, color) {
    const words = text.split(" ");
    let line = "";
    let y = startY;
    for (const word of words) {
      const test = line ? line + " " + word : word;
      if (font.widthOfTextAtSize(test, size) > maxW) {
        page.drawText(line, { x, y, size, font, color });
        line = word;
        y -= size + 4;
      } else {
        line = test;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font, color });
      y -= size + 4;
    }
    return y;
  }

  // ── PAGE 1: Deployment Architecture ──
  let p = newPage("1. Deployment Architecture");
  let y = 660;
  const bw = 530;

  y = drawWrapped(p, "ProcureAI Enterprise is delivered as a Docker Compose stack that runs entirely within your private network. No ERP or production data leaves your infrastructure.", 40, y, bw, 11, reg, gray);
  y -= 12;

  const archRows = [
    ["Component", "Technology", "Port"],
    ["API Server", "FastAPI (Python 3.11)", "8000"],
    ["Frontend", "React + Nginx", "443 / 3000"],
    ["Database", "PostgreSQL 15", "5432"],
    ["Cache (App)", "Redis 7", "6379"],
    ["Cache (ML)", "Redis 7 (secondary)", "6380"],
    ["Task Queue", "Celery + Redis Broker", "Internal"],
    ["Task Monitor", "Flower", "5555"],
    ["ML Pipeline", "scikit-learn + pandas", "Internal"],
    ["Reverse Proxy", "Nginx", "443"],
  ];

  for (let i = 0; i < archRows.length; i++) {
    const row = archRows[i];
    const f = i === 0 ? bold : reg;
    const c = i === 0 ? dark : gray;
    p.drawText(row[0], { x: 40, y, size: 10, font: f, color: c });
    p.drawText(row[1], { x: 210, y, size: 10, font: f, color: c });
    p.drawText(row[2], { x: 440, y, size: 10, font: f, color: c });
    if (i === 0) {
      y -= 4;
      p.drawRectangle({ x: 40, y: y + 2, width: bw, height: 0.5, color: gray });
    }
    y -= 16;
  }

  y -= 10;
  p.drawText("Minimum Hardware Requirements", { x: 40, y, size: 12, font: bold, color: dark });
  y -= 18;
  const hwRows = [
    "Up to 100K PO lines:   8 CPU cores  |  32 GB RAM  |  500 GB SSD",
    "Up to 300K PO lines:  12 CPU cores  |  48 GB RAM  |  750 GB SSD",
    "Up to 500K PO lines:  16 CPU cores  |  64 GB RAM  |  1 TB NVMe",
  ];
  for (const hw of hwRows) {
    p.drawText(hw, { x: 50, y, size: 10, font: reg, color: gray });
    y -= 16;
  }

  // ── PAGE 2: ERP Integration ──
  p = newPage("2. ERP Integration & Connectors");
  y = 660;

  y = drawWrapped(p, "ProcureAI connects bi-directionally to your ERP via standard protocols. Authentication is managed through your existing ERP service users with least-privilege permissions.", 40, y, bw, 11, reg, gray);
  y -= 16;

  const erpSections = [
    {
      title: "SAP S/4HANA",
      items: [
        "Protocol: PyRFC (RFC) + OData v2/v4",
        "Read: BAPI_PO_GETDETAIL, RFC_READ_TABLE, BAPI_MATERIAL_GET_ALL",
        "Write-back: BAPI_PO_CHANGE for schedule line updates",
        "Auth: SAP service user with roles for MM and SD modules",
      ],
    },
    {
      title: "Oracle ERP (Cloud + EBS)",
      items: [
        "Protocol: REST API (Oracle Cloud), PL/SQL views (EBS)",
        "Read: Purchase orders, suppliers, inventory, BOMs",
        "Write-back: REST PATCH for approved schedule changes",
        "Auth: OAuth 2.0 client credentials or basic auth",
      ],
    },
    {
      title: "Microsoft Dynamics 365",
      items: [
        "Protocol: OData v4 / Dataverse Web API",
        "Read: Purchase orders, vendors, items, BOMs",
        "Write-back: PATCH requests for delivery date updates",
        "Auth: Azure AD application (client_id / client_secret)",
      ],
    },
  ];

  for (const section of erpSections) {
    p.drawText(section.title, { x: 40, y, size: 12, font: bold, color: orange });
    y -= 18;
    for (const item of section.items) {
      p.drawText("\u2022  " + item, { x: 50, y, size: 10, font: reg, color: gray });
      y -= 15;
    }
    y -= 8;
  }

  y -= 4;
  p.drawText("Data Entities Synchronized", { x: 40, y, size: 12, font: bold, color: dark });
  y -= 18;
  const entities = [
    "Purchase Orders (headers, items, schedule lines)",
    "Suppliers / Vendors",
    "Materials (master data + lead times)",
    "Bills of Material (multi-level BOM)",
    "Sales Orders (for revenue-at-risk calculation)",
    "Inventory / Stock Levels",
  ];
  for (const e of entities) {
    p.drawText("\u2022  " + e, { x: 50, y, size: 10, font: reg, color: gray });
    y -= 15;
  }

  // ── PAGE 3: Security Controls ──
  p = newPage("3. Security Controls");
  y = 660;

  const secSections = [
    {
      title: "Encryption",
      items: [
        "At rest: AES-128 via Fernet (cryptography library) for all ERP credentials",
        "In transit: TLS 1.2 / 1.3 enforced on all external connections",
        "Application secrets managed via environment variable injection (never stored in code)",
      ],
    },
    {
      title: "Authentication & Access",
      items: [
        "Multi-Factor Authentication (MFA): TOTP-based, enforced for all admin accounts",
        "Role-Based Access Control (RBAC): Admin, Buyer, Viewer roles with scoped permissions",
        "JWT session tokens with configurable expiry",
        "Supplier portal: unique hashed tokens per link, no login credentials needed",
      ],
    },
    {
      title: "Audit & Logging",
      items: [
        "Full audit trail: every user action logged with timestamp, user ID, old/new values",
        "Structured JSON logging with correlation IDs for request tracing",
        "Configurable retention period (default: 90 days)",
        "Supplier update submissions tracked with IP, timestamp, and field-level changes",
      ],
    },
    {
      title: "Infrastructure Hardening",
      items: [
        "Security headers: HSTS, X-Content-Type-Options, X-Frame-Options, CSP",
        "GZip compression enabled for API responses",
        "Rate limiting on authentication endpoints",
        "Container isolation via Docker network segmentation",
      ],
    },
  ];

  for (const section of secSections) {
    p.drawText(section.title, { x: 40, y, size: 12, font: bold, color: orange });
    y -= 18;
    for (const item of section.items) {
      y = drawWrapped(p, "\u2022  " + item, 50, y, bw - 10, 10, reg, gray);
      y -= 4;
    }
    y -= 6;
  }

  // ── PAGE 4: ML Pipeline & Network ──
  p = newPage("4. ML Pipeline & Network Requirements");
  y = 660;

  p.drawText("Predictive ML Pipeline", { x: 40, y, size: 12, font: bold, color: orange });
  y -= 18;
  const mlItems = [
    "34 prediction variables across 7 intelligence engines",
    "Models: RandomForest Classifier (late/on-time) + GradientBoosting Regressor (delay days)",
    "Training: occurs on-premise using customer data exclusively — no data sent externally",
    "Prediction window: 14 days ahead of scheduled delivery",
    "Batch scoring via Celery task queue (configurable schedule)",
    "Feature categories: internal PO data, external risk signals, enriched operational metrics",
  ];
  for (const item of mlItems) {
    y = drawWrapped(p, "\u2022  " + item, 50, y, bw - 10, 10, reg, gray);
    y -= 4;
  }

  y -= 12;
  p.drawText("Network Requirements", { x: 40, y, size: 12, font: bold, color: orange });
  y -= 18;

  y = drawWrapped(p, "Internal (mandatory):", 40, y, bw, 10, bold, dark);
  y -= 2;
  const intNet = [
    "PostgreSQL: TCP 5432 (app server to database)",
    "Redis: TCP 6379, 6380 (app server to cache)",
    "HTTP: TCP 8000 (internal API), TCP 3000 (frontend dev), TCP 443 (production)",
  ];
  for (const item of intNet) {
    p.drawText("\u2022  " + item, { x: 50, y, size: 10, font: reg, color: gray });
    y -= 15;
  }

  y -= 8;
  y = drawWrapped(p, "External (optional — for risk intelligence):", 40, y, bw, 10, bold, dark);
  y -= 2;
  const extNet = [
    "HTTPS 443 outbound to: Meteosource, AISStream, Alpha Vantage, GDELT, NOAA APIs",
    "These APIs provide weather, shipping, energy, geopolitical, and forex risk signals",
    "ProcureAI operates in restricted-network mode without these (using internal features only)",
  ];
  for (const item of extNet) {
    y = drawWrapped(p, "\u2022  " + item, 50, y, bw - 10, 10, reg, gray);
    y -= 4;
  }

  y -= 16;
  p.drawText("Data Sovereignty", { x: 40, y, size: 12, font: bold, color: orange });
  y -= 18;
  const dsItems = [
    "All ERP data processed and stored within your firewall — Horaxis has zero access",
    "ML models trained locally on your data — no aggregation or external transmission",
    "On-premise deployment eliminates the need for DPAs or cross-border transfer agreements",
    "Customer retains full control over data retention, access policies, and deletion",
  ];
  for (const item of dsItems) {
    y = drawWrapped(p, "\u2022  " + item, 50, y, bw - 10, 10, reg, gray);
    y -= 4;
  }

  // Footer on last page
  y -= 20;
  p.drawRectangle({ x: 40, y: y + 8, width: bw, height: 0.5, color: gray });
  y -= 8;
  p.drawText("CONFIDENTIAL — Horaxis Enterprise Solutions | info@horaxis.com", {
    x: 40, y, size: 8, font: reg, color: gray,
  });

  return await pdf.save();
}

// ── Main Handler ──────────────────────────────────────────────────
export const onRequest = async (context) => {
  const { request, env } = context;

  if (request.method !== "POST") return json({ ok: false }, 405);

  const data = await request.json();
  const { name, email, company, erp, message, type } = data;

  const isGuide = type === "it-guide";

  // ── Notification email to Horaxis team ──
  const emailHtml = `
    <div style="font-family:sans-serif; background:#f1f5f9; padding:40px;">
      <div style="background:#ffffff; max-width:600px; margin:0 auto; border-radius:4px; overflow:hidden; border:1px solid #e2e8f0;">
        <div style="background:#0f172a; padding:20px; text-align:center;">
          <img src="https://horaxis.com/assets/img/horaxis-logo.png" width="150" alt="Horaxis">
        </div>
        <div style="padding:40px;">
          <h2 style="margin-top:0; color:#0f172a;">${isGuide ? "IT Guide Request" : "New Pilot Proposal Request"}</h2>
          <hr style="border:0; border-top:1px solid #e2e8f0; margin:20px 0;">
          <p><strong>Lead Name:</strong> ${name}</p>
          <p><strong>Company:</strong> ${company}</p>
          <p><strong>ERP System:</strong> ${erp}</p>
          <p><strong>Work Email:</strong> ${email}</p>
          <p><strong>Inquiry Details:</strong></p>
          <p style="background:#f8fafc; padding:15px; border-radius:4px;">${message || "(no message)"}</p>
        </div>
      </div>
    </div>
  `;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Horaxis System <info@horaxis.com>",
      to: ["demo@horaxis.com"],
      subject: isGuide
        ? `IT GUIDE REQUEST: ${company} (${name})`
        : `PROPOSAL REQUEST: ${company} (${name})`,
      html: emailHtml,
    }),
  });

  // ── Response email to the lead ──
  if (isGuide) {
    // Generate and attach the IT Readiness Guide PDF
    const pdfBytes = await generateITGuide();
    const pdfBase64 = arrayBufferToBase64(pdfBytes);

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Horaxis Enterprise <info@horaxis.com>",
        to: [email],
        subject: "ProcureAI IT Readiness Guide — Horaxis",
        html: `
          <div style="font-family:sans-serif; padding:40px; background:#f8fafc; color:#0f172a;">
            <h2 style="color:#0f172a;">IT Readiness Guide</h2>
            <p>Hi ${name},</p>
            <p>Thank you for your interest in ProcureAI. Attached is our IT Readiness Guide covering deployment architecture, ERP connector specifications, security controls, and network requirements.</p>
            <div style="background:white; padding:20px; border-left:4px solid #ea580c; margin:20px 0;">
              <p style="margin:0;"><strong>Covers:</strong> Docker Compose stack, SAP/Oracle/Dynamics 365 connectors, AES-128 encryption, MFA, RBAC, ML pipeline (34 variables), and hardware sizing.</p>
            </div>
            <p>If you have questions or would like to schedule a technical walkthrough, simply reply to this email.</p>
            <p style="color:#64748b; font-size:12px; margin-top:30px;">Horaxis Enterprise Solutions | info@horaxis.com</p>
          </div>
        `,
        attachments: [
          {
            filename: "Horaxis_IT_Readiness_Guide.pdf",
            content: pdfBase64,
          },
        ],
      }),
    });
  } else {
    // Standard pilot proposal confirmation
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
        html: `<p>Hi ${name},</p><p>Thank you for requesting a Pilot Proposal. Our team will review your ERP requirements (${erp}) and contact you within 1 business day.</p>`,
      }),
    });
  }

  return json({ ok: true });
};
