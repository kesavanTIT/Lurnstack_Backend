const fs = require("fs");

console.log("Applying fixes to Trainer Dashboard (D:\\lurn_t\\LurnStack-Trainer)...");

// ─────────────────────────────────────────────────────────────
// 1. Patch TrainerDashboardPage.jsx
// ─────────────────────────────────────────────────────────────
const pageFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
let pageContent = fs.readFileSync(pageFile, "utf8");

// A. Update handleChange so targetTridin and targetLurnstack update targetAudience & isTridinOnly immediately
const targetHandleChange = `  const handleChange = (e) => {
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

const newHandleChange = `  const handleChange = (e) => {
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
    setFormErrors((prev) => ({ ...prev, [name]: "", targetAudience: "" }));
    setMessage("");
    setError("");
  };`;

if (pageContent.includes(targetHandleChange)) {
  pageContent = pageContent.replace(targetHandleChange, newHandleChange);
  console.log("✓ Patched handleChange in TrainerDashboardPage.jsx");
} else {
  console.log("⚠ Could not find exact handleChange string in TrainerDashboardPage.jsx");
}

// B. Update handleSubmit to guarantee calculated targetAudience is sent
const targetSubmitBlock = `    const formWithCalculatedHours = {
      ...form,
      totalHours: calculatedTotalHours !== "" ? calculatedTotalHours : "",
    };`;

const newSubmitBlock = `    const targetLurnstack = form.targetLurnstack !== undefined ? Boolean(form.targetLurnstack) : true;
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

if (pageContent.includes(targetSubmitBlock)) {
  pageContent = pageContent.replace(targetSubmitBlock, newSubmitBlock);
  console.log("✓ Patched handleSubmit in TrainerDashboardPage.jsx");
} else {
  console.log("⚠ Could not find exact targetSubmitBlock in TrainerDashboardPage.jsx");
}

fs.writeFileSync(pageFile, pageContent, "utf8");

// ─────────────────────────────────────────────────────────────
// 2. Patch trainerSessionsApi.js
// ─────────────────────────────────────────────────────────────
const apiFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\recurring\\api\\trainerSessionsApi.js";
let apiContent = fs.readFileSync(apiFile, "utf8");

const targetAudienceInApi = `    isTridinOnly: (payload.targetAudience === "TRIDIN" || (payload.targetTridin && !payload.targetLurnstack)),
    targetAudience: payload.targetAudience || ((payload.targetTridin && payload.targetLurnstack) ? "BOTH" : (payload.targetTridin ? "TRIDIN" : "LURNSTACK")),
    targetLurnstack: payload.targetLurnstack !== undefined ? Boolean(payload.targetLurnstack) : true,
    targetTridin: Boolean(payload.targetTridin || payload.isTridinOnly),`;

const newAudienceInApi = `    isTridinOnly: (Boolean(payload.targetTridin) && !payload.targetLurnstack) || payload.targetAudience === "TRIDIN",
    targetAudience: (Boolean(payload.targetTridin) && Boolean(payload.targetLurnstack)) ? "BOTH" : (Boolean(payload.targetTridin) || payload.isTridinOnly || payload.targetAudience === "TRIDIN") ? "TRIDIN" : "LURNSTACK",
    targetLurnstack: payload.targetLurnstack !== undefined ? Boolean(payload.targetLurnstack) : true,
    targetTridin: Boolean(payload.targetTridin || payload.isTridinOnly),`;

if (apiContent.includes(targetAudienceInApi)) {
  apiContent = apiContent.replace(targetAudienceInApi, newAudienceInApi);
  fs.writeFileSync(apiFile, apiContent, "utf8");
  console.log("✓ Patched normalizeSessionPayload in trainerSessionsApi.js");
} else {
  console.log("⚠ Could not find exact targetAudienceInApi in trainerSessionsApi.js");
}

console.log("Done applying trainer frontend patches.");
