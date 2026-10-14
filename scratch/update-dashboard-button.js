const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";
let content = fs.readFileSync(targetFile, "utf8");

// Replace "See more" button with Course Videos navigation button
const oldButton = `<button
                        type="button"
                        onClick={() => handleJoinClass(course)}
                        className="inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-[11px] font-extrabold text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        See more
                      </button>`;

const newButton = `<button
                        type="button"
                        onClick={() => navigate(\`/tridin/course/\${course.id}/learn\`)}
                        className="inline-flex h-8 items-center justify-center rounded border border-[#004d3d] bg-emerald-50 px-3 text-[11px] font-extrabold text-[#004d3d] transition-colors hover:bg-emerald-100 shadow-sm whitespace-nowrap"
                      >
                        Course Videos ➔
                      </button>`;

if (content.includes(oldButton)) {
  content = content.replace(oldButton, newButton);
  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Successfully updated TridinDashboardPage.jsx See More button!");
} else {
  // If exact whitespace differs, use regex
  const regex = /<button\s+type="button"\s+onClick=\{\(\)\s*=>\s*handleJoinClass\(course\)\}\s+className="inline-flex h-8 items-center justify-center rounded border border-gray-300 bg-white px-3 text-\[11px\] font-extrabold text-gray-700 transition-colors hover:bg-gray-50"\s*>\s*See more\s*<\/button>/;
  if (regex.test(content)) {
    content = content.replace(regex, newButton);
    fs.writeFileSync(targetFile, content, "utf8");
    console.log("Successfully regex updated TridinDashboardPage.jsx See More button!");
  } else {
    console.log("Could not find exact See More button string");
  }
}
