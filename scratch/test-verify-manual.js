const prisma = require('../src/config/db');
const certificateService = require('../src/services/certificate.service');
const fs = require('fs');
const path = require('path');

async function createVerifiedManualCertificate() {
  console.log("=== Creating Verified Manual Certificate ===");

  const studentName = "Sharvesh V";
  const courseTitle = "Oracle SQL";
  const categoryName = "Database";
  const startDate = new Date("2026-07-01T00:00:00Z");
  const endDate = new Date("2026-07-31T00:00:00Z");
  const issueDate = new Date();

  // Find or use any student user (or first student user)
  let student = await prisma.user.findFirst({
    where: { fullName: { contains: "Sharvesh", mode: "insensitive" } }
  });

  if (!student) {
    student = await prisma.user.findFirst({
      where: { role: "STUDENT" }
    });
  }

  if (!student) {
    student = await prisma.user.findFirst({});
  }

  const userId = student ? student.id : 1;
  const courseId = "manual-oracle-sql-" + Date.now();

  // Generate REAL official Credential ID (e.g. LS-OS-260801-0001)
  const credentialId = await certificateService.generateCertificateId(courseTitle);
  const verificationUrl = `https://lurnstack.com/verify/${credentialId}`;

  console.log(`Generated Real Credential ID: ${credentialId}`);
  console.log(`Verification URL: ${verificationUrl}`);

  // Create PDF using real credential ID
  const certMock = {
    id: `manual_${Date.now()}`,
    certificateId: credentialId,
    studentName,
    verificationUrl,
    issueDate
  };

  const pdfUrl = await certificateService.generateCertificatePDF(
    userId,
    courseId,
    certMock,
    {
      studentName,
      startDate,
      endDate,
      categoryName
    }
  );

  // Extract blob filename
  const blobName = pdfUrl.split('/').pop().split('?')[0];

  // Upsert Certificate in database so verification route returns VALID!
  const certRecord = await prisma.certificate.upsert({
    where: { certificateId: credentialId },
    update: {
      studentName,
      courseName: courseTitle,
      collegeName: "LurnStack Learner",
      issueDate,
      completionDate: endDate,
      verificationUrl,
      paymentStatus: "PAID",
      certificateType: "FREE",
      certificateUrl: blobName,
      issuedAt: issueDate
    },
    create: {
      userId,
      courseId,
      certificateId: credentialId,
      studentName,
      courseName: courseTitle,
      collegeName: "LurnStack Learner",
      issueDate,
      completionDate: endDate,
      verificationUrl,
      attendancePct: 100,
      certificateType: "FREE",
      paymentStatus: "PAID",
      certificateUrl: blobName,
      issuedAt: issueDate
    }
  });

  console.log("✅ DB Record Created Successfully!", certRecord.id);

  // Copy PDF to uploads/certificates/Sharvesh_V_Certificate.pdf
  const localPdfPath = path.join(process.cwd(), "uploads", "certificates", blobName);
  const friendlyPdfPath = path.join(process.cwd(), "uploads", "certificates", "Sharvesh_V_Certificate.pdf");
  if (fs.existsSync(localPdfPath)) {
    fs.copyFileSync(localPdfPath, friendlyPdfPath);
    console.log(`✅ Copy saved to: ${friendlyPdfPath}`);
  }

  console.log("\n=== Test Verification API Query ===");
  const verifyCheck = await prisma.certificate.findUnique({
    where: { certificateId: credentialId }
  });
  console.log("Verification DB Lookup Result:", verifyCheck ? "VALID RECORD FOUND" : "NOT FOUND");
  console.log("Status:", verifyCheck?.paymentStatus);
}

createVerifiedManualCertificate()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
