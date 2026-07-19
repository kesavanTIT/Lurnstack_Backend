const prisma = require("../src/config/db");
const { getAllLiveClasses } = require("../src/controllers/studentController");

const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
  user: { id: 1 },
};

const res = {
  status: (code) => {
    return {
      json: (data) => {
        console.log(`API Status Code: ${code}`);
        console.log(`API Data Count: ${data.data?.length}`);
        if (data.data) {
          data.data.forEach((session, index) => {
            console.log(`[${index + 1}] ID: ${session.id}, Title: ${session.title || session.classTitle}, Trainer: ${session.instructor}, Date: ${session.date}, TodayStatus: ${session.todayStatus}`);
          });
        }
      },
    };
  },
};

getAllLiveClasses(req, res).catch((e) => console.error(e));
