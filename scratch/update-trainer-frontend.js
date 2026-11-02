const fs = require("fs");

// 1. Update trainerSessionsApi.js
const apiFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\recurring\\api\\trainerSessionsApi.js";
let apiContent = fs.readFileSync(apiFile, "utf8");

if (!apiContent.includes("isTridinOnly: Boolean(raw.isTridinOnly)")) {
  apiContent = apiContent.replace(
    'completedDays: raw.completedDays !== undefined && raw.completedDays !== null ? Number(raw.completedDays) : (raw.completed_days !== undefined && raw.completed_days !== null ? Number(raw.completed_days) : 0),',
    'completedDays: raw.completedDays !== undefined && raw.completedDays !== null ? Number(raw.completedDays) : (raw.completed_days !== undefined && raw.completed_days !== null ? Number(raw.completed_days) : 0),\n    isTridinOnly: Boolean(raw.isTridinOnly) || false,'
  );
  fs.writeFileSync(apiFile, apiContent, "utf8");
  console.log("Updated trainerSessionsApi.js with isTridinOnly mapping");
}

// 2. Update RecurringSessionsSection.jsx
const sectionFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\RecurringSessionsSection.jsx";
let sectionContent = fs.readFileSync(sectionFile, "utf8");

const targetSnippet = `<div className="text-[10px] font-extrabold uppercase tracking-widest text-[#006b58] truncate">
            {session.courseTitle}
          </div>`;

const replacementSnippet = `<div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006b58] truncate">
              {session.courseTitle}
            </span>
            {session.isTridinOnly && (
              <span className="inline-flex items-center rounded-md bg-orange-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-800">
                Tridin Only
              </span>
            )}
          </div>`;

if (sectionContent.includes(targetSnippet)) {
  sectionContent = sectionContent.replace(targetSnippet, replacementSnippet);
  fs.writeFileSync(sectionFile, sectionContent, "utf8");
  console.log("Updated RecurringSessionsSection.jsx with Tridin Only badge");
}
