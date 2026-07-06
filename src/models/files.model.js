const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const File = sequelize.define(
    "File",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        comment: "Primary key for File",
      },
      fileable_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment:
          "Nama model pemilik file, misal 'Company', 'Contract', 'Vendor'",
      },
      fileable_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "ID record pemilik file (id Company/Contract/Vendor, dst)",
      },
      original_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Nama asli file saat diupload user",
      },
      indonesian_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Nama file dalam indonesia saat diupload user",
      },
      mandarin_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Nama file dalam mandarin diupload user",
      },
      stored_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Nama file yang tersimpan di disk (hasil generate aman)",
      },
      url: {
        type: DataTypes.STRING(500),
        allowNull: false,
        comment: "URL akses file, misal /files/company/xxx.pdf",
      },
      mime_type: {
        type: DataTypes.STRING(150),
        allowNull: false,
        comment: "MIME type file",
      },
      size: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: "Ukuran file dalam bytes",
      },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "ID user yang mengupload file",
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
        comment: "Status file (active/soft-deleted)",
      },
    },
    {
      tableName: "files",
      timestamps: true,
      underscored: true,
      indexes: [
        {
          name: "idx_fileable",
          fields: ["fileable_type", "fileable_id"],
        },
        {
          name: "idx_is_active",
          fields: ["is_active"],
        },
      ],
    }
  );

  // Define associations (untuk future development)
  File.associate = (models) => {
    // File TIDAK didefinisikan belongsTo statis ke satu model tertentu
    // karena sifatnya polymorphic (bisa milik Company, Contract, Vendor, dst).
    // Asosiasi arah sebaliknya (X hasMany File) didefinisikan di masing-masing
    // model pemilik (lihat contoh di Company/Contract/Vendor model), BUKAN di sini.
    //
    // Contoh yang perlu ditambahkan di company.model.js:
    //
    // Company.hasMany(models.File, {
    //   foreignKey: "fileable_id",
    //   constraints: false,
    //   scope: { fileable_type: "Company" },
    //   as: "files",
    // });
  };

  return File;
};
