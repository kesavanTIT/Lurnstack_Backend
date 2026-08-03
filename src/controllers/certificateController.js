const prisma = require("../config/db");
const crypto = require("crypto");
const certificateService = require("../services/certificate.service");
const { ELIGIBILITY } = require("../constants/certificate.constants");

// ─────────────────────────────────────────────────────────────────
// 1. GET /api/courses/:courseId/eligibility
// @desc    Check certificate eligibility for the logged-in student
// ─────────────────────────────────────────────────────────────────
const getEligibility = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.params;

    if (!courseId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId is required." });
    }

    const result = await certificateService.checkEligibility(userId, courseId);

    // If a certificate already exists, include its info
    const existing = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
      select: {
        id: true,
        certificateType: true,
        paymentStatus: true,
        issuedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        ...result,
        existingCertificate: existing || null,
      },
    });
  } catch (error) {
    console.error("Certificate Eligibility Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 2. POST /api/certificates/generate
// @desc    Generate certificate (idempotent). FREE certs only.
//          PAID certs must go through /purchase first.
// ─────────────────────────────────────────────────────────────────
const generateCertificate = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId, studentName: customStudentName, startDate: customStartDate, endDate: customEndDate, collegeName: customCollegeName } = req.body;


    if (!courseId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId is required in body." });
    }

    if ((customStartDate && !customEndDate) || (!customStartDate && customEndDate)) {
      return res.status(400).json({
        success: false,
        message: "When providing custom dates, both startDate and endDate are mandatory."
      });
    }

    if (courseId.startsWith("mock-")) {
      const studentName = customStudentName || "Demo Student";
      const startDate = customStartDate ? new Date(customStartDate) : new Date("2026-05-05T10:00:00Z");
      const endDate = customEndDate ? new Date(customEndDate) : new Date("2026-05-20T10:00:00Z");
      const courseTitle = "React Development Masterclass (Demo)";
      
      const signedUrl = await certificateService.generateMockCertificatePDF(
        studentName, courseTitle, startDate, endDate
      );

      return res.status(201).json({
        success: true,
        certificateId: `LS-DEMO-${Date.now()}`,
        pdfUrl: signedUrl,
        message: "Demo Certificate generated successfully.",
        data: {
          certificateId: `demo-cert-${Date.now()}`,
          certificateType: "FREE",
          paymentStatus: "PAID",
          issuedAt: new Date().toISOString(),
          downloadUrl: signedUrl,
        },
      });
    }

    // ── Idempotency: return existing if found ──────────────────
    const existing = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    const hasCustomData = customStudentName || customStartDate || customEndDate || customCollegeName;

    if (existing && existing.certificateUrl && !hasCustomData) {
      const signedUrl = certificateService.getSignedDownloadUrl(
        existing.certificateUrl
      );
      return res.status(200).json({
        success: true,
        message: "Certificate already exists.",
        data: {
          certificateId: existing.id,
          certificateType: existing.certificateType,
          paymentStatus: existing.paymentStatus,
          issuedAt: existing.issuedAt,
          downloadUrl: signedUrl,
        },
      });
    }

    // ── Check eligibility ──────────────────────────────────────
    const eligibility = await certificateService.checkEligibility(
      userId,
      courseId
    );

    if (eligibility.status === "INELIGIBLE") {
      return res.status(403).json({
        success: false,
        message: eligibility.message,
        eligibility: eligibility.status,
      });
    }

    if (eligibility.status === ELIGIBILITY.INCOMPLETE) {
      return res.status(400).json({
        success: false,
        message: eligibility.message,
        eligibility: eligibility.status,
      });
    }

    if (eligibility.status === ELIGIBILITY.NONE) {
      return res.status(403).json({
        success: false,
        message: eligibility.message,
        eligibility: eligibility.status,
      });
    }

    // Fetch details for ID generation
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const session = await prisma.liveSession.findFirst({
      where: {
        OR: [
          { courseId },
          { id: courseId }
        ]
      }
    });
    const courseName = session?.courseTitle || session?.title || "LurnStack Course";
    const studentName = customStudentName || user?.fullName || "Student";
    const collegeName = customCollegeName || null;
    
    let certificateId = existing?.certificateId;
    if (!certificateId) {
      certificateId = await certificateService.generateCertificateId(courseName);
    }
    const verificationUrl = `https://lurnstack.com/verify/${certificateId}`;
    const issueDate = new Date();
    const { endDate: completionDate } = await certificateService.getCourseDates(courseId);

    // ── Generate certificate immediately (FREE or paid-eligible) ──
    const cert = await prisma.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        certificateId, studentName, courseName, collegeName, verificationUrl, issueDate, completionDate,
        paymentStatus: "PAID",
        certificateType: eligibility.type || "FREE",
      },
      create: {
        userId,
        courseId,
        certificateId, studentName, courseName, collegeName, verificationUrl, issueDate, completionDate,
        attendancePct: eligibility.attendancePct,
        certificateType: eligibility.type || "FREE",
        paymentStatus: "PAID", // Auto-paid since they are eligible (Free count met or Paid course purchased)
      },
    });

    const signedUrl = await certificateService.generateCertificatePDF(
      userId,
      courseId,
      cert,
      { 
        studentName: customStudentName, 
        startDate: customStartDate, 
        endDate: customEndDate,
        collegeName: customCollegeName
      }
    );

    return res.status(201).json({
      success: true,
      certificateId: cert.certificateId,
      verificationUrl: cert.verificationUrl,
      pdfUrl: signedUrl,
      message: "Certificate generated successfully.",
      data: {
        certificateId: cert.id,
        certificateType: cert.certificateType,
        paymentStatus: "PAID",
        issuedAt: new Date().toISOString(),
        downloadUrl: signedUrl,
      },
    });
  } catch (error) {
    console.error("Generate Certificate Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 3. GET /api/certificates/:id/download
// @desc    Get a fresh signed download URL for an issued certificate
// ─────────────────────────────────────────────────────────────────
const downloadCertificate = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { id } = req.params;

    let certificate = await prisma.certificate.findFirst({
      where: { certificateId: id },
    });
    
    if (!certificate && !isNaN(id)) {
      try {
        certificate = await prisma.certificate.findFirst({
          where: { id: id },
        });
      } catch (e) {
        // Ignore parsing errors
      }
    }

    if (!certificate) {
      return res
        .status(404)
        .json({ success: false, message: "Certificate not found." });
    }

    if (certificate.userId !== userId) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied." });
    }

    if (!certificate.certificateUrl) {
      return res.status(400).json({
        success: false,
        message: "Certificate has not been generated yet.",
      });
    }

    if (
      certificate.certificateType === "PAID" &&
      certificate.paymentStatus !== "PAID"
    ) {
      return res.status(402).json({
        success: false,
        message: "Payment required before downloading.",
      });
    }

    const signedUrl = certificateService.getSignedDownloadUrl(
      certificate.certificateUrl
    );

    // Log download
    const clientIp =
      req.headers["x-forwarded-for"] || req.connection?.remoteAddress || null;
    await certificateService.trackDownload(certificate.id, clientIp);

    return res.status(200).json({
      success: true,
      data: {
        certificateId: certificate.id,
        downloadUrl: signedUrl,
        expiresInMinutes: 15,
      },
    });
  } catch (error) {
    console.error("Download Certificate Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 4. POST /api/certificates/purchase
// @desc    Create a Razorpay order for a PAID certificate
// ─────────────────────────────────────────────────────────────────
const purchaseCertificate = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.body;

    if (!courseId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId is required." });
    }

    // Verify eligibility is PAID
    const eligibility = await certificateService.checkEligibility(
      userId,
      courseId
    );

    if (eligibility.status === ELIGIBILITY.FREE) {
      return res.status(400).json({
        success: false,
        message:
          "You are eligible for a FREE certificate. Use /api/certificates/generate instead.",
      });
    }

    if (
      eligibility.status === ELIGIBILITY.NONE ||
      eligibility.status === ELIGIBILITY.INCOMPLETE
    ) {
      return res.status(403).json({
        success: false,
        message: eligibility.message,
      });
    }

    // Check if already paid
    const existingCert = await prisma.certificate.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (existingCert && existingCert.paymentStatus === "PAID") {
      return res.status(409).json({
        success: false,
        message: "Certificate already paid for.",
        alreadyPaid: true,
        certificateId: existingCert.id,
      });
    }

    // Validate Razorpay credentials
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error("[CERT] Missing Razorpay credentials");
      return res.status(500).json({
        success: false,
        message: "Payment gateway not configured.",
      });
    }

    const Razorpay = require("razorpay");
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    // Fetch details for ID generation
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const session = await prisma.liveSession.findFirst({ where: { courseId } });
    const courseName = session?.courseTitle || session?.title || "LurnStack Course";
    const studentName = user?.fullName || "Student";
    
    let certificateId = existingCert?.certificateId;
    if (!certificateId) {
      certificateId = await certificateService.generateCertificateId(courseName);
    }
    const verificationUrl = `https://lurnstack.com/verify/${certificateId}`;
    const issueDate = new Date();
    const { endDate: completionDate } = await certificateService.getCourseDates(courseId);

    // Upsert certificate record
    const cert = await prisma.certificate.upsert({
      where: { userId_courseId: { userId, courseId } },
      update: {
        certificateId, studentName, courseName, verificationUrl, issueDate, completionDate,
        attendancePct: eligibility.attendancePct,
        certificateType: "PAID",
        paymentStatus: "PENDING",
      },
      create: {
        userId,
        courseId,
        certificateId, studentName, courseName, verificationUrl, issueDate, completionDate,
        attendancePct: eligibility.attendancePct,
        certificateType: "PAID",
        paymentStatus: "PENDING",
      },
    });

    // Create Razorpay order
    const certificatePricePaise = eligibility.certificatePricePaise; // Fixed missing reference
    const order = await razorpay.orders.create({
      amount: certificatePricePaise,
      currency: "INR",
      receipt: `cert_${cert.id.substring(0, 20)}`,
      notes: {
        certificateId: cert.id,
        userId: String(userId),
        courseId,
        type: "certificate_purchase",
      },
    });

    // Store the order ID on the certificate
    await prisma.certificate.update({
      where: { id: cert.id },
      data: { razorpayOrderId: order.id },
    });

    // Fetch student details for checkout
    const student = await prisma.user.findUnique({
      where: { id: userId },
      select: { fullName: true, email: true, phoneNumber: true },
    });

    return res.status(201).json({
      success: true,
      data: {
        certificateId: cert.id,
        razorpayOrderId: order.id,
        amountPaise: certificatePricePaise,
        currency: "INR",
        keyId: process.env.RAZORPAY_KEY_ID,
        student: {
          name: student?.fullName || "Student",
          email: student?.email || "",
          phone: student?.phoneNumber || "",
        },
      },
    });
  } catch (error) {
    console.error("Purchase Certificate Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 5. POST /api/certificates/payment/verify
// @desc    Razorpay webhook handler for certificate purchases
//          Mounted with express.raw() — never trust client
// ─────────────────────────────────────────────────────────────────
const verifyCertPayment = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res
        .status(400)
        .json({ success: false, message: "Missing signature." });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("[CERT WEBHOOK] RAZORPAY_WEBHOOK_SECRET not configured");
      return res
        .status(500)
        .json({ success: false, message: "Webhook secret not configured." });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : req.body;
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSig !== signature) {
      console.error("[CERT WEBHOOK] Invalid signature");
      return res
        .status(400)
        .json({ success: false, message: "Invalid signature." });
    }

    let eventData;
    try {
      eventData = JSON.parse(rawBody);
    } catch {
      return res
        .status(400)
        .json({ success: false, message: "Invalid JSON payload." });
    }

    const event = eventData.event;
    console.log(`[CERT WEBHOOK] Event: ${event}`);

    if (event !== "order.paid" && event !== "payment.captured") {
      // We only care about successful payments for certificates
      return res
        .status(200)
        .json({ success: true, message: "Event ignored." });
    }

    const orderEntity = eventData.payload.order?.entity;
    const paymentEntity = eventData.payload.payment?.entity;
    const razorpayOrderId = orderEntity?.id || paymentEntity?.order_id;
    const notes = orderEntity?.notes || paymentEntity?.notes || {};

    // Only process certificate payments
    if (notes.type !== "certificate_purchase") {
      return res
        .status(200)
        .json({ success: true, message: "Not a certificate payment." });
    }

    if (!razorpayOrderId) {
      console.warn("[CERT WEBHOOK] No razorpayOrderId found");
      return res
        .status(200)
        .json({ success: true, message: "No order ID." });
    }

    // Find the certificate by Razorpay order ID
    const certificate = await prisma.certificate.findUnique({
      where: { razorpayOrderId },
    });

    if (!certificate) {
      console.warn(
        `[CERT WEBHOOK] No certificate for order: ${razorpayOrderId}`
      );
      return res
        .status(200)
        .json({ success: true, message: "Certificate not found for order." });
    }

    if (certificate.paymentStatus === "PAID") {
      console.log(
        `[CERT WEBHOOK] Certificate ${certificate.id} already paid.`
      );
      return res
        .status(200)
        .json({ success: true, message: "Already processed." });
    }

    // Mark as paid
    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { paymentStatus: "PAID" },
    });

    // Generate the PDF now that payment is confirmed
    try {
      await certificateService.generateCertificatePDF(
        certificate.userId,
        certificate.courseId,
        certificate
      );
      console.log(
        `[CERT WEBHOOK] PDF generated for certificate ${certificate.id}`
      );
    } catch (pdfErr) {
      console.error(
        `[CERT WEBHOOK] PDF generation failed for ${certificate.id}:`,
        pdfErr
      );
      // Payment is still marked as PAID — PDF can be retried later
    }

    // Log the purchase event
    await certificateService.trackPurchase(
      certificate.id,
      paymentEntity?.id || razorpayOrderId
    );

    console.log(
      `✅ [CERT WEBHOOK] Certificate ${certificate.id} payment processed.`
    );
    return res
      .status(200)
      .json({ success: true, message: "Certificate payment processed." });
  } catch (error) {
    console.error("Certificate Webhook Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 6. GET /api/courses/:courseId/attendance
// @desc    Get detailed attendance records for the student in a course
// ─────────────────────────────────────────────────────────────────
const getCourseAttendanceForCert = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.params;

    if (!courseId) {
      return res
        .status(400)
        .json({ success: false, message: "courseId is required." });
    }

    const { attended, total, pct } =
      await certificateService.calculateAttendance(userId, courseId);

    // Get detailed records
    const records = await prisma.studentAttendance.findMany({
      where: { courseId, studentId: userId },
      include: {
        occurrence: {
          select: {
            occurrenceDate: true,
            startsAt: true,
            endsAt: true,
            status: true,
          },
        },
        session: {
          select: { title: true, courseTitle: true },
        },
      },
      orderBy: { occurrenceDate: "desc" },
    });

    const formattedRecords = records.map((r) => ({
      id: r.id,
      occurrenceDate: r.occurrenceDate,
      sessionTitle: r.session?.title || r.session?.courseTitle || "Session",
      status: r.status,
      firstJoinedAt: r.firstJoinedAt,
      lastJoinedAt: r.lastJoinedAt,
      joinCount: r.joinCount,
      scheduledStart: r.occurrence?.startsAt || null,
      scheduledEnd: r.occurrence?.endsAt || null,
      occurrenceStatus: r.occurrence?.status || null,
    }));

    return res.status(200).json({
      success: true,
      data: {
        summary: { attended, total, attendancePct: pct },
        records: formattedRecords,
      },
    });
  } catch (error) {
    console.error("Course Attendance for Cert Error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message || "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 7. GET /api/admin/certificate-settings
// @desc    Read current certificate settings
// ─────────────────────────────────────────────────────────────────
const getAdminSettings = async (req, res) => {
  try {
    const settings = await prisma.certificateSettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!settings) {
      return res.status(200).json({
        success: true,
        data: null,
        message: "No certificate settings configured yet.",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: settings.id,
        freeThreshold: settings.freeThreshold,
        certificatePricePaise: settings.certificatePricePaise,
        certificatePriceRupees: (settings.certificatePricePaise / 100).toFixed(
          2
        ),
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error("Get Admin Certificate Settings Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 8. PUT /api/admin/certificate-settings
// @desc    Upsert certificate settings (freeThreshold, price)
// ─────────────────────────────────────────────────────────────────
const updateAdminSettings = async (req, res) => {
  try {
    const { freeThreshold, certificatePricePaise } = req.body;

    // Validation
    if (freeThreshold !== undefined) {
      const threshold = parseFloat(freeThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 100) {
        return res.status(400).json({
          success: false,
          message: "freeThreshold must be a number between 0 and 100.",
        });
      }
    }

    if (certificatePricePaise !== undefined) {
      const price = parseInt(certificatePricePaise);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({
          success: false,
          message: "certificatePricePaise must be a non-negative integer.",
        });
      }
    }

    // Find existing settings
    const existing = await prisma.certificateSettings.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    let settings;
    if (existing) {
      const updateData = {};
      if (freeThreshold !== undefined)
        updateData.freeThreshold = parseFloat(freeThreshold);
      if (certificatePricePaise !== undefined)
        updateData.certificatePricePaise = parseInt(certificatePricePaise);

      settings = await prisma.certificateSettings.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      settings = await prisma.certificateSettings.create({
        data: {
          freeThreshold:
            freeThreshold !== undefined ? parseFloat(freeThreshold) : 75,
          certificatePricePaise:
            certificatePricePaise !== undefined
              ? parseInt(certificatePricePaise)
              : 50000,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Certificate settings updated successfully.",
      data: {
        id: settings.id,
        freeThreshold: settings.freeThreshold,
        certificatePricePaise: settings.certificatePricePaise,
        certificatePriceRupees: (settings.certificatePricePaise / 100).toFixed(
          2
        ),
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error("Update Admin Certificate Settings Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 9. GET /api/certificates
// @desc    Get all certificates for the logged-in student
// ─────────────────────────────────────────────────────────────────
const getMyCertificates = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.query;

    if (courseId) {
      const cert = await prisma.certificate.findUnique({
        where: { userId_courseId: { userId, courseId } }
      });
      if (!cert || cert.paymentStatus !== "PAID" || !cert.certificateUrl) {
        const eligibility = await certificateService.checkEligibility(userId, courseId);
        if (eligibility.status === "ELIGIBLE" && eligibility.type === "PAID") {
          return res.status(200).json({
            paymentStatus: "PAID",
            placeholder: true
          });
        }
        return res.status(200).json({ data: null });
      }
      
      const signedUrl = certificateService.getSignedDownloadUrl(cert.certificateUrl);
      
      return res.status(200).json({
        certificateId: cert.certificateId || cert.id,
        pdfUrl: signedUrl,
        paymentStatus: cert.paymentStatus
      });
    }

    const certificates = await prisma.certificate.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const data = certificates.map(cert => ({
      ...cert,
      pdfUrl: cert.certificateUrl ? certificateService.getSignedDownloadUrl(cert.certificateUrl) : null
    }));

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Get My Certificates Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 10. GET /api/certificates/verify/:certificateId
// @desc    Public verification API
// ─────────────────────────────────────────────────────────────────
const verifyCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;

    const cert = await prisma.certificate.findUnique({
      where: { certificateId },
      include: {
        user: { select: { fullName: true } }
      }
    });

    if (!cert || cert.paymentStatus !== "PAID" || !cert.certificateUrl) {
      return res.status(404).json({
        status: "INVALID",
        message: "Certificate not found"
      });
    }

    const collegeName = (cert.collegeName && cert.collegeName !== "Not Specified") 
      ? cert.collegeName 
      : "Tamil Info Technology Pvt. Ltd.";

    return res.status(200).json({
      status: "VALID",
      certificateId: cert.certificateId,
      studentName: cert.studentName || cert.user?.fullName,
      courseName: cert.courseName,
      collegeName: collegeName,
      issueDate: cert.issueDate ? cert.issueDate.toISOString().split("T")[0] : null,
      completionDate: cert.completionDate ? cert.completionDate.toISOString().split("T")[0] : (cert.issueDate ? cert.issueDate.toISOString().split("T")[0] : null)
    });
  } catch (error) {
    console.error("Verify Certificate Error:", error);
    return res.status(500).json({ status: "INVALID", message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 11. GET /api/certificates/settings
// @desc    Returns the global certificate settings
// ─────────────────────────────────────────────────────────────────
const getCertificateSettings = async (req, res) => {
  try {
    const settings = await certificateService.getSettings();
    return res.status(200).json({
      freeThreshold: settings.freeThreshold,
      certificatePrice: Math.round(settings.certificatePricePaise / 100)
    });
  } catch (error) {
    console.error("Get Certificate Settings Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 12. GET /api/certificates/eligible-courses
// @desc    Returns an array of courses the logged-in student has completed or is enrolled in
// ─────────────────────────────────────────────────────────────────
const getEligibleCourses = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    
    // Fetch attendances
    const attendances = await prisma.studentAttendance.findMany({
      where: { studentId: userId },
      select: { 
        courseId: true, 
        sessionId: true,
        session: { select: { id: true, title: true, courseTitle: true, courseId: true } },
        trainer: { select: { fullName: true } },
        occurrenceDate: true
      },
      orderBy: { occurrenceDate: "desc" }
    });

    // Fetch bookings for paid sessions
    const bookings = await prisma.booking.findMany({
      where: {
        studentId: userId,
        status: { in: ["paid", "completed", "joined"] }
      },
      include: {
        session: {
          select: {
            id: true,
            courseId: true,
            title: true,
            courseTitle: true,
            trainer: { select: { fullName: true } }
          }
        }
      }
    });

    const courseMap = new Map();
    
    // Add records from attendance
    for (const a of attendances) {
      if (!a.session) continue;
      const cid = a.session.courseId || a.sessionId || a.courseId;
      if (cid && cid !== "default" && !courseMap.has(cid)) {
        courseMap.set(cid, {
          courseId: cid,
          title: a.session.courseTitle || a.session.title || "Unknown Course",
          trainerName: a.trainer?.fullName || "Unknown Trainer",
          completedAt: a.occurrenceDate ? a.occurrenceDate.toISOString() : new Date().toISOString()
        });
      }
    }

    // Add records from bookings
    for (const b of bookings) {
      if (!b.session) continue;
      const cid = b.session.courseId || b.session.id || b.sessionId || b.courseId;
      if (cid && cid !== "default" && !courseMap.has(cid)) {
        courseMap.set(cid, {
          courseId: cid,
          title: b.session.courseTitle || b.session.title || "Unknown Course",
          trainerName: b.session.trainer?.fullName || "Unknown Trainer",
          completedAt: b.createdAt ? b.createdAt.toISOString() : new Date().toISOString()
        });
      }
    }

    return res.status(200).json(Array.from(courseMap.values()));
  } catch (error) {
    console.error("Get Eligible Courses Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 13. GET /api/certificates/attendance/:courseId
// @desc    Returns the student's attendance metrics for a specific course
// ─────────────────────────────────────────────────────────────────
const getAttendanceStats = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.params;
    const { attended, total, pct } = await certificateService.calculateAttendance(userId, courseId);
    
    return res.status(200).json({ attended, total, pct });
  } catch (error) {
    console.error("Get Attendance Stats Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 14. GET /api/certificates/eligibility/:courseId
// @desc    Calculates and returns eligibility status for frontend
// ─────────────────────────────────────────────────────────────────
const getEligibilityStatus = async (req, res) => {
  try {
    const userId = parseInt(req.user.id);
    const { courseId } = req.params;
    const eligibility = await certificateService.checkEligibility(userId, courseId);
    
    if (eligibility.status === "ELIGIBLE") {
      return res.status(200).json({
        eligibility: "ELIGIBLE",
        status: eligibility.type,
        type: eligibility.type,
        required: eligibility.required,
        attended: eligibility.attended,
      });
    } else {
      let finalStatus = "NONE";
      if (eligibility.status === "INCOMPLETE") {
        finalStatus = "INCOMPLETE";
      } else if (eligibility.type === "PAID" && eligibility.status !== "ELIGIBLE") {
        finalStatus = "PAID";
      }
      return res.status(200).json({
        eligibility: eligibility.status,
        status: finalStatus,
        type: eligibility.type,
        required: eligibility.required,
        attended: eligibility.attended,
      });
    }
  } catch (error) {
    console.error("Get Eligibility Status Error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────────────────────────
// 15. GET /api/certificates/download/:blobName
// @desc    Download locally stored mock certificate
// ─────────────────────────────────────────────────────────────────
const downloadLocalCertificate = (req, res) => {
  const { blobName } = req.params;
  const path = require("path");
  const fs = require("fs");
  const filePath = path.join(process.cwd(), "uploads", "certificates", blobName);
  
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  } else {
    return res.status(404).send("Certificate not found on server.");
  }
};

// ─────────────────────────────────────────────────────────────────
// 16. GET /api/certificates/seed-test-data
// @desc    Seed mock data for certificates directly via API
// ─────────────────────────────────────────────────────────────────
const seedTestData = async (req, res) => {
  try {
    const bcrypt = require("bcryptjs");
    
    // 1. Ensure Global Certificate Settings
    let settings = await prisma.certificateSettings.findFirst();
    if (!settings) {
      settings = await prisma.certificateSettings.create({
        data: { freeThreshold: 75, certificatePricePaise: 29900 },
      });
    } else {
      settings = await prisma.certificateSettings.update({
        where: { id: settings.id },
        data: { freeThreshold: 75, certificatePricePaise: 29900 },
      });
    }

    // 2. Find or Create a Trainer
    const trainerEmail = "trainer_cert@lurnstack.com";
    let trainer = await prisma.user.findUnique({ where: { email: trainerEmail } });
    if (!trainer) {
      const password = await bcrypt.hash("password123", 10);
      trainer = await prisma.user.create({
        data: { fullName: "Expert Trainer", email: trainerEmail, password, role: "TRAINER" },
      });
    }

    // 3. Find or Create a Test Student
    const studentEmail = "student_cert@lurnstack.com";
    let student = await prisma.user.findUnique({ where: { email: studentEmail } });
    if (!student) {
      const password = await bcrypt.hash("password123", 10);
      student = await prisma.user.create({
        data: { fullName: "HORA JENCY. S", email: studentEmail, password, role: "STUDENT" },
      });
    }

    // 4. Create Mock Courses (LiveSessions)
    const courses = [{ courseId: "C-PY-260505", title: "Python Programming", expectedPct: 100 }];
    const logs = [];

    for (const c of courses) {
      let session = await prisma.liveSession.findFirst({ where: { courseId: c.courseId } });
      if (!session) {
        session = await prisma.liveSession.create({
          data: { courseId: c.courseId, courseTitle: c.title, title: c.title, trainerId: trainer.id, status: "active", publishState: "PUBLISHED" },
        });
        logs.push(`Created Course: ${c.title}`);
      }

      const totalSessions = 15;
      const attendedCount = Math.floor((c.expectedPct / 100) * totalSessions);
      const existingOccurrences = await prisma.sessionOccurrence.count({ where: { sessionId: session.id } });
      
      if (existingOccurrences === 0) {
        const startDate = new Date("2026-05-05T10:00:00Z");
        for (let i = 0; i < totalSessions; i++) {
          const occDate = new Date(startDate);
          occDate.setDate(startDate.getDate() + i);

          const occurrence = await prisma.sessionOccurrence.create({
            data: { sessionId: session.id, courseId: session.courseId, trainerId: trainer.id, occurrenceDate: occDate, startsAt: occDate, endsAt: new Date(occDate.getTime() + 60 * 60000), status: "completed" },
          });

          await prisma.studentAttendance.create({
            data: {
              courseId: session.courseId, sessionId: session.id, occurrenceId: occurrence.id, occurrenceDate: occurrence.occurrenceDate, studentId: student.id, trainerId: trainer.id, status: i < attendedCount ? "present" : "absent", joinCount: i < attendedCount ? 1 : 0,
            },
          });
        }
        logs.push(`Created ${totalSessions} Occurrences for ${c.title}.`);
      } else {
        logs.push(`Occurrences already exist for ${c.title}.`);
      }
    }

    return res.status(200).json({ success: true, message: "Seeding complete!", logs, credentials: { email: studentEmail, password: "password123" } });
  } catch (error) {
    console.error("Seed Test Data Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  seedTestData,
  getEligibility,
  generateCertificate,
  downloadCertificate,
  purchaseCertificate,
  verifyCertPayment,
  getCourseAttendanceForCert,
  getAdminSettings,
  updateAdminSettings,
  getMyCertificates,
  verifyCertificate,
  getCertificateSettings,
  getEligibleCourses,
  getAttendanceStats,
  getEligibilityStatus,
  downloadLocalCertificate,
};
