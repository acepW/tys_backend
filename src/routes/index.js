const express = require("express");
const router = express.Router();

// Import all routes
//sync
const syncRoutes = require("./sync.route");

//master data
const categoryRoutes = require("./category.route");
const companyRoutes = require("./company.route");
const productRoutes = require("./product.route");
const customerRoutes = require("./customer.route");
const divisionRoutes = require("./division.route");
const vendorRoutes = require("./vendor.route");
const flowProcessRoutes = require("./flowProcess.route");
const clauseRoute = require("./clause.route");
const userRoute = require("./user.route");

//service pricing
const servicePricingRoutes = require("./servicePricing.route");
const projectPlanRoutes = require("./projectPlan.route");

//Quotation
const quotationRoutes = require("./quotation.route");

//contract
const contactRoutes = require("./contract.route");
const contactServiceRoutes = require("./contractService.route");
const contactProjectPlanRoutes = require("./contractProjectPlan.route");

//invoice
const invoiceRoutes = require("./invoice.route");

//debit note
const debitNoteRoutes = require("./debitNote.route");

//payment request
const paymentRequestRoutes = require("./paymentRequest.route");

//report
const reportInvoiceRoutes = require("./reportInvoice.route");

// Use routes
//sync
router.use("/sync", syncRoutes);

//master data
router.use("/categories", categoryRoutes);
router.use("/companies", companyRoutes);
router.use("/products-header", productRoutes);
router.use("/customers", customerRoutes);
router.use("/divisions", divisionRoutes);
router.use("/vendors", vendorRoutes);
router.use("/flow-process", flowProcessRoutes);
router.use("/clauses", clauseRoute);
router.use("/users", userRoute);

//service pricing
router.use("/service-pricing", servicePricingRoutes);
router.use("/project-plans", projectPlanRoutes);

//quotation
router.use("/quotations", quotationRoutes);

//contract
router.use("/contracts", contactRoutes);
router.use("/contracts-services", contactServiceRoutes);
router.use("/contracts/project-plans", contactProjectPlanRoutes);

//invoice
router.use("/invoices", invoiceRoutes);

//debit note
router.use("/debit-notes", debitNoteRoutes);

//payment request
router.use("/payment-requests", paymentRequestRoutes);

//report
router.use("/report-invoices", reportInvoiceRoutes);

// API Documentation route
router.get("/", (req, res) => {
  res.json({
    message: "ERP Backend API",
    version: "1.0.0",
    endpoints: {
      sync: "/api/sync",
      //master data
      categories: "/api/categories",
      companies: "/api/companies",
      products: "/api/products-header",
      customers: "/api/customers",
      divisions: "/api/divisions",
      vendors: "/api/vendors",
      flowProcess: "/api/flow-process",
      clauses: "/api/clauses",
      users: "/api/users",

      //service pricing
      servicePricing: "/api/service-pricing",
      projectPlans: "/api/project-plans",

      //quotation
      quotation: "api/quotations",

      //contract
      contract: "api/contracts",
      contractService: "api/contracts-services",
      contractProjectPlan: "api/contracts/project-plans",

      //invoice
      invoice: "api/invoices",

      //debit note
      debitNote: "/api/debit-notes",

      //payment request
      paymentRequest: "/api/payment-requests",

      //report
      reportInvoice: "/api/report-invoices",
    },
  });
});

module.exports = router;
