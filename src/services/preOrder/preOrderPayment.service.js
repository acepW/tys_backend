const DualDatabaseService = require("../dualDatabase.service");
const incomingInvoiceService = require("../invoice/incomingInvoice.service");
const incomingDebitNoteService = require("../debitNote/incomingDebitNote.service");

class PreOrderPaymentService extends DualDatabaseService {
  constructor() {
    super("PreOrderPayment");
  }

  /**
   * Open a pre order payment.
   * @param {Number} idPayment - Pre order payment ID
   * @param {Boolean} isDoubleDatabase - Update both databases if true
   * @returns {Object} Updated pre order payment
   */
  async openPayment(
    idPayment,
    isDoubleDatabase = true,
    idUserCreate = null,
  ) {
    const existing = await this.Model1.findByPk(idPayment);

    if (!existing) {
      const error = new Error("PreOrder payment not found");
      error.statusCode = 404;
      throw error;
    }

    await incomingInvoiceService.createFromPayment(
      "pre_order",
      idPayment,
      idUserCreate,
      isDoubleDatabase,
    );

    await incomingDebitNoteService.createFromPayment(
      "pre_order",
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

module.exports = new PreOrderPaymentService();
