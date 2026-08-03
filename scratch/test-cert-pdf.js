const certificateService = require('../src/services/certificate.service');
const fs = require('fs');
const path = require('path');

async function testPdfGen() {
  console.log("Generating sample certificate PDF with new logo...");
  const startDate = new Date("2026-06-30T00:00:00Z");
  const endDate = new Date("2026-07-31T00:00:00Z");

  const pdfUrl = await certificateService.generateMockCertificatePDF(
    "SANJAY S",
    "Database",
    startDate,
    endDate,
    "DATABASE"
  );
  console.log("Mock PDF generated successfully!", pdfUrl);
}

testPdfGen().catch(console.error);
