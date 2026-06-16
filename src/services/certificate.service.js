const prisma = require("../config/db");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const {
  BlobServiceClient,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  StorageSharedKeyCredential,
} = require("@azure/storage-blob");
const {
  SIGNED_URL_EXPIRY_MINUTES,
  AZURE_CONTAINER_NAME,
  PRESENT_STATUSES,
  COMPLETED_OCCURRENCE_STATUS,
  ELIGIBILITY,
} = require("../constants/certificate.constants");

// ─────────────────────────────────────────────────────────────────
// Azure Blob helpers (lazy-initialised singleton)
// ─────────────────────────────────────────────────────────────────
let _blobServiceClient = null;
let _sharedKeyCred = null;

function getBlobServiceClient() {
  if (_blobServiceClient) return _blobServiceClient;

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not configured");
  }
  _blobServiceClient =
    BlobServiceClient.fromConnectionString(connectionString);
  return _blobServiceClient;
}

function getSharedKeyCredential() {
  if (_sharedKeyCred) return _sharedKeyCred;

  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!accountName || !accountKey) {
    throw new Error(
      "AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY must be set for signed URLs"
    );
  }
  _sharedKeyCred = new StorageSharedKeyCredential(accountName, accountKey);
  return _sharedKeyCred;
}

// ─────────────────────────────────────────────────────────────────
// getSettings — read freeThreshold & price from DB at runtime
// ─────────────────────────────────────────────────────────────────
const getSettings = async () => {
  const settings = await prisma.certificateSettings.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!settings) {
    throw new Error(
      "CertificateSettings not configured. An admin must create settings first."
    );
  }

  return {
    freeThreshold: settings.freeThreshold,
    certificatePricePaise: settings.certificatePricePaise,
  };
};

// ─────────────────────────────────────────────────────────────────
// isCourseCompleted — all occurrences for the course have completed
// ─────────────────────────────────────────────────────────────────
const isCourseCompleted = async (courseId) => {
  const totalOccurrences = await prisma.sessionOccurrence.count({
    where: { courseId },
  });

  if (totalOccurrences === 0) return false;

  const completedOccurrences = await prisma.sessionOccurrence.count({
    where: { courseId, status: COMPLETED_OCCURRENCE_STATUS },
  });

  return completedOccurrences === totalOccurrences;
};

// ─────────────────────────────────────────────────────────────────
// calculateAttendance — { attended, total, pct }
// ─────────────────────────────────────────────────────────────────
const calculateAttendance = async (userId, courseId) => {
  // Total completed occurrences = total possible classes
  const total = await prisma.sessionOccurrence.count({
    where: { courseId, status: COMPLETED_OCCURRENCE_STATUS },
  });

  if (total === 0) {
    return { attended: 0, total: 0, pct: 0 };
  }

  // Count how many of those the student attended (present / late / joined)
  const attended = await prisma.studentAttendance.count({
    where: {
      courseId,
      studentId: userId,
      status: { in: PRESENT_STATUSES },
    },
  });

  const pct = parseFloat(((attended / total) * 100).toFixed(2));

  return { attended, total, pct };
};

// ─────────────────────────────────────────────────────────────────
// checkEligibility — FREE | PAID | NONE | INCOMPLETE
// ─────────────────────────────────────────────────────────────────
const checkEligibility = async (userId, courseId) => {
  const courseCompleted = await isCourseCompleted(courseId);
  if (!courseCompleted) {
    return {
      status: ELIGIBILITY.INCOMPLETE,
      attendancePct: 0,
      attended: 0,
      total: 0,
      message: "Course is not yet completed.",
    };
  }

  const { attended, total, pct } = await calculateAttendance(userId, courseId);
  const { freeThreshold, certificatePricePaise } = await getSettings();

  if (pct === 0) {
    return {
      status: ELIGIBILITY.NONE,
      attendancePct: pct,
      attended,
      total,
      message: "Not eligible — 0% attendance.",
    };
  }

  if (pct >= freeThreshold) {
    return {
      status: ELIGIBILITY.FREE,
      attendancePct: pct,
      attended,
      total,
      freeThreshold,
      message: `Eligible for a FREE certificate (${pct}% ≥ ${freeThreshold}%).`,
    };
  }

  // 1% ≤ pct < freeThreshold
  return {
    status: ELIGIBILITY.PAID,
    attendancePct: pct,
    attended,
    total,
    freeThreshold,
    certificatePricePaise,
    message: `Eligible for a PAID certificate (${pct}% < ${freeThreshold}%). Price: ₹${(certificatePricePaise / 100).toFixed(2)}`,
  };
};

// ─────────────────────────────────────────────────────────────────
// getCourseDates — fetch start, end dates and calculate duration
// ─────────────────────────────────────────────────────────────────
const getCourseDates = async (courseId) => {
  const occurrences = await prisma.sessionOccurrence.findMany({
    where: { courseId, status: COMPLETED_OCCURRENCE_STATUS },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, endsAt: true },
  });

  if (!occurrences.length) {
    const now = new Date();
    return { startDate: now, endDate: now, durationDays: 1 };
  }

  const startDate = occurrences[0].startsAt;
  const endDate = occurrences[occurrences.length - 1].endsAt || occurrences[occurrences.length - 1].startsAt;

  // Calculate duration in days (inclusive)
  const diffTime = Math.abs(endDate - startDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return { startDate, endDate, durationDays: diffDays };
};

// ─────────────────────────────────────────────────────────────────
// generateCertificateId — Creates globally unique ID
// ─────────────────────────────────────────────────────────────────
const generateCertificateId = async (courseTitle) => {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, ""); // YYMMDD
  const code = courseTitle 
    ? courseTitle.replace(/[^a-zA-Z0-9]/g, "").substring(0, 2).toUpperCase() 
    : "CR";
  const prefix = `LS-${code}-${dateStr}`;

  const lastCert = await prisma.certificate.findFirst({
    where: { certificateId: { startsWith: prefix } },
    orderBy: { certificateId: "desc" }
  });

  let seq = 1;
  if (lastCert && lastCert.certificateId) {
    const parts = lastCert.certificateId.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`;
};

// ─────────────────────────────────────────────────────────────────
// generateCertificatePDF — create PDF → upload to Azure → return signed URL
// ─────────────────────────────────────────────────────────────────
const generateCertificatePDF = async (userId, courseId, certificate, customOptions = {}) => {
  // Fetch user + course details for the PDF
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const session = await prisma.liveSession.findFirst({
    where: { courseId },
    select: { courseTitle: true, title: true },
  });
  const courseTitle =
    session?.courseTitle || session?.title || "LurnStack Course";

  // Fetch dates and calculate duration
  const { startDate: dbStart, endDate: dbEnd, durationDays } = await getCourseDates(courseId);
  const startDate = customOptions.startDate ? new Date(customOptions.startDate) : dbStart;
  const endDate = customOptions.endDate ? new Date(customOptions.endDate) : dbEnd;

  // Format dates e.g., "05 May 2026"
  const formatDate = (dateObj) => {
    return dateObj.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).replace(/ /g, " ");
  };

  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  
  // Format issue date e.g., "15.05.2026"
  const issuedDate = certificate.issueDate 
    ? new Date(certificate.issueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".") 
    : new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, ".");

  // Generate Credential ID
  const credentialId = certificate.certificateId || `LS-${courseId.substring(0, 2).toUpperCase()}-${Date.now().toString().slice(-6)}`;

  // ── Build PDF in memory ────────────────────────────────────────
  const doc = new PDFDocument({
    size: "A4", // 595.28 x 841.89 points
    layout: "landscape", // 841.89 x 595.28 points
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const pdfReady = new Promise((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  // ── Draw Certificate Design Programmatically ─────────────────────
  // Always draw from scratch so there's no baked-in text to clash with.
  
  // 1. White Background
  doc.fillColor("#ffffff").rect(0, 0, pageW, pageH).fill();
  
  // 2. Gray Borders
  const m = 30; // outer margin
  doc.rect(m, m, pageW - 2 * m, pageH - 2 * m).lineWidth(2).strokeColor("#e2e8f0").stroke();
  doc.rect(m + 6, m + 6, pageW - 2 * m - 12, pageH - 2 * m - 12).lineWidth(1).strokeColor("#cbd5e1").stroke();
  
  // Watermark image
  const watermarkPath = path.join(process.cwd(), "uploads", "certificates", "watermark.jpg");
  if (fs.existsSync(watermarkPath)) {
    try {
      doc.save();
      // Use doc.opacity for images and set it to 15% so it is actually visible
      doc.opacity(0.15);
      const wmSize = 350;
      const wmX = (pageW - wmSize) / 2;
      const wmY = (pageH - wmSize) / 2;
      doc.image(watermarkPath, wmX, wmY, { width: wmSize, height: wmSize });
      doc.restore();
    } catch (e) {
      console.error("Failed to load watermark image", e);
    }
  } else {
    // Fallback: text watermark "t"
    doc.font("Times-Italic").fontSize(400).fillColor("#cbd5e1").fillOpacity(0.08).text("t", (pageW - 400) / 2 + 100, (pageH - 400) / 2, { align: 'center', width: 400 });
    doc.fillOpacity(1); // reset
  }

  // 3. Top-Left Dark Blue Corner Frame
  const blueColor = "#111827"; 
  doc.fillColor(blueColor);
  doc.rect(20, 20, 280, 26).fill(); // Top bar
  doc.rect(20, 20, 26, 280).fill(); // Left bar
  
  // 4. Bottom-Right Green Accents
  doc.fillColor("#84cc16"); // Lighter green
  doc.polygon(
    [pageW - 20, pageH - 20],
    [pageW - 20, pageH - 350],
    [pageW - 350, pageH - 20]
  ).fill();
  doc.fillColor("#65a30d"); // Darker green
  doc.polygon(
    [pageW - 20, pageH - 20],
    [pageW - 20, pageH - 250],
    [pageW - 250, pageH - 20]
  ).fill();
  
  // 5. Logo
  const logoPath = path.join(process.cwd(), "uploads", "logo.png");
  let logoDrawn = false;
  if (fs.existsSync(logoPath)) {
    try { 
      doc.image(logoPath, 80, 70, { width: 140 }); 
      logoDrawn = true; 
    } catch (e) {
      console.error("Failed to load logo image", e);
    }
  } 
  
  if (!logoDrawn) {
    // Draw "t" green logo circle
    doc.circle(110, 100, 30).fillColor("#84cc16").fill();
    doc.font("Times-Italic").fontSize(45).fillColor("#ffffff").text("t", 80, 75, { width: 60, align: 'center' });
    // Text
    doc.font("Helvetica-Bold").fontSize(34).fillColor("#111827").text("LURNSTACK", 160, 75);
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#64748b").text("TAMIL INFO TECHNOLOGY", 160, 112, { characterSpacing: 1 });
  }

  // ── Dynamic Text Rendering ─────────────────────────────────────

  // Bottom Section Alignment
  const bottomY = 480; 

  // 1. Credential ID (Top Right)
  doc.font("Helvetica-Bold")
     .fontSize(10)
     .fillColor("#64748b")
     .text("CREDENTIAL ID", pageW - 220, 75, { width: 150, align: "right", characterSpacing: 1.5 });
  doc.font("Helvetica-Bold")
     .fontSize(14)
     .fillColor("#ffffff")
     .rect(pageW - 220, 95, 150, 30).fillAndStroke("#111827", "#111827");
  doc.fillColor("#ffffff")
     .font("Helvetica-Bold")
     .fontSize(14)
     .text(credentialId, pageW - 220, 103, { width: 150, align: "center", characterSpacing: 1 });

  // 2. CERTIFICATE OF COMPLETION
  doc.font("Helvetica-Bold")
     .fontSize(12)
     .fillColor("#94a3b8")
     .text("CERTIFICATE OF COMPLETION", 0, 170, { align: "center", characterSpacing: 4 });

  // 3. Student Name (Center, Large Bold)
  const studentNameText = customOptions.studentName || certificate.studentName || user.fullName;
  doc.font("Helvetica-Bold")
     .fontSize(48)
     .fillColor("#0f172a")
     .text(studentNameText.toUpperCase(), 0, 205, { align: "center" });

  // 4. Description Paragraph
  const descText = `This is to certify that ${studentNameText} has successfully completed the ${courseTitle} course offered by Lurnstack (Tamil Info Technology Pvt. Ltd.). The course was conducted for a duration of ${durationDays} days, from ${formattedStartDate} to ${formattedEndDate}.`;

  const descText2 = `During the period, they gained comprehensive knowledge in ${courseTitle} concepts, including fundamentals, application development, data processing, and problem-solving, demonstrating strong technical aptitude and dedication. We congratulate the learner on this achievement and wish them continued success in their future endeavors.`;

  doc.font("Times-Roman")
     .fontSize(15)
     .fillColor("#334155")
     .text(descText, 100, 275, { align: "center", lineGap: 6, width: pageW - 200 });
     
  doc.font("Helvetica")
     .fontSize(11)
     .fillColor("#64748b")
     .text(descText2, 100, 335, { align: "center", lineGap: 5, width: pageW - 200 });

  // 6. Date of Issue (Bottom Left)
  doc.font("Helvetica-Bold")
     .fontSize(15)
     .fillColor("#111827")
     .text(issuedDate, 80, bottomY - 30, { width: 180, align: "center" });
  doc.moveTo(80, bottomY).lineTo(260, bottomY).lineWidth(1).strokeColor("#94a3b8").stroke();
  doc.font("Helvetica-Bold")
     .fontSize(10)
     .fillColor("#64748b")
     .text("DATE OF ISSUE", 80, bottomY + 10, { width: 180, align: "center", characterSpacing: 1.5 });

  // 5. QR Code (Bottom Center)
  if (certificate.verificationUrl) {
    try {
      const qrBuffer = await QRCode.toBuffer(certificate.verificationUrl, { margin: 1, color: { dark: '#111827', light: '#ffffff' } });
      const qrSize = 80;
      const qrX = (pageW / 2) - (qrSize / 2);
      const qrY = bottomY - 60;
      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
      
      // Add green "t" inside QR
      doc.rect(qrX + (qrSize/2) - 8, qrY + (qrSize/2) - 8, 16, 16).fillColor("#ffffff").fill();
      doc.circle(qrX + (qrSize/2), qrY + (qrSize/2), 6).fillColor("#84cc16").fill();
      doc.font("Times-Italic").fontSize(9).fillColor("#ffffff").text("t", qrX + (qrSize/2) - 5, qrY + (qrSize/2) - 4, {width: 10, align: "center"});
    } catch (err) {
      console.error("Failed to generate QR code", err);
    }
  }

  // 7. Signature (Bottom Right)
  const signatureImagePath = path.join(process.cwd(), "uploads", "signature.png");
  
  if (fs.existsSync(signatureImagePath)) {
    try {
      doc.image(signatureImagePath, pageW - 230, bottomY - 65, { width: 120 });
    } catch (e) {
      console.error("Failed to load signature image", e);
    }
  } else {
    const cursiveFontPath = path.join(process.cwd(), "uploads", "DancingScript.ttf");
    if (fs.existsSync(cursiveFontPath)) {
      doc.registerFont("CursiveSignature", cursiveFontPath);
    }
    const signatureFont = fs.existsSync(cursiveFontPath) ? "CursiveSignature" : "Times-Italic";
    doc.font(signatureFont)
       .fontSize(44)
       .fillColor("#111827")
       .text("Priya. P", pageW - 260, bottomY - 50, { width: 180, align: "center" });
  }

  doc.moveTo(pageW - 260, bottomY).lineTo(pageW - 80, bottomY).lineWidth(1).strokeColor("#94a3b8").stroke();
  doc.font("Helvetica-Bold")
     .fontSize(10)
     .fillColor("#64748b")
     .text("AUTHORIZED SIGNATURE", pageW - 260, bottomY + 10, { width: 180, align: "center", characterSpacing: 1.5 });

  doc.end();

  const pdfBuffer = await pdfReady;

  // ── Upload to Azure Blob Storage ───────────────────────────────
  let blobName = `cert_${certificate.id}.pdf`;
  let saveLocally = false;

  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    try {
      const blobClient = getBlobServiceClient();
      const containerClient = blobClient.getContainerClient(AZURE_CONTAINER_NAME);
      await containerClient.createIfNotExists({ access: undefined }); // private

      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(pdfBuffer, {
        blobHTTPHeaders: { blobContentType: "application/pdf" },
      });
    } catch (err) {
      console.warn("Azure upload failed, falling back to local:", err.message);
      saveLocally = true;
    }
  } else {
    console.warn("AZURE_STORAGE_CONNECTION_STRING not set. Saving locally.");
    saveLocally = true;
  }

  // Handle local saving
  if (saveLocally) {
    try {
      const fs = require("fs");
      const path = require("path");
      const uploadDir = path.join(process.cwd(), "uploads", "certificates");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, blobName), pdfBuffer);
    } catch (fsErr) {
      console.error("Failed to save PDF locally:", fsErr);
    }
  }

  // Store the blob name (not a signed URL) in DB
  await prisma.certificate.update({
    where: { id: certificate.id },
    data: {
      certificateUrl: blobName,
      issuedAt: new Date(),
    },
  });

  // Return a signed download URL
  return getSignedDownloadUrl(blobName, saveLocally);
};

// ─────────────────────────────────────────────────────────────────
// getSignedDownloadUrl — generate a fresh SAS-signed URL
// ─────────────────────────────────────────────────────────────────
const getSignedDownloadUrl = (blobName, isLocal = false) => {
  if (isLocal || !process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return `/api/certificates/download/local/${blobName}`;
  }

  const sharedKeyCred = getSharedKeyCredential();
  const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME;

  const expiresOn = new Date();
  expiresOn.setMinutes(expiresOn.getMinutes() + SIGNED_URL_EXPIRY_MINUTES);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: AZURE_CONTAINER_NAME,
      blobName,
      permissions: BlobSASPermissions.parse("r"), // read-only
      expiresOn,
    },
    sharedKeyCred
  ).toString();

  return `https://${accountName}.blob.core.windows.net/${AZURE_CONTAINER_NAME}/${blobName}?${sasToken}`;
};

// ─────────────────────────────────────────────────────────────────
// trackDownload — log a DOWNLOAD event
// ─────────────────────────────────────────────────────────────────
const trackDownload = async (certificateId, ipAddress) => {
  await prisma.certificateLog.create({
    data: {
      certificateId,
      event: "DOWNLOAD",
      ipAddress: ipAddress || null,
    },
  });
};

// ─────────────────────────────────────────────────────────────────
// trackPurchase — log a PURCHASE event with payment reference
// ─────────────────────────────────────────────────────────────────
const trackPurchase = async (certificateId, paymentRef) => {
  await prisma.certificateLog.create({
    data: {
      certificateId,
      event: "PURCHASE",
      metadata: paymentRef ? { paymentRef } : undefined,
    },
  });
};

module.exports = {
  getSettings,
  isCourseCompleted,
  calculateAttendance,
  checkEligibility,
  generateCertificatePDF,
  getSignedDownloadUrl,
  trackDownload,
  trackPurchase,
  generateCertificateId,
};
