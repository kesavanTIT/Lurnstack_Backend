const fs = require("fs");

const pagePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
let content = fs.readFileSync(pagePath, "utf8");

// ─────────────────────────────────────────────────────
// 1. Patch handleChange  (line 242 area)
// ─────────────────────────────────────────────────────
const oldHandleChange =
`  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };
      if (
        name === "startTime" ||
        name === "endTime" ||
        name === "recurringDays" ||
        name === "recurrenceEndDate" ||
        name === "totalDays"
      ) {
        const calc = autoCalculateDuration(next);
        return {
          ...next,
          totalDays: calc.totalDays,
          totalHoursPart: calc.totalHoursPart,
          totalMinutesPart: calc.totalMinutesPart,
        };
      }
      return next;
    });
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
    setMessage("");
    setError("");
  };`;

const newHandleChange =
`  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };

      // Sync targetAudience whenever audience checkboxes change
      if (name === "targetLurnstack" || name === "targetTridin") {
        const tl = name === "targetLurnstack" ? checked : Boolean(next.targetLurnstack);
        const tt = name === "targetTridin" ? checked : Boolean(next.targetTridin);
        let audience = "LURNSTACK";
        if (tt && tl) audience = "BOTH";
        else if (tt) audience = "TRIDIN";
        else audience = "LURNSTACK";
        return { ...next, targetLurnstack: tl, targetTridin: tt, targetAudience: audience, isTridinOnly: audience === "TRIDIN" };
      }

      if (
        name === "startTime" ||
        name === "endTime" ||
        name === "recurringDays" ||
        name === "recurrenceEndDate" ||
        name === "totalDays"
      ) {
        const calc = autoCalculateDuration(next);
        return {
          ...next,
          totalDays: calc.totalDays,
          totalHoursPart: calc.totalHoursPart,
          totalMinutesPart: calc.totalMinutesPart,
        };
      }
      return next;
    });
    setFormErrors((prev) => ({ ...prev, [name]: "", targetAudience: "" }));
    setMessage("");
    setError("");
  };`;

if (content.includes(oldHandleChange)) {
  content = content.replace(oldHandleChange, newHandleChange);
  console.log("✓ Patched handleChange");
} else {
  console.log("⚠ handleChange pattern not found — trying CRLF variant...");
  const crOld = oldHandleChange.replace(/\n/g, "\r\n");
  const crNew = newHandleChange.replace(/\n/g, "\r\n");
  if (content.includes(crOld)) {
    content = content.replace(crOld, crNew);
    console.log("✓ Patched handleChange (CRLF)");
  } else {
    console.log("✗ FAILED to patch handleChange");
  }
}

// ─────────────────────────────────────────────────────
// 2. Patch formWithCalculatedHours in handleSubmit
// ─────────────────────────────────────────────────────
const oldCalc =
`    const formWithCalculatedHours = {
      ...form,
      totalHours: calculatedTotalHours !== "" ? calculatedTotalHours : "",
    };`;

const newCalc =
`    const _tl = form.targetLurnstack !== undefined ? Boolean(form.targetLurnstack) : true;
    const _tt = Boolean(form.targetTridin);
    let _audience = "LURNSTACK";
    if (_tt && _tl) _audience = "BOTH";
    else if (_tt) _audience = "TRIDIN";
    else _audience = "LURNSTACK";

    const formWithCalculatedHours = {
      ...form,
      targetLurnstack: _tl,
      targetTridin: _tt,
      targetAudience: _audience,
      isTridinOnly: _audience === "TRIDIN",
      totalHours: calculatedTotalHours !== "" ? calculatedTotalHours : "",
    };`;

if (content.includes(oldCalc)) {
  content = content.replace(oldCalc, newCalc);
  console.log("✓ Patched formWithCalculatedHours");
} else {
  const crOld2 = oldCalc.replace(/\n/g, "\r\n");
  const crNew2 = newCalc.replace(/\n/g, "\r\n");
  if (content.includes(crOld2)) {
    content = content.replace(crOld2, crNew2);
    console.log("✓ Patched formWithCalculatedHours (CRLF)");
  } else {
    console.log("✗ FAILED to patch formWithCalculatedHours");
  }
}

fs.writeFileSync(pagePath, content, "utf8");
console.log("Done. File saved.");
