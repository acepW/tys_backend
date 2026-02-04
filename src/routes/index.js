const express = require("express");
const router = express.Router();

// Import all routes
const categoryRoutes = require("./category.route");
const companyRoutes = require("./company.route");
const productRoutes = require("./product.route");
const customerRoutes = require("./customer.route");
const syncRoutes = require("./sync.route");

// Use routes
router.use("/categories", categoryRoutes);
router.use("/companies", companyRoutes);
router.use("/products-header", productRoutes);
router.use("/customers", customerRoutes);
router.use("/sync", syncRoutes);

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
    },
  });
});

module.exports = router;
