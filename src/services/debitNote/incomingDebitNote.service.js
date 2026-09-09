const { Op } = require("sequelize");
const { models, db1, db2 } = require("../../models");

class IncomingDebitNoteService {
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

      const config = this._sourceConfig(sourceType, models.db1);
      const payment = await config.Payment.findByPk(idPayment, {
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

      const paymentLists = await config.PaymentList.findAll({
        where: {
          [config.paymentForeignKey]: idPayment,
          payment_purpose: "debit note",
          is_active: true,
        },
        transaction: transaction1,
      });

      const created = [];
      for (const paymentList of paymentLists) {
        const sourceWhere = {
          source_type: sourceType,
          [config.listForeignKey]: paymentList.id,
        };
        let incoming = await models.db1.IncomingDebitNote.findOne({
          where: sourceWhere,
          transaction: transaction1,
        });

        if (!incoming) {
          const data = {
            source_type: sourceType,
            [config.paymentForeignKey]: idPayment,
            [config.listForeignKey]: paymentList.id,
            status: "incoming",
            id_user_create: idUserCreate,
            is_active: true,
          };
          incoming = await models.db1.IncomingDebitNote.create(data, {
            transaction: transaction1,
          });

          if (isDoubleDatabase) {
            await models.db2.IncomingDebitNote.create(
              { ...data, id: incoming.id },
              { transaction: transaction2 },
            );
          }
        } else if (isDoubleDatabase) {
          const secondary = await models.db2.IncomingDebitNote.findByPk(
            incoming.id,
            { transaction: transaction2 },
          );
          if (!secondary) {
            await models.db2.IncomingDebitNote.create(incoming.toJSON(), {
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
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }

  _contractIncludes(dbModels, search, status) {
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
            where: search
              ? { contract_no: { [Op.like]: `%${search}%` } }
              : undefined,
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
        where: { payment_purpose: "debit note", is_active: true },
        include: [
          {
            model: dbModels.ContractPaymentService,
            as: "contract_payment_services",
            include: [
              { model: dbModels.QuotationService, as: "quotation_service" },
            ],
          },
        ],
      },
      { model: dbModels.DebitNote, as: "debit_note", required: false },
    ];
  }

  _preOrderIncludes(dbModels, search, status) {
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
            where: search
              ? { pre_order_no: { [Op.like]: `%${search}%` } }
              : undefined,
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
        where: { payment_purpose: "debit note", is_active: true },
        include: [
          {
            model: dbModels.PreOrderPaymentService,
            as: "pre_order_payment_services",
            include: [
              { model: dbModels.PreOrderService, as: "pre_order_service" },
            ],
          },
        ],
      },
      { model: dbModels.DebitNote, as: "debit_note", required: false },
    ];
  }

  _normalize(row, sourceType) {
    const isContract = sourceType === "contract";
    const payment = isContract ? row.contract_payment : row.pre_order_payment;
    const document = isContract ? payment.contract : payment.pre_order;
    const list = isContract
      ? row.contract_payment_list
      : row.pre_order_payment_list;
    const links = isContract
      ? list.contract_payment_services
      : list.pre_order_payment_services;

    return {
      incoming_debit_note_id: row.id,
      source_type: sourceType,
      source_document: {
        id: document.id,
        document_no: isContract ? document.contract_no : document.pre_order_no,
        document_title_indo: isContract
          ? document.contract_title_indo
          : document.pre_order_title_indo,
        document_title_mandarin: isContract
          ? document.contract_title_mandarin
          : document.pre_order_title_mandarin,
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
        debit_note: row.debit_note,
        services: (links || []).map((link) => ({
          payment_service_id: link.id,
          source_service_id: isContract
            ? link.id_quotation_service
            : link.id_pre_order_service,
          id_quotation_service: isContract
            ? link.id_quotation_service
            : link.pre_order_service?.id_quotation_service || null,
          ...(isContract ? link.quotation_service : link.pre_order_service || {}),
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
      const found = await dbModels.IncomingDebitNote.findAll({
        where: { ...baseWhere, source_type: "contract" },
        include: this._contractIncludes(dbModels, search, status),
        order: [["createdAt", "DESC"]],
      });
      rows.push(...found.map((row) => this._normalize(row.toJSON(), "contract")));
    }
    if (sourceType === "all" || sourceType === "pre_order") {
      const found = await dbModels.IncomingDebitNote.findAll({
        where: { ...baseWhere, source_type: "pre_order" },
        include: this._preOrderIncludes(dbModels, search, status),
        order: [["createdAt", "DESC"]],
      });
      rows.push(...found.map((row) => this._normalize(row.toJSON(), "pre_order")));
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
            debit_note_total_idr: "0",
            debit_note_total_rmb: "0",
          },
          payment_lists: [],
        });
      }
      const group = grouped.get(key);
      group.payment_lists.push({
        incoming_debit_note_id: row.incoming_debit_note_id,
        ...row.payment_list,
      });
      group.payment.debit_note_total_idr = String(
        Number(group.payment.debit_note_total_idr) +
          Number(row.payment_list.price_idr || 0),
      );
      group.payment.debit_note_total_rmb = String(
        Number(group.payment.debit_note_total_rmb) +
          Number(row.payment_list.price_rmb || 0),
      );
    }

    const data = Array.from(grouped.values());
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
    idDebitNote,
    isDoubleDatabase = true,
    transaction1 = null,
    transaction2 = null,
  ) {
    const where = { id: ids, status: "incoming", is_active: true };
    const data = {
      status: "history",
      id_debit_note: idDebitNote,
      consumed_at: new Date(),
    };
    const [updated1] = await models.db1.IncomingDebitNote.update(data, {
      where,
      transaction: transaction1,
      validate: false,
    });
    if (updated1 !== ids.length) {
      throw new Error("One or more incoming debit note items are no longer available");
    }
    if (isDoubleDatabase) {
      const [updated2] = await models.db2.IncomingDebitNote.update(data, {
        where,
        transaction: transaction2,
        validate: false,
      });
      if (updated2 !== ids.length) {
        throw new Error("Incoming debit note data is inconsistent between databases");
      }
    }
    return updated1;
  }
}

module.exports = new IncomingDebitNoteService();
