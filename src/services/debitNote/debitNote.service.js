const DualDatabaseService = require("../dualDatabase.service");
const companyService = require("../company.service");
const { syncChildRecords } = require("../../utils/transactionHelper");
const { models, db1, db2 } = require("../../models");
const { Op, fn, col } = require("sequelize");

class DebitNoteService extends DualDatabaseService {
  constructor() {
    super("DebitNote");
  }

  /**
   * Get all debit notes with relations
   * @param {Object} options - Query options
   * @param {Number} page - Page number for pagination
   * @param {Number} limit - Number of records per page
   * @param {Boolean} isDoubleDatabase
   * @returns {Array} Debit notes with relations
   */
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
          attributes: [
            "id",
            "quotation_no",
            "quotation_title_indo",
            "quotation_title_mandarin",
          ],
        },
        {
          model: dbModels.Contract,
          as: "contract",
          attributes: [
            "id",
            "contract_no",
            "contract_title_indo",
            "contract_title_mandarin",
          ],
        },
        {
          model: dbModels.Invoice,
          as: "invoice",
          attributes: ["id", "invoice_no", "date", "total"],
        },
        {
          model: dbModels.Company,
          as: "company",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.Customer,
          as: "customer",
          attributes: ["id", "company_name"],
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_paid",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.DebitNoteItem,
          as: "debit_note_items",
          separate: true,
        },
      ],
      order: [["createdAt", "DESC"]],
    };

    if (!page || !limit) {
      return await this.findAll(queryOptions, isDoubleDatabase);
    }

    const offset = (page - 1) * limit;
    const { count, rows } = await this.findAndCountAll(
      { ...queryOptions, limit, offset },
      isDoubleDatabase
    );

    return {
      data: rows,
      pagination: {
        total_data: count,
        total_page: Math.ceil(count / limit),
        current_page: page,
        per_page: limit,
      },
    };
  }

  /**
   * Get debit note by ID with relations
   * @param {Number} id
   * @param {Object} options - Query options
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Debit note with relations
   */
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        {
          model: dbModels.Quotation,
          as: "quotation",
        },
        {
          model: dbModels.Contract,
          as: "contract",
        },
        {
          model: dbModels.Invoice,
          as: "invoice",
        },
        {
          model: dbModels.Company,
          as: "company",
        },
        {
          model: dbModels.Customer,
          as: "customer",
        },
        {
          model: dbModels.User,
          as: "user_create",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_approve",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_reject",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.User,
          as: "user_paid",
          attributes: ["id", "name", "email"],
        },
        {
          model: dbModels.DebitNoteItem,
          as: "debit_note_items",
          separate: true,
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  /**
   * Get no Debit Note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Debit Note with relations
   */
  async getNoDebitNote(isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    // 🔥 1. Ambil total per company
    const dataTotal = await dbModels.DebitNote.findAll({
      attributes: ["id_company", [fn("COUNT", col("id")), "total"]],
      where: {
        is_active: true,
        createdAt: {
          [Op.gte]: new Date(`${year}-01-01`),
          [Op.lt]: new Date(`${year + 1}-01-01`),
        },
      },
      group: ["id_company"],
      raw: true,
    });

    // 🔥 2. Ambil data company
    const dataCompany = await companyService.findAll(
      {
        attributes: ["id", "company_name", "initial_company"],
      },
      isDoubleDatabase
    );

    // 🔥 function bulan romawi
    function getRomanMonth(month) {
      const romans = [
        "I",
        "II",
        "III",
        "IV",
        "V",
        "VI",
        "VII",
        "VIII",
        "IX",
        "X",
        "XI",
        "XII",
      ];
      return romans[month - 1];
    }

    const bulanRomawi = getRomanMonth(month);

    // 🔥 3. Merge + format nomor
    const result = dataCompany.map((company) => {
      const found = dataTotal.find((d) => d.id_company === company.id);

      const total = found ? parseInt(found.total) : 0;
      const nomorUrut = String(total + 1).padStart(3, "0");

      const initial = company.initial_company
        ? company.initial_company.toUpperCase()
        : "-";

      const noQuotation = `${nomorUrut}/DN/${initial}/${bulanRomawi}/${year}`;

      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        total,
        next_number: nomorUrut,
        no_debit_note: noQuotation,
      };
    });

    return result;
  }

  /**
   * Create debit note with debit note items
   * @param {Object} debitNoteData - Debit note data
   * @param {Array} debitNoteItems - Debit note items data
   * @param {Number} id_user_create - User ID who creates the debit note
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Created debit note with all relations
   */
  async createWithRelations(
    debitNoteData,
    debitNoteItems = [],
    id_user_create,
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Creating DebitNote with items in both databases...`);

        // 1. Create DebitNote in DB1
        const debitNote1 = await this.Model1.create(debitNoteData, {
          transaction: transaction1,
        });
        console.log(`✅ Created DebitNote in DB1 with ID: ${debitNote1.id}`);

        // 2. Create DebitNote in DB2 with same ID
        const debitNoteDataWithId = { ...debitNoteData, id: debitNote1.id };
        await this.Model2.create(debitNoteDataWithId, {
          transaction: transaction2,
        });
        console.log(`✅ Created DebitNote in DB2 with ID: ${debitNote1.id}`);

        // 3. Sync DebitNote Items
        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: debitNote1.id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: models.db2.DebitNoteItem,
          foreignKey: "id_debit_note",
          parentId: debitNote1.id,
          newData: itemsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(
          `✅ Synced ${itemsResult.created?.length || 0} DebitNote Items`
        );

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ DebitNote with all relations successfully created`);

        return {
          debit_note: debitNote1.toJSON(),
          debit_note_items: itemsResult,
        };
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const debitNote = await this.Model1.create(debitNoteData, {
          transaction: transaction1,
        });
        console.log(`✅ Created DebitNote in DB1 with ID: ${debitNote.id}`);

        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: debitNote.id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: null,
          foreignKey: "id_debit_note",
          parentId: debitNote.id,
          newData: itemsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        console.log(
          `✅ Synced ${itemsResult.created?.length || 0} DebitNote Items`
        );

        await transaction1.commit();
        console.log(`✅ DebitNote created in DB1 only`);

        return {
          debit_note: debitNote.toJSON(),
          debit_note_items: itemsResult,
        };
      }
    } catch (error) {
      console.error(`❌ Error creating DebitNote:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to create DebitNote: ${error.message}`);
    }
  }

  /**
   * Update debit note with debit note items (create/update/delete)
   * @param {Number} id - Debit note ID
   * @param {Object} debitNoteData - Debit note data to update
   * @param {Array} debitNoteItems - Debit note items data
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note with all relations
   */
  async updateWithRelations(
    id,
    debitNoteData,
    debitNoteItems = [],
    isDoubleDatabase = true
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Updating DebitNote ID ${id} with items...`);

        // 1. Update DebitNote in both databases
        const [updatedRows1] = await this.Model1.update(debitNoteData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(debitNoteData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        console.log(`✅ Updated DebitNote in both databases`);

        // 2. Sync DebitNote Items (syncChildRecords handles create/update/delete)
        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: models.db2.DebitNoteItem,
          foreignKey: "id_debit_note",
          parentId: id,
          newData: itemsData,
          transaction1,
          transaction2,
          isDoubleDatabase,
        });

        console.log(`✅ Synced DebitNote Items`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ DebitNote with all relations successfully updated`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const [updatedRows] = await this.Model1.update(debitNoteData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        const itemsData = debitNoteItems.map((item) => ({
          ...item,
          id_debit_note: id,
        }));

        const itemsResult = await syncChildRecords({
          Model1: models.db1.DebitNoteItem,
          Model2: null,
          foreignKey: "id_debit_note",
          parentId: id,
          newData: itemsData,
          transaction1,
          transaction2: null,
          isDoubleDatabase: false,
        });

        await transaction1.commit();
        console.log(`✅ DebitNote updated in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error updating DebitNote:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to update DebitNote: ${error.message}`);
    }
  }

  /**
   * Submit debit note - change status to "on verification"
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for submission
   * @param {Number} id_user - User ID who submits
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async submitDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "on verification",
      note || "Debit note submitted",
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Approve debit note
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for approval
   * @param {Number} id_user - User ID who approves
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async approveDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "approved",
      note || "Debit note approved",
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Reject debit note
   * @param {Number} id - Debit note ID
   * @param {String} note - Note for rejection
   * @param {Number} id_user - User ID who rejects
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async rejectDebitNote(id, note, id_user, isDoubleDatabase = true) {
    return await this._changeStatus(
      id,
      "rejected",
      note || "Debit note rejected",
      id_user,
      isDoubleDatabase
    );
  }

  /**
   * Pay debit note - change status to "paid off" and add progress
   * @param {Number} id - Debit note ID
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async payDebitNote(
    id,
    note,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment,
    id_user,
    isDoubleDatabase = true
  ) {
    return await this._changeStatus(
      id,
      "paid",
      note || "Debit note paid",
      id_user,
      isDoubleDatabase,
      payment_date,
      payment_amount,
      payment_method,
      proof_of_payment
    );
  }

  /**
   * Internal method to change debit note status
   * @param {Number} id - Debit note ID
   * @param {String} status - New status
   * @param {String} note - Note for the status change
   * @param {Number} id_user - User ID performing the action
   * @param {Boolean} isDoubleDatabase
   * @returns {Object} Updated debit note
   */
  async _changeStatus(
    id,
    status,
    note,
    id_user,
    isDoubleDatabase = true,
    payment_date,
    payment_amount,
    payment_method,
    proof_of_payment
  ) {
    let transaction1 = null;
    let transaction2 = null;

    try {
      if (isDoubleDatabase) {
        transaction1 = await db1.transaction();
        transaction2 = await db2.transaction();

        console.log(`🔄 Changing DebitNote ID ${id} status to "${status}"...`);

        // Prepare update data
        const updateData = { status };
        if (note) updateData.note = note;
        if (status === "approved") updateData.id_user_approve = id_user;
        if (status === "rejected") updateData.id_user_reject = id_user;

        if (status == "paid") {
          updateData.payment_date = payment_date;
          updateData.payment_amount = payment_amount;
          updateData.payment_method = payment_method;
          updateData.proof_of_payment = proof_of_payment;
          updateData.id_user_paid = id_user;
        }

        // Update DebitNote status in both databases
        const [updatedRows1] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        const [updatedRows2] = await this.Model2.update(updateData, {
          where: { id },
          transaction: transaction2,
        });

        if (updatedRows1 === 0 && updatedRows2 === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        const getDataDebitNote = await this.getById(id, {}, isDoubleDatabase);
        if (!getDataDebitNote) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        if (getDataDebitNote.id_payment_request) {
          // Handle payment request
          await models.db1.PaymentRequest.update(
            {
              payment_method: payment_method,
              total_payment: payment_amount,
              file_proof_payment: proof_of_payment,
              status: "paid",
            },
            {
              where: { id: getDataDebitNote.id_payment_request },
              transaction: transaction1,
            }
          );

          await models.db2.PaymentRequest.update(
            {
              payment_method: payment_method,
              total_payment: payment_amount,
              file_proof_payment: proof_of_payment,
              status: "paid",
            },
            {
              where: { id: getDataDebitNote.id_payment_request },
              transaction: transaction2,
            }
          );

          console.log(`✅ Update PaymentRequest with status "paid"`);
        }

        console.log(`✅ Updated DebitNote status in both databases`);

        await transaction1.commit();
        await transaction2.commit();
        console.log(`✅ DebitNote status successfully changed to "${status}"`);

        return await this.getById(id, {}, isDoubleDatabase);
      } else {
        // Single database (DB1 only)
        transaction1 = await db1.transaction();

        const updateData = { status };
        if (note) updateData.note = note;
        if (status === "approved") updateData.id_user_approve = id_user;
        if (status === "rejected") updateData.id_user_reject = id_user;

        const [updatedRows] = await this.Model1.update(updateData, {
          where: { id },
          transaction: transaction1,
        });

        if (updatedRows === 0) {
          throw new Error(`DebitNote with ID ${id} not found`);
        }

        await transaction1.commit();
        console.log(`✅ DebitNote status changed to "${status}" in DB1 only`);

        return await this.getById(id, {}, isDoubleDatabase);
      }
    } catch (error) {
      console.error(`❌ Error changing DebitNote status:`, error.message);
      if (transaction1) await transaction1.rollback();
      if (transaction2) await transaction2.rollback();
      throw new Error(`Failed to change DebitNote status: ${error.message}`);
    }
  }
}

module.exports = new DebitNoteService();
