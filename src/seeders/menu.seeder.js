"use strict";

const seedMenus = async (db) => {
  const now = new Date();

  const parentMenus = [
    {
      label: "Home",
      icon: "HomeIcon",
      path: "/",
      parent_id: null,
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "My Tasks",
      icon: "MyTaskIcon",
      path: "/tasks",
      parent_id: null,
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Project",
      icon: "ProjectIcon",
      path: null,
      parent_id: null,
      order_index: 3,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Service & Pricing",
      icon: "ServicePricingIcon",
      path: null,
      parent_id: null,
      order_index: 4,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Quotation",
      icon: "QuotationIcon",
      path: null,
      parent_id: null,
      order_index: 5,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Contract",
      icon: "ContractIcon",
      path: null,
      parent_id: null,
      order_index: 6,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "FAT",
      icon: "FatIcon",
      path: null,
      parent_id: null,
      order_index: 7,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Report",
      icon: "FatIcon",
      path: null,
      parent_id: null,
      order_index: 8,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "HR",
      icon: "HrIcon",
      path: "/hr",
      parent_id: null,
      order_index: 9,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Monitoring Data",
      icon: "MonitoringIcon",
      path: "/monitoring",
      parent_id: null,
      order_index: 10,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Master Data",
      icon: "MasterDataIcon",
      path: "/master-data",
      parent_id: null,
      order_index: 11,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.Menu.bulkCreate(parentMenus, { ignoreDuplicates: true });

  const parents = await db.Menu.findAll({
    where: { parent_id: null },
    attributes: ["id", "label"],
  });

  const getId = (label) => parents.find((p) => p.label === label)?.id;

  const subMenus = [
    // Project
    {
      label: "Project List",
      icon: null,
      path: "/project/project-list",
      parent_id: getId("Project"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Project Progress",
      icon: null,
      path: "/project/project-progress",
      parent_id: getId("Project"),
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    // Service & Pricing
    {
      label: "Add New Services",
      icon: null,
      path: "/services/add",
      parent_id: getId("Service & Pricing"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "List Service & Pricing",
      icon: null,
      path: "/services/list",
      parent_id: getId("Service & Pricing"),
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    // Quotation
    {
      label: "Add New Quotation",
      icon: null,
      path: "/quotation/add",
      parent_id: getId("Quotation"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "List Quotation",
      icon: null,
      path: "/quotation/list",
      parent_id: getId("Quotation"),
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    // Contract
    {
      label: "Create New Contract",
      icon: null,
      path: "/contract/add",
      parent_id: getId("Contract"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "List Contract",
      icon: null,
      path: "/contract/list",
      parent_id: getId("Contract"),
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Project Plan",
      icon: null,
      path: "/contract/project-plan",
      parent_id: getId("Contract"),
      order_index: 3,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    // FAT
    {
      label: "Create New Invoice",
      icon: null,
      path: "/fat/invoice",
      parent_id: getId("FAT"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "List Invoice",
      icon: null,
      path: "/fat/list-invoice",
      parent_id: getId("FAT"),
      order_index: 2,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Payment Request",
      icon: null,
      path: "/fat/payment-request",
      parent_id: getId("FAT"),
      order_index: 3,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      label: "Debit Note",
      icon: null,
      path: "/fat/debit-note",
      parent_id: getId("FAT"),
      order_index: 4,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
    // Report
    {
      label: "List AR",
      icon: null,
      path: "/report/list-ar",
      parent_id: getId("Report"),
      order_index: 1,
      is_active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  await db.Menu.bulkCreate(subMenus, { ignoreDuplicates: true });

  const totalMenus = await db.Menu.count();

  return {
    menus_inserted: parentMenus.length + subMenus.length,
    total_menus: totalMenus,
  };
};

module.exports = seedMenus;
