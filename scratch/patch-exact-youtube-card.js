const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";

let content = fs.readFileSync(targetFile, "utf8");

// ── 1. Ensure FiMoreVertical, FiCheck are imported ──
if (!content.includes("FiMoreVertical")) {
  content = content.replace(
    'import { FiCalendar, FiLogOut, FiRefreshCcw, FiSearch, FiShield, FiPlayCircle, FiVideo } from "react-icons/fi";',
    'import { FiCalendar, FiLogOut, FiRefreshCcw, FiSearch, FiShield, FiPlayCircle, FiVideo, FiMoreVertical, FiCheck } from "react-icons/fi";'
  );
}

// ── 2. Replace the course card in the videos grid with exact YouTube layout ──
const oldCardRegex = /<div\s+key=\{course\.id\}\s+onClick=\{\(\) => navigate\(`\/tridin\/course\/\$\{course\.id\}\/learn`\)\}\s+className="group cursor-pointer flex flex-col justify-between transition-all duration-200"[\s\S]*?<\/div>\s*<\/div>\s*\);\s*\}\)/;

const newCardCode = `<div
                        key={course.id}
                        onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                        className="group cursor-pointer rounded-2xl p-2.5 -m-2.5 transition-all duration-200 hover:bg-gray-100/80 flex flex-col justify-between"
                      >
                        {/* ── YouTube 16:9 Thumbnail ── */}
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-slate-900 shadow-sm transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-md">
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={course.title || "Course"}
                              className="h-full w-full object-cover transition-transform duration-300"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#004d3d] to-emerald-800 text-white font-bold text-3xl">
                              {(course.title || "Course")[0]?.toUpperCase()}
                            </div>
                          )}

                          {/* YouTube Lesson Badge on bottom-right (Exact YouTube style: 3 lessons) */}
                          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-md shadow-sm">
                            <span>{lessonCount} lessons</span>
                          </div>
                        </div>

                        {/* ── YouTube Bottom Info: Avatar + Title & Meta ── */}
                        <div className="mt-3 flex items-start gap-3">
                          {/* Channel / Course Avatar */}
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#004d3d] text-white font-bold text-xs shadow-sm">
                            {(course.title || "T")[0]?.toUpperCase()}
                          </div>

                          {/* Title and Metadata */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-1">
                              <h3 className="text-[14px] font-semibold text-[#0f0f0f] leading-snug line-clamp-2 group-hover:text-black">
                                {course.title ? course.title.charAt(0).toUpperCase() + course.title.slice(1) : "Course"} Complete Track
                              </h3>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(\`/tridin/course/\${course.id}/learn\`);
                                }}
                                className="text-gray-400 hover:text-gray-700 p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Options"
                              >
                                <FiMoreVertical className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Channel / Organization Name with Verified Tick */}
                            <div className="mt-1 flex items-center gap-1 text-[12px] text-[#606060] font-normal">
                              <span className="hover:text-[#0f0f0f] truncate">Tridin Software</span>
                              <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gray-400 text-white text-[9px]">
                                <FiCheck className="h-2.5 w-2.5" />
                              </div>
                            </div>

                            {/* Meta info line */}
                            <div className="text-[12px] text-[#606060] font-normal">
                              <span>Course</span>
                              <span className="mx-1">•</span>
                              <span>Tridin Training Track</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })`;

if (oldCardRegex.test(content)) {
  content = content.replace(oldCardRegex, newCardCode);
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Successfully replaced course card with pixel-perfect YouTube card styling!");
} else {
  console.log("Regex did not match, using slice replacement");
  const cardStart = content.indexOf('key={course.id}');
  if (cardStart !== -1) {
    const startDiv = content.lastIndexOf('<div', cardStart);
    const endBlock = content.indexOf('</div>\n            )}', startDiv);
    if (startDiv !== -1 && endBlock !== -1) {
      const closing = content.lastIndexOf(');', endBlock);
      content = content.slice(0, startDiv) + newCardCode + content.slice(closing + 2);
      fs.writeFileSync(targetFile, content, "utf8");
      console.log("Successfully replaced card with slice!");
    }
  }
}
