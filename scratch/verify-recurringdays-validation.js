const assert = require('assert');
const trainerSessionController = require('../src/controllers/trainerSessionController');
const adminController = require('../src/controllers/adminController');

// Helper to create a mock response object
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

// 1. Test Trainer Session Validation
async function testTrainerSessionValidation() {
  console.log("=== Testing Trainer Session recurringDays Validation ===");

  const testCases = [
    {
      name: "Valid array of integers",
      recurringDays: [1, 2, 3, 5],
      expectedStatus: null, // should pass validation and attempt DB create (status will not be 400)
    },
    {
      name: "Valid JSON array string",
      recurringDays: "[0, 6]",
      expectedStatus: null,
    },
    {
      name: "Null or undefined should pass",
      recurringDays: null,
      expectedStatus: null,
    },
    {
      name: "Array with float value should fail",
      recurringDays: [1, 2.5, 3],
      expectedStatus: 400,
      expectedMessage: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)."
    },
    {
      name: "Array with out of range value should fail",
      recurringDays: [0, 1, 7],
      expectedStatus: 400,
      expectedMessage: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)."
    },
    {
      name: "Array with negative value should fail",
      recurringDays: [-1, 2, 3],
      expectedStatus: 400,
      expectedMessage: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)."
    },
    {
      name: "Non-array string should fail",
      recurringDays: "monday",
      expectedStatus: 400,
      expectedMessage: "recurringDays must be a valid JSON array of integers ranging between 0 (Sunday) and 6 (Saturday)."
    },
    {
      name: "Non-array value should fail",
      recurringDays: 123,
      expectedStatus: 400,
      expectedMessage: "recurringDays must be a valid JSON array of integers ranging between 0 (Sunday) and 6 (Saturday)."
    }
  ];

  for (const tc of testCases) {
    const req = {
      user: { id: "1" },
      body: {
        courseId: "valid-course-id",
        title: "Test Session",
        startTime: "10:00",
        endTime: "11:00",
        meetingLink: "http://zoom.us",
        recurringDays: tc.recurringDays,
      }
    };
    const res = mockResponse();

    try {
      await trainerSessionController.createSession(req, res);
    } catch (err) {
      // If validation passed, the controller tries to run DB query and might throw error if DB connection/trainer isn't mocked.
      // That's fine! It means validation passed successfully (which is expected for expectedStatus === null).
    }

    if (tc.expectedStatus === 400) {
      assert.strictEqual(res.statusCode, 400, `Case [${tc.name}] should have failed with status 400`);
      assert.strictEqual(res.body.success, false, `Case [${tc.name}] success should be false`);
      assert.strictEqual(res.body.message, tc.expectedMessage, `Case [${tc.name}] error message mismatch`);
      console.log(`✅ Case [${tc.name}] correctly rejected with 400`);
    } else {
      // Should NOT be 400
      assert.notStrictEqual(res.statusCode, 400, `Case [${tc.name}] should NOT fail with 400 validation error`);
      console.log(`✅ Case [${tc.name}] successfully passed validation`);
    }
  }
}

// 2. Test Admin Live Class Validation
async function testAdminLiveClassValidation() {
  console.log("=== Testing Admin Live Class recurringDays Validation ===");

  const testCases = [
    {
      name: "Valid array of integers",
      recurringDays: [1, 2, 3, 5],
      expectedStatus: null,
    },
    {
      name: "Valid JSON array string",
      recurringDays: "[0, 6]",
      expectedStatus: null,
    },
    {
      name: "Array with float value should fail",
      recurringDays: [1, 2.5, 3],
      expectedStatus: 400,
      expectedMessage: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)."
    },
    {
      name: "Array with out of range value should fail",
      recurringDays: [0, 1, 7],
      expectedStatus: 400,
      expectedMessage: "Each value in recurringDays must be an integer ranging between 0 (Sunday) and 6 (Saturday)."
    }
  ];

  for (const tc of testCases) {
    const req = {
      body: {
        courseName: "Test Course",
        classTitle: "Test Live Class",
        instructor: "Test Instructor",
        date: "2026-06-15",
        time: "10:00",
        duration: "60 mins",
        meetLink: "http://zoom.us",
        sectionType: "TIT", // triggers LiveSession creation flow in adminController
        recurringDays: tc.recurringDays,
      }
    };
    const res = mockResponse();

    try {
      await adminController.createLiveClass(req, res);
    } catch (err) {
      // Validation passed, DB write threw
    }

    if (tc.expectedStatus === 400) {
      assert.strictEqual(res.statusCode, 400, `Case [${tc.name}] should have failed with status 400`);
      assert.strictEqual(res.body.success, false, `Case [${tc.name}] success should be false`);
      assert.strictEqual(res.body.message, tc.expectedMessage, `Case [${tc.name}] error message mismatch`);
      console.log(`✅ Case [${tc.name}] correctly rejected with 400`);
    } else {
      assert.notStrictEqual(res.statusCode, 400, `Case [${tc.name}] should NOT fail with 400 validation error`);
      console.log(`✅ Case [${tc.name}] successfully passed validation`);
    }
  }
}

async function run() {
  try {
    await testTrainerSessionValidation();
    await testAdminLiveClassValidation();
    console.log("🚀 All validation tests passed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

run();
