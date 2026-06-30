const fileUploadService = require("../services/fileUpload.service");

class FileUploadController {
  // POST /api/upload/:folderAlias/single
  async uploadSingle(req, res) {
    try {
      const data = fileUploadService.buildFileResponse(
        req.file,
        req.params.folderAlias
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // POST /api/upload/:folderAlias/multiple
  async uploadMultiple(req, res) {
    try {
      const data = fileUploadService.buildMultipleFileResponse(
        req.files,
        req.params.folderAlias
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // GET /api/upload/:folderAlias  -> list semua file dalam folder
  async list(req, res) {
    try {
      const data = await fileUploadService.listFiles(req.params.folderAlias);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // GET /api/upload/info?url=/uploads/contracts/xxx.pdf -> metadata file
  async getInfo(req, res) {
    try {
      const data = await fileUploadService.getFileInfo(req.query.url);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return res.status(404).json({ success: false, message: error.message });
    }
  }

  // GET /api/upload/download?url=/uploads/contracts/xxx.pdf -> stream file
  async download(req, res) {
    try {
      const fullPath = fileUploadService.getSafeFilePathForServing(
        req.query.url
      );
      return res.sendFile(fullPath, (err) => {
        if (err && !res.headersSent) {
          res
            .status(404)
            .json({ success: false, message: "File tidak ditemukan" });
        }
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // DELETE /api/upload  (body: { url })
  async delete(req, res) {
    try {
      const { url } = req.body;
      const deleted = await fileUploadService.deleteFile(url);
      return res.status(200).json({
        success: true,
        deleted,
        message: deleted ? "File berhasil dihapus" : "File tidak ditemukan",
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new FileUploadController();
