const prisma = require("../src/config/db");
const { getStudentSessions } = require("../src/controllers/studentController");

// Mock request and response to run getStudentSessions directly for trainer user 657
const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
  user: { id: 657 }, // User ID for kesavan.tit@gmail.com
  query: {},
};

const res = {
  status: (code) => {
    return {
      json: (data) => {
        console.log(`API Status Code: ${code}`);
        console.log(`API Data Count: ${data.data?.length}`);
        if (data.data) {
          data.data.forEach((session, index) => {
            console.log(`[${index + 1}] ID: ${session.id}, Title: ${session.title}, Trainer: ${session.trainerName}`);
          });
        }
      },
    };
  },
};

getStudentSessions(req, res).catch((e) => console.error(e));
