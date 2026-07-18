const prisma = require("../src/config/db");
const { getAllLiveClasses } = require("../src/controllers/studentController");

// Mock request and response to run getAllLiveClasses directly
const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
  user: { id: 1 }, // Mock student ID (use 1 or any active user ID)
};

const res = {
  status: (code) => {
    return {
      json: (data) => {
        console.log(`API Status Code: ${code}`);
        console.log(`API Data Count: ${data.data?.length}`);
        if (data.data) {
          data.data.forEach((session, index) => {
            console.log(`[${index + 1}] ID: ${session.id}, Title: ${session.classTitle}, Instructor: ${session.instructor}, Thumbnail: ${session.thumbnail}`);
          });
        }
      },
    };
  },
};

getAllLiveClasses(req, res).catch((e) => console.error(e));
