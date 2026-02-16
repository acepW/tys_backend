const { Sequelize } = require("sequelize");
require("dotenv").config();

// Database 1 Configuration (Primary)
const db1 = new Sequelize(
  process.env.DB1_NAME,
  process.env.DB1_USER,
  process.env.DB1_PASSWORD,
  {
    host: process.env.DB1_HOST,
    port: process.env.DB1_PORT,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
    },
  }
);

// Database 2 Configuration (Secondary)
const db2 = new Sequelize(
  process.env.DB2_NAME,
  process.env.DB2_USER,
  process.env.DB2_PASSWORD,
  {
    host: process.env.DB2_HOST,
    port: process.env.DB2_PORT,
    dialect: "mysql",
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    dialectOptions: {
      charset: "utf8mb4",
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      charset: "utf8mb4",
      collate: "utf8mb4_unicode_ci",
    },
  }
);

// Test database connections
const testConnections = async () => {
  try {
    await db1.authenticate();
    console.log("✅ Database 1 (Primary) connected successfully");
    console.log(`   Host: ${process.env.DB1_HOST}`);
    console.log(`   Database: ${process.env.DB1_NAME}`);

    await db2.authenticate();
    console.log("✅ Database 2 (Secondary) connected successfully");
    console.log(`   Host: ${process.env.DB2_HOST}`);
    console.log(`   Database: ${process.env.DB2_NAME}`);
  } catch (error) {
    console.error("❌ Unable to connect to databases:", error.message);
    process.exit(1);
  }
};

module.exports = {
  db1,
  db2,
  testConnections,
};
