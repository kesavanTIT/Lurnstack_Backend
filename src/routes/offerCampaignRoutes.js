"use strict";

const express = require("express");
const router = express.Router();
const { protect, isAdmin } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  getOfferTargets,
  getOfferCampaigns,
  createOfferCampaign,
  getOfferCampaignById,
  updateOfferCampaign,
  deleteOfferCampaign,
  previewOfferCampaign,
  sendOfferCampaign,
  getOfferCampaignDeliveries,
  trackOfferCampaignClick
} = require("../controllers/offerCampaignController");

// ─── Admin Offer Campaign Management Endpoints ───────────────────────────────

router.get("/admin/offer-targets", protect, isAdmin, getOfferTargets);
router.get("/admin/offer-campaigns", protect, isAdmin, getOfferCampaigns);
router.post("/admin/offer-campaigns", protect, isAdmin, upload.single("heroImage"), createOfferCampaign);
router.get("/admin/offer-campaigns/:id", protect, isAdmin, getOfferCampaignById);
router.patch("/admin/offer-campaigns/:id", protect, isAdmin, upload.single("heroImage"), updateOfferCampaign);
router.delete("/admin/offer-campaigns/:id", protect, isAdmin, deleteOfferCampaign);
router.post("/admin/offer-campaigns/:id/preview", protect, isAdmin, previewOfferCampaign);
router.post("/admin/offer-campaigns/:id/send", protect, isAdmin, sendOfferCampaign);
router.get("/admin/offer-campaigns/:id/deliveries", protect, isAdmin, getOfferCampaignDeliveries);

// ─── Student Campaign Click Tracking Endpoints ────────────────────────────────

router.post("/student/offer-campaigns/:campaignId/click", trackOfferCampaignClick);

module.exports = router;
