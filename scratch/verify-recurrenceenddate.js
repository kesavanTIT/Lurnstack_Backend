const assert = require('assert');
const trainerSessionController = require('../src/controllers/trainerSessionController');
const adminController = require('../src/controllers/adminController');

const validateRecurrenceEndDate = (recurrenceEndDate) => {
  if (recurrenceEndDate === undefined || recurrenceEndDate === null || recurrenceEndDate === "") {
    return { isValid: true, parsed: null };
  }
  const dateStr = String(recurrenceEndDate).trim();
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) {
    return { isValid: false, message: "recurrenceEndDate must be in YYYY-MM-DD format." };
  }
  const parsedDate = new Date(dateStr);
  if (isNaN(parsedDate.getTime())) {
    return { isValid: false, message: "recurrenceEndDate is not a valid calendar date." };
  }
  return { isValid: true, parsed: dateStr };
};

const mockResponse = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  return res;
};

function testStandaloneValidation() {
  console.log("=== Testing Standalone validateRecurrenceEndDate ===");
  const testCases = [
    { input: null, expected: { isValid: true, parsed: null } },
    { input: undefined, expected: { isValid: true, parsed: null } },
    { input: "", expected: { isValid: true, parsed: null } },
    { input: "2026-06-30", expected: { isValid: true, parsed: "2026-06-30" } },
    { input: "2026-06-30 ", expected: { isValid: true, parsed: "2026-06-30" } }, // whitespace trimmed
    { input: "2026-13-01", expected: { isValid: false } }, // invalid month
    { input: "2026-06-32", expected: { isValid: false } }, // invalid day
    { input: "06-30-2026", expected: { isValid: false } }, // invalid format
    { input: "yesterday", expected: { isValid: false } }, // invalid string
  ];

  for (const tc of testCases) {
    const result = validateRecurrenceEndDate(tc.input);
    assert.strictEqual(result.isValid, tc.expected.isValid);
    if (tc.expected.isValid) {
      assert.strictEqual(result.parsed, tc.expected.parsed);
    }
    console.log(`✅ Input: "${tc.input}" -> isValid: ${result.isValid}`);
  }
}

async function testTrainerControllerValidation() {
  console.log("=== Testing Trainer Controller Validation ===");
  const testCases = [
    { input: "2026-06-30", expectedStatus: null },
    { input: "invalid-date", expectedStatus: 400 }
  ];

  for (const tc of testCases) {
    const req = {
      user: { id: "1" },
      body: {
        courseId: "valid",
        title: "Test",
        startTime: "10:00",
        endTime: "11:00",
        meetingLink: "url",
        recurrenceEndDate: tc.input
      }
    };
    const res = mockResponse();
    try {
      await trainerSessionController.createSession(req, res);
    } catch (e) {}

    if (tc.expectedStatus === 400) {
      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.ok(res.body.message.includes("recurrenceEndDate"));
      console.log(`✅ Case [${tc.input}] correctly rejected with 400`);
    } else {
      assert.notStrictEqual(res.statusCode, 400);
      console.log(`✅ Case [${tc.input}] successfully passed validation`);
    }
  }
}

async function run() {
  try {
    testStandaloneValidation();
    await testTrainerControllerValidation();
    console.log("🚀 All recurrenceEndDate validation tests passed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

run();
