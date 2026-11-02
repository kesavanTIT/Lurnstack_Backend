const fs = require("fs");

const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\RecurringSessionsSection.jsx";
let content = fs.readFileSync(file, "utf8");

// 1. Insert audience filter state and filteredSessions computation
const targetFuncStart = `export default function RecurringSessionsSection({
  sessions,
  message,
  error,
  loadingSessions,
  trainerActionsLocked,
  actionId,
  onNavigate,
  onRefresh,
  onEditSession,
  onUpdateSessionAction,
  onOpenSessionDialog,
}) {`;

const newFuncStart = `export default function RecurringSessionsSection({
  sessions,
  message,
  error,
  loadingSessions,
  trainerActionsLocked,
  actionId,
  onNavigate,
  onRefresh,
  onEditSession,
  onUpdateSessionAction,
  onOpenSessionDialog,
}) {
  const [audienceFilter, setAudienceFilter] = useState("ALL");

  const lurnstackSessions = sessions.filter(
    (s) => s.targetAudience === "LURNSTACK" || (!s.targetAudience && !s.isTridinOnly)
  );
  const tridinSessions = sessions.filter(
    (s) => s.targetAudience === "TRIDIN" || (s.isTridinOnly && s.targetAudience !== "BOTH")
  );
  const bothSessions = sessions.filter((s) => s.targetAudience === "BOTH");

  const filteredSessions = sessions.filter((s) => {
    if (audienceFilter === "LURNSTACK") {
      return s.targetAudience === "LURNSTACK" || (!s.targetAudience && !s.isTridinOnly);
    }
    if (audienceFilter === "TRIDIN") {
      return s.targetAudience === "TRIDIN" || (s.isTridinOnly && s.targetAudience !== "BOTH");
    }
    if (audienceFilter === "BOTH") {
      return s.targetAudience === "BOTH";
    }
    return true;
  });`;

content = content.replace(targetFuncStart, newFuncStart);

// 2. Insert tabs above <div className="mt-6">
const targetBeforeMt6 = `<div className="mt-6">`;

const tabsSnippet = `{/* ── Audience Filter Tabs (All / LurnStack / Tridin / Both) ── */}
      <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar border-b border-slate-200">
        {[
          { key: "ALL", label: "All Sessions", count: sessions.length, icon: "🔘" },
          { key: "LURNSTACK", label: "LurnStack Only", count: lurnstackSessions.length, icon: "🔵" },
          { key: "TRIDIN", label: "Tridin Only", count: tridinSessions.length, icon: "🟠" },
          { key: "BOTH", label: "Both (Shared)", count: bothSessions.length, icon: "🟣" },
        ].map((tab) => {
          const isActive = audienceFilter === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setAudienceFilter(tab.key)}
              className={\`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-black transition-all whitespace-nowrap \${
                isActive
                  ? "border-[#00342b] text-[#00342b] bg-slate-50 rounded-t-lg"
                  : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
              }\`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
              <span className={\`rounded-full px-2 py-0.5 text-[10px] font-extrabold \${
                isActive ? "bg-[#00342b] text-white" : "bg-slate-200/80 text-slate-600"
              }\`}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4">`;

content = content.replace(targetBeforeMt6, tabsSnippet);

// 3. Replace sessions.map with filteredSessions.map
content = content.replace(
  "{sessions.map((session) => (",
  "{filteredSessions.map((session) => ("
);

// 4. Update the badges in SessionRow
const oldBadgeRegex = /<div className="flex items-center gap-1\.5 flex-wrap">[\s\S]*?\{session\.courseTitle\}[\s\S]*?<\/div>/;

const newBadgeSnippet = `<div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#006b58] truncate">
              {session.courseTitle}
            </span>
            {session.targetAudience === "BOTH" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-purple-100 border border-purple-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-purple-900 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-purple-600"></span>
                Both (Shared)
              </span>
            ) : (session.targetAudience === "TRIDIN" || session.isTridinOnly) ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-orange-100 border border-orange-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-orange-900 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-600"></span>
                Tridin Only
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 border border-blue-200 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-blue-900 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-600"></span>
                LurnStack Only
              </span>
            )}
          </div>`;

if (oldBadgeRegex.test(content)) {
  content = content.replace(oldBadgeRegex, newBadgeSnippet);
}

fs.writeFileSync(file, content, "utf8");
console.log("✓ Successfully updated RecurringSessionsSection.jsx with 4 Tabs and 3 Badges!");
