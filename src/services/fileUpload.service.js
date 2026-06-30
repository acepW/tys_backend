const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const {
  UPLOAD_BASE_DIR,
  ALLOWED_FOLDERS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
} = require("../config/config");

class FileUploadService {
  constructor() {
    this._ensureDirSync(UPLOAD_BASE_DIR);
  }

  _ensureDirSync(dir) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Validasi alias folder terhadap whitelist + cegah path traversal
   */
  _resolveSafeFolder(folderAlias) {
    if (!folderAlias || typeof folderAlias !== "string") {
      throw new Error("Folder tujuan tidak valid");
    }

    const physicalFolder = ALLOWED_FOLDERS[folderAlias];
    if (!physicalFolder) {
      throw new Error(
        `Folder '${folderAlias}' tidak diizinkan. Folder tersedia: ${Object.keys(
          ALLOWED_FOLDERS
        ).join(", ")}`
      );
    }

    const base = path.resolve(UPLOAD_BASE_DIR);
    const resolvedPath = path.resolve(base, physicalFolder);

    if (!resolvedPath.startsWith(base + path.sep)) {
      throw new Error("Path folder tidak valid (terdeteksi path traversal)");
    }

    return resolvedPath;
  }

  _generateSafeFilename(originalName, mimeType) {
    const ext =
      ALLOWED_MIME_TYPES[mimeType] || path.extname(originalName).toLowerCase();
    const randomName = crypto.randomBytes(16).toString("hex");
    const timestamp = Date.now();
    return `${timestamp}_${randomName}${ext}`;
  }

  _buildStorage(folderAlias) {
    const safeFolder = this._resolveSafeFolder(folderAlias);
    this._ensureDirSync(safeFolder);

    return multer.diskStorage({
      destination: (req, file, cb) => cb(null, safeFolder),
      filename: (req, file, cb) => {
        try {
          cb(
            null,
            this._generateSafeFilename(file.originalname, file.mimetype)
          );
        } catch (err) {
          cb(err);
        }
      },
    });
  }

  _fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(
        new Error(
          `Tipe file '${
            file.mimetype
          }' tidak diizinkan. Tipe diizinkan: ${Object.values(
            ALLOWED_MIME_TYPES
          ).join(", ")}`
        ),
        false
      );
    }
    cb(null, true);
  }

  singleUploadMiddleware(folderAlias, fieldName = "file") {
    this._resolveSafeFolder(folderAlias); // validasi awal
    const upload = multer({
      storage: this._buildStorage(folderAlias),
      limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      fileFilter: this._fileFilter.bind(this),
    });
    return upload.single(fieldName);
  }

  multipleUploadMiddleware(folderAlias, fieldName = "files", maxCount = 5) {
    this._resolveSafeFolder(folderAlias);
    const upload = multer({
      storage: this._buildStorage(folderAlias),
      limits: { fileSize: MAX_FILE_SIZE, files: maxCount },
      fileFilter: this._fileFilter.bind(this),
    });
    return upload.array(fieldName, maxCount);
  }

  buildFileResponse(file, folderAlias) {
    if (!file) throw new Error("File tidak ditemukan pada request");
    const physicalFolder = ALLOWED_FOLDERS[folderAlias];
    return {
      url: `/uploads/${physicalFolder}/${file.filename}`,
      type: file.mimetype,
      size: file.size,
      originalName: file.originalname,
      storedName: file.filename,
    };
  }

  buildMultipleFileResponse(files, folderAlias) {
    if (!files || !Array.isArray(files))
      throw new Error("Files tidak ditemukan pada request");
    return files.map((file) => this.buildFileResponse(file, folderAlias));
  }

  /**
   * Konversi url (/uploads/contracts/xxx.pdf) -> absolute path fisik yang sudah divalidasi aman
   */
  _resolveSafePathFromUrl(fileUrl) {
    if (
      !fileUrl ||
      typeof fileUrl !== "string" ||
      !fileUrl.startsWith("/uploads/")
    ) {
      throw new Error("URL file tidak valid");
    }

    const relativePath = fileUrl.replace(/^\/uploads\//, "");
    const base = path.resolve(UPLOAD_BASE_DIR);
    const fullPath = path.resolve(base, relativePath);

    if (!fullPath.startsWith(base + path.sep)) {
      throw new Error("Path file tidak valid (terdeteksi path traversal)");
    }

    return fullPath;
  }

  /**
   * Ambil metadata file dari disk (untuk endpoint GET info)
   */
  async getFileInfo(fileUrl) {
    const fullPath = this._resolveSafePathFromUrl(fileUrl);
    try {
      const stat = await fsp.stat(fullPath);
      if (!stat.isFile()) throw new Error("Bukan file yang valid");
      return {
        url: fileUrl,
        size: stat.size,
        createdAt: stat.birthtime,
        modifiedAt: stat.mtime,
      };
    } catch (err) {
      if (err.code === "ENOENT") throw new Error("File tidak ditemukan");
      throw err;
    }
  }

  /**
   * Dapatkan absolute path aman untuk di-stream/serve (dipakai controller GET download)
   */
  getSafeFilePathForServing(fileUrl) {
    return this._resolveSafePathFromUrl(fileUrl);
  }

  /**
   * List semua file dalam satu folder alias (untuk endpoint GET list)
   */
  async listFiles(folderAlias) {
    const safeFolder = this._resolveSafeFolder(folderAlias);
    this._ensureDirSync(safeFolder);
    const physicalFolder = ALLOWED_FOLDERS[folderAlias];

    const entries = await fsp.readdir(safeFolder, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile());

    const results = await Promise.all(
      files.map(async (entry) => {
        const stat = await fsp.stat(path.join(safeFolder, entry.name));
        return {
          url: `/uploads/${physicalFolder}/${entry.name}`,
          storedName: entry.name,
          size: stat.size,
          modifiedAt: stat.mtime,
        };
      })
    );

    return results;
  }

  async deleteFile(fileUrl) {
    const fullPath = this._resolveSafePathFromUrl(fileUrl);
    try {
      await fsp.unlink(fullPath);
      return true;
    } catch (err) {
      if (err.code === "ENOENT") return false;
      throw err;
    }
  }
}

module.exports = new FileUploadService();
