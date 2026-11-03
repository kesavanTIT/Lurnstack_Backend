const fs = require("fs");

// 1. Update TrainerDashboardPage.jsx
const pageFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
let pageContent = fs.readFileSync(pageFile, "utf8");

// Replace handleChange
const oldHandleChangeRegex = /const handleChange = \(e\) =>\s*\{[\s\S]*?setFormErrors\(\(prev\) => \(\{ \.\.\.prev, \[name\]: "" \}\)\);/;

const newHandleChangeCode = `const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: type === "checkbox" ? checked : value };

      if (name === "targetLurnstack" || name === "targetTridin") {
        const targetLurnstack = name === "targetLurnstack" ? checked : Boolean(next.targetLurnstack);
        const targetTridin = name === "targetTridin" ? checked : Boolean(next.targetTridin);
        let targetAudience = "LURNSTACK";
        if (targetTridin && targetLurnstack) targetAudience = "BOTH";
        else if (targetTridin) targetAudience = "TRIDIN";
        else targetAudience = "LURNSTACK";

        return {
          ...next,
          targetLurnstack,
          targetTridin,
          targetAudience,
          isTridinOnly: targetAudience === "TRIDIN",
        };
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
    setFormErrors((prev) => ({ ...prev, [name]: "", targetAudience: "" }));`;

if (oldHandleChangeRegex.test(pageContent)) {
  pageContent = pageContent.replace(oldHandleChangeRegex, newHandleChangeCode);
  console.log("✓ Successfully replaced handleChange in TrainerDashboardPage.jsx");
} else {
  console.log("⚠ Could not match oldHandleChangeRegex");
}

// Replace formWithCalculatedHours in handleSubmit
const oldSubmitCalcRegex = /const formWithCalculatedHours = \{\s*\.\.\.form,\s*totalHours: calculatedTotalHours !== "" \? calculatedTotalHours : "",\s*\};/;

const newSubmitCalcCode = `const targetLurnstack = form.targetLurnstack !== undefined ? Boolean(form.targetLurnstack) : true;
    const targetTridin = Boolean(form.targetTridin);
    let targetAudience = "LURNSTACK";
    if (targetTridin && targetLurnstack) targetAudience = "BOTH";
    else if (targetTridin) targetAudience = "TRIDIN";
    else targetAudience = "LURNSTACK";

    const formWithCalculatedHours = {
      ...form,
      targetLurnstack,
      targetTridin,
      targetAudience,
      isTridinOnly: targetAudience === "TRIDIN",
      totalHours: calculatedTotalHours !== "" ? calculatedTotalHours : "",
    };`;

if (oldSubmitCalcRegex.test(pageContent)) {
  pageContent = pageContent.replace(oldSubmitCalcRegex, newSubmitCalcCode);
  console.log("✓ Successfully replaced formWithCalculatedHours in TrainerDashboardPage.jsx");
} else {
  console.log("⚠ Could not match oldSubmitCalcRegex");
}

fs.writeFileSync(pageFile, pageContent, "utf8");
console.log("Trainer frontend updated successfully.");
