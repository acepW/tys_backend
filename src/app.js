const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const cookieParser = require("cookie-parser");
const zktecoProtocolRoutes = require("./routes/zktecoProtocol.route");

const app = express();

// Middleware
app.use(
  cors({
    credentials: true,
    origin: true, // Configure sesuai kebutuhan production
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ZKTeco Push devices send text payloads and cannot use the application's JWT.
// Mount this route before the global JSON/urlencoded body parsers.
app.use("/iclock", zktecoProtocolRoutes);

app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    message: "ERP Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use("/api", routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    data: null,
    timestamp: new Date().toISOString(),
  });
});

// Global error handler
app.use(errorHandler);

module.exports = app;
