const DualDatabaseService = require("../dualDatabase.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");

class ContractPaymentService extends DualDatabaseService {
  constructor() {
    super("ContractPayment");
  }
}

module.exports = new ContractPaymentService();
