const prisma = require("../config/db");
const crypto = require("crypto");

// ─────────────────────────────────────────────
// @desc    Handle Razorpay webhook POST events
// @route   POST /api/webhooks/razorpay
// ─────────────────────────────────────────────
const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      console.warn("⚠️ Webhook received without x-razorpay-signature header");
      return res.status(400).json({ success: false, message: "Missing signature" });
    }

    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("❌ RAZORPAY_WEBHOOK_SECRET is not configured in the environment variables!");
      return res.status(500).json({ success: false, message: "Webhook secret not configured" });
    }

    // Since this endpoint is configured with express.raw, req.body is a Buffer
    const rawBodyString = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBodyString)
      .digest("hex");

    if (expectedSignature !== signature) {
      console.error("❌ Invalid Razorpay Webhook signature!");
      return res.status(400).json({ success: false, message: "Invalid signature" });
    }

    let eventData;
    try {
      eventData = JSON.parse(rawBodyString);
    } catch (err) {
      console.error("❌ Failed to parse webhook payload JSON:", err);
      return res.status(400).json({ success: false, message: "Invalid JSON payload" });
    }

    const event = eventData.event;
    console.log(`ℹ️ Razorpay Webhook Event: ${event}`);

    switch (event) {
      case "order.paid":
      case "payment.captured": {
        const orderEntity = eventData.payload.order?.entity;
        const paymentEntity = eventData.payload.payment?.entity;

        const razorpayOrderId = orderEntity?.id || paymentEntity?.order_id;
        const razorpayPaymentId = paymentEntity?.id;

        if (!razorpayOrderId) {
          console.warn("⚠️ No razorpayOrderId found in payment/order webhook entity");
          break;
        }

        // Find the payment and booking records
        const paymentRecord = await prisma.payment.findFirst({
          where: { razorpayOrderId },
          include: { booking: true }
        });

        let bookingId = paymentRecord?.bookingId;
        if (!bookingId) {
          // Fallback to notes if booking not found by order ID directly
          bookingId = orderEntity?.notes?.bookingId || paymentEntity?.notes?.bookingId;
        }

        if (!bookingId) {
          console.warn(`⚠️ No booking found for order ID: ${razorpayOrderId}`);
          break;
        }

        // Transaction to capture payment, confirm booking, and create trainer earning
        await prisma.$transaction(async (tx) => {
          const booking = await tx.booking.findUnique({
            where: { id: bookingId }
          });

          if (!booking) {
            console.warn(`Booking ${bookingId} not found in database`);
            return;
          }

          if (booking.status === "paid") {
            console.log(`Booking ${bookingId} is already marked as paid.`);
            return;
          }

          // Update Booking
          await tx.booking.update({
            where: { id: bookingId },
            data: { status: "paid" }
          });

          // Update Payment
          const existingPayment = await tx.payment.findFirst({
            where: { razorpayOrderId }
          });

          let updatedPaymentId;
          if (existingPayment) {
            const updated = await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                status: "captured",
                razorpayPaymentId: razorpayPaymentId || existingPayment.razorpayPaymentId,
                paidAt: new Date()
              }
            });
            updatedPaymentId = updated.id;
          } else {
            const created = await tx.payment.create({
              data: {
                bookingId,
                studentId: booking.studentId,
                sessionId: booking.sessionId,
                razorpayOrderId,
                razorpayPaymentId,
                amountPaise: booking.amountPaise,
                currency: booking.currency,
                status: "captured",
                paidAt: new Date()
              }
            });
            updatedPaymentId = created.id;
          }

          // Calculate & Create TrainerEarning
          const sessionPricing = await tx.sessionPricing.findUnique({
            where: { sessionId: booking.sessionId }
          });

          if (sessionPricing) {
            const session = await tx.liveSession.findUnique({
              where: { id: booking.sessionId }
            });

            if (session) {
              const trainerSharePercent = sessionPricing.trainerSharePercent;
              const grossAmountPaise = booking.amountPaise;
              const trainerAmountPaise = Math.round(grossAmountPaise * (trainerSharePercent / 100));
              const platformFeePaise = grossAmountPaise - trainerAmountPaise;

              const sessionEnd = new Date(booking.sessionDate);
              sessionEnd.setHours(sessionEnd.getHours() + 2); // available after 2 hours

              const existingEarning = await tx.trainerEarning.findFirst({
                where: { bookingId: booking.id }
              });

              if (!existingEarning) {
                await tx.trainerEarning.create({
                  data: {
                    trainerId: session.trainerId,
                    sessionId: booking.sessionId,
                    sessionDate: booking.sessionDate,
                    bookingId: booking.id,
                    paymentId: updatedPaymentId,
                    grossAmountPaise,
                    platformFeePaise,
                    trainerAmountPaise,
                    status: "pending_session_completion",
                    availableAfter: sessionEnd
                  }
                });
              }
            }
          }
        });

        console.log(`✅ Webhook processed successfully for booking: ${bookingId}`);
        break;
      }

      case "payment.failed": {
        const paymentEntity = eventData.payload.payment?.entity;
        const razorpayOrderId = paymentEntity?.order_id;
        const razorpayPaymentId = paymentEntity?.id;

        if (!razorpayOrderId) {
          console.warn("⚠️ No razorpayOrderId found in payment.failed entity");
          break;
        }

        const paymentRecord = await prisma.payment.findFirst({
          where: { razorpayOrderId },
          include: { booking: true }
        });

        if (paymentRecord) {
          await prisma.$transaction([
            prisma.booking.update({
              where: { id: paymentRecord.bookingId },
              data: { status: "failed" }
            }),
            prisma.payment.update({
              where: { id: paymentRecord.id },
              data: {
                status: "failed",
                razorpayPaymentId
              }
            })
          ]);
          console.log(`❌ Updated booking and payment to failed for Order: ${razorpayOrderId}`);
        } else {
          console.warn(`⚠️ No payment record found for failed Order: ${razorpayOrderId}`);
        }
        break;
      }

      case "refund.processed": {
        const refundEntity = eventData.payload.refund?.entity;
        const razorpayPaymentId = refundEntity?.payment_id;

        if (!razorpayPaymentId) {
          console.warn("⚠️ No razorpayPaymentId found in refund.processed entity");
          break;
        }

        const paymentRecord = await prisma.payment.findFirst({
          where: { razorpayPaymentId },
          include: { booking: true }
        });

        if (paymentRecord) {
          await prisma.$transaction([
            prisma.payment.update({
              where: { id: paymentRecord.id },
              data: { status: "refunded" }
            }),
            prisma.booking.update({
              where: { id: paymentRecord.bookingId },
              data: { status: "refunded" }
            }),
            prisma.trainerEarning.updateMany({
              where: { bookingId: paymentRecord.bookingId },
              data: { status: "cancelled" }
            })
          ]);
          console.log(`↩️ Refund processed. Booking and payment updated to refunded. Earning cancelled for Payment: ${razorpayPaymentId}`);
        } else {
          console.warn(`⚠️ No payment record found for refund on Payment: ${razorpayPaymentId}`);
        }
        break;
      }

      case "transfer.processed": {
        const transferEntity = eventData.payload.transfer?.entity;
        const transferId = transferEntity?.id;
        const paymentId = transferEntity?.source;
        const transferAmountPaise = transferEntity?.amount;

        if (!paymentId) {
          console.warn("⚠️ No source paymentId found in transfer.processed entity");
          break;
        }

        const paymentRecord = await prisma.payment.findFirst({
          where: { razorpayPaymentId: paymentId }
        });

        if (paymentRecord) {
          const earningRecord = await prisma.trainerEarning.findFirst({
            where: { paymentId: paymentRecord.id }
          });

          if (earningRecord) {
            await prisma.$transaction([
              prisma.trainerEarning.update({
                where: { id: earningRecord.id },
                data: {
                  status: "paid",
                  paidAt: new Date()
                }
              }),
              prisma.trainerPayout.create({
                data: {
                  trainerId: earningRecord.trainerId,
                  sessionId: earningRecord.sessionId,
                  sessionDate: earningRecord.sessionDate,
                  amountPaise: transferAmountPaise || earningRecord.trainerAmountPaise,
                  status: "paid",
                  razorpayTransferId: transferId
                }
              })
            ]);
            console.log(`💸 Trainer payout processed. Earning status set to paid. Payout record created for Transfer: ${transferId}`);
          } else {
            console.warn(`⚠️ No trainer earning record found for payment ID: ${paymentRecord.id}`);
          }
        } else {
          console.warn(`⚠️ No payment record found for transfer source payment: ${paymentId}`);
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled webhook event: ${event}`);
        break;
    }

    return res.status(200).json({ success: true, message: "Webhook received and verified." });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  handleRazorpayWebhook
};
