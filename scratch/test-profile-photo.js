require('dotenv').config();
const prisma = require('../src/config/db');
const { getMe, updateProfile, uploadProfilePhoto, deleteProfilePhoto } = require('../src/controllers/authController');
const fs = require('fs');
const path = require('path');

// Mock Express response object
const mockResponse = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.jsonData = data;
    return res;
  };
  return res;
};

async function runTests() {
  console.log("🚀 Starting Profile CRUD & Safety Tests...");

  // 1. Create a temporary test user
  const testEmail = `test-profile-${Date.now()}@example.com`;
  const testUser = await prisma.user.create({
    data: {
      fullName: "Test User",
      email: testEmail,
      password: "HashedPassword123!",
      phoneNumber: `99999${Math.floor(10000 + Math.random() * 90000)}`,
      role: "STUDENT",
    },
  });
  console.log(`✅ Created test user with ID: ${testUser.id}`);

  // Set up mock request base
  const reqBase = {
    user: { id: testUser.id, role: "STUDENT" },
    protocol: "http",
    get: (header) => (header === "host" ? "localhost:5000" : ""),
  };

  try {
    // ----------------------------------------------------
    // Test 1: GET /api/auth/me returns profilePhotoUrl
    // ----------------------------------------------------
    console.log("\n🧪 Test 1: GET /api/auth/me profilePhotoUrl presence...");
    const req1 = { ...reqBase };
    const res1 = mockResponse();
    await getMe(req1, res1);

    if (res1.statusCode === 200 && 'profilePhotoUrl' in res1.jsonData.user) {
      console.log("PASS: getMe returns profilePhotoUrl (Value:", res1.jsonData.user.profilePhotoUrl, ")");
    } else {
      throw new Error(`FAIL: getMe failed. Status: ${res1.statusCode}, Data: ${JSON.stringify(res1.jsonData)}`);
    }

    // ----------------------------------------------------
    // Test 2: PUT /api/auth/profile updates fullName
    // ----------------------------------------------------
    console.log("\n🧪 Test 2: PUT /api/auth/profile update fullName...");
    const req2 = {
      ...reqBase,
      body: { fullName: "Updated Test Name" },
    };
    const res2 = mockResponse();
    await updateProfile(req2, res2);

    if (res2.statusCode === 200 && res2.jsonData.user.fullName === "Updated Test Name") {
      console.log("PASS: updateProfile successfully updated fullName.");
    } else {
      throw new Error(`FAIL: updateProfile failed to update fullName. Status: ${res2.statusCode}, Data: ${JSON.stringify(res2.jsonData)}`);
    }

    // ----------------------------------------------------
    // Test 3: PUT /api/auth/profile blocks email update
    // ----------------------------------------------------
    console.log("\n🧪 Test 3: PUT /api/auth/profile reject email update...");
    const req3 = {
      ...reqBase,
      body: { email: "malicious@gmail.com" },
    };
    const res3 = mockResponse();
    await updateProfile(req3, res3);

    if (res3.statusCode === 400 && res3.jsonData.message === "Email cannot be updated from profile.") {
      console.log("PASS: updateProfile rejected email update with 400.");
    } else {
      throw new Error(`FAIL: updateProfile did not block email update correctly. Status: ${res3.statusCode}, Data: ${JSON.stringify(res3.jsonData)}`);
    }

    // ----------------------------------------------------
    // Test 4: POST /api/auth/profile/photo upload photo
    // ----------------------------------------------------
    console.log("\n🧪 Test 4: POST /api/auth/profile/photo upload file...");
    // Write a dummy file to profiles dir to simulate multer upload
    const uploadDir = path.join("uploads", "profiles");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    const testFilename = `user-${testUser.id}-${Date.now()}.png`;
    const dummyFilePath = path.join(uploadDir, testFilename);
    fs.writeFileSync(dummyFilePath, "dummy image content");

    const req4 = {
      ...reqBase,
      file: {
        filename: testFilename,
        path: dummyFilePath,
      },
    };
    const res4 = mockResponse();
    await uploadProfilePhoto(req4, res4);

    if (res4.statusCode === 200 && res4.jsonData.profilePhotoUrl.includes(testFilename)) {
      console.log("PASS: uploadProfilePhoto successfully updated DB and returned URL:", res4.jsonData.profilePhotoUrl);
      // Check if file exists
      if (fs.existsSync(dummyFilePath)) {
        console.log("PASS: Uploaded file exists on disk.");
      } else {
        throw new Error("FAIL: Uploaded file not found on disk.");
      }
    } else {
      throw new Error(`FAIL: uploadProfilePhoto failed. Status: ${res4.statusCode}, Data: ${JSON.stringify(res4.jsonData)}`);
    }

    // ----------------------------------------------------
    // Test 5: POST /api/auth/profile/photo overwrites & deletes old photo
    // ----------------------------------------------------
    console.log("\n🧪 Test 5: POST /api/auth/profile/photo deletes old local photo...");
    const newTestFilename = `user-${testUser.id}-${Date.now() + 1000}.png`;
    const newDummyFilePath = path.join(uploadDir, newTestFilename);
    fs.writeFileSync(newDummyFilePath, "new dummy image content");

    const req5 = {
      ...reqBase,
      file: {
        filename: newTestFilename,
        path: newDummyFilePath,
      },
    };
    const res5 = mockResponse();
    await uploadProfilePhoto(req5, res5);

    if (res5.statusCode === 200 && res5.jsonData.profilePhotoUrl.includes(newTestFilename)) {
      console.log("PASS: uploadProfilePhoto successfully updated with new photo.");
      // The old file should be deleted now
      if (!fs.existsSync(dummyFilePath)) {
        console.log("PASS: Old profile photo file was deleted successfully from disk.");
      } else {
        throw new Error("FAIL: Old profile photo file was NOT deleted from disk.");
      }
    } else {
      throw new Error(`FAIL: uploadProfilePhoto replace failed. Status: ${res5.statusCode}, Data: ${JSON.stringify(res5.jsonData)}`);
    }

    // ----------------------------------------------------
    // Test 6: DELETE /api/auth/profile/photo removes photo and deletes file
    // ----------------------------------------------------
    console.log("\n🧪 Test 6: DELETE /api/auth/profile/photo deletes photo and clears field...");
    const req6 = { ...reqBase };
    const res6 = mockResponse();
    await deleteProfilePhoto(req6, res6);

    if (res6.statusCode === 200 && res6.jsonData.user.profilePhotoUrl === null) {
      console.log("PASS: deleteProfilePhoto cleared DB profilePhotoUrl.");
      // The new file should be deleted now
      if (!fs.existsSync(newDummyFilePath)) {
        console.log("PASS: Profile photo file was deleted successfully from disk.");
      } else {
        throw new Error("FAIL: Profile photo file was NOT deleted from disk.");
      }
    } else {
      throw new Error(`FAIL: deleteProfilePhoto failed. Status: ${res6.statusCode}, Data: ${JSON.stringify(res6.jsonData)}`);
    }

    console.log("\n🎉 All Profile CRUD & Safety Tests Passed Successfully!");

  } catch (error) {
    console.error("\n❌ Test Suite Failed:", error.message);
  } finally {
    // Cleanup test user
    await prisma.user.delete({ where: { id: testUser.id } });
    console.log(`\n🧹 Cleaned up test user ${testUser.id}`);
  }
}

runTests().finally(() => prisma.$disconnect());
