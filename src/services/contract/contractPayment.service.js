const DualDatabaseService = require("../dualDatabase.service");
const incomingInvoiceService = require("../invoice/incomingInvoice.service");
const incomingDebitNoteService = require("../debitNote/incomingDebitNote.service");

class ContractPaymentService extends DualDatabaseService {
  constructor() {
    super("ContractPayment");
  }

  /**
   * Open a contract payment.
   * @param {Number} idPayment - Contract payment ID
   * @param {Boolean} isDoubleDatabase - Update both databases if true
   * @returns {Object} Updated contract payment
   */
  async openPayment(
    idPayment,
    isDoubleDatabase = true,
    idUserCreate = null,
  ) {
    const existing = await this.Model1.findByPk(idPayment);

    if (!existing) {
      const error = new Error("Payment not found");
      error.statusCode = 404;
      throw error;
    }

    await incomingInvoiceService.createFromPayment(
      "contract",
      idPayment,
      idUserCreate,
      isDoubleDatabase,
    );

    await incomingDebitNoteService.createFromPayment(
      "contract",
      idPayment,
      idUserCreate,
      isDoubleDatabase,
    );

    const result = await this.update(
      idPayment,
      { is_open: true },
      isDoubleDatabase,
    );
    return result;
  }
}

module.exports = new ContractPaymentService();
