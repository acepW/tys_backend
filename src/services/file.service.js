const DualDatabaseService = require("./dualDatabase.service");
const { Op } = require("sequelize");
const { db1, db2 } = require("../models");

class FileService extends DualDatabaseService {
  constructor() {
    super("File");
  }

  /**
   * Sinkronisasi file untuk satu entity (fileable_type + fileable_id).
   * - item tanpa `id`               -> create baru
   * - item dengan `id` (masih ada)  -> update
   * - id lama yg TIDAK ada di incomingFiles -> dihapus (soft delete default)
   *
   * @param {string} fileableType
   * @param {number} fileableId
   * @param {Array} incomingFiles
   * @param {object} opts - { category, uploadedBy, isDoubleDatabase, hardDelete }
   * @param {Object|null} externalTransaction1
   * @param {Object|null} externalTransaction2
   * @returns {object} { created: [], updated: [], deletedIds: [] }
   */
  async syncFiles(
    fileableType,
    fileableId,
    incomingFiles = [],
    opts = {},
    externalTransaction1 = null,
    externalTransaction2 = null
  ) {
    const isDoubleDatabase = opts.isDoubleDatabase !== false;
    const hardDelete = !!opts.hardDelete;
    const isExternalTransaction = !!externalTransaction1;

    let transaction1 = externalTransaction1;
    let transaction2 = externalTransaction2;

    try {
      if (isDoubleDatabase) {
        if (!isExternalTransaction) {
          transaction1 = await db1.transaction();
          transaction2 = await db2.transaction();
        }

        console.log(
          `🔄 Syncing files for ${fileableType}=${fileableId} in both databases...`
        );

        // 1. Ambil existing file dari DB1
        const existing = await this.Model1.findAll({
          where: { fileable_type: fileableType, fileable_id: fileableId },
          transaction: transaction1,
        });

        const existingIds = existing.map((f) => f.id);
        const incomingIds = incomingFiles.filter((f) => f.id).map((f) => f.id);

        const result = { created: [], updated: [], deletedIds: [] };

        // 2. Create / Update
        for (const file of incomingFiles) {
          const payload = {
            fileable_type: fileableType,
            fileable_id: fileableId,
            original_name: file.original_name,
            indonesian_name: file.indonesian_name ?? file.original_name,
            mandarin_name: file.mandarin_name ?? file.original_name,
            stored_name: file.stored_name,
            url: file.url,
            mime_type: file.mime_type,
            size: file.size,
            uploaded_by: file.uploaded_by ?? opts.uploadedBy ?? null,
          };

          const isExisting = file.id && existingIds.includes(file.id);

          if (isExisting) {
            await this.Model1.update(payload, {
              where: { id: file.id },
              transaction: transaction1,
            });
            await this.Model2.update(payload, {
              where: { id: file.id },
              transaction: transaction2,
            });
            result.updated.push({ id: file.id, ...payload });
          } else {
            const created1 = await this.Model1.create(payload, {
              transaction: transaction1,
            });
            await this.Model2.create(
              { ...payload, id: created1.id },
              { transaction: transaction2 }
            );
            result.created.push(created1.toJSON());
          }
        }

        console.log(
          `✅ Created ${result.created.length}, updated ${result.updated.length} files`
        );

        // 3. Hapus id lama yang tidak ada lagi di incoming
        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id)
        );

        if (idsToDelete.length > 0) {
          if (hardDelete) {
            await this.Model1.destroy({
              where: { id: { [Op.in]: idsToDelete } },
              transaction: transaction1,
            });
            await this.Model2.destroy({
              where: { id: { [Op.in]: idsToDelete } },
              transaction: transaction2,
            });
          } else {
            await this.Model1.update(
              { is_active: false },
              {
                where: { id: { [Op.in]: idsToDelete } },
                transaction: transaction1,
              }
            );
            await this.Model2.update(
              { is_active: false },
              {
                where: { id: { [Op.in]: idsToDelete } },
                transaction: transaction2,
              }
            );
          }
          console.log(
            `✅ ${hardDelete ? "Deleted" : "Deactivated"} ${
              idsToDelete.length
            } files`
          );
          result.deletedIds = idsToDelete;
        }

        if (!isExternalTransaction) {
          await transaction1.commit();
          await transaction2.commit();
          console.log(`✅ File sync successfully committed in both databases`);
        }

        return result;
      } else {
        // Single database (DB2 only, mengikuti pola isDoubleDatabase=false di service lain)
        if (!isExternalTransaction) {
          transaction1 = await db1.transaction();
        }

        const existing = await this.Model2.findAll({
          where: { fileable_type: fileableType, fileable_id: fileableId },
          transaction: transaction1,
        });

        const existingIds = existing.map((f) => f.id);
        const incomingIds = incomingFiles.filter((f) => f.id).map((f) => f.id);

        const result = { created: [], updated: [], deletedIds: [] };

        for (const file of incomingFiles) {
          const payload = {
            fileable_type: fileableType,
            fileable_id: fileableId,
            original_name: file.original_name,
            indonesian_name: file.indonesian_name ?? file.original_name,
            mandarin_name: file.mandarin_name ?? file.original_name,
            stored_name: file.stored_name,
            url: file.url,
            mime_type: file.mime_type,
            size: file.size,
            uploaded_by: file.uploaded_by ?? opts.uploadedBy ?? null,
          };

          const isExisting = file.id && existingIds.includes(file.id);

          if (isExisting) {
            await this.Model2.update(payload, {
              where: { id: file.id },
              transaction: transaction1,
            });
            result.updated.push({ id: file.id, ...payload });
          } else {
            const created = await this.Model2.create(payload, {
              transaction: transaction1,
            });
            result.created.push(created.toJSON());
          }
        }

        const idsToDelete = existingIds.filter(
          (id) => !incomingIds.includes(id)
        );

        if (idsToDelete.length > 0) {
          if (hardDelete) {
            await this.Model2.destroy({
              where: { id: { [Op.in]: idsToDelete } },
              transaction: transaction1,
            });
          } else {
            await this.Model2.update(
              { is_active: false },
              {
                where: { id: { [Op.in]: idsToDelete } },
                transaction: transaction1,
              }
            );
          }
          result.deletedIds = idsToDelete;
        }

        if (!isExternalTransaction) {
          await transaction1.commit();
          console.log(`✅ File sync completed in DB2 only`);
        }

        return result;
      }
    } catch (error) {
      console.error(`❌ Error in syncFiles:`, error.message);
      if (!isExternalTransaction) {
        if (transaction1) await transaction1.rollback();
        if (transaction2) await transaction2.rollback();
      }
      throw new Error(`Failed to sync files: ${error.message}`);
    }
  }

  /**
   * List file aktif milik satu entity (read-only, pakai base class)
   */
  async listFiles(
    fileableType,
    fileableId,
    category = null,
    isDoubleDatabase = true
  ) {
    const where = {
      fileable_type: fileableType,
      fileable_id: fileableId,
      is_active: true,
    };
    if (category) where.category = category;

    return this.findAll(
      { where, order: [["created_at", "DESC"]] },
      isDoubleDatabase
    );
  }

  async listFilesGrouped(
    fileableType,
    fileableIds,
    category = null,
    isDoubleDatabase = true
  ) {
    const where = {
      fileable_type: fileableType,
      fileable_id: { [Op.in]: fileableIds },
      is_active: true,
    };
    if (category) where.category = category;

    const files = await this.findAll({ where }, isDoubleDatabase);

    return files.reduce((acc, file) => {
      const key = file.fileable_id;
      if (!acc[key]) acc[key] = [];
      acc[key].push(file);
      return acc;
    }, {});
  }

  async belongsTo(fileId, fileableType, fileableId, isDoubleDatabase = true) {
    const file = await this.findOne(
      {
        where: {
          id: fileId,
          fileable_type: fileableType,
          fileable_id: fileableId,
        },
      },
      isDoubleDatabase
    );
    return file !== null;
  }
}

module.exports = new FileService();
