require("dotenv").config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  db1: {
    host: process.env.DB1_HOST,
    port: process.env.DB1_PORT,
    name: process.env.DB1_NAME,
    user: process.env.DB1_USER,
    password: process.env.DB1_PASSWORD,
  },

  db2: {
    host: process.env.DB2_HOST,
    port: process.env.DB2_PORT,
    name: process.env.DB2_NAME,
    user: process.env.DB2_USER,
    password: process.env.DB2_PASSWORD,
  },
};
