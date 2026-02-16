const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class QuotationServiceService extends DualDatabaseService {
  constructor() {
    super("QuotationService");
  }
}

module.exports = new QuotationServiceService();
