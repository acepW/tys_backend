const { Op } = require("sequelize");
const { models, db1, db2 } = require("../../models");
const incomingDebitNoteService = require("../debitNote/incomingDebitNote.service");

class IncomingInvoiceService {
  _sourceConfig(sourceType, dbModels) {
    if (sourceType === "contract") {
      return {
        Payment: dbModels.ContractPayment,
        PaymentList: dbModels.ContractPaymentList,
        paymentForeignKey: "id_contract_payment",
        listForeignKey: "id_contract_payment_list",
      };
    }

    if (sourceType === "pre_order") {
      return {
        Payment: dbModels.PreOrderPayment,
        PaymentList: dbModels.PreOrderPaymentList,
        paymentForeignKey: "id_pre_order_payment",
        listForeignKey: "id_pre_order_payment_list",
      };
    }

    throw new Error("source_type must be 'contract' or 'pre_order'");
  }

  async createFromPayment(
    sourceType,
    idPayment,
    idUserCreate = null,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      const config1 = this._sourceConfig(sourceType, models.db1);
      const payment = await config1.Payment.findByPk(idPayment, {
        transaction: transaction1,
      });

      if (!payment) {
        const error = new Error(
          sourceType === "contract"
            ? "Contract payment not found"
            : "PreOrder payment not found",
        );
        error.statusCode = 404;
        throw error;
      }

      const paymentLists = await config1.PaymentList.findAll({
        where: {
          [config1.paymentForeignKey]: idPayment,
          payment_purpose: "invoice",
          is_active: true,
        },
        transaction: transaction1,
      });

      const created = [];
      for (const paymentList of paymentLists) {
        const sourceWhere = {
          source_type: sourceType,
          [config1.listForeignKey]: paymentList.id,
        };
        let incoming = await models.db1.IncomingInvoice.findOne({
          where: sourceWhere,
          transaction: transaction1,
        });

        if (!incoming) {
          const data = {
            source_type: sourceType,
            [config1.paymentForeignKey]: idPayment,
            [config1.listForeignKey]: paymentList.id,
            status: "incoming",
            id_user_create: idUserCreate,
            is_active: true,
          };
          incoming = await models.db1.IncomingInvoice.create(data, {
            transaction: transaction1,
          });

          if (isDoubleDatabase) {
            await models.db2.IncomingInvoice.create(
              { ...data, id: incoming.id },
              { transaction: transaction2 },
            );
          }
        } else if (isDoubleDatabase) {
          const secondary = await models.db2.IncomingInvoice.findByPk(
            incoming.id,
            { transaction: transaction2 },
          );
          if (!secondary) {
            await models.db2.IncomingInvoice.create(incoming.toJSON(), {
              transaction: transaction2,
            });
          }
        }

        created.push(incoming.toJSON());
      }

      await transaction1.commit();
      if (transaction2) await transaction2.commit();

      return created;
    } catch (error) {
      if (transaction1 && !transaction1.finished) {
        await transaction1.rollback();
      }
      if (transaction2 && !transaction2.finished) {
        await transaction2.rollback();
      }
      throw error;
    }
  }

  _contractIncludes(dbModels, search, status) {
    const contractWhere = search
      ? { contract_no: { [Op.like]: `%${search}%` } }
      : undefined;

    return [
      {
        model: dbModels.ContractPayment,
        as: "contract_payment",
        required: true,
        where: status === "incoming" ? { is_open: true, is_active: true } : {},
        include: [
          {
            model: dbModels.Contract,
            as: "contract",
            required: true,
            where: contractWhere,
            include: [
              { model: dbModels.Company, as: "company" },
              { model: dbModels.Customer, as: "customer" },
            ],
          },
        ],
      },
      {
        model: dbModels.ContractPaymentList,
        as: "contract_payment_list",
        required: true,
        where: { payment_purpose: "invoice", is_active: true },
        include: [
          {
            model: dbModels.ContractPaymentService,
            as: "contract_payment_services",
            include: [
              {
                model: dbModels.QuotationService,
                as: "quotation_service",
              },
            ],
          },
        ],
      },
      { model: dbModels.Invoice, as: "invoice", required: false },
    ];
  }

  _preOrderIncludes(dbModels, search, status) {
    const preOrderWhere = search
      ? { pre_order_no: { [Op.like]: `%${search}%` } }
      : undefined;

    return [
      {
        model: dbModels.PreOrderPayment,
        as: "pre_order_payment",
        required: true,
        where: status === "incoming" ? { is_open: true, is_active: true } : {},
        include: [
          {
            model: dbModels.PreOrder,
            as: "pre_order",
            required: true,
            where: preOrderWhere,
            include: [
              { model: dbModels.Company, as: "company" },
              { model: dbModels.Customer, as: "customer" },
            ],
          },
        ],
      },
      {
        model: dbModels.PreOrderPaymentList,
        as: "pre_order_payment_list",
        required: true,
        where: { payment_purpose: "invoice", is_active: true },
        include: [
          {
            model: dbModels.PreOrderPaymentService,
            as: "pre_order_payment_services",
            include: [
              {
                model: dbModels.PreOrderService,
                as: "pre_order_service",
              },
            ],
          },
        ],
      },
      { model: dbModels.Invoice, as: "invoice", required: false },
    ];
  }

  _normalizeContract(row) {
    const payment = row.contract_payment;
    const document = payment.contract;
    const list = row.contract_payment_list;

    return {
      incoming_invoice_id: row.id,
      source_type: "contract",
      source_document: {
        id: document.id,
        document_no: document.contract_no,
        document_title_indo: document.contract_title_indo,
        document_title_mandarin: document.contract_title_mandarin,
      },
      company: document.company,
      customer: document.customer,
      payment: {
        id: payment.id,
        payment_time_indo: payment.payment_time_indo,
        payment_time_mandarin: payment.payment_time_mandarin,
        payment_to: payment.payment_to,
        currency_type: payment.currency_type,
        total_payment_idr: payment.total_payment_idr,
        total_payment_rmb: payment.total_payment_rmb,
        is_open: payment.is_open,
      },
      payment_list: {
        ...list,
        status: row.status,
        invoice: row.invoice,
        services: (list.contract_payment_services || []).map((service) => ({
          payment_service_id: service.id,
          source_service_id: service.id_quotation_service,
          id_quotation_service: service.id_quotation_service,
          ...(service.quotation_service || {}),
        })),
      },
    };
  }

  _normalizePreOrder(row) {
    const payment = row.pre_order_payment;
    const document = payment.pre_order;
    const list = row.pre_order_payment_list;

    return {
      incoming_invoice_id: row.id,
      source_type: "pre_order",
      source_document: {
        id: document.id,
        document_no: document.pre_order_no,
        document_title_indo: document.pre_order_title_indo,
        document_title_mandarin: document.pre_order_title_mandarin,
      },
      company: document.company,
      customer: document.customer,
      payment: {
        id: payment.id,
        payment_time_indo: payment.payment_time_indo,
        payment_time_mandarin: payment.payment_time_mandarin,
        payment_to: payment.payment_to,
        currency_type: payment.currency_type,
        total_payment_idr: payment.total_payment_idr,
        total_payment_rmb: payment.total_payment_rmb,
        is_open: payment.is_open,
      },
      payment_list: {
        ...list,
        status: row.status,
        invoice: row.invoice,
        services: (list.pre_order_payment_services || []).map((service) => ({
          payment_service_id: service.id,
          source_service_id: service.id_pre_order_service,
          id_quotation_service:
            service.pre_order_service?.id_quotation_service || null,
          ...(service.pre_order_service || {}),
        })),
      },
    };
  }

  async getAll({
    status = "incoming",
    sourceType = "all",
    search = null,
    page = 1,
    limit = 10,
  } = {}) {
    if (!["incoming", "history"].includes(status)) {
      throw new Error("status must be 'incoming' or 'history'");
    }
    if (!["all", "contract", "pre_order"].includes(sourceType)) {
      throw new Error("source_type must be 'all', 'contract', or 'pre_order'");
    }

    const dbModels = models.db1;
    const baseWhere = { status, is_active: true };
    const rows = [];

    if (sourceType === "all" || sourceType === "contract") {
      const contractRows = await dbModels.IncomingInvoice.findAll({
        where: { ...baseWhere, source_type: "contract" },
        include: this._contractIncludes(dbModels, search, status),
        order: [["createdAt", "DESC"]],
      });
      rows.push(...contractRows.map((row) => this._normalizeContract(row.toJSON())));
    }

    if (sourceType === "all" || sourceType === "pre_order") {
      const preOrderRows = await dbModels.IncomingInvoice.findAll({
        where: { ...baseWhere, source_type: "pre_order" },
        include: this._preOrderIncludes(dbModels, search, status),
        order: [["createdAt", "DESC"]],
      });
      rows.push(...preOrderRows.map((row) => this._normalizePreOrder(row.toJSON())));
    }

    const grouped = new Map();
    for (const row of rows) {
      const key = `${row.source_type}:${row.payment.id}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          source_type: row.source_type,
          source_document: row.source_document,
          company: row.company,
          customer: row.customer,
          payment: {
            ...row.payment,
            status,
            invoice_total_idr: "0",
            invoice_total_rmb: "0",
          },
          payment_lists: [],
        });
      }

      const group = grouped.get(key);
      group.payment_lists.push({
        incoming_invoice_id: row.incoming_invoice_id,
        ...row.payment_list,
      });
      group.payment.invoice_total_idr = String(
        Number(group.payment.invoice_total_idr) +
          Number(row.payment_list.price_idr || 0),
      );
      group.payment.invoice_total_rmb = String(
        Number(group.payment.invoice_total_rmb) +
          Number(row.payment_list.price_rmb || 0),
      );
    }

    const relatedDebitNotes = await incomingDebitNoteService.getGrouped({
      status,
      sourceType,
      search,
    });
    for (const debitNote of relatedDebitNotes) {
      const key = `${debitNote.source_type}:${debitNote.payment.id}`;
      if (grouped.has(key)) {
        grouped.get(key).incoming_debit_notes = debitNote.payment_lists;
        continue;
      }

      grouped.set(key, {
        source_type: debitNote.source_type,
        source_document: debitNote.source_document,
        company: debitNote.company,
        customer: debitNote.customer,
        payment: {
          ...debitNote.payment,
          invoice_total_idr: "0",
          invoice_total_rmb: "0",
        },
        payment_lists: [],
        incoming_debit_notes: debitNote.payment_lists,
      });
    }

    const data = Array.from(grouped.values()).map((item) => ({
      ...item,
      incoming_debit_notes: item.incoming_debit_notes || [],
    }));
    const currentPage = Math.max(Number.parseInt(page, 10) || 1, 1);
    const perPage = Math.max(Number.parseInt(limit, 10) || 10, 1);
    const offset = (currentPage - 1) * perPage;

    return {
      data: data.slice(offset, offset + perPage),
      pagination: {
        total_data: data.length,
        total_page: Math.ceil(data.length / perPage),
        current_page: currentPage,
        per_page: perPage,
      },
    };
  }

  async markAsHistory(
    ids,
    idInvoice,
    isDoubleDatabase = true,
    transaction1 = null,
    transaction2 = null,
  ) {
    const where = { id: ids, status: "incoming", is_active: true };
    const data = {
      status: "history",
      id_invoice: idInvoice,
      consumed_at: new Date(),
    };

    const [updated1] = await models.db1.IncomingInvoice.update(data, {
      where,
      transaction: transaction1,
      validate: false,
    });
    if (updated1 !== ids.length) {
      throw new Error("One or more incoming invoice items are no longer available");
    }

    if (isDoubleDatabase) {
      const [updated2] = await models.db2.IncomingInvoice.update(data, {
        where,
        transaction: transaction2,
        validate: false,
      });
      if (updated2 !== ids.length) {
        throw new Error("Incoming invoice data is inconsistent between databases");
      }
    }

    return updated1;
  }
}

module.exports = new IncomingInvoiceService();
