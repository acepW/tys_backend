const fileUploadService = require("../services/fileUpload.service");

function uploadSingle(req, res, next) {
  try {
    const middleware = fileUploadService.singleUploadMiddleware(
      req.params.folderAlias,
      "file"
    );
    middleware(req, res, (err) => {
      if (err)
        return res.status(400).json({ success: false, message: err.message });
      next();
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

function uploadMultiple(req, res, next) {
  try {
    const middleware = fileUploadService.multipleUploadMiddleware(
      req.params.folderAlias,
      "files",
      5
    );
    middleware(req, res, (err) => {
      if (err)
        return res.status(400).json({ success: false, message: err.message });
      next();
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
}

module.exports = { uploadSingle, uploadMultiple };
