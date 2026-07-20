/**
 * Normalizes absolute server paths into relative public asset paths.
 * Example: "/www/wwwroot/api.lurnstack.com/uploads/thumbnails/file.png" -> "uploads/thumbnails/file.png"
 * Example: "uploads\\thumbnails\\file.png" -> "uploads/thumbnails/file.png"
 * 
 * @param {string} pathStr The path to normalize
 * @returns {string} The relative upload path starting with "uploads/"
 */
function getRelativeUploadPath(pathStr) {
  if (!pathStr) return pathStr;
  
  // Convert all backslashes to forward slashes
  const normalized = String(pathStr).replace(/\\/g, "/");
  
  // Find index of "uploads/"
  const idx = normalized.indexOf("uploads/");
  if (idx !== -1) {
    return normalized.substring(idx);
  }
  
  return normalized;
}

module.exports = {
  getRelativeUploadPath
};
