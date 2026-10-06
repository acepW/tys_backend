const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");
const fileService = require("../file.service");
const { getNextDeviceUserId } = require("../../utils/deviceUserId");
const { getNextEmployeeCode } = require("../../utils/employeeCode");
const { syncChildRecords } = require("../../utils/transactionHelper");

class EmployeeService extends DualDatabaseService {
  constructor() {
    super("Employee");
  }

  _relations(dbModels) {
    return [
      { model: dbModels.Company, as: "company", required: false },
      { model: dbModels.Division, as: "division", required: false },
      { model: dbModels.Department, as: "department", required: false },
      { model: dbModels.Position, as: "position", required: false },
      {
        model: dbModels.EmployeeEmergencyContact,
        as: "emergency_contacts",
        required: false,
      },
      { model: dbModels.EmployeeAllowance, as: "allowances", required: false },
      { model: dbModels.EmployeeFamilyMember, as: "family_data", required: false },
      { model: dbModels.EmployeeEducation, as: "education_history", required: false },
      {
        model: dbModels.File,
        as: "contract_documents",
        required: false,
        where: { is_active: true },
      },
      {
        model: dbModels.File,
        as: "employee_photos",
        required: false,
        where: { is_active: true },
      },
      ...[
        "files_ktp",
        "files_npwp",
        "files_bpjs_kesehatan",
        "files_bpjs_ketenagakerjaan",
        "files_sim",
        "files_stnk",
      ].map((as) => ({
        model: dbModels.File,
        as,
        required: false,
        where: { is_active: true },
      })),
    ];
  }

  async getAll(options = {}, page = 1, limit = 20, search = null) {
    const where = { ...(options.where || {}) };
    if (search) {
      const pattern = `%${search}%`;
      where[Op.or] = [
        { employee_code: { [Op.like]: pattern } },
        { device_user_id: { [Op.like]: pattern } },
        { full_name: { [Op.like]: pattern } },
        { email: { [Op.like]: pattern } },
        { office_email: { [Op.like]: pattern } },
      ];
    }

    const result = await models.db1.Employee.findAndCountAll({
      where,
      include: this._relations(models.db1),
      order: [["full_name", "ASC"]],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    });

    return {
      data: result.rows.map((row) => row.toJSON()),
      pagination: {
        total: result.count,
        page,
        limit,
        total_pages: Math.ceil(result.count / limit),
      },
    };
  }

  async getById(id) {
    const employee = await models.db1.Employee.findByPk(id, {
      include: this._relations(models.db1),
    });
    return employee ? employee.toJSON() : null;
  }

  async getNextDeviceUserId() {
    const employees = await models.db1.Employee.findAll({
      attributes: ["device_user_id"],
      raw: true,
    });

    return {
      next_device_user_id: getNextDeviceUserId(
        employees.map((employee) => employee.device_user_id),
      ),
    };
  }

  async getNextEmployeeCodes() {
    const [companies, employees] = await Promise.all([
      models.db1.Company.findAll({
        attributes: ["id", "company_name", "initial_company"],
        raw: true,
      }),
      models.db1.Employee.findAll({
        attributes: ["id_company", "employee_code"],
        raw: true,
      }),
    ]);
    const codesByCompany = new Map();
    for (const employee of employees) {
      const key = Number(employee.id_company);
      if (!codesByCompany.has(key)) codesByCompany.set(key, []);
      codesByCompany.get(key).push(employee.employee_code);
    }

    return companies.map((company) => {
      const initial = String(company.initial_company || "-").trim().toUpperCase();
      return {
        id_company: company.id,
        company_name: company.company_name,
        initial_company: initial,
        ...getNextEmployeeCode(initial, codesByCompany.get(Number(company.id)) || []),
      };
    });
  }

  async findDuplicate(employeeCode, deviceUserId, excludeId = null) {
    const where = {
      [Op.or]: [
        { employee_code: employeeCode },
        { device_user_id: deviceUserId },
      ],
    };
    if (excludeId) where.id = { [Op.ne]: excludeId };
    return models.db1.Employee.findOne({ where });
  }

  async _syncEmployeeList(
    employeeId,
    items,
    modelName,
    fields,
    transaction1,
    transaction2,
    isDoubleDatabase,
  ) {
    const model1 = models.db1[modelName];
    const model2 = models.db2[modelName];
    const existing = await model1.findAll({
      where: { id_employee: employeeId },
      transaction: transaction1,
    });
    const existingIds = new Set(existing.map((item) => Number(item.id)));
    const incomingIds = new Set();
    for (const item of items) {
      if (item.id === undefined || item.id === null) continue;
      const id = Number(item.id);
      if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        !existingIds.has(id) ||
        incomingIds.has(id)
      ) {
        const error = new Error(
          `${modelName} item id ${item.id} does not belong to employee ${employeeId} or is duplicated`,
        );
        error.statusCode = 400;
        throw error;
      }
      incomingIds.add(id);
    }

    const newData = items.map((item) => {
      const payload = {};
      for (const field of fields) {
        payload[field] = ["from", "to"].includes(field)
          ? Number(item[field])
          : String(item[field]).trim();
      }
      if (item.id !== undefined && item.id !== null) {
        payload.id = Number(item.id);
      }
      return payload;
    });

    await syncChildRecords({
      Model1: model1,
      Model2: model2,
      foreignKey: "id_employee",
      parentId: employeeId,
      newData,
      transaction1,
      transaction2,
      isDoubleDatabase,
    });
  }

  async _syncEmployeeLists(
    employeeId,
    relations,
    transaction1,
    transaction2,
    isDoubleDatabase,
  ) {
    const lists = {
      emergency_contacts: [
        "EmployeeEmergencyContact",
        ["name", "address", "contact_number"],
      ],
      allowances: ["EmployeeAllowance", ["allowance", "amount", "status"]],
      family_data: [
        "EmployeeFamilyMember",
        ["name", "relationship", "contact_number", "address"],
      ],
      education_history: [
        "EmployeeEducation",
        ["level", "institution", "major", "from", "to"],
      ],
    };
    for (const [field, [modelName, fields]] of Object.entries(lists)) {
      if (relations[field] === undefined) continue;
      await this._syncEmployeeList(
        employeeId,
        relations[field],
        modelName,
        fields,
        transaction1,
        transaction2,
        isDoubleDatabase,
      );
    }
  }

  async _syncFiles(
    employeeId,
    relations,
    uploadedBy,
    transaction1,
    transaction2,
    isDoubleDatabase,
  ) {
    const categories = [
      "contract_documents",
      "employee_photos",
      "files_ktp",
      "files_npwp",
      "files_bpjs_kesehatan",
      "files_bpjs_ketenagakerjaan",
      "files_sim",
      "files_stnk",
    ];
    for (const category of categories) {
      if (relations[category] === undefined) continue;
      await fileService.syncFiles(
        "employees",
        employeeId,
        relations[category],
        {
          category,
          uploadedBy,
          isDoubleDatabase,
          hardDelete: false,
        },
        transaction1,
        transaction2,
      );
    }
  }

  async createWithRelations(
    employeeData,
    relations,
    uploadedBy,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;
    try {
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      const employee = await models.db1.Employee.create(employeeData, {
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.Employee.create(
          { ...employeeData, id: employee.id },
          { transaction: transaction2 },
        );
      }

      await this._syncEmployeeLists(
        employee.id,
        relations,
        transaction1,
        transaction2,
        isDoubleDatabase,
      );
      await this._syncFiles(
        employee.id,
        {
          contract_documents: relations.contract_documents || [],
          employee_photos: relations.employee_photos || [],
          files_ktp: relations.files_ktp || [],
          files_npwp: relations.files_npwp || [],
          files_bpjs_kesehatan: relations.files_bpjs_kesehatan || [],
          files_bpjs_ketenagakerjaan: relations.files_bpjs_ketenagakerjaan || [],
          files_sim: relations.files_sim || [],
          files_stnk: relations.files_stnk || [],
        },
        uploadedBy,
        transaction1,
        transaction2,
        isDoubleDatabase,
      );

      await transaction1.commit();
      if (transaction2) await transaction2.commit();
      return this.getById(employee.id);
    } catch (error) {
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }

  async updateWithRelations(
    id,
    employeeData,
    relations,
    uploadedBy,
    isDoubleDatabase = true,
  ) {
    let transaction1 = null;
    let transaction2 = null;
    try {
      transaction1 = await db1.transaction();
      if (isDoubleDatabase) transaction2 = await db2.transaction();

      await models.db1.Employee.update(employeeData, {
        where: { id },
        transaction: transaction1,
      });
      if (isDoubleDatabase) {
        await models.db2.Employee.update(employeeData, {
          where: { id },
          transaction: transaction2,
        });
      }

      await this._syncEmployeeLists(
        id,
        relations,
        transaction1,
        transaction2,
        isDoubleDatabase,
      );
      await this._syncFiles(
        id,
        relations,
        uploadedBy,
        transaction1,
        transaction2,
        isDoubleDatabase,
      );

      await transaction1.commit();
      if (transaction2) await transaction2.commit();
      return this.getById(id);
    } catch (error) {
      if (transaction1 && !transaction1.finished) await transaction1.rollback();
      if (transaction2 && !transaction2.finished) await transaction2.rollback();
      throw error;
    }
  }
}

module.exports = new EmployeeService();
