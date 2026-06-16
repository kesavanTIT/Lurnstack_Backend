// ─────────────────────────────────────────────────────────────────
// Certificate System Constants
// ─────────────────────────────────────────────────────────────────

module.exports = {
  /** SAS signed URL expiry for PDF download links */
  SIGNED_URL_EXPIRY_MINUTES: 15,

  /** Azure Blob Storage container for certificate PDFs */
  AZURE_CONTAINER_NAME: "certificates",

  /** Attendance statuses that count as "attended" */
  PRESENT_STATUSES: ["present", "late", "joined"],

  /** SessionOccurrence status meaning the class actually happened */
  COMPLETED_OCCURRENCE_STATUS: "completed",

  /** Eligibility result codes */
  ELIGIBILITY: {
    FREE: "FREE",
    PAID: "PAID",
    NONE: "NONE",
    INCOMPLETE: "INCOMPLETE",
  },
};
