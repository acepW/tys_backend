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
const flowProcessRoutes = require("./flowProcess.route");

//service pricing
const servicePricingRoutes = require("./servicePricing.route");

//Quotation
const quotationRoutes = require("./quotation.route");

// Use routes
//sync
router.use("/sync", syncRoutes);

//master data
router.use("/categories", categoryRoutes);
router.use("/companies", companyRoutes);
router.use("/products-header", productRoutes);
router.use("/customers", customerRoutes);
router.use("/divisions", divisionRoutes);
router.use("/flow-process", flowProcessRoutes);

//service pricing
router.use("/service-pricing", servicePricingRoutes);

//quotation
router.use("/quotations", quotationRoutes);

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
      flowProcess: "/api/flow-process",

      //service pricing
      servicePricing: "/api/service-pricing",

      //quotation
      quotation: "api/quotations",
    },
  });
});

module.exports = router;
