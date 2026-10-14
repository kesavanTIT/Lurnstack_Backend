const fs = require("fs");

const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";
let content = fs.readFileSync(filePath, "utf8");

// Inject progress bar before the submit buttons
const targetSubmitArea = `              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setVideoModalOpen(false)}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingVideo}
                  className="rounded-xl bg-[#004d3d] px-5 py-2 text-xs font-bold text-white hover:bg-[#00392d] disabled:opacity-50"
                >
                  {savingVideo ? "Saving..." : editingVideo ? "Update Video" : "Add Video"}
                </button>
              </div>`;

const newSubmitArea = `              {/* Upload progress bar for direct video file upload */}
              {savingVideo && videoUploadTab === "file" && uploadProgress > 0 && (
                <div className="space-y-1 px-1">
                  <div className="flex justify-between text-[11px] font-semibold text-gray-700">
                    <span>⬆️ Uploading video file...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#004d3d] h-2 rounded-full transition-all duration-200"
                      style={{ width: \`\${uploadProgress}%\` }}
                    />
                  </div>
                  <p className="text-[11px] text-amber-600 font-medium">⚠️ Please wait, do not close this modal...</p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setVideoModalOpen(false)}
                  disabled={savingVideo}
                  className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingVideo}
                  className="rounded-xl bg-[#004d3d] px-5 py-2 text-xs font-bold text-white hover:bg-[#00392d] disabled:opacity-50 flex items-center gap-2"
                >
                  {savingVideo ? (
                    <>
                      <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      {videoUploadTab === "file" ? \`Uploading \${uploadProgress}%\` : "Saving..."}
                    </>
                  ) : editingVideo ? "Update Video" : "Add Video"}
                </button>
              </div>`;

if (content.includes(targetSubmitArea)) {
  content = content.replace(targetSubmitArea, newSubmitArea);
  console.log("✅ Progress bar + spinner added to submit area!");
} else {
  console.log("❌ Submit area target not found!");
  // Fallback - search for key text
  const idx = content.indexOf(`type="submit"`);
  console.log("type='submit' found at:", idx);
}

fs.writeFileSync(filePath, content, "utf8");
console.log("✅ File saved!");
