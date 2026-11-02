const fs = require("fs");
const file = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinDashboardPage.jsx";
let content = fs.readFileSync(file, "utf8");

const target = `{/* Recurrence Badge */}
                          <div className="absolute bottom-2.5 left-3 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                            {session.isRecurring ? "Daily Recurring Batch" : "One-off Session"}
                          </div>`;

const replacement = `{/* Recurrence Badge */}
                          <div className="absolute bottom-2.5 left-3 rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                            {session.isRecurring ? "Daily Recurring Batch" : "One-off Session"}
                          </div>

                          {/* Shared Audience Badge */}
                          {session.targetAudience === "BOTH" && (
                            <div className="absolute bottom-2.5 right-3 rounded-md bg-purple-950/80 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-purple-200 border border-purple-400/40 shadow-sm">
                              Shared Batch
                            </div>
                          )}`;

if (content.includes(target) && !content.includes("Shared Audience Badge")) {
  content = content.replace(target, replacement);
  fs.writeFileSync(file, content, "utf8");
  console.log("✓ Added shared batch badge to TridinDashboardPage.jsx");
} else {
  console.log("Target not found or already added");
}
