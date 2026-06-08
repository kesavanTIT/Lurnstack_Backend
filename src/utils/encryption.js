const crypto = require("crypto");

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

// Derive a 32-byte key from ENCRYPTION_KEY or JWT_SECRET or fallback
const getSecretKey = () => {
  const secret = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "lurnstack_default_secret_encryption_key_2026";
  return crypto.createHash("sha256").update(secret).digest();
};

const encrypt = (text) => {
  if (!text) return null;
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
};

const decrypt = (text) => {
  if (!text) return null;
  try {
    const parts = text.split(":");
    if (parts.length < 2) return null;
    const iv = Buffer.from(parts.shift(), "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return null;
  }
};

const maskAccountNumber = (accountNumber) => {
  if (!accountNumber) return "";
  if (accountNumber.length <= 4) return accountNumber;
  const maskedLength = accountNumber.length - 4;
  return "*".repeat(maskedLength) + accountNumber.slice(-4);
};

module.exports = {
  encrypt,
  decrypt,
  maskAccountNumber
};
