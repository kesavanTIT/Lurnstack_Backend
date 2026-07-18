const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Mock getKolkataDateString
const getKolkataDateString = (date = new Date()) => {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

// Mock formatSession and calculateSessionTodayStatus from studentController
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

const getSessionOccurrences = (session, now = new Date()) => {
  if (!matchesRecurringDays(session, now)) {
    return { scheduledAt: null, endsAt: null };
  }
  const todayStr = getKolkataDateString(now);
  const createdDateStr = getKolkataDateString(new Date(session.createdAt));
  const dateStr = session.isRecurring ? todayStr : createdDateStr;
  const scheduledAt = session.startTime ? getKolkataDateTime(dateStr, session.startTime) : null;
  const endsAt = session.endTime ? getKolkataDateTime(dateStr, session.endTime) : null;
  return { scheduledAt, endsAt };
};

const calculateSessionTodayStatus = (session, now = new Date()) => {
  if (session.status === "paused") return "paused";
  if (session.status === "ended") return "ended";
  if (session.status === "cancelled") return "cancelled";
  if (!matchesRecurringDays(session, now)) return "not_scheduled";
  return "active";
};

// Mock isSessionUnavailable
const isSessionUnavailable = (session) => {
  const status = String(session.status || "").trim().toLowerCase();
  return ["cancelled", "canceled", "paused", "ended", "inactive", "archived"].includes(status);
};

// Mock getSessionOccurrenceTiming
const getLiveTiming = (scheduledAt, durationMinutes) => {
  const startMs = scheduledAt ? new Date(scheduledAt).getTime() : 0;
  const endMs = startMs ? startMs + Number(durationMinutes || 0) * 60 * 1000 : 0;
  return { startMs, endMs };
};

const getSessionOccurrenceTiming = (liveClass, now = Date.now()) => {
  const scheduledAt = liveClass.scheduledAt;
  const durationMinutes = liveClass.durationMinutes || 60;
  const endsAt = liveClass.endsAt || "";
  const base = getLiveTiming(scheduledAt, durationMinutes);

  const isRecurring = liveClass.isRecurring;
  if (!isRecurring) {
    return { ...base, scheduledAt, endsAt, isRecurring: false };
  }

  // Recurring logic mock
  const todayStr = getKolkataDateString(new Date(now));
  const startTime = liveClass.startTime || "";
  const occurrenceScheduledAt = getKolkataDateTime(todayStr, startTime).toISOString();
  const occurrenceStartMs = new Date(occurrenceScheduledAt).getTime();
  const occurrenceEndMs = occurrenceStartMs + Number(durationMinutes || 60) * 60 * 1000;

  return {
    startMs: occurrenceStartMs,
    endMs: occurrenceEndMs,
    scheduledAt: occurrenceScheduledAt,
    endsAt: new Date(occurrenceEndMs).toISOString(),
    isRecurring: true,
  };
};

async function main() {
  const sessions = await prisma.liveSession.findMany({
    where: {
      status: { not: "deleted" },
      publishState: "PUBLISHED",
      AND: [
        { OR: [{ sectionType: { not: "TIT" } }, { sectionType: null }] },
        { OR: [{ sessionType: { not: "TIT" } }, { sessionType: null }] },
        { OR: [{ source: { not: "admin_tit_classes" } }, { source: null }] }
      ]
    },
    include: { trainer: true },
  });

  const now = Date.now();
  console.log(`Analyzing ${sessions.length} sessions for timing:`);

  const activeList = sessions.map((session) => {
    // formatSession mock
    const todayStatus = calculateSessionTodayStatus(session, new Date(now));
    const { scheduledAt, endsAt } = getSessionOccurrences(session, new Date(now));

    let durationMinutes = 60;
    if (session.startTime && session.endTime) {
      const [sh, sm] = session.startTime.split(":").map(Number);
      const [eh, em] = session.endTime.split(":").map(Number);
      durationMinutes = (eh * 60 + em) - (sh * 60 + sm);
      if (durationMinutes < 0) durationMinutes += 1440;
    }

    const normalized = {
      id: session.id,
      title: session.title,
      trainerName: session.trainer?.fullName,
      status: session.status,
      isRecurring: session.isRecurring,
      startTime: session.startTime,
      endTime: session.endTime,
      scheduledAt: scheduledAt ? scheduledAt.toISOString() : null,
      endsAt: endsAt ? endsAt.toISOString() : null,
      durationMinutes,
    };

    // prioritizeUpcomingSessions mock logic
    const occurrence = getSessionOccurrenceTiming(normalized, now);
    const startMs = occurrence.startMs || 0;
    const endMs = occurrence.endMs || 0;
    const isLive = startMs > 0 && now >= startMs && now <= endMs;

    const enriched = {
      ...normalized,
      occurrence,
      isLive,
    };

    const isIdValid = !!enriched.id;
    const isUnavailable = isSessionUnavailable(enriched);
    const isPastEnd = enriched.occurrence.endMs && enriched.occurrence.endMs < now;

    console.log(`\nSession: "${enriched.title}" (${enriched.trainerName})`);
    console.log(`- status: ${enriched.status}, isRecurring: ${enriched.isRecurring}`);
    console.log(`- scheduledAt (Kolkata occurrence): ${occurrence.scheduledAt}`);
    console.log(`- startsAt time: ${new Date(occurrence.startMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
    console.log(`- endsAt time: ${new Date(occurrence.endMs).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`);
    console.log(`- Filter check - isIdValid: ${isIdValid}, isUnavailable: ${isUnavailable}, isPastEnd: ${isPastEnd}`);
    console.log(`- Will be KEPT in ticker: ${isIdValid && !isUnavailable && !isPastEnd}`);

    return enriched;
  });
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
