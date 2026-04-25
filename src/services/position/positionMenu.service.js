const DualDatabaseService = require("../dualDatabase.service");

const { models } = require("../../models");

class PositionMenuService extends DualDatabaseService {
  constructor() {
    super("PositionMenu");
  }

  /**
   * Get full permission list for a position
   * Ambil SEMUA menu, merge dengan permission yang sudah ada
   * Jika belum ada permission → default semua false
   */
  async getByPosition(idPosition, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    // Ambil semua menu aktif (parent only, include sub_items)
    const allMenus = await dbModels.Menu.findAll({
      where: { parent_id: null, is_active: true },
      include: [
        {
          model: dbModels.Menu,
          as: "sub_items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order_index", "ASC"],
        [{ model: dbModels.Menu, as: "sub_items" }, "order_index", "ASC"],
      ],
    });

    // Ambil permission yang sudah tersimpan untuk position ini
    const savedPermissions = await dbModels.PositionMenu.findAll({
      where: { id_position: idPosition },
    });

    // Buat map untuk lookup cepat { id_menu: permissionObj }
    const permissionMap = {};
    for (const p of savedPermissions) {
      permissionMap[p.id_menu] = p;
    }

    // Default permission jika belum ada
    const defaultPermission = {
      is_active: false,
      is_can_view: false,
      is_can_create: false,
      is_can_update: false,
      is_can_delete: false,
    };

    // Merge semua menu dengan permission-nya
    const result = allMenus.map((menu) => {
      const menuObj = menu.toJSON();
      const parentPerm = permissionMap[menu.id] || defaultPermission;

      return {
        id: menuObj.id,
        label: menuObj.label,
        icon: menuObj.icon,
        path: menuObj.path,
        order_index: menuObj.order_index,
        is_active: parentPerm.is_active,
        is_can_view: parentPerm.is_can_view,
        is_can_create: parentPerm.is_can_create,
        is_can_update: parentPerm.is_can_update,
        is_can_delete: parentPerm.is_can_delete,
        sub_items: menuObj.sub_items.map((sub) => {
          const subPerm = permissionMap[sub.id] || defaultPermission;
          return {
            id: sub.id,
            label: sub.label,
            icon: sub.icon,
            path: sub.path,
            order_index: sub.order_index,
            is_active: subPerm.is_active,
            is_can_view: subPerm.is_can_view,
            is_can_create: subPerm.is_can_create,
            is_can_update: subPerm.is_can_update,
            is_can_delete: subPerm.is_can_delete,
          };
        }),
      };
    });

    return result;
  }

  /**
   * Update permission untuk satu menu dalam satu position
   */
  async updatePermission(idPosition, idMenu, data, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const [record] = await dbModels.PositionMenu.findOrCreate({
      where: { id_position: idPosition, id_menu: idMenu },
      defaults: {
        is_active: false,
        is_can_view: false,
        is_can_create: false,
        is_can_update: false,
        is_can_delete: false,
      },
    });

    const allowed = [
      "is_active",
      "is_can_view",
      "is_can_create",
      "is_can_update",
      "is_can_delete",
    ];

    allowed.forEach((field) => {
      if (data[field] !== undefined) record[field] = data[field];
    });

    await record.save();
    return record;
  }

  /**
   * Bulk update permissions untuk satu position
   * Body: { permissions: [{ id_menu, is_active, is_can_view, ... }] }
   */
  async bulkUpdatePermissions(
    idPosition,
    permissions,
    isDoubleDatabase = true,
  ) {
    const results = await Promise.all(
      permissions.map(({ id_menu, ...data }) =>
        this.updatePermission(idPosition, id_menu, data, isDoubleDatabase),
      ),
    );
    return results;
  }

  /**
   * Get permissions untuk user (dipakai di login / getMe / getById)
   * Hanya return menu yang is_active = true
   */
  async getAccessForUser(idPosition, isDoubleDatabase = true) {
    const dbModels = isDoubleDatabase ? models.db1 : models.db2;

    const allMenus = await dbModels.Menu.findAll({
      where: { parent_id: null, is_active: true },
      include: [
        {
          model: dbModels.Menu,
          as: "sub_items",
          where: { is_active: true },
          required: false,
        },
      ],
      order: [
        ["order_index", "ASC"],
        [{ model: dbModels.Menu, as: "sub_items" }, "order_index", "ASC"],
      ],
    });

    const savedPermissions = await dbModels.PositionMenu.findAll({
      where: { id_position: idPosition },
    });

    const permissionMap = {};
    for (const p of savedPermissions) {
      permissionMap[p.id_menu] = p;
    }

    const defaultPermission = {
      is_active: false,
      is_can_view: false,
      is_can_create: false,
      is_can_update: false,
      is_can_delete: false,
    };

    // Hanya return menu yang is_active = true untuk user
    const result = [];

    for (const menu of allMenus) {
      const menuObj = menu.toJSON();
      const parentPerm = permissionMap[menu.id] || defaultPermission;

      if (!parentPerm.is_active) continue;

      const subItems = menuObj.sub_items
        .map((sub) => {
          const subPerm = permissionMap[sub.id] || defaultPermission;
          if (!subPerm.is_active) return null;
          return {
            id: sub.id,
            label: sub.label,
            icon: sub.icon,
            path: sub.path,
            is_active: subPerm.is_active,
            is_can_view: subPerm.is_can_view,
            is_can_create: subPerm.is_can_create,
            is_can_update: subPerm.is_can_update,
            is_can_delete: subPerm.is_can_delete,
          };
        })
        .filter(Boolean);

      result.push({
        id: menuObj.id,
        label: menuObj.label,
        icon: menuObj.icon,
        path: menuObj.path,
        is_active: parentPerm.is_active,
        is_can_view: parentPerm.is_can_view,
        is_can_create: parentPerm.is_can_create,
        is_can_update: parentPerm.is_can_update,
        is_can_delete: parentPerm.is_can_delete,
        sub_items: subItems,
      });
    }

    return result;
  }
}

module.exports = new PositionMenuService();
