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
    //await syncModel("VendorVerificationProgress");
    console.log("");

    // Start Express server
    const server = app.listen(PORT, "0.0.0.0", () => {
      console.log("=".repeat(50));
      console.log(`✅ Server is running successfully`);
      console.log(`📍 Port: ${PORT}`);
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🔗 URL: http://localhost:${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api`);
      console.log(`💚 Health Check: http://localhost:${PORT}/health`);
      console.log("=".repeat(50));
    });

    // Handle server-level errors (e.g. port already in use)
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error("=".repeat(50));
        console.error(`❌ Port ${PORT} is already in use!`);
        console.error(`💡 Tips to fix this:`);
        console.error(`   1. Kill the process using port ${PORT}:`);
        console.error(`      - Linux/Mac : lsof -ti:${PORT} | xargs kill -9`);
        console.error(`      - Windows   : netstat -ano | findstr :${PORT}`);
        console.error(`   2. Or change PORT in your .env file`);
        console.error("=".repeat(50));
      } else {
        console.error("❌ Server error:", err.message);
        console.error(err.stack);
      }
      process.exit(1);
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
