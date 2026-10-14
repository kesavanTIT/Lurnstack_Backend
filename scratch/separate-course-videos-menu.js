const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";

let content = fs.readFileSync(targetFile, "utf8");

// ── 1. Update imports to include FiPlayCircle, FiVideo ──
content = content.replace(
  'import { FiCalendar, FiLogOut, FiRefreshCcw, FiSearch, FiShield } from "react-icons/fi";',
  'import { FiCalendar, FiLogOut, FiRefreshCcw, FiSearch, FiShield, FiPlayCircle, FiVideo } from "react-icons/fi";'
);

// ── 2. Add mainMenu state ("live" | "videos") ──
content = content.replace(
  'const [filterTab, setFilterTab] = useState("all");',
  'const [filterTab, setFilterTab] = useState("all");\n  const [mainMenu, setMainMenu] = useState("live");'
);

// ── 3. Update Top Navigation Header with Live Classes and Course Videos Menu ──
const oldHeaderLeft = `          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-[#004d3d]">
              <FiShield className="h-4 w-4" />
              <span>Tridin Software</span>
            </div>
          </div>`;

const newHeaderLeft = `          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-[#004d3d]">
              <FiShield className="h-4 w-4" />
              <span>Tridin Software</span>
            </div>

            {/* Navigation Menu Tabs: Live Classes vs Course Videos */}
            <nav className="flex items-center gap-1 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setMainMenu("live")}
                className={\`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all \${
                  mainMenu === "live"
                    ? "bg-[#004d3d] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }\`}
              >
                <FiVideo className="h-3.5 w-3.5" />
                <span>Live Classes</span>
              </button>

              <button
                type="button"
                onClick={() => setMainMenu("videos")}
                className={\`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-extrabold transition-all \${
                  mainMenu === "videos"
                    ? "bg-[#004d3d] text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }\`}
              >
                <FiPlayCircle className="h-3.5 w-3.5" />
                <span>Course Videos</span>
              </button>
            </nav>
          </div>`;

content = content.replace(oldHeaderLeft, newHeaderLeft);

// ── 4. Remove Course Videos button from Live Card (Keep Join Class full width) ──
const oldCardButtons = `                    {/* Action Buttons Container */}
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        disabled={unavailable || !isOpen}
                        onClick={() => handleJoinClass(course)}
                        className={\`flex-1 inline-flex h-8 items-center justify-center rounded text-[11px] font-extrabold transition-all duration-200 \${
                          isOpen
                            ? "bg-[#004d3d] text-white hover:bg-[#00392d] active:scale-[0.98]"
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }\`}
                      >
                        {isOpen ? "Join Class" : "Locked"}
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                        className="inline-flex h-8 items-center justify-center rounded border border-[#004d3d] bg-emerald-50 px-3 text-[11px] font-extrabold text-[#004d3d] transition-colors hover:bg-emerald-100 shadow-sm whitespace-nowrap"
                      >
                        Course Videos ➔
                      </button>
                    </div>`;

const newCardButtons = `                    {/* Action Buttons Container */}
                    <div className="mt-3">
                      <button
                        type="button"
                        disabled={unavailable || !isOpen}
                        onClick={() => handleJoinClass(course)}
                        className={\`w-full inline-flex h-8 items-center justify-center rounded text-[11px] font-extrabold transition-all duration-200 \${
                          isOpen
                            ? "bg-[#004d3d] text-white hover:bg-[#00392d] active:scale-[0.98]"
                            : "bg-slate-200 text-slate-500 cursor-not-allowed"
                        }\`}
                      >
                        {isOpen ? "Join Class" : "Locked"}
                      </button>
                    </div>`;

content = content.replace(oldCardButtons, newCardButtons);

// ── 5. Add Main Menu condition in main content ──
// Wrap main content: when mainMenu === "videos", show dedicated Course Videos view
const mainStartNeedle = `<main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">`;
const newMainStart = `<main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {mainMenu === "videos" ? (
          <div>
            {/* ── Dedicated Course Videos Section ── */}
            <div className="mb-6 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 via-white to-emerald-50/50 p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#004d3d] text-white shadow-md">
                  <FiPlayCircle className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-base font-black text-gray-900">
                    Tridin Course Videos & Assessments
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Watch sequential video modules and pass assessments to unlock subsequent modules in your training track.
                  </p>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-64 rounded-2xl border border-gray-200 bg-white p-4 animate-pulse" />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
                <FiPlayCircle className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                <h3 className="text-sm font-bold text-gray-800">No Course Videos Found</h3>
                <p className="text-xs text-gray-500 mt-1">There are no courses assigned to your Tridin track yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {courses.map((course) => {
                  const rawThumbnail = course.thumbnail || course.thumbnailUrl || "";
                  const thumbnailUrl = getThumbnailUrl(rawThumbnail);

                  return (
                    <div
                      key={course.id}
                      className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-lg hover:border-emerald-300 flex flex-col justify-between"
                    >
                      <div>
                        {/* Course Thumbnail */}
                        <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={course.title || "Course"}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#004d3d] to-emerald-800 text-white font-black text-3xl">
                              {(course.title || "Course")[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="absolute top-2.5 right-2.5 rounded-full bg-emerald-950/85 border border-emerald-500/40 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 backdrop-blur-sm shadow-sm">
                            1-by-1 Video Track
                          </div>
                        </div>

                        {/* Course Info */}
                        <div className="p-5 space-y-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                            {course.category || "Tridin Training Track"}
                          </span>
                          <h3 className="text-base font-extrabold text-gray-900 group-hover:text-[#004d3d] transition-colors line-clamp-1">
                            {course.title || course.courseTitle || "Course"}
                          </h3>
                          <p className="text-xs text-gray-500">
                            Instructor: <span className="font-semibold text-gray-700">{course.instructorName || course.instructor || "Assigned Trainer"}</span>
                          </p>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="p-5 pt-0">
                        <button
                          type="button"
                          onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                          className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#004d3d] px-4 text-xs font-black text-white hover:bg-[#00392d] active:scale-[0.98] transition-all shadow-md shadow-emerald-900/20"
                        >
                          <FiPlayCircle className="h-4 w-4" />
                          <span>Open Course Videos & Tests ➔</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>`;

content = content.replace(mainStartNeedle, newMainStart);

// Close the conditional div before </main>
content = content.replace(
  `        )}
      </main>`,
  `        )}
          </div>
        )}
      </main>`
);

fs.writeFileSync(targetFile, content, "utf8");
console.log("Successfully updated TridinDashboardPage.jsx with dedicated Course Videos menu!");
