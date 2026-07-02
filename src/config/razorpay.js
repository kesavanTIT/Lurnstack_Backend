const Razorpay = require("razorpay");

let razorpay = null;

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.error("⚠️ CRITICAL: Razorpay credentials are not set in the environment variables!");
  try {
    razorpay = new Razorpay({
      key_id: "rzp_test_dummykey123",
      key_secret: "dummysecret123",
    });
  } catch (err) {
    console.error("Failed to initialize fallback Razorpay client:", err.message);
  }
} else {
  razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
}

module.exports = razorpay;
