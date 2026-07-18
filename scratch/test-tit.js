const prisma = require("../src/config/db");
const { getStudentTITClasses } = require("../src/controllers/studentController");

// Mock request and response to run getStudentTITClasses directly
const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
};

const res = {
  status: (code) => {
    return {
      json: (data) => {
        console.log(`API Status Code: ${code}`);
        console.log(`API Data Count: ${data.data?.length}`);
        if (data.data) {
          data.data.forEach((session, index) => {
            console.log(`[${index + 1}] ID: ${session.id}, Title: ${session.title}, Trainer: ${session.instructor}`);
          });
        }
      },
    };
  },
};

getStudentTITClasses(req, res).catch((e) => console.error(e));
