const prisma = require('../src/config/db');
const certificateService = require('../src/services/certificate.service');
const fs = require('fs');
const path = require('path');

const students = [
  {
    studentName: "Sanjay S",
    courseTitle: "Database",
    categoryName: "Database",
    startDate: new Date("2026-06-30T00:00:00Z"),
    endDate: new Date("2026-07-31T00:00:00Z"),
    issueDate: new Date("2026-08-01T00:00:00Z")
  },
  {
    studentName: "Sharvesh V",
    courseTitle: "Oracle SQL",
    categoryName: "Database",
    startDate: new Date("2026-07-01T00:00:00Z"),
    endDate: new Date("2026-07-31T00:00:00Z"),
    issueDate: new Date("2026-08-01T00:00:00Z")
  },
  {
    studentName: "ANUSA.S",
    courseTitle: "Oracle SQL",
    categoryName: "Database",
    startDate: new Date("2026-06-30T00:00:00Z"),
    endDate: new Date("2026-07-31T00:00:00Z"),
    issueDate: new Date("2026-08-01T00:00:00Z")
  },
  {
    studentName: "SNEGA M",
    courseTitle: "Oracle SQL",
    categoryName: "Database",
    startDate: new Date("2026-07-20T00:00:00Z"),
    endDate: new Date("2026-07-31T00:00:00Z"),
    issueDate: new Date("2026-08-01T00:00:00Z")
  }
];

async function generateAllVerified() {
  console.log("=== Generating Verified Official Manual Certificates ===");

  const results = [];

  for (const student of students) {
    console.log(`\nGenerating verified certificate for: ${student.studentName}...`);
    
    // Find or fallback student user
    let user = await prisma.user.findFirst({
      where: { fullName: { contains: student.studentName.split(' ')[0], mode: "insensitive" } }
    }) || await prisma.user.findFirst({ where: { role: "STUDENT" } }) || await prisma.user.findFirst({});

    const userId = user ? user.id : 1;
    const courseId = `manual-${student.courseTitle.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;

    // 1. Generate official unique Credential ID (e.g., LS-DA-260803-0001)
    const credentialId = await certificateService.generateCertificateId(student.courseTitle);
    const verificationUrl = `https://lurnstack.com/verify/${credentialId}`;

    const certMock = {
      id: `manual_${Date.now()}`,
      certificateId: credentialId,
      studentName: student.studentName,
      verificationUrl,
      issueDate: student.issueDate
    };

    // 2. Generate PDF
    const pdfUrl = await certificateService.generateCertificatePDF(
      userId,
      courseId,
      certMock,
      {
        studentName: student.studentName,
        startDate: student.startDate,
        endDate: student.endDate,
        categoryName: student.categoryName
      }
    );

    const blobName = pdfUrl.split('/').pop().split('?')[0];

    // 3. Save to database so scanning QR code / Chrome URL returns VALID!
    const certRecord = await prisma.certificate.upsert({
      where: { certificateId: credentialId },
      update: {
        studentName: student.studentName,
        courseName: student.courseTitle,
        collegeName: "Tamil Info Technology Pvt. Ltd.",
        issueDate: student.issueDate,
        completionDate: student.endDate,
        verificationUrl,
        paymentStatus: "PAID",
        certificateType: "FREE",
        certificateUrl: blobName,
        issuedAt: student.issueDate
      },
      create: {
        userId,
        courseId,
        certificateId: credentialId,
        studentName: student.studentName,
        courseName: student.courseTitle,
        collegeName: "Tamil Info Technology Pvt. Ltd.",
        issueDate: student.issueDate,
        completionDate: student.endDate,
        verificationUrl,
        attendancePct: 100,
        certificateType: "FREE",
        paymentStatus: "PAID",
        certificateUrl: blobName,
        issuedAt: student.issueDate
      }
    });

    // Copy to named PDF file
    const safeName = student.studentName.replace(/[^a-zA-Z0-9]/g, '_');
    const localPdfPath = path.join(process.cwd(), "uploads", "certificates", blobName);
    const friendlyPdfPath = path.join(process.cwd(), "uploads", "certificates", `${safeName}_Certificate.pdf`);

    if (fs.existsSync(localPdfPath)) {
      fs.copyFileSync(localPdfPath, friendlyPdfPath);
    }

    results.push({
      studentName: student.studentName,
      credentialId,
      verificationUrl,
      friendlyPdfPath,
      fileName: `${safeName}_Certificate.pdf`
    });

    console.log(`✅ Success for ${student.studentName}!`);
    console.log(`   Credential ID : ${credentialId}`);
    console.log(`   Verification  : ${verificationUrl}`);
    console.log(`   Local File    : ${friendlyPdfPath}`);
  }

  console.log("\n==========================================");
  console.log("All certificates generated & registered in DB!");
  console.log(JSON.stringify(results, null, 2));
  console.log("==========================================");
}

generateAllVerified()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
