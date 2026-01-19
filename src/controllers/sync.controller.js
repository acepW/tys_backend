const {
  checkAllDatabasesSync,
  checkDatabaseSync,
  syncRecordToDb2,
  syncAllRecordsToDb2,
} = require("../utils/databaseSync");
const { successResponse, errorResponse } = require("../utils/response");

class SyncController {
  /**
   * Check sync status for all models
   */
  async checkAllSync(req, res) {
    try {
      const results = await checkAllDatabasesSync();

      const allInSync = results.every((r) => r.isSync);

      return successResponse(
        res,
        {
          allInSync,
          details: results,
        },
        allInSync
          ? "All databases are in sync"
          : "Some databases are out of sync",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Check sync status for specific model
   */
  async checkModelSync(req, res) {
    try {
      const { modelName } = req.params;

      const validModels = [
        "Category",
        "SubCategory",
        "Company",
        "Product",
        "Customer",
      ];
      if (!validModels.includes(modelName)) {
        return errorResponse(res, "Invalid model name", 400);
      }

      const result = await checkDatabaseSync(modelName);

      return successResponse(
        res,
        result,
        result.isSync
          ? `${modelName} is in sync`
          : `${modelName} is out of sync`,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync specific record to DB2
   */
  async syncRecord(req, res) {
    try {
      const { modelName, id } = req.params;

      const validModels = [
        "Category",
        "SubCategory",
        "Company",
        "Product",
        "Customer",
      ];
      if (!validModels.includes(modelName)) {
        return errorResponse(res, "Invalid model name", 400);
      }

      await syncRecordToDb2(modelName, id);

      return successResponse(
        res,
        null,
        `${modelName} ID ${id} synced to DB2 successfully`,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync all records of a model to DB2
   */
  async syncAllRecords(req, res) {
    try {
      const { modelName } = req.params;

      const validModels = [
        "Category",
        "SubCategory",
        "Company",
        "Product",
        "Customer",
      ];
      if (!validModels.includes(modelName)) {
        return errorResponse(res, "Invalid model name", 400);
      }

      const result = await syncAllRecordsToDb2(modelName);

      return successResponse(
        res,
        result,
        `Synced ${result.synced} records, ${result.failed} failed`,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new SyncController();
