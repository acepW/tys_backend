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

//service pricing
const servicePricingRoutes = require("./servicePricing.route");

// Use routes

//sync
router.use("/sync", syncRoutes);

//master data
router.use("/categories", categoryRoutes);
router.use("/companies", companyRoutes);
router.use("/products-header", productRoutes);
router.use("/customers", customerRoutes);

//service pricing
router.use("/service-pricing", servicePricingRoutes);

// API Documentation route
router.get("/", (req, res) => {
  res.json({
    message: "ERP Backend API",
    version: "1.0.0",
    endpoints: {
      sync: "/api/sync",
      categories: "/api/categories",
      companies: "/api/companies",
      products: "/api/products-header",
      customers: "/api/customers",
      servicePricing: "/api/service-pricing",
    },
  });
});

module.exports = router;
