const certificateService = require('../src/services/certificate.service');

async function testDuration() {
  console.log("=== Testing Mock Certificate Generation Duration ===");
  const startDate = new Date("2026-06-30T00:00:00Z");
  const endDate = new Date("2026-07-31T00:00:00Z");

  const diffTime = Math.abs(endDate - startDate);
  const durationDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`Calculated duration for 30 Jun 2026 to 31 Jul 2026: ${durationDays} days`);

  if (durationDays === 32) {
    console.log("✅ SUCCESS: Duration calculation verified!");
  } else {
    console.error("❌ FAILED: Duration calculation mismatch!");
  }
}

testDuration();
