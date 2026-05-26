/**
 * Normalizes phone numbers by removing all non-digit characters.
 * E.g., "+91 9677794485" -> "919677794485"
 *
 * @param {string} value - The raw phone number input
 * @returns {string} The normalized, digits-only phone number
 */
function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

module.exports = {
  normalizePhone,
};
