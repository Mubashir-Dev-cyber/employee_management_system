// Runs the API tests against TEST_DATABASE_URL. Run from backend: npm test
// The test database is wiped on every run, so this refuses anything that could be the real one.
require("dotenv").config({ quiet: true });

const path = require("path");
const { spawnSync } = require("child_process");

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  fail("TEST_DATABASE_URL is not set. Add it to backend/.env (see .env.example).");
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(testUrl).pathname.slice(1));
} catch {
  fail("TEST_DATABASE_URL is not a valid URL.");
}

if (testUrl === process.env.DATABASE_URL || !databaseName.endsWith("_test")) {
  fail(`Refusing to run: the test database name must end in "_test" and differ from DATABASE_URL.`);
}

const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  NODE_ENV: "test",
  JWT_SECRET: process.env.JWT_SECRET || "test-only-secret-that-is-long-enough-1234",
  LOGIN_RATE_LIMIT: "5",
  API_RATE_LIMIT: "10000",
  // The attendance tests expect the default shift, whatever .env says.
  SHIFT_START: "09:00",
  SHIFT_END: "17:00",
  LATE_GRACE_MINUTES: "5",
  COMPANY_TIMEZONE: "Asia/Karachi",
};

const run = (args) => spawnSync(process.execPath, args, { env, stdio: "inherit", cwd: path.join(__dirname, "..") });

// Creates the test database if needed and brings its tables up to date.
const prismaCli = require.resolve("prisma/build/index.js");
if (run([prismaCli, "migrate", "deploy"]).status !== 0) fail("Could not migrate the test database.");

const result = run(["--test", "--test-concurrency=1", "tests/**/*.test.js"]);
process.exit(result.status ?? 1);
