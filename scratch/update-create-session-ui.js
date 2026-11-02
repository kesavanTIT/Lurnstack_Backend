const fs = require("fs");

const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\CreateSessionSection.jsx";
let content = fs.readFileSync(file, "utf8");

// Regex matching the old Tridin checkbox box
const oldBoxRegex = /\{\/\*[\s\S]*?Tridin Software Portal[\s\S]*?<div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-4">[\s\S]*?<\/div>\s*<\/label>\s*<\/div>/;

const newAudienceBox = `{/* ── Audience & Platform Visibility (LurnStack / Tridin / Both) ── */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              Target Candidates & Platform Visibility
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose who can attend this live class: Regular students, Tridin candidates, or both platforms.
            </p>
          </div>

          {/* Dynamic Audience Badge Preview */}
          <div className="self-start sm:self-auto">
            {Boolean(form.targetLurnstack) && Boolean(form.targetTridin) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 border border-purple-200 px-3 py-1 text-xs font-black text-purple-900 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-purple-600 animate-pulse"></span>
                Both: LurnStack + Tridin
              </span>
            ) : Boolean(form.targetTridin) ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-100 border border-orange-200 px-3 py-1 text-xs font-black text-orange-900 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-orange-600"></span>
                Tridin Candidates Only
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 border border-blue-200 px-3 py-1 text-xs font-black text-blue-900 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-blue-600"></span>
                Regular LurnStack Students Only
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Checkbox 1: Regular LurnStack Students */}
          <label className={\`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all \${
            Boolean(form.targetLurnstack)
              ? "border-blue-400 bg-blue-50/90 shadow-sm ring-1 ring-blue-300"
              : "border-slate-200 bg-white hover:border-slate-300"
          }\`}>
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                name="targetLurnstack"
                checked={Boolean(form.targetLurnstack)}
                onChange={onChange}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-blue-300 bg-white checked:border-blue-600 checked:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
              />
              <svg
                className="pointer-events-none absolute inset-0 hidden h-5 w-5 text-white peer-checked:block"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>🔵 Regular LurnStack Students</span>
              </span>
              <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                Visible to regular students in LurnStack public catalog, search, and student portal.
              </p>
            </div>
          </label>

          {/* Checkbox 2: Tridin Software Candidates */}
          <label className={\`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-all \${
            Boolean(form.targetTridin)
              ? "border-orange-400 bg-orange-50/90 shadow-sm ring-1 ring-orange-300"
              : "border-slate-200 bg-white hover:border-slate-300"
          }\`}>
            <div className="relative mt-0.5 flex-shrink-0">
              <input
                type="checkbox"
                name="targetTridin"
                checked={Boolean(form.targetTridin)}
                onChange={onChange}
                className="peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-orange-300 bg-white checked:border-orange-600 checked:bg-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:ring-offset-1"
              />
              <svg
                className="pointer-events-none absolute inset-0 hidden h-5 w-5 text-white peer-checked:block"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>🟠 Tridin Software Candidates</span>
              </span>
              <p className="mt-0.5 text-[11px] text-slate-500 leading-snug">
                Visible to Tridin candidates in their Online Class & Meetings dashboard.
              </p>
            </div>
          </label>
        </div>
      </div>`;

if (oldBoxRegex.test(content)) {
  content = content.replace(oldBoxRegex, newAudienceBox);
  fs.writeFileSync(file, content, "utf8");
  console.log("✓ Successfully replaced audience checkbox in CreateSessionSection.jsx");
} else {
  console.log("⚠ Could not match oldBoxRegex in CreateSessionSection.jsx");
}
