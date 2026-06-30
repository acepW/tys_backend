const path = require("path");

const UPLOAD_BASE_DIR = path.join(__dirname, "..", "uploads");

// Whitelist folder — key = alias dipakai di URL, value = nama folder fisik di disk
const ALLOWED_FOLDERS = {
  company: "company",
};

const ALLOWED_MIME_TYPES = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

module.exports = {
  UPLOAD_BASE_DIR,
  ALLOWED_FOLDERS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};
