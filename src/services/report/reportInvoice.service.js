const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");

class ReportInvoice extends DualDatabaseService {
  constructor() {
    super("Customer");
  }

  /**
   * Get Report Invoice
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Report Invoices
   */
  async getReportInvoice(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;
    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Invoice,
          as: "invoices",
          attributes: ["id", "total", "date", "invoice_no", "payment_amount"],
          include: [
            {
              model: dbModels.DebitNote,
              as: "debit_notes",
              separate: true,
              attributes: ["id", "debit_note_no", "total"],
            },
          ],
        },
      ],
    };

    const computeInvoiceFields = (invoice) => {
      const today = new Date();
      const invoiceDate = new Date(invoice.date);

      // Total invoice + semua debit notes
      const totalDebitNotes = (invoice.debit_notes || []).reduce(
        (sum, dn) => sum + parseFloat(dn.total || 0),
        0,
      );
      const total_invoice_debit_note =
        parseFloat(invoice.total || 0) + totalDebitNotes;

      // Outstanding = total_invoice_debit_note - payment_amount
      const outstanding =
        total_invoice_debit_note - parseFloat(invoice.payment_amount || 0);

      // Status piutang
      const status_piutang = outstanding <= 0 ? "Lunas" : "Belum Lunas";

      // Umur piutang dalam hari dari date ke hari ini
      const umur_piutang = Math.floor(
        (today.setHours(0, 0, 0, 0) - invoiceDate.setHours(0, 0, 0, 0)) /
          (1000 * 60 * 60 * 24),
      );

      return {
        ...invoice,
        total_invoice_debit_note,
        outstanding,
        status_piutang,
        umur_piutang,
      };
    };

    const computeCompanyFields = (company) => {
      const invoices = (company.invoices || []).map((inv) => {
        const raw = inv.toJSON ? inv.toJSON() : inv;
        return computeInvoiceFields(raw);
      });

      const total_bill = invoices.reduce(
        (sum, inv) => sum + inv.total_invoice_debit_note,
        0,
      );

      const outstanding = invoices.reduce(
        (sum, inv) => sum + inv.outstanding,
        0,
      );

      return {
        ...(company.toJSON ? company.toJSON() : company),
        invoices,
        total_bill,
        outstanding,
      };
    };

    if (!page || !limit) {
      const rows = await this.findAll(queryOptions, isDoubleDatabase);
      return rows.map(computeCompanyFields);
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase,
    );

    return {
      data: rows.map(computeCompanyFields),
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }
}

module.exports = new ReportInvoice();
