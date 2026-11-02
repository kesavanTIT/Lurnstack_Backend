const { getTridinLiveSessions } = require("../src/controllers/tridinController");

// Mock req and res
const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
};

const res = {
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    console.log("Status:", this.statusCode);
    console.log("Success:", data.success);
    console.log("Total Sessions returned:", data.count);
    if (data.sessions && data.sessions.length > 0) {
      console.log("First Session:", {
        id: data.sessions[0].id,
        title: data.sessions[0].title,
        instructorName: data.sessions[0].instructorName,
        meetingLink: data.sessions[0].meetingLink,
        isLiveNow: data.sessions[0].isLiveNow,
        todayHasClass: data.sessions[0].todayHasClass,
      });
    }
    process.exit(0);
  }
};

getTridinLiveSessions(req, res);
