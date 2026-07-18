const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// --- FRONTEND time.js ---
function toMs(iso) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function parseTimeTo24h(time) {
  const raw = String(time || "").trim().toUpperCase();
  const match = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(AM|PM)?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2] || "0");
  const meridiem = match[3] || "";

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (minutes < 0 || minutes > 59) return null;

  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    if (meridiem === "AM" && hours === 12) hours = 0;
    if (meridiem === "PM" && hours !== 12) hours += 12;
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00`;
}

function toKolkataIso(date, time) {
  const d = String(date || "").trim();
  if (d.includes("T")) return d;
  const t24 = parseTimeTo24h(time);
  if (!d || !t24) return "";
  return `${d}T${t24}+05:30`;
}

function getDurationMinutes(startTime, endTime) {
  const start = parseTimeTo24h(startTime);
  const end = parseTimeTo24h(endTime);
  if (!start || !end) return 0;

  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return endTotal > startTotal ? endTotal - startTotal : 0;
}

function getLiveTiming(scheduledAtIso, durationMinutes = 60, endsAtIso = "") {
  const startMs = toMs(scheduledAtIso);
  const explicitEndMs = toMs(endsAtIso);
  const durationEndMs = startMs + Number(durationMinutes || 0) * 60 * 1000;
  const endMs = explicitEndMs > startMs ? explicitEndMs : durationEndMs;
  return { startMs, endMs };
}

// --- FRONTEND sessionTiming.js ---
function getKolkataParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return parts.reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
}

function kolkataIsoFromParts(dateParts, timeParts) {
  if (!dateParts || !timeParts) return "";
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}T${timeParts.hour}:${timeParts.minute}:${timeParts.second || "00"}+05:30`;
}

function flagValue(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (["false", "0", "no", "none"].includes(raw)) return false;
  if (["true", "1", "yes", "daily", "recurring"].includes(raw)) return true;
  return null;
}

const WEEKDAY_MAP = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6
};

function parseRecurringDays(value) {
  if (value === null || value === undefined) return null;

  const toDayNum = (val) => {
    const s = String(val).trim().toLowerCase();
    if (s in WEEKDAY_MAP) return WEEKDAY_MAP[s];
    const n = Number(s);
    return isNaN(n) ? null : n;
  };

  const clean = (arr) => {
    const res = arr.map(toDayNum).filter(x => x !== null);
    return res.length > 0 ? res : null;
  };

  if (Array.isArray(value)) {
    return clean(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return clean(parsed);
      }
      const dayVal = toDayNum(parsed);
      if (dayVal !== null) return [dayVal];
    } catch {
      if (trimmed.includes(",")) {
        return clean(trimmed.split(","));
      }
      const dayVal = toDayNum(trimmed);
      if (dayVal !== null) return [dayVal];
    }
  }
  if (typeof value === "number") {
    return [value];
  }
  return null;
}

function getKolkataWeekdayIndex(date) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return -1;
  const weekdayStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long"
  }).format(d);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days.indexOf(weekdayStr);
}

function isAfterDayKolkata(dateA, dateB) {
  const a = getKolkataParts(dateA);
  const b = getKolkataParts(dateB);
  if (!a || !b) return false;
  
  const yA = Number(a.year), yB = Number(b.year);
  if (yA !== yB) return yA > yB;
  
  const mA = Number(a.month), mB = Number(b.month);
  if (mA !== mB) return mA > mB;
  
  return Number(a.day) > Number(b.day);
}

function isSessionUnavailable(liveClass) {
  const raw = liveClass?.raw || {};
  const status = String(liveClass?.status || raw?.status || "").trim().toLowerCase();
  return ["cancelled", "canceled", "paused", "ended", "inactive", "archived"].includes(status);
}

function isRecurringSession(liveClass, { defaultRecurring = false } = {}) {
  if (isSessionUnavailable(liveClass)) return false;

  const recurringDaysRaw =
    liveClass?.recurringDays ||
    liveClass?.recurring_days ||
    liveClass?.raw?.recurringDays ||
    liveClass?.raw?.recurring_days ||
    null;
  const recurringDays = parseRecurringDays(recurringDaysRaw);

  if (Array.isArray(recurringDays) && recurringDays.length > 0) return true;

  const explicitRecurring = flagValue(
    liveClass?.isRecurring ??
      liveClass?.recurring ??
      liveClass?.is_recurring ??
      liveClass?.raw?.isRecurring ??
      liveClass?.raw?.recurring ??
      liveClass?.raw?.is_recurring
  );
  if (explicitRecurring !== null) return explicitRecurring;

  const recurrenceType = String(
    liveClass?.recurrenceType ||
      liveClass?.recurrence_type ||
      liveClass?.repeatType ||
      liveClass?.raw?.recurrenceType ||
      liveClass?.raw?.recurrence_type ||
      liveClass?.raw?.repeatType ||
      ""
  ).trim().toLowerCase();

  if (recurrenceType) {
    return ["daily", "everyday", "every_day", "recurring"].includes(recurrenceType);
  }

  return defaultRecurring;
}

function getSessionOccurrenceTiming(liveClass, now = Date.now(), options = {}) {
  const scheduledAt = liveClass?.scheduledAt;
  const durationMinutes = liveClass?.durationMinutes || 60;
  const endsAt = liveClass?.endsAt || "";
  const base = getLiveTiming(scheduledAt, durationMinutes, endsAt);

  const isRecurring = isRecurringSession(liveClass, options);

  if (!isRecurring) {
    return {
      ...base,
      scheduledAt,
      endsAt,
      isRecurring: false,
    };
  }

  const todayParts = getKolkataParts(now);
  const startTimeParts = getKolkataParts(scheduledAt);
  if (!todayParts || !startTimeParts) {
    return {
      ...base,
      scheduledAt,
      endsAt,
      isRecurring: true,
    };
  }

  const endTimeParts = endsAt ? getKolkataParts(endsAt) : null;

  const buildOccurrence = (dateParts) => {
    const occurrenceScheduledAt = kolkataIsoFromParts(dateParts, startTimeParts);
    const occurrenceStartMs = toMs(occurrenceScheduledAt);
    const occurrenceEndsAt = endTimeParts ? kolkataIsoFromParts(dateParts, endTimeParts) : "";
    const explicitOccurrenceEndMs = toMs(occurrenceEndsAt);
    const durationEndMs = occurrenceStartMs + Number(durationMinutes || 0) * 60 * 1000;
    const occurrenceEndMs =
      explicitOccurrenceEndMs > occurrenceStartMs ? explicitOccurrenceEndMs : durationEndMs;
    return {
      startMs: occurrenceStartMs,
      endMs: occurrenceEndMs,
      scheduledAt: occurrenceScheduledAt,
      endsAt: new Date(occurrenceEndMs).toISOString(),
      isRecurring: true,
    };
  };

  const recurringDays = parseRecurringDays(
    liveClass?.recurringDays ||
    liveClass?.recurring_days ||
    liveClass?.raw?.recurringDays ||
    liveClass?.raw?.recurring_days ||
    null
  );

  const recurrenceEndDate = liveClass?.recurrenceEndDate || liveClass?.recurrence_end_date || liveClass?.raw?.recurrenceEndDate || liveClass?.raw?.recurrence_end_date || null;

  const todayOccurrence = buildOccurrence(todayParts);
  const todayWeekday = getKolkataWeekdayIndex(now);
  const isTodayActive = (Array.isArray(recurringDays) ? recurringDays.includes(todayWeekday) : true) &&
    (!recurrenceEndDate || !isAfterDayKolkata(now, recurrenceEndDate));

  if (isTodayActive && !(options.rollForwardAfterEnd && now > todayOccurrence.endMs)) {
    return todayOccurrence;
  }

  let currentMs = now + 24 * 60 * 60 * 1000;
  for (let i = 0; i < 7; i++) {
    const weekday = getKolkataWeekdayIndex(currentMs);
    const isActive = Array.isArray(recurringDays) ? recurringDays.includes(weekday) : true;
    if (isActive) {
      if (recurrenceEndDate && isAfterDayKolkata(currentMs, recurrenceEndDate)) {
        break;
      }
      const nextParts = getKolkataParts(currentMs);
      if (nextParts) return buildOccurrence(nextParts);
    }
    currentMs += 24 * 60 * 60 * 1000;
  }

  return todayOccurrence;
}

// --- FRONTEND normalizeSession (from studentSessionsApi.js) ---
function getCourseAccessId(source = {}) {
  const raw = source?.raw || source || {};
  const course = raw.course || raw.Course || source?.course || source?.Course || {};
  const liveClass = raw.liveClass || raw.live_class || source?.liveClass || {};
  const value =
    raw.courseAccessId ||
    raw.course_connection_id ||
    raw.accessCourseId ||
    raw.access_course_id ||
    raw.trainerCourseId ||
    raw.trainer_course_id ||
    raw.parentCourseId ||
    raw.parent_course_id ||
    raw.batchCourseId ||
    raw.batch_course_id ||
    raw.batchId ||
    raw.batch_id ||
    raw.courseId ||
    raw.course_id ||
    course.id ||
    course._id ||
    course.courseId ||
    course.course_id ||
    course.trainerCourseId ||
    course.trainer_course_id ||
    liveClass.courseAccessId ||
    liveClass.course_access_id ||
    liveClass.courseId ||
    liveClass.course_id ||
    source.courseAccessId ||
    source.courseId ||
    source.trainerCourseId ||
    "";
  return String(value || "").trim();
}

function normalizeSession(raw = {}) {
  const id =
    raw.id ??
    raw._id ??
    raw.sessionId ??
    raw.session_id ??
    raw.liveClassId ??
    raw.live_class_id ??
    raw.courseId ??
    raw.course_id ??
    "";
  const courseAccessId = getCourseAccessId({ ...raw, id });
  const category = raw.category || "Trainer Courses";
  const scheduledAt =
    toKolkataIso(raw.scheduledDate || raw.scheduled_date || raw.date, raw.startTime || raw.start_time) ||
    raw.scheduledAt ||
    raw.scheduled_at ||
    "";
  const endsAt =
    toKolkataIso(raw.scheduledDate || raw.scheduled_date || raw.date, raw.endTime || raw.end_time) ||
    raw.endsAt ||
    raw.ends_at ||
    "";
  const timeDuration = getDurationMinutes(raw.startTime || raw.start_time, raw.endTime || raw.end_time);
  const durationMinutes = timeDuration || Number(raw.durationMinutes) || 60;
  const recurringValue = raw.isRecurring ?? raw.is_recurring ?? raw.recurring;
  const recurringDays = raw.recurringDays ?? raw.recurring_days ?? null;
  const recurrenceEndDate = raw.recurrenceEndDate ?? raw.recurrence_end_date ?? null;
  const recurrenceType = raw.recurrenceType || raw.recurrence_type || raw.repeatType || "";

  return {
    id,
    courseAccessId,
    courseId: courseAccessId,
    thumbnail: raw.thumbnail || "",
    category,
    title: raw.courseTitle || raw.course?.title || raw.classTitle || raw.title || "Live session",
    classTitle: raw.classTitle || "",
    instructor: raw.trainerName || raw.trainer?.name || "Trainer",
    instructorName: raw.trainerName || raw.trainer?.name || "Trainer",
    description: raw.description || "",
    isRecurring: recurringValue,
    recurringDays,
    recurrenceEndDate,
    recurrenceType,
    liveClass: {
      id,
      courseId: courseAccessId || id,
      courseAccessId,
      courseName: raw.courseTitle || raw.course?.title || "",
      title: raw.classTitle || raw.title || "",
      instructorName: raw.trainerName || raw.trainer?.name || "Trainer",
      description: raw.description || "",
      scheduledAt,
      endsAt,
      durationMinutes,
      meetUrl: raw.meetingLink || "",
      status: raw.status || "",
      isRecurring: recurringValue,
      recurringDays,
      recurrenceEndDate,
      recurrenceType,
    },
    raw,
  };
}

// --- FRONTEND prioritizeUpcomingSessions (from HeroSection.jsx) ---
function prioritizeUpcomingSessions(sessions, now) {
  return (sessions || [])
    .map((session) => {
      const live = session?.liveClass || session;
      const occurrence = getSessionOccurrenceTiming(live, now, { defaultRecurring: false, rollForwardAfterEnd: true });
      const startMs = occurrence.startMs || 0;
      const endMs = occurrence.endMs || 0;
      const isLive = startMs > 0 && now >= startMs && now <= endMs;

      return {
        ...session,
        occurrence,
        priorityTime: startMs || Number.MAX_SAFE_INTEGER,
        isLive,
      };
    })
    .filter((session) => {
      if (!session?.id) return false;
      if (isSessionUnavailable(session.liveClass || session)) return false;
      return !session.occurrence.endMs || session.occurrence.endMs >= now;
    })
    .sort((a, b) => {
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
      return a.priorityTime - b.priorityTime;
    });
}

// --- MAIN FUNCTION ---
const calculateSessionTodayStatus = (session, now = new Date()) => {
  if (session.status === "paused") return "paused";
  if (session.status === "ended") return "ended";
  if (session.status === "cancelled") return "cancelled";
  // Simulating matchesRecurringDays
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (session.isRecurring && session.recurrenceEndDate && dateStr > session.recurrenceEndDate) return "not_scheduled";
  if (!session.isRecurring) return "active";

  let daysArray = [];
  if (session.recurringDays) {
    try {
      daysArray = typeof session.recurringDays === "string" ? JSON.parse(session.recurringDays) : session.recurringDays;
    } catch (e) {
      if (typeof session.recurringDays === "string") daysArray = session.recurringDays.split(",").map(Number);
    }
  }
  const weekdayStr = now.toLocaleDateString("en-US", { timeZone: "Asia/Kolkata", weekday: "long" });
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekday = weekdays.indexOf(weekdayStr);
  if (Array.isArray(daysArray) && daysArray.length > 0) {
    return daysArray.includes(weekday) ? "active" : "not_scheduled";
  }
  return "active";
};

const formatSession = (session, studentId = null) => {
  const now = new Date();
  const todayStatus = calculateSessionTodayStatus(session, now);
  // Simulating getSessionOccurrences
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const scheduledAt = session.startTime ? `${dateStr}T${session.startTime}:00+05:30` : null;
  const endsAt = session.endTime ? `${dateStr}T${session.endTime}:00+05:30` : null;

  return {
    id: session.id,
    title: session.title,
    courseId: session.courseId,
    trainerId: `trainer_${session.trainerId}`,
    trainerName: session.trainer?.fullName ?? null,
    thumbnail: session.thumbnail,
    scheduledAt,
    endsAt,
    startTime: session.startTime,
    endTime: session.endTime,
    isRecurring: session.isRecurring,
    recurringDays: session.recurringDays,
    recurrenceEndDate: session.recurrenceEndDate || null,
    status: session.status,
    todayStatus,
  };
};

async function main() {
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
    include: { trainer: true },
  });

  const formatted = sessions.map(s => formatSession(s, studentId));
  const normalized = formatted.map(normalizeSession);
  const prioritized = prioritizeUpcomingSessions(normalized, Date.now());

  console.log(`\nExact Frontend Filter Result (Count: ${prioritized.length}):`);
  prioritized.forEach((p, idx) => {
    console.log(`[${idx+1}] ID: ${p.id}, Title: "${p.title}", Trainer: "${p.instructorName}"`);
    console.log(`    occurrence.scheduledAt: ${p.occurrence.scheduledAt}, occurrence.endsAt: ${p.occurrence.endsAt}`);
    console.log(`    isLive: ${p.isLive}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
