const fs = require("fs");

console.log("Starting full Trainer Frontend updates for audience targeting...");

// 1. Update createSessionConfig.js
const configFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\create-session\\createSessionConfig.js";
let configCode = fs.readFileSync(configFile, "utf8");
if (!configCode.includes("targetLurnstack:")) {
  configCode = configCode.replace(
    'isTridinOnly: false,',
    'isTridinOnly: false,\n  targetLurnstack: true,\n  targetTridin: false,\n  targetAudience: "LURNSTACK",'
  );
  fs.writeFileSync(configFile, configCode, "utf8");
  console.log("✓ Updated createSessionConfig.js");
}

// 2. Update trainerSessionsApi.js
const apiFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\recurring\\api\\trainerSessionsApi.js";
let apiCode = fs.readFileSync(apiFile, "utf8");

// Add targetAudience to normalizeSession
if (!apiCode.includes("targetAudience: raw.targetAudience")) {
  apiCode = apiCode.replace(
    'isTridinOnly: Boolean(raw.isTridinOnly) || false,',
    'isTridinOnly: Boolean(raw.isTridinOnly) || false,\n    targetAudience: raw.targetAudience || (raw.isTridinOnly ? "TRIDIN" : "LURNSTACK"),'
  );
}

// Add targetAudience to normalizeSessionPayload
if (!apiCode.includes("targetAudience: payload.targetAudience")) {
  apiCode = apiCode.replace(
    'isTridinOnly: Boolean(payload.isTridinOnly) || false,',
    `isTridinOnly: (payload.targetAudience === "TRIDIN" || (payload.targetTridin && !payload.targetLurnstack)),
    targetAudience: payload.targetAudience || ((payload.targetTridin && payload.targetLurnstack) ? "BOTH" : (payload.targetTridin ? "TRIDIN" : "LURNSTACK")),
    targetLurnstack: payload.targetLurnstack !== undefined ? Boolean(payload.targetLurnstack) : true,
    targetTridin: Boolean(payload.targetTridin || payload.isTridinOnly),`
  );
}
fs.writeFileSync(apiFile, apiCode, "utf8");
console.log("✓ Updated trainerSessionsApi.js");

// 3. Update TrainerDashboardPage.jsx (startEditingSession)
const pageFile = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
let pageCode = fs.readFileSync(pageFile, "utf8");
if (!pageCode.includes("targetLurnstack:")) {
  pageCode = pageCode.replace(
    'isTridinOnly: Boolean(details.isTridinOnly) || false,',
    `isTridinOnly: Boolean(details.isTridinOnly) || false,
        targetAudience: details.targetAudience || (details.isTridinOnly ? "TRIDIN" : "LURNSTACK"),
        targetLurnstack: details.targetAudience === "BOTH" || (!details.isTridinOnly && details.targetAudience !== "TRIDIN"),
        targetTridin: details.targetAudience === "BOTH" || Boolean(details.isTridinOnly) || details.targetAudience === "TRIDIN",`
  );
  fs.writeFileSync(pageFile, pageCode, "utf8");
  console.log("✓ Updated TrainerDashboardPage.jsx");
}

console.log("Core API and form configs updated successfully.");
