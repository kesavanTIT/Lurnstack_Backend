const fs = require("fs");
const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\RecurringSessionsSection.jsx";
let content = fs.readFileSync(file, "utf8");

const regex = /<div className="text-\[10px\] font-extrabold uppercase tracking-widest text-\[#006b58\] truncate">\s*\{session\.courseTitle\}\s*<\/div>/;
const replacement = `<div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006b58] truncate">
              {session.courseTitle}
            </span>
            {session.isTridinOnly && (
              <span className="inline-flex items-center rounded-md bg-orange-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-800">
                Tridin Only
              </span>
            )}
          </div>`;

if (regex.test(content)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, "utf8");
  console.log("SUCCESS");
} else {
  console.log("NOT FOUND");
}
