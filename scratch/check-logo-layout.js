const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

async function testLogoRender() {
  const doc = new PDFDocument({
    size: "A4", layout: "landscape", margins: { top: 0, bottom: 0, left: 0, right: 0 }
  });

  const stream = fs.createWriteStream(path.join(__dirname, 'test_output.pdf'));
  doc.pipe(stream);

  const pageW = doc.page.width; // 841.89
  const pageH = doc.page.height; // 595.28

  // 1. Background
  doc.fillColor("#ffffff").rect(0, 0, pageW, pageH).fill();
  
  // 2. Borders
  const m = 30;
  doc.rect(m, m, pageW - 2 * m, pageH - 2 * m).lineWidth(2).strokeColor("#e2e8f0").stroke();
  doc.rect(m + 6, m + 6, pageW - 2 * m - 12, pageH - 2 * m - 12).lineWidth(1).strokeColor("#cbd5e1").stroke();

  // 3. Corner bar
  doc.fillColor("#111827").rect(20, 20, 280, 26).fill();
  doc.fillColor("#111827").rect(20, 20, 26, 280).fill();

  // 4. Logo4.png
  const logoPath = path.join(process.cwd(), "templates", "Logo4.png");
  console.log("Logo exists:", fs.existsSync(logoPath));

  if (fs.existsSync(logoPath)) {
    // Draw Logo image cleanly
    doc.image(logoPath, 70, 55, { width: 110 });
  }

  // Credential ID (Top Right)
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#64748b").text("CREDENTIAL ID", pageW - 220, 65, { width: 150, align: "right" });
  doc.rect(pageW - 220, 80, 150, 30).fillAndStroke("#111827", "#111827");
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(14).text("LS-DA-260801-0001", pageW - 220, 88, { width: 150, align: "center" });

  // Certificate title
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#94a3b8").text("CERTIFICATE OF COMPLETION", 0, 175, { align: "center" });

  doc.end();
  console.log("PDF written to scratch/test_output.pdf");
}

testLogoRender();
