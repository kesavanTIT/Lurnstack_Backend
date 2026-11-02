const fs = require("fs");

const file = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";
let content = fs.readFileSync(file, "utf8");

// 1. Update filtering logic
const targetFilterBlock = `  // Filter video courses
  const videoCategories = ["All", ...Array.from(new Set(courses.map((c) => c.title || c.category || "General")))];
  const filteredCourses = courses.filter((c) => {
    const title = String(c.title || c.courseTitle || "").toLowerCase();
    const cat = String(c.category || "").toLowerCase();
    const q = courseSearch.toLowerCase().trim();
    const matchesSearch = !q || title.includes(q) || cat.includes(q);

    if (!matchesSearch) return false;

    if (videoCategoryFilter !== "All") {
      const matchesCat = c.title === videoCategoryFilter || c.category === videoCategoryFilter;
      if (!matchesCat) return false;
    }

    return true;
  });

  // Filter live meetings
  const filteredMeetings = liveSessions.filter((s) => {
    const title = String(s.title || s.courseTitle || "").toLowerCase();
    const trainerName = String(s.instructorName || s.trainer?.fullName || "").toLowerCase();
    const cat = String(s.category || "").toLowerCase();
    const q = meetingSearch.toLowerCase().trim();
    const matchesSearch = !q || title.includes(q) || trainerName.includes(q) || cat.includes(q);

    if (!matchesSearch) return false;

    if (meetingStatusFilter === "Live Now") return s.isLiveNow;
    if (meetingStatusFilter === "Today") return s.todayHasClass;
    if (meetingStatusFilter === "Recurring") return s.isRecurring;

    return true;
  });

  const liveNowSessions = liveSessions.filter((s) => s.isLiveNow);`;

const newFilterBlock = `  // ── 1. Strictly Filter Video Courses (Only courses with at least 1 video uploaded) ──
  const validVideoCourses = courses.filter((c) => (Number(c.videoCount || c._count?.tridinVideos || 0) > 0));
  const videoCategories = ["All", ...Array.from(new Set(validVideoCourses.map((c) => c.title || c.category || "General")))];
  const filteredCourses = validVideoCourses.filter((c) => {
    const title = String(c.title || c.courseTitle || "").toLowerCase();
    const cat = String(c.category || "").toLowerCase();
    const q = courseSearch.toLowerCase().trim();
    const matchesSearch = !q || title.includes(q) || cat.includes(q);

    if (!matchesSearch) return false;

    if (videoCategoryFilter !== "All") {
      const matchesCat = c.title === videoCategoryFilter || c.category === videoCategoryFilter;
      if (!matchesCat) return false;
    }

    return true;
  });

  // ── 2. Strictly Filter Live Meetings (Only sessions with an actual meeting link) ──
  const validLiveSessions = liveSessions.filter((s) => {
    const link = String(s.meetingLink || s.meetUrl || "").trim();
    return link !== "" && link !== "null" && link !== "undefined";
  });

  const filteredMeetings = validLiveSessions.filter((s) => {
    const title = String(s.title || s.courseTitle || "").toLowerCase();
    const trainerName = String(s.instructorName || s.trainer?.fullName || "").toLowerCase();
    const cat = String(s.category || "").toLowerCase();
    const q = meetingSearch.toLowerCase().trim();
    const matchesSearch = !q || title.includes(q) || trainerName.includes(q) || cat.includes(q);

    if (!matchesSearch) return false;

    if (meetingStatusFilter === "Live Now") return s.isLiveNow;
    if (meetingStatusFilter === "Today") return s.todayHasClass;
    if (meetingStatusFilter === "Recurring") return s.isRecurring;

    return true;
  });

  const liveNowSessions = validLiveSessions.filter((s) => s.isLiveNow);`;

if (content.includes(targetFilterBlock)) {
  content = content.replace(targetFilterBlock, newFilterBlock);
}

// 2. Update count displays in search bars:
content = content.replace(
  "{courses.length} {courses.length === 1 ? \"Course Track\" : \"Course Tracks\"}",
  "{validVideoCourses.length} {validVideoCourses.length === 1 ? \"Course Track\" : \"Course Tracks\"}"
);

content = content.replace(
  "{liveSessions.length} {liveSessions.length === 1 ? \"Session\" : \"Sessions\"}",
  "{validLiveSessions.length} {validLiveSessions.length === 1 ? \"Session\" : \"Sessions\"}"
);

fs.writeFileSync(file, content, "utf8");
console.log("✓ Successfully updated TridinDashboardPage.jsx with strict separation!");
