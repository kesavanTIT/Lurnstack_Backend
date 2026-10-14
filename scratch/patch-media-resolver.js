const fs = require("fs");
const targetFile = "D:\\lurnstack\\LurnStack\\src\\pages\\TridinCoursePlayerPage.jsx";
let content = fs.readFileSync(targetFile, "utf8");

// Add resolveMediaUrl helper if not present
if (!content.includes("resolveMediaUrl")) {
  const helperCode = `
// Helper to resolve backend media URLs (handles both full URLs and relative /uploads paths)
const resolveMediaUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const base = String(axiosClient.defaults.baseURL || "").replace(/\\/+$/, "");
  const cleanPath = url.startsWith("/") ? url : "/" + url;
  return base + cleanPath;
};
`;

  // Inject before component
  content = content.replace("export default function TridinCoursePlayerPage() {", helperCode + "\nexport default function TridinCoursePlayerPage() {");

  // Update <video src={activeVideo.videoUrl} to resolveMediaUrl(activeVideo.videoUrl)
  content = content.replace("<video\n                  src={activeVideo.videoUrl}", "<video\n                  src={resolveMediaUrl(activeVideo.videoUrl)}");
  content = content.replace("src={activeVideo.videoUrl}", "src={resolveMediaUrl(activeVideo.videoUrl)}");

  // Update thumbnail image src as well
  content = content.replace("src={v.thumbnailUrl}", "src={resolveMediaUrl(v.thumbnailUrl)}");

  fs.writeFileSync(targetFile, content, "utf8");
  console.log("Successfully added resolveMediaUrl to TridinCoursePlayerPage.jsx!");
} else {
  console.log("resolveMediaUrl already present");
}
