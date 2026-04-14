require("dotenv").config();
const app = require("./src/app");
const { testConnections } = require("./src/config/database");
const { syncDatabases, syncModel } = require("./src/models");
const config = require("./src/config/config");

const PORT = config.port;
/**
 * Start the server
 */
const startServer = async () => {
  try {
    console.log("🚀 Starting ERP Backend Server...\n");

    // Test database connections
    //await testConnections();
    console.log("");

    // Sync databases
    //await syncDatabases();

    //sync database by table name
    //await syncModel("Vendor");
    console.log("");

    // Start Express server
    app.listen(PORT, () => {
      console.log("=".repeat(50));
      console.log(`✅ Server is running successfully`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api`);
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
      console.log("=".repeat(50));
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
};

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});

// Start the server
startServer();
