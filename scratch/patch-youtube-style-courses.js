const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";

let content = fs.readFileSync(targetFile, "utf8");

// ── 1. Add videoSearch and selectedVideoCategory state if not present ──
if (!content.includes("videoCategoryFilter")) {
  content = content.replace(
    'const [mainMenu, setMainMenu] = useState("live");',
    'const [mainMenu, setMainMenu] = useState("live");\n  const [videoCategoryFilter, setVideoCategoryFilter] = useState("All");'
  );
}

// ── 2. Replace the Course Videos section with the clean YouTube-style courses grid ──
const oldVideosBlockStart = `{mainMenu === "videos" ? (`;
const oldVideosBlockEnd = `        ) : (
          <div>
        {/* Search & Tabs Toolbar */}`;

const startIndex = content.indexOf(oldVideosBlockStart);
const endIndex = content.indexOf(oldVideosBlockEnd);

if (startIndex !== -1 && endIndex !== -1) {
  const newVideosSection = `{mainMenu === "videos" ? (
          <div>
            {/* ── YouTube-Style Header & Filter Chips ── */}
            <div className="mb-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                    Course Playlists & Video Lessons
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Structured video tracks with module assessments for Tridin candidates.
                  </p>
                </div>

                <div className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full w-fit">
                  {courses.length} {courses.length === 1 ? "Course Track" : "Course Tracks"} Available
                </div>
              </div>

              {/* YouTube Filter Chips (All, Python, Java, Gen AI, etc.) */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
                {["All", ...Array.from(new Set(courses.map((c) => c.title || c.category || "General")))].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setVideoCategoryFilter(cat)}
                    className={\`rounded-lg px-3.5 py-1.5 font-bold transition-all whitespace-nowrap \${
                      videoCategoryFilter === cat
                        ? "bg-gray-900 text-white shadow-sm"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }\`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-3 animate-pulse">
                    <div className="aspect-video w-full rounded-2xl bg-gray-200" />
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
                <FiPlayCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-sm font-bold text-gray-800">No Course Videos Found</h3>
                <p className="text-xs text-gray-500 mt-1">There are no courses assigned to your Tridin track yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {courses
                  .filter((c) => videoCategoryFilter === "All" || (c.title === videoCategoryFilter || c.category === videoCategoryFilter))
                  .map((course) => {
                    const rawThumbnail = course.thumbnail || course.thumbnailUrl || "";
                    const thumbnailUrl = getThumbnailUrl(rawThumbnail);
                    const lessonCount = course.videoCount || course._count?.tridinVideos || 3;

                    return (
                      <div
                        key={course.id}
                        onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                        className="group cursor-pointer flex flex-col justify-between transition-all duration-200"
                      >
                        {/* ── YouTube Aspect-Video Thumbnail ── */}
                        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 shadow-sm transition-all group-hover:shadow-md">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={course.title || "Course"}
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#004d3d] to-emerald-800 text-white font-black text-3xl">
                              {(course.title || "Course")[0]?.toUpperCase()}
                            </div>
                          )}

                          {/* Free / Course Tag on top-left (YouTube style) */}
                          <div className="absolute top-2 left-2 rounded-md bg-emerald-600/90 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white backdrop-blur-sm shadow-sm">
                            Full Course
                          </div>

                          {/* Lessons Pill on bottom-right (Exact YouTube style like 🎓 7 lessons) */}
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/80 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md shadow-sm">
                            <span className="text-xs">🎓</span>
                            <span>{lessonCount} lessons</span>
                          </div>
                        </div>

                        {/* ── YouTube Video Title & Metadata ── */}
                        <div className="pt-3 space-y-1">
                          <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2 group-hover:text-[#004d3d] transition-colors">
                            {course.title || course.courseTitle || "Course"}
                          </h3>

                          <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                            <span>Tridin Track</span>
                            <span>•</span>
                            <span className="text-[#004d3d] font-bold">Course</span>
                          </div>

                          <div className="pt-1 flex items-center gap-1 text-[11px] font-bold text-[#004d3d] group-hover:underline">
                            <span>View full course</span>
                            <span className="text-xs transition-transform group-hover:translate-x-0.5">➔</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          <div>
        {/* Search & Tabs Toolbar */}`;

  content = content.slice(0, startIndex) + newVideosSection + content.slice(endIndex + oldVideosBlockEnd.length);
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Successfully replaced Course Videos with modern YouTube courses grid layout!");
} else {
  console.error("Could not find start or end index for videos block");
}
