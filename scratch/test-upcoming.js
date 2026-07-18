const prisma = require("../src/config/db");
const { getUpcomingSessions } = require("../src/controllers/sessionReminderController");

// Mock request and response to run getUpcomingSessions directly
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
            console.log(`[${index + 1}] ID: ${session.id}, Title: ${session.title}, Trainer: ${session.trainerName}`);
          });
        }
      },
    };
  },
};

getUpcomingSessions(req, res).catch((e) => console.error(e));
