const fs = require("fs");
const file = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\pages\\TrainerDashboardPage.jsx";
let content = fs.readFileSync(file, "utf8");

const regex = /setFormErrors\(nextErrors\);\s*return nextErrors;/;
if (regex.test(content) && !content.includes("nextErrors.targetAudience")) {
  content = content.replace(
    regex,
    `if (!formToValidate.targetLurnstack && !formToValidate.targetTridin) {
      nextErrors.targetAudience = "Please select at least one platform (LurnStack or Tridin).";
    }

    setFormErrors(nextErrors);
    return nextErrors;`
  );
  fs.writeFileSync(file, content, "utf8");
  console.log("SUCCESS");
} else {
  console.log("ALREADY OR NOT MATCHED");
}
