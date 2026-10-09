const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

const prisma = require("./utils/prisma");
const authRoutes = require("./routes/authRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const managerRoutes = require("./routes/managerRoutes");
const correctionRoutes = require("./routes/correctionRoutes");
const { notFound, errorHandler } = require("./middleware/errorHandler");

const isProduction = process.env.NODE_ENV === "production";

// Browsers may only call the API from these origins (comma separated in CORS_ORIGINS).
// Without it, development allows any localhost port (Expo web) and production allows none.
// Native apps send no Origin header, so CORS doesn't affect them.
const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const isLocalhost = (origin) => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

const corsOptions = {
  origin: (origin, callback) => {
    const allowed = allowedOrigins.length > 0 ? allowedOrigins.includes(origin) : !isProduction && isLocalhost(origin);
    callback(null, allowed);
  },
};

// Limits per client IP. Behind a reverse proxy set TRUST_PROXY (e.g. 1) so the IP is the
// real client's, not the proxy's.
const limiter = (limit, windowMs, options = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later" },
    ...options,
  });

// Failed logins only, so a brute-force attempt is cut off without locking out real users.
const loginLimiter = limiter(Number(process.env.LOGIN_RATE_LIMIT) || 10, 15 * 60 * 1000, {
  skipSuccessfulRequests: true,
  message: { message: "Too many failed sign-in attempts, please try again in 15 minutes" },
});
const apiLimiter = limiter(Number(process.env.API_RATE_LIMIT) || 300, 60 * 1000);

const app = express();

app.disable("x-powered-by");
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "100kb" }));

app.use("/api", apiLimiter);
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/attendance-corrections", correctionRoutes);

app.get("/", (req, res) => {
  res.json({
    message: "Employee Management System API is running",
  });
});

// For uptime checks: says whether the API can reach the database, nothing more.
app.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(503).json({ status: "unavailable" });
  }
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
