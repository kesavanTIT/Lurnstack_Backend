const fs = require("fs");
const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";
let content = fs.readFileSync(filePath, "utf8");

// Check handleSaveVideo
if (content.includes("const handleSaveVideo = async (e) => {")) {
  const checkCode = `  const handleSaveVideo = async (e) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setVideoModalError("Please select a Tridin course first from the dropdown.");
      return;
    }`;

  content = content.replace("  const handleSaveVideo = async (e) => {\n    e.preventDefault();", checkCode);
  fs.writeFileSync(filePath, content, "utf8");
  console.log("Added selectedCourseId validation to handleSaveVideo!");
} else {
  console.log("Could not find handleSaveVideo start");
}
