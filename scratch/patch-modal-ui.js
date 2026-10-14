const fs = require("fs");

const filePath = "D:\\lurn_t\\LurnStack-Trainer\\src\\trainers\\dashboard\\sections\\TridinCurriculumSection.jsx";
let content = fs.readFileSync(filePath, "utf8");

// ── Replace the YouTube/URL only field with a tab-based switcher ──────────────
const oldVideoUrlField = `              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  YouTube or Video URL *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. https://www.youtube.com/watch?v=YtX-Rmoea0M"
                  value={videoForm.videoUrl}
                  onChange={(e) => setVideoForm({ ...videoForm, videoUrl: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-500">
                  Paste standard YouTube link (watch?v=..., youtu.be/...) or direct video URL.
                </p>
              </div>`;

const newVideoUrlField = `              {/* ── Video Source Tab Switcher ── */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">
                  Video Source *
                </label>
                {/* Tab buttons */}
                <div className="flex mb-3 rounded-xl overflow-hidden border border-gray-200">
                  <button
                    type="button"
                    onClick={() => { setVideoUploadTab("youtube"); setVideoFile(null); setVideoFilePreview(""); }}
                    className={\`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-all \${
                      videoUploadTab === "youtube"
                        ? "bg-[#004d3d] text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }\`}
                  >
                    <FiYoutube className="h-4 w-4" />
                    YouTube / URL
                  </button>
                  <button
                    type="button"
                    onClick={() => { setVideoUploadTab("file"); setVideoForm(p => ({ ...p, videoUrl: "" })); }}
                    className={\`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold transition-all \${
                      videoUploadTab === "file"
                        ? "bg-[#004d3d] text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50"
                    }\`}
                  >
                    <FiUpload className="h-4 w-4" />
                    Upload Video File
                  </button>
                </div>

                {/* YouTube / URL Input */}
                {videoUploadTab === "youtube" && (
                  <>
                    <input
                      type="text"
                      placeholder="e.g. https://www.youtube.com/watch?v=YtX-Rmoea0M"
                      value={videoForm.videoUrl}
                      onChange={(e) => setVideoForm({ ...videoForm, videoUrl: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-[#004d3d] focus:outline-none"
                    />
                    <p className="mt-1 text-[11px] text-gray-500">
                      Paste YouTube link (watch?v=..., youtu.be/...) or any direct video URL.
                    </p>
                  </>
                )}

                {/* Direct Video File Upload */}
                {videoUploadTab === "file" && (
                  <div className="space-y-2">
                    <label className="cursor-pointer block w-full rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-[#004d3d] hover:bg-emerald-50 transition-all p-4 text-center">
                      <FiVideo className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <span className="text-xs font-bold text-gray-600 block">
                        {videoFile ? videoFile.name : "Click to choose video file"}
                      </span>
                      <span className="text-[11px] text-gray-400 mt-0.5 block">
                        {videoFile
                          ? \`\${(videoFile.size / (1024 * 1024)).toFixed(1)} MB\`
                          : "MP4, WebM, OGG, AVI, MKV — Max 500MB"}
                      </span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) {
                            setVideoFile(f);
                            setVideoFilePreview(URL.createObjectURL(f));
                            // Auto-fill duration from video metadata
                            const video = document.createElement("video");
                            video.preload = "metadata";
                            video.onloadedmetadata = () => {
                              URL.revokeObjectURL(video.src);
                              const mins = Math.ceil(video.duration / 60);
                              setVideoForm(p => ({ ...p, durationMinutes: mins || p.durationMinutes }));
                            };
                            video.src = URL.createObjectURL(f);
                          }
                        }}
                      />
                    </label>

                    {/* Preview the selected video file */}
                    {videoFilePreview && (
                      <video
                        src={videoFilePreview}
                        controls
                        className="w-full rounded-xl max-h-40 bg-black"
                      />
                    )}

                    {/* Editing existing upload - show current */}
                    {editingVideo?.videoType === "UPLOAD" && !videoFile && (
                      <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2">
                        ✅ Current: Uploaded video file is kept. Select a new file above to replace it.
                      </p>
                    )}
                  </div>
                )}
              </div>`;

if (content.includes(oldVideoUrlField)) {
  content = content.replace(oldVideoUrlField, newVideoUrlField);
  console.log("✅ Video source field patched with tab switcher!");
} else {
  console.log("❌ Target not found! Searching for nearby text...");
  const idx = content.indexOf("YouTube or Video URL *");
  if (idx > -1) {
    console.log("Found 'YouTube or Video URL *' at index:", idx);
    console.log("Context:", content.substring(idx - 100, idx + 200));
  }
}

// ── Also patch the upload progress bar (add after error message, before submit button) ──
const oldSubmitArea = `              {videoError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                  <FiAlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                  <span>{videoError}</span>
                </div>
              )}`;

const newSubmitArea = `              {videoError && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                  <FiAlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
                  <span>{videoError}</span>
                </div>
              )}

              {/* Upload progress bar (for direct video file upload) */}
              {savingVideo && videoUploadTab === "file" && uploadProgress > 0 && uploadProgress < 100 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] font-semibold text-gray-700">
                    <span>Uploading video...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-[#004d3d] h-2 rounded-full transition-all duration-300"
                      style={{ width: \`\${uploadProgress}%\` }}
                    />
                  </div>
                  <p className="text-[11px] text-gray-500">Please wait, do not close this window...</p>
                </div>
              )}`;

if (content.includes(oldSubmitArea)) {
  content = content.replace(oldSubmitArea, newSubmitArea);
  console.log("✅ Upload progress bar added!");
} else {
  console.log("❌ Submit area not found for progress bar injection");
}

fs.writeFileSync(filePath, content, "utf8");
console.log("✅ File saved successfully!");
