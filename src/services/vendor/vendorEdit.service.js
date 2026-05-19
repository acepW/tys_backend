const DualDatabaseService = require("../dualDatabase.service");
const { models, db1, db2 } = require("../../models");

class VendorEditService extends DualDatabaseService {
  constructor() {
    super("VendorEdit");
  }

  // ─────────────────────────────────────────────
  // GET ALL WITH RELATIONS
  // ─────────────────────────────────────────────
  async getAllWithRelations(
    options = {},
    page = null,
    limit = null,
    isDoubleDatabase = true,
  ) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        { model: dbModels.Vendor, as: "vendor" },
        { model: dbModels.User, as: "user_request" },
        { model: dbModels.Department, as: "department_request" },
        {
          model: dbModels.VendorServiceEdit,
          as: "vendor_service_edits",
          separate: true,
          include: [{ model: dbModels.Category, as: "category" }],
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
      isDoubleDatabase,
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

  // ─────────────────────────────────────────────
  // GET BY ID WITH RELATIONS
  // ─────────────────────────────────────────────
  async getById(id, options = {}, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const queryOptions = {
      ...options,
      include: [
        { model: dbModels.Vendor, as: "vendor" },
        { model: dbModels.User, as: "user_request" },
        { model: dbModels.Department, as: "department_request" },
        {
          model: dbModels.VendorServiceEdit,
          as: "vendor_service_edits",
          separate: true,
          include: [{ model: dbModels.Category, as: "category" }],
        },
      ],
    };

    return await this.findById(id, queryOptions, isDoubleDatabase);
  }

  // ─────────────────────────────────────────────
  // CREATE VENDOR EDIT
  // Status vendorEdit  : pending
  // Status vendor      : request edit
  // Progress vendor    : request edit
  // ─────────────────────────────────────────────
  async createWithRelations(
    vendorEditData,
    vendorEditServices = [],
    id_user_create,
    isDoubleDatabase = true,
  ) {
    let t1 = null;
    let t2 = null;

    try {
      const dataToCreate = {
        ...vendorEditData,
        status: "pending",
        is_active: false,
      };

      if (isDoubleDatabase) {
        t1 = await db1.transaction();
        t2 = await db2.transaction();

        // 1. Buat VendorEdit di kedua DB
        const vendorEdit1 = await this.Model1.create(dataToCreate, {
          transaction: t1,
        });
        await this.Model2.create(
          { ...dataToCreate, id: vendorEdit1.id },
          { transaction: t2 },
        );
        console.log(`✅ VendorEdit created, ID: ${vendorEdit1.id}`);

        // 2. Update status vendor → "request edit" di kedua DB
        await models.db1.Vendor.update(
          { status: "request edit" },
          { where: { id: vendorEditData.id_vendor }, transaction: t1 },
        );
        await models.db2.Vendor.update(
          { status: "request edit" },
          { where: { id: vendorEditData.id_vendor }, transaction: t2 },
        );
        console.log(`✅ Vendor status → "request edit"`);

        // 3. Tambah progress ke vendor_verification_progress
        const progressData = {
          id_vendor: vendorEditData.id_vendor,
          id_user: id_user_create,
          status: "request edit",
          note: "Vendor edit requested, waiting for approval",
          is_active: true,
        };
        const progress1 = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: t1 },
        );
        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: t2 },
        );
        console.log(`✅ VendorVerificationProgress created`);

        // 4. Buat VendorServiceEdit
        const createdServices = await this._createVendorEditServices(
          vendorEdit1.id,
          vendorEditServices,
          t1,
          t2,
          true,
        );

        await t1.commit();
        await t2.commit();

        return {
          vendor_edit: vendorEdit1.toJSON(),
          verification_progress: progress1.toJSON(),
          vendor_service_editss: createdServices,
        };
      } else {
        t1 = await db1.transaction();

        const vendorEdit = await this.Model1.create(dataToCreate, {
          transaction: t1,
        });

        await models.db1.Vendor.update(
          { status: "request edit" },
          { where: { id: vendorEditData.id_vendor }, transaction: t1 },
        );

        const progressData = {
          id_vendor: vendorEditData.id_vendor,
          id_user: id_user_create,
          status: "request edit",
          note: "Vendor edit requested, waiting for approval",
          is_active: true,
        };
        const progress = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: t1 },
        );

        const createdServices = await this._createVendorEditServices(
          vendorEdit.id,
          vendorEditServices,
          t1,
          null,
          false,
        );

        await t1.commit();

        return {
          vendor_edit: vendorEdit.toJSON(),
          verification_progress: progress.toJSON(),
          vendor_service_editss: createdServices,
        };
      }
    } catch (error) {
      if (t1) await t1.rollback();
      if (t2) await t2.rollback();
      console.error(`❌ Error creating VendorEdit:`, error.message);
      throw new Error(`Failed to create VendorEdit: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────
  // APPROVE VENDOR EDIT
  // Status vendorEdit  : approve
  // Status vendor      : approve edit
  // Progress vendor    : approve edit
  // Replace semua data vendor dengan vendorEdit
  // Sync VendorService
  // ─────────────────────────────────────────────
  async approveVendorEdit(id, note, id_user, isDoubleDatabase = true) {
    let t1 = null;
    let t2 = null;

    try {
      // Ambil data VendorEdit + services
      const vendorEdit = await this.findById(
        id,
        {
          include: [
            {
              model: isDoubleDatabase
                ? models.db1.VendorServiceEdit
                : models.db2.VendorServiceEdit,
              as: "vendor_service_edits",
            },
          ],
        },
        isDoubleDatabase,
      );

      if (!vendorEdit) throw new Error(`VendorEdit with ID ${id} not found`);

      const idVendor = vendorEdit.id_vendor;

      // Field yang akan di-replace ke tabel vendors
      const replaceFields = [
        "vendor_application_no",
        "date_request",
        "vendor_name",
        "pic_name",
        "npwp",
        "nib",
        "email",
        "phone_number",
        "type_of_service",
        "bank_name",
        "account_number",
        "account_holder_name",
        "bank_branch",
        "transaction_currency",
        "file",
      ];

      const vendorUpdateData = {};
      replaceFields.forEach((field) => {
        if (vendorEdit[field] !== undefined) {
          vendorUpdateData[field] = vendorEdit[field];
        }
      });
      vendorUpdateData.status = "approve edit";

      if (isDoubleDatabase) {
        t1 = await db1.transaction();
        t2 = await db2.transaction();

        // 1. Update status VendorEdit → approve
        await this.Model1.update(
          { status: "approve" },
          { where: { id }, transaction: t1 },
        );
        await this.Model2.update(
          { status: "approve" },
          { where: { id }, transaction: t2 },
        );
        console.log(`✅ VendorEdit status → "approve"`);

        // 2. Replace data vendor + ubah status vendor → approve edit
        await models.db1.Vendor.update(vendorUpdateData, {
          where: { id: idVendor },
          transaction: t1,
        });
        await models.db2.Vendor.update(vendorUpdateData, {
          where: { id: idVendor },
          transaction: t2,
        });
        console.log(`✅ Vendor data replaced & status → "approve edit"`);

        // 3. Tambah progress ke vendor_verification_progress
        const progressData = {
          id_vendor: idVendor,
          id_user,
          status: "approve edit",
          note: note || "Vendor edit approved",
          is_active: true,
        };
        const progress1 = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: t1 },
        );
        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: t2 },
        );
        console.log(`✅ VendorVerificationProgress → "approve edit"`);

        // 4. Sync VendorService berdasarkan VendorServiceEdit
        const vendorEditServices = vendorEdit.vendor_service_edits || [];
        await this._syncVendorServicesOnApprove(
          idVendor,
          vendorEditServices,
          t1,
          t2,
          true,
        );

        await t1.commit();
        await t2.commit();
        console.log(`✅ VendorEdit approved successfully`);
      } else {
        t1 = await db1.transaction();

        await this.Model1.update(
          { status: "approve" },
          { where: { id }, transaction: t1 },
        );

        await models.db1.Vendor.update(vendorUpdateData, {
          where: { id: idVendor },
          transaction: t1,
        });

        const progressData = {
          id_vendor: idVendor,
          id_user,
          status: "approve edit",
          note: note || "Vendor edit approved",
          is_active: true,
        };
        await models.db1.VendorVerificationProgress.create(progressData, {
          transaction: t1,
        });

        const vendorEditServices = vendorEdit.vendor_service_edits || [];
        await this._syncVendorServicesOnApprove(
          idVendor,
          vendorEditServices,
          t1,
          null,
          false,
        );

        await t1.commit();
        console.log(`✅ VendorEdit approved (DB1 only)`);
      }

      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      if (t1) await t1.rollback();
      if (t2) await t2.rollback();
      console.error(`❌ Error approving VendorEdit:`, error.message);
      throw new Error(`Failed to approve VendorEdit: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────
  // REJECT VENDOR EDIT
  // Status vendorEdit  : reject
  // Status vendor      : reject edit
  // Progress vendor    : reject edit
  // ─────────────────────────────────────────────
  async rejectVendorEdit(id, note, id_user, isDoubleDatabase = true) {
    let t1 = null;
    let t2 = null;

    try {
      const vendorEdit = await this.findById(id, {}, isDoubleDatabase);
      if (!vendorEdit) throw new Error(`VendorEdit with ID ${id} not found`);

      const idVendor = vendorEdit.id_vendor;

      if (isDoubleDatabase) {
        t1 = await db1.transaction();
        t2 = await db2.transaction();

        // 1. Update status VendorEdit → reject
        await this.Model1.update(
          { status: "reject" },
          { where: { id }, transaction: t1 },
        );
        await this.Model2.update(
          { status: "reject" },
          { where: { id }, transaction: t2 },
        );
        console.log(`✅ VendorEdit status → "reject"`);

        // 2. Update status vendor → reject edit
        await models.db1.Vendor.update(
          { status: "reject edit" },
          { where: { id: idVendor }, transaction: t1 },
        );
        await models.db2.Vendor.update(
          { status: "reject edit" },
          { where: { id: idVendor }, transaction: t2 },
        );
        console.log(`✅ Vendor status → "reject edit"`);

        // 3. Tambah progress
        const progressData = {
          id_vendor: idVendor,
          id_user,
          status: "reject edit",
          note: note || "Vendor edit rejected",
          is_active: true,
        };
        const progress1 = await models.db1.VendorVerificationProgress.create(
          progressData,
          { transaction: t1 },
        );
        await models.db2.VendorVerificationProgress.create(
          { ...progressData, id: progress1.id },
          { transaction: t2 },
        );
        console.log(`✅ VendorVerificationProgress → "reject edit"`);

        await t1.commit();
        await t2.commit();
        console.log(`✅ VendorEdit rejected successfully`);
      } else {
        t1 = await db1.transaction();

        await this.Model1.update(
          { status: "reject" },
          { where: { id }, transaction: t1 },
        );
        await models.db1.Vendor.update(
          { status: "reject edit" },
          { where: { id: idVendor }, transaction: t1 },
        );

        const progressData = {
          id_vendor: idVendor,
          id_user,
          status: "reject edit",
          note: note || "Vendor edit rejected",
          is_active: true,
        };
        await models.db1.VendorVerificationProgress.create(progressData, {
          transaction: t1,
        });

        await t1.commit();
        console.log(`✅ VendorEdit rejected (DB1 only)`);
      }

      return await this.getById(id, {}, isDoubleDatabase);
    } catch (error) {
      if (t1) await t1.rollback();
      if (t2) await t2.rollback();
      console.error(`❌ Error rejecting VendorEdit:`, error.message);
      throw new Error(`Failed to reject VendorEdit: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Buat VendorServiceEdit saat create
  // ─────────────────────────────────────────────
  async _createVendorEditServices(
    idVendorEdit,
    services,
    t1,
    t2,
    isDoubleDatabase,
  ) {
    const created = [];

    for (const service of services) {
      const serviceData = {
        ...service,
        id_vendor_edit: idVendorEdit,
      };

      const s1 = await models.db1.VendorServiceEdit.create(serviceData, {
        transaction: t1,
      });

      if (isDoubleDatabase && t2) {
        await models.db2.VendorServiceEdit.create(
          { ...serviceData, id: s1.id },
          { transaction: t2 },
        );
      }

      created.push(s1.toJSON());
    }

    console.log(`✅ Created ${created.length} VendorServiceEdit records`);
    return created;
  }

  // ─────────────────────────────────────────────
  // PRIVATE: Sync VendorService saat approve
  //
  // Aturan:
  // - Ada id_vendor_service  → UPDATE record di vendor_services
  // - Tidak ada              → INSERT baru ke vendor_services
  // - VendorService yang tidak ada di VendorServiceEdit → is_active = false
  // ─────────────────────────────────────────────
  async _syncVendorServicesOnApprove(
    idVendor,
    vendorEditServices,
    t1,
    t2,
    isDoubleDatabase,
  ) {
    // Ambil semua VendorService aktif milik vendor ini
    const existingServices = await models.db1.VendorService.findAll({
      where: { id_vendor: idVendor },
    });

    // Kumpulkan id_vendor_service yang disebut di VendorServiceEdit
    const mentionedServiceIds = vendorEditServices
      .filter((s) => s.id_vendor_service != null)
      .map((s) => Number(s.id_vendor_service));

    for (const editService of vendorEditServices) {
      const serviceFields = {
        id_vendor: idVendor,
        id_category: editService.id_category,
        service_name: editService.service_name,
        price_idr: editService.price_idr,
        price_rmb: editService.price_rmb,
        is_active: true,
      };

      if (editService.id_vendor_service) {
        // UPDATE record yang sudah ada
        await models.db1.VendorService.update(serviceFields, {
          where: { id: editService.id_vendor_service },
          transaction: t1,
        });

        if (isDoubleDatabase && t2) {
          await models.db2.VendorService.update(serviceFields, {
            where: { id: editService.id_vendor_service },
            transaction: t2,
          });
        }

        console.log(
          `✅ Updated VendorService ID ${editService.id_vendor_service}`,
        );
      } else {
        // INSERT baru
        const newService1 = await models.db1.VendorService.create(
          serviceFields,
          { transaction: t1 },
        );

        if (isDoubleDatabase && t2) {
          await models.db2.VendorService.create(
            { ...serviceFields, id: newService1.id },
            { transaction: t2 },
          );
        }

        console.log(`✅ Created new VendorService ID ${newService1.id}`);
      }
    }

    // VendorService yang tidak di-mention → is_active = false
    const toDeactivate = existingServices
      .filter((s) => !mentionedServiceIds.includes(s.id))
      .map((s) => s.id);

    if (toDeactivate.length > 0) {
      await models.db1.VendorService.update(
        { is_active: false },
        { where: { id: toDeactivate }, transaction: t1 },
      );

      if (isDoubleDatabase && t2) {
        await models.db2.VendorService.update(
          { is_active: false },
          { where: { id: toDeactivate }, transaction: t2 },
        );
      }

      console.log(
        `✅ Deactivated ${toDeactivate.length} VendorService(s): [${toDeactivate.join(", ")}]`,
      );
    }
  }
}

module.exports = new VendorEditService();
