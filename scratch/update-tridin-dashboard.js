const fs = require("fs");
const path = require("path");

const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";

const fileContent = `import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiLogOut,
  FiPlay,
  FiPlayCircle,
  FiSearch,
  FiShield,
  FiVideo,
  FiCalendar,
  FiClock,
  FiUser,
  FiExternalLink,
  FiRadio,
  FiCheckCircle,
} from "react-icons/fi";
import { useAuth } from "../auth";
import { axiosClient } from "../shared/api/axiosClient";
import { PATHS } from "../app/router/paths";

function getThumbnailUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const url = rawUrl.trim();
  if (!url || url === "null" || url === "undefined") return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  const cleanPath = url.replace(/^\\/+/, "");
  return \`https://api.lurnstack.com/\${cleanPath}\`;
}

export default function TridinDashboardPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // Navigation tab state: "videos" | "meetings"
  const [activeTab, setActiveTab] = useState("videos");

  // Video courses state
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesError, setCoursesError] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [videoCategoryFilter, setVideoCategoryFilter] = useState("All");

  // Live sessions / meetings state
  const [liveSessions, setLiveSessions] = useState([]);
  const [loadingMeetings, setLoadingMeetings] = useState(true);
  const [meetingsError, setMeetingsError] = useState("");
  const [meetingSearch, setMeetingSearch] = useState("");
  const [meetingStatusFilter, setMeetingStatusFilter] = useState("All");

  // Fetch Tridin video courses
  const fetchTridinCourses = async () => {
    setLoadingCourses(true);
    setCoursesError("");
    try {
      const res = await axiosClient.get("/api/tridin/courses");
      const data = res?.data;
      if (data?.success) {
        setCourses(data.courses || []);
      } else {
        setCoursesError(data?.message || "Failed to load candidate courses.");
      }
    } catch (err) {
      setCoursesError(err?.response?.data?.message || err?.message || "Unable to fetch candidate portal data.");
    } finally {
      setLoadingCourses(false);
    }
  };

  // Fetch Tridin live sessions & meetings
  const fetchTridinLiveSessions = async () => {
    setLoadingMeetings(true);
    setMeetingsError("");
    try {
      const res = await axiosClient.get("/api/tridin/live-sessions");
      const data = res?.data;
      if (data?.success) {
        setLiveSessions(data.sessions || []);
      } else {
        setMeetingsError(data?.message || "Failed to load live sessions.");
      }
    } catch (err) {
      setMeetingsError(err?.response?.data?.message || err?.message || "Unable to fetch live meetings.");
    } finally {
      setLoadingMeetings(false);
    }
  };

  useEffect(() => {
    fetchTridinCourses();
    fetchTridinLiveSessions();
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate(PATHS.LOGIN, { replace: true });
  };

  const handleJoinMeeting = async (session) => {
    const meetingLink = session.meetingLink || session.meetUrl;
    if (!meetingLink) {
      alert("Meeting link has not been shared by trainer yet.");
      return;
    }

    // Open meeting immediately in a new tab
    window.open(meetingLink, "_blank", "noopener,noreferrer");

    // Record attendance / join event in the backend
    try {
      await axiosClient.post(\`/api/tridin/sessions/\${session.id}/join\`);
    } catch (err) {
      console.warn("Could not log attendance automatically:", err?.message);
    }
  };

  // Filter video courses
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

  const liveNowSessions = liveSessions.filter((s) => s.isLiveNow);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* ── Top Header Navigation ── */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
            {/* Brand Badge */}
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-[#004d3d]">
              <FiShield className="h-4 w-4" />
              <span className="hidden sm:inline">Tridin Software</span>
              <span className="sm:hidden">Tridin</span>
            </div>

            {/* Menu Tabs Navigation */}
            <div className="inline-flex items-center gap-1 rounded-xl bg-gray-100 p-1 border border-gray-200/80">
              <button
                type="button"
                onClick={() => setActiveTab("videos")}
                className={\`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all \${
                  activeTab === "videos"
                    ? "bg-[#004d3d] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
                }\`}
              >
                <FiPlayCircle className="h-4 w-4" />
                <span>Course Videos & Playlists</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("meetings")}
                className={\`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all relative \${
                  activeTab === "meetings"
                    ? "bg-[#004d3d] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-200/60"
                }\`}
              >
                <FiVideo className="h-4 w-4" />
                <span>Online Class & Meetings</span>
                {liveNowSessions.length > 0 && (
                  <span className="relative flex h-2 w-2 ml-0.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-xs font-medium">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#004d3d] text-white font-bold text-[11px]">
                {user?.fullName ? user.fullName[0].toUpperCase() : "T"}
              </div>
              <span className="font-semibold text-gray-900 hidden sm:inline">{user?.fullName || "Tridin Candidate"}</span>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-all active:scale-95"
            >
              <FiLogOut className="h-4 w-4 text-gray-500" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Content Area ── */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ========================================================= */}
        {/* TAB 1: COURSE VIDEOS & PLAYLISTS                          */}
        {/* ========================================================= */}
        {activeTab === "videos" && (
          <div>
            {/* Header & Filter Bar */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    Course Playlists & Video Lessons
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Sequential 1-by-1 video tracks with module assessments for Tridin candidates.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search courses..."
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#004d3d] focus:outline-none"
                    />
                  </div>

                  <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                    {courses.length} {courses.length === 1 ? "Course Track" : "Course Tracks"}
                  </div>
                </div>
              </div>

              {/* Category Filter Chips */}
              {videoCategories.length > 2 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
                  {videoCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setVideoCategoryFilter(cat)}
                      className={\`rounded-lg px-3.5 py-1.5 font-bold transition-all whitespace-nowrap \${
                        videoCategoryFilter === cat
                          ? "bg-[#004d3d] text-white shadow-sm"
                          : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                      }\`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Courses Content */}
            {loadingCourses ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-3 animate-pulse">
                    <div className="aspect-video w-full rounded-2xl bg-gray-200" />
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : coursesError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center max-w-lg mx-auto my-12">
                <p className="text-sm font-semibold text-red-600 mb-4">{coursesError}</p>
                <button
                  onClick={fetchTridinCourses}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#004d3d] px-4 py-2 text-xs font-bold text-white hover:bg-[#00392d]"
                >
                  Retry Loading
                </button>
              </div>
            ) : filteredCourses.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
                <FiPlayCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-sm font-bold text-gray-800">No Course Videos Found</h3>
                <p className="text-xs text-gray-500 mt-1">There are no courses assigned to your Tridin track yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredCourses.map((course) => {
                  const rawThumbnail = course.thumbnail || course.thumbnailUrl || "";
                  const thumbnailUrl = getThumbnailUrl(rawThumbnail);
                  const lessonCount = course.videoCount || course._count?.tridinVideos || 0;

                  return (
                    <div
                      key={course.id}
                      onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                      className="group cursor-pointer rounded-2xl p-3 bg-white border border-gray-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all duration-200 flex flex-col justify-between"
                    >
                      <div>
                        {/* 16:9 Thumbnail */}
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 shadow-sm">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={course.title || "Course"}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#004d3d] to-emerald-800 text-white font-bold text-3xl">
                              {(course.title || "Course")[0]?.toUpperCase()}
                            </div>
                          )}

                          {/* Lesson Count Badge */}
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-md shadow-sm">
                            <FiPlay className="h-3 w-3 text-emerald-400" />
                            <span>{lessonCount} {lessonCount === 1 ? "video" : "videos"}</span>
                          </div>

                          <div className="absolute top-2 left-2 rounded-full bg-emerald-500/90 text-white text-[10px] font-black px-2 py-0.5 uppercase tracking-wider backdrop-blur-sm">
                            {course.category || "Tridin Track"}
                          </div>
                        </div>

                        {/* Title & Description */}
                        <div className="mt-3">
                          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-[#004d3d] transition-colors">
                            {course.title || course.courseTitle || "Course Track"}
                          </h3>
                          {course.description && (
                            <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                              {course.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Start Learning Button */}
                      <div className="mt-4 pt-3 border-t border-gray-100">
                        <button
                          type="button"
                          className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#004d3d] py-2 text-xs font-bold text-white shadow-sm hover:bg-[#00392d] active:scale-[0.98] transition-all"
                        >
                          <FiPlayCircle className="h-4 w-4" />
                          <span>Start Learning Track</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: ONLINE CLASS & MEETINGS                            */}
        {/* ========================================================= */}
        {activeTab === "meetings" && (
          <div>
            {/* Live Now Alert Banner */}
            {liveNowSessions.length > 0 && (
              <div className="mb-6 overflow-hidden rounded-2xl border border-emerald-300 bg-gradient-to-r from-emerald-950 via-[#004d3d] to-teal-900 p-5 text-white shadow-lg">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="relative mt-1 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-400"></span>
                    </div>
                    <div>
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-400/40 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-200">
                        <FiRadio className="h-3 w-3 animate-pulse text-emerald-300" />
                        Live Meeting In Progress
                      </div>
                      <h3 className="text-lg font-black mt-1 text-white">
                        {liveNowSessions[0].title}
                      </h3>
                      <p className="text-xs text-emerald-100 mt-0.5">
                        Instructor: <span className="font-semibold text-white">{liveNowSessions[0].instructorName}</span> • Time: {liveNowSessions[0].startTime} - {liveNowSessions[0].endTime} ({liveNowSessions[0].timezone || "IST"})
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleJoinMeeting(liveNowSessions[0])}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-xs font-black text-[#004d3d] shadow-md hover:bg-emerald-50 active:scale-95 transition-all whitespace-nowrap"
                  >
                    <FiVideo className="h-4 w-4 text-[#004d3d]" />
                    <span>JOIN LIVE CLASS NOW</span>
                    <FiExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Header & Filter Controls */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    Online Classes & Live Meetings
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Attend scheduled live batches, interactive workshops, and Google Meet/Zoom sessions for Tridin Software.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative w-full sm:w-64">
                    <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search meetings or trainers..."
                      value={meetingSearch}
                      onChange={(e) => setMeetingSearch(e.target.value)}
                      className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-1.5 text-xs text-gray-900 placeholder-gray-400 focus:border-[#004d3d] focus:outline-none"
                    />
                  </div>

                  <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full whitespace-nowrap">
                    {liveSessions.length} {liveSessions.length === 1 ? "Session" : "Sessions"}
                  </div>
                </div>
              </div>

              {/* Status Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
                {["All", "Live Now", "Today", "Recurring"].map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setMeetingStatusFilter(filterKey)}
                    className={\`rounded-lg px-3.5 py-1.5 font-bold transition-all whitespace-nowrap \${
                      meetingStatusFilter === filterKey
                        ? "bg-[#004d3d] text-white shadow-sm"
                        : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                    }\`}
                  >
                    {filterKey}
                  </button>
                ))}
              </div>
            </div>

            {/* Meetings Grid */}
            {loadingMeetings ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4 animate-pulse">
                    <div className="h-6 w-1/3 rounded bg-gray-200" />
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-16 rounded-xl bg-gray-100" />
                    <div className="h-10 rounded-xl bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : meetingsError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center max-w-lg mx-auto my-12">
                <p className="text-sm font-semibold text-red-600 mb-4">{meetingsError}</p>
                <button
                  onClick={fetchTridinLiveSessions}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#004d3d] px-4 py-2 text-xs font-bold text-white hover:bg-[#00392d]"
                >
                  Retry Loading
                </button>
              </div>
            ) : filteredMeetings.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
                <FiVideo className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-sm font-bold text-gray-800">No Live Meetings Scheduled</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  There are no active live sessions for Tridin candidates right now. Your trainer will schedule new sessions here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredMeetings.map((session) => {
                  const rawThumbnail = session.thumbnail || "";
                  const thumbnailUrl = getThumbnailUrl(rawThumbnail);
                  const isLive = session.isLiveNow;
                  const hasLink = Boolean(session.meetingLink || session.meetUrl);

                  return (
                    <div
                      key={session.id}
                      className={\`rounded-2xl bg-white border transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md \${
                        isLive ? "border-emerald-400 ring-2 ring-emerald-400/20" : "border-gray-200 hover:border-emerald-300"
                      }\`}
                    >
                      <div>
                        {/* Card Header with image or gradient */}
                        <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={session.title || "Live Meeting"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#00342b] via-[#004d3d] to-emerald-900 text-white font-extrabold text-2xl">
                              <FiVideo className="h-10 w-10 text-emerald-300 opacity-60" />
                            </div>
                          )}

                          {/* Category Badge */}
                          <div className="absolute top-3 left-3 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-extrabold text-white uppercase tracking-wider">
                            {session.category || "Live Batch"}
                          </div>

                          {/* Live / Status Badge */}
                          <div className="absolute top-3 right-3">
                            {isLive ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-black text-white shadow-md animate-pulse">
                                <span className="h-2 w-2 rounded-full bg-white"></span>
                                LIVE NOW
                              </span>
                            ) : session.todayHasClass ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
                                <FiCalendar className="h-3 w-3" />
                                TODAY'S CLASS
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-gray-200">
                                <FiClock className="h-3 w-3" />
                                SCHEDULED
                              </span>
                            )}
                          </div>

                          {/* Recurrence Badge */}
                          <div className="absolute bottom-2.5 left-3 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                            {session.isRecurring ? "Daily Recurring Batch" : "One-off Session"}
                          </div>
                        </div>

                        {/* Card Body */}
                        <div className="p-4 space-y-3">
                          <div>
                            <h3 className="text-base font-extrabold text-gray-900 line-clamp-2 leading-snug">
                              {session.title || "Live Session"}
                            </h3>
                            {session.description && (
                              <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                                {session.description}
                              </p>
                            )}
                          </div>

                          {/* Trainer Info */}
                          <div className="flex items-center gap-2.5 pt-2 border-t border-gray-100">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-[#004d3d] font-bold text-xs flex-shrink-0">
                              {session.trainer?.profilePhotoUrl ? (
                                <img
                                  src={session.trainer.profilePhotoUrl}
                                  alt={session.instructorName}
                                  className="h-full w-full rounded-full object-cover"
                                />
                              ) : (
                                (session.instructorName || "T")[0]?.toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-gray-900 truncate">
                                {session.instructorName || "LurnStack Trainer"}
                              </p>
                              <p className="text-[10px] text-gray-400 truncate">Instructor & Mentor</p>
                            </div>
                          </div>

                          {/* Schedule Details Box */}
                          <div className="rounded-xl bg-gray-50 p-2.5 space-y-1.5 border border-gray-100 text-xs text-gray-700">
                            <div className="flex items-center gap-2">
                              <FiClock className="h-3.5 w-3.5 text-emerald-700 flex-shrink-0" />
                              <span className="font-semibold">
                                {session.startTime && session.endTime
                                  ? \`\${session.startTime} - \${session.endTime} (\${session.timezone || "IST"})\`
                                  : "Timing to be announced"}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <FiCalendar className="h-3.5 w-3.5 text-emerald-700 flex-shrink-0" />
                              <span className="text-gray-600 truncate">
                                {session.recurringDayNames && session.recurringDayNames.length > 0
                                  ? \`Every \${session.recurringDayNames.join(", ")}\`
                                  : session.isRecurring
                                  ? "Every Weekday"
                                  : "Scheduled Session"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer / Action */}
                      <div className="p-4 pt-0">
                        {hasLink ? (
                          <button
                            type="button"
                            onClick={() => handleJoinMeeting(session)}
                            className={\`w-full inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black shadow-sm transition-all active:scale-[0.98] \${
                              isLive
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 ring-2 ring-emerald-500/30"
                                : "bg-[#004d3d] text-white hover:bg-[#00392d]"
                            }\`}
                          >
                            <FiVideo className="h-4 w-4" />
                            <span>{isLive ? "JOIN LIVE CLASS NOW" : "JOIN MEETING ROOM"}</span>
                            <FiExternalLink className="h-3.5 w-3.5 opacity-80" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-gray-100 py-2.5 text-xs font-bold text-gray-400 cursor-not-allowed"
                          >
                            <span>Meeting Link Pending</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
`;

fs.writeFileSync(targetFile, fileContent, "utf8");
console.log("Successfully updated TridinDashboardPage.jsx at", targetFile);
