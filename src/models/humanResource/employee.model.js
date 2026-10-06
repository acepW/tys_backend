const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Employee = sequelize.define(
    "Employee",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      employee_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      device_user_id: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
        comment: "PIN/User ID registered on the attendance device",
      },
      full_name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      gender: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: { isEmail: true },
      },
      office_email: {
        type: DataTypes.STRING(100),
        allowNull: true,
        validate: { isEmail: true },
        comment: "Office email (email kantor)",
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      ktp: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      npwp: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      level: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      employee_status: { type: DataTypes.STRING(100), allowNull: true },
      contract_duration: { type: DataTypes.INTEGER, allowNull: true },
      payment_type: { type: DataTypes.STRING(100), allowNull: true },
      base_salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      bonus_salary: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      bank_name: { type: DataTypes.STRING(100), allowNull: true },
      bank_account_no: { type: DataTypes.STRING(100), allowNull: true },
      name_npwp: { type: DataTypes.STRING(200), allowNull: true },
      tax_status: { type: DataTypes.STRING(100), allowNull: true },
      bpjs_kesehatan_no: { type: DataTypes.STRING(100), allowNull: true },
      bpjs_ketenagakerjaan_no: { type: DataTypes.STRING(100), allowNull: true },
      sim_no: { type: DataTypes.STRING(100), allowNull: true },
      stnk_no: { type: DataTypes.STRING(100), allowNull: true },
      plate_number: { type: DataTypes.STRING(30), allowNull: true },
      id_company: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "companies", key: "id" },
      },
      id_division: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "divisions", key: "id" },
      },
      id_department: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "departments", key: "id" },
      },
      id_position: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "positions", key: "id" },
      },
      hire_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Employee join date",
      },
      contract_start_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      contract_end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      contract_reminder_days: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 60,
        validate: { min: 0 },
      },
      contract_reminder_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
        comment: "Automatically calculated from contract end date",
      },
      termination_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "employees",
      timestamps: true,
      underscored: true,
      indexes: [
        { name: "idx_employee_company", fields: ["id_company"] },
        { name: "idx_employee_active", fields: ["is_active"] },
        {
          name: "idx_employee_contract_reminder_date",
          fields: ["contract_reminder_date"],
        },
      ],
    },
  );

  Employee.associate = (models) => {
    Employee.belongsTo(models.Company, {
      foreignKey: "id_company",
      as: "company",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Division, {
      foreignKey: "id_division",
      as: "division",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Department, {
      foreignKey: "id_department",
      as: "department",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.belongsTo(models.Position, {
      foreignKey: "id_position",
      as: "position",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.hasMany(models.AttendanceLog, {
      foreignKey: "id_employee",
      as: "attendance_logs",
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    });
    Employee.hasMany(models.Attendance, {
      foreignKey: "id_employee",
      as: "attendances",
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    });
    Employee.hasMany(models.EmployeeEmergencyContact, {
      foreignKey: "id_employee",
      as: "emergency_contacts",
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    });
    for (const [model, as] of [
      [models.EmployeeAllowance, "allowances"],
      [models.EmployeeFamilyMember, "family_data"],
      [models.EmployeeEducation, "education_history"],
    ]) {
      Employee.hasMany(model, {
        foreignKey: "id_employee",
        as,
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      });
    }
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "contract_documents" },
      as: "contract_documents",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "employee_photos" },
      as: "employee_photos",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_ktp" },
      as: "files_ktp",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_npwp" },
      as: "files_npwp",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_bpjs_kesehatan" },
      as: "files_bpjs_kesehatan",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_bpjs_ketenagakerjaan" },
      as: "files_bpjs_ketenagakerjaan",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_sim" },
      as: "files_sim",
    });
    Employee.hasMany(models.File, {
      foreignKey: "fileable_id",
      constraints: false,
      scope: { fileable_type: "employees", category: "files_stnk" },
      as: "files_stnk",
    });
  };

  return Employee;
};
