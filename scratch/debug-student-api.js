const prisma = require("../src/config/db");
const { getAllLiveClasses } = require("../src/controllers/studentController");

// Mock request and response to run getAllLiveClasses directly
const req = {
  protocol: "https",
  get: () => "api.lurnstack.com",
  user: { id: 1 }, // Mock student ID
};

const res = {
  status: (code) => {
    return {
      json: (data) => {
        console.log(`API Status Code: ${code}`);
        console.log(`API Data Count: ${data.data?.length}`);
      },
    };
  },
};

// We will replicate the query and mapping to print the debug info
async function runDebug() {
  const studentId = 1;
  const sessions = await prisma.liveSession.findMany({
    where: {
      status: { not: "deleted" },
      deleteRequested: false,
      AND: [
        { OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }] },
        { OR: [{ sessionType: { not: "TIT" } }, { sessionType: null }] },
        { OR: [{ source: { not: "admin_tit_classes" } }, { source: null }] }
      ]
    },
    include: {
      trainer: true,
    }
  });

  const getKolkataDateString = (date = new Date()) => {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };

  const getKolkataTimeString = (date = new Date()) => {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  };

  const getKolkataDateTime = (dateStr, timeStr) => {
    return new Date(`${dateStr}T${timeStr}:00+05:30`);
  };

  const matchesRecurringDays = (session, date) => {
    if (session.isRecurring && session.recurrenceEndDate) {
      const dateStr = getKolkataDateString(date);
      if (dateStr > session.recurrenceEndDate) return false;
    }
    if (!session.isRecurring) return true;
    let daysArray = [];
    if (session.recurringDays) {
      try {
        daysArray = typeof session.recurringDays === "string" ? JSON.parse(session.recurringDays) : session.recurringDays;
      } catch (e) {}
    }
    const weekdayStr = date.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const weekday = weekdays.indexOf(weekdayStr);
    if (Array.isArray(daysArray) && daysArray.length > 0) {
      return daysArray.includes(weekday);
    }
    return true;
  };

  const calculateSessionTodayStatus = (session, now = new Date()) => {
    if (session.status === "paused") return "paused";
    if (session.status === "ended") return "ended";
    if (session.status === "cancelled") return "cancelled";
    if (!matchesRecurringDays(session, now)) return "not_scheduled";
    return "active";
  };

  console.log(`Checking ${sessions.length} live sessions:`);
  sessions.forEach(session => {
    const todayStatus = calculateSessionTodayStatus(session, new Date());
    console.log(`- Title: "${session.title}", Trainer: ${session.trainer?.fullName}, isRecurring: ${session.isRecurring}, todayStatus: ${todayStatus}`);
  });
}

runDebug().catch(console.error);
