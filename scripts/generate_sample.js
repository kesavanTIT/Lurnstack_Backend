const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

async function generateSample() {
  const outputPath = path.join(__dirname, "..", "sample_certificate.pdf");
  
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  doc.pipe(fs.createWriteStream(outputPath));

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  // 1. White Background
  doc.fillColor("#ffffff").rect(0, 0, pageW, pageH).fill();
  
  // 2. Gray Borders
  const m = 30; // outer margin
  doc.rect(m, m, pageW - 2 * m, pageH - 2 * m).lineWidth(2).strokeColor("#e2e8f0").stroke();
  doc.rect(m + 6, m + 6, pageW - 2 * m - 12, pageH - 2 * m - 12).lineWidth(1).strokeColor("#cbd5e1").stroke();
  
  // Watermark fallback
  doc.font("Times-Italic").fontSize(400).fillColor("#cbd5e1").fillOpacity(0.08).text("t", (pageW - 400) / 2 + 100, (pageH - 400) / 2, { align: 'center', width: 400 });
  doc.fillOpacity(1); // reset

  // 3. Top-Left Dark Blue Corner Frame
  const blueColor = "#111827"; 
  doc.fillColor(blueColor);
  doc.rect(20, 20, 280, 26).fill(); // Top bar
  doc.rect(20, 20, 26, 280).fill(); // Left bar
  
  // 4. Bottom-Right Green Accents
  doc.fillColor("#84cc16"); // Lighter green
  doc.polygon([pageW - 20, pageH - 20], [pageW - 20, pageH - 350], [pageW - 350, pageH - 20]).fill();
  doc.fillColor("#65a30d"); // Darker green
  doc.polygon([pageW - 20, pageH - 20], [pageW - 20, pageH - 250], [pageW - 250, pageH - 20]).fill();
  
  // 5. Logo fallback
  doc.circle(110, 100, 30).fillColor("#84cc16").fill();
  doc.font("Times-Italic").fontSize(45).fillColor("#ffffff").text("t", 80, 75, { width: 60, align: 'center' });
  doc.font("Helvetica-Bold").fontSize(34).fillColor("#111827").text("LURNSTACK", 160, 75);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#64748b").text("TAMIL INFO TECHNOLOGY", 160, 112, { characterSpacing: 1 });

  // ── Dynamic Text ──────────────────────────────────────────────
  const bottomY = 480; 

  // Credential ID
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("CREDENTIAL ID", pageW - 220, 75, { width: 150, align: "right", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#ffffff").rect(pageW - 220, 95, 150, 30).fillAndStroke("#111827", "#111827");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text("LS-RE-260505", pageW - 220, 103, { width: 150, align: "center", characterSpacing: 1 });

  // CERTIFICATE OF COMPLETION
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#94a3b8").text("CERTIFICATE OF COMPLETION", 0, 170, { align: "center", characterSpacing: 4 });

  // Student Name
  doc.font("Helvetica-Bold").fontSize(48).fillColor("#0f172a").text("HORA JENCY. S", 0, 205, { align: "center" });

  // Descriptions
  const descText = "This is to certify that HORA JENCY. S has successfully completed the React JS course offered by Lurnstack (Tamil Info Technology Pvt. Ltd.). The course was conducted for a duration of 15 days, from 05 May 2026 to 20 May 2026.";
  const descText2 = "During the period, they gained comprehensive knowledge in React JS concepts, including fundamentals, application development, data processing, and problem-solving, demonstrating strong technical aptitude and dedication. We congratulate the learner on this achievement and wish them continued success in their future endeavors.";

  doc.font("Times-Roman").fontSize(15).fillColor("#334155").text(descText, 100, 275, { align: "center", lineGap: 6, width: pageW - 200 });
  doc.font("Helvetica").fontSize(11).fillColor("#64748b").text(descText2, 100, 335, { align: "center", lineGap: 5, width: pageW - 200 });

  // Issue Date
  doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827").text("20.05.2026", 80, bottomY - 30, { width: 180, align: "center" });
  doc.moveTo(80, bottomY).lineTo(260, bottomY).lineWidth(1).strokeColor("#94a3b8").stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("DATE OF ISSUE", 80, bottomY + 10, { width: 180, align: "center", characterSpacing: 1.5 });

  // QR
  try {
    const qrBuffer = await QRCode.toBuffer("https://lurnstack.com/verify/LS-RE-260505", { margin: 1, color: { dark: '#111827', light: '#ffffff' } });
    const qrSize = 80;
    const qrX = (pageW / 2) - (qrSize / 2);
    const qrY = bottomY - 60;
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
    doc.rect(qrX + (qrSize/2) - 8, qrY + (qrSize/2) - 8, 16, 16).fillColor("#ffffff").fill();
    doc.circle(qrX + (qrSize/2), qrY + (qrSize/2), 6).fillColor("#84cc16").fill();
    doc.font("Times-Italic").fontSize(9).fillColor("#ffffff").text("t", qrX + (qrSize/2) - 5, qrY + (qrSize/2) - 4, {width: 10, align: "center"});
  } catch (err) {}

  // Signature
  doc.font("Times-Italic").fontSize(44).fillColor("#111827").text("Priya. P", pageW - 260, bottomY - 50, { width: 180, align: "center" });
  doc.moveTo(pageW - 260, bottomY).lineTo(pageW - 80, bottomY).lineWidth(1).strokeColor("#94a3b8").stroke();
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("AUTHORIZED SIGNATURE", pageW - 260, bottomY + 10, { width: 180, align: "center", characterSpacing: 1.5 });

  doc.end();
  console.log("✅ PDF Generated successfully at:", outputPath);
}

generateSample();
