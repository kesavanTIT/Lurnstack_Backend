const fs = require("fs");
const c = fs.readFileSync("D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx", "utf8");
console.log("Lines:", c.split("\n").length, "| Bytes:", c.length);
console.log("Has YouTube tab:", c.includes('videoUploadTab === "youtube"'));
console.log("Has File tab:", c.includes('videoUploadTab === "file"'));
console.log("Has progress bar:", c.includes("uploadProgress"));
console.log("Has videoFile state:", c.includes("setVideoFile"));
console.log("Has spinner:", c.includes("animate-spin"));
console.log("Has file drag area:", c.includes('accept="video/*"'));
