const prisma = require("../config/db");

// ─────────────────────────────────────────────
// @desc    Get all earnings for the logged-in trainer
// @route   GET /api/trainer/earnings
// ─────────────────────────────────────────────
const getTrainerEarnings = async (req, res) => {
  try {
    const trainerId = parseInt(req.user.id);
    const earnings = await prisma.trainerEarning.findMany({
      where: { trainerId },
      include: {
        session: { select: { id: true, title: true } },
        booking: true
      },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json({ success: true, data: earnings });
  } catch (error) {
    console.error("getTrainerEarnings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    Get earnings breakdown for a specific session
// @route   GET /api/trainer/sessions/:sessionId/earnings
// ─────────────────────────────────────────────
const getTrainerSessionEarnings = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const trainerId = parseInt(req.user.id);

    const earnings = await prisma.trainerEarning.findMany({
      where: {
        trainerId,
        sessionId
      },
      include: {
        booking: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json({ success: true, data: earnings });
  } catch (error) {
    console.error("getTrainerSessionEarnings error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

// ─────────────────────────────────────────────
// @desc    List payouts made to the trainer
// @route   GET /api/trainer/payouts
// ─────────────────────────────────────────────
const getTrainerPayouts = async (req, res) => {
  try {
    const trainerId = parseInt(req.user.id);
    const payouts = await prisma.trainerPayout.findMany({
      where: { trainerId },
      include: {
        session: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    return res.status(200).json({ success: true, data: payouts });
  } catch (error) {
    console.error("getTrainerPayouts error:", error);
    return res.status(500).json({ success: false, message: "Internal server error." });
  }
};

module.exports = {
  getTrainerEarnings,
  getTrainerSessionEarnings,
  getTrainerPayouts
};
