// Shared setup for the API tests. Only ever runs against TEST_DATABASE_URL (see scripts/test.js).
const request = require("supertest");
const app = require("../src/app");
const prisma = require("../src/utils/prisma");
const authService = require("../src/services/authService");

const PASSWORD = "Correct-horse-42";

const resetDatabase = () =>
  prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AttendanceCorrection", "Attendance", "LeaveRequest", "Admin", "Employee" RESTART IDENTITY CASCADE'
  );

const employee = (code, firstName, managerId = null) =>
  prisma.employee.create({
    data: {
      employeeId: code,
      firstName,
      lastName: "Test",
      email: `${code.toLowerCase()}@example.com`,
      hireDate: new Date("2024-01-15"),
      managerId,
    },
  });

const account = async (email, role, employeeId = null) =>
  prisma.admin.create({
    data: { email, name: email.split("@")[0], role, employeeId, passwordHash: await authService.hashPassword(PASSWORD) },
  });

const leave = (employeeId, status = "PENDING") =>
  prisma.leaveRequest.create({
    data: {
      employeeId,
      type: "Annual",
      startDate: new Date("2026-11-02"),
      endDate: new Date("2026-11-04"),
      days: 3,
      reason: "Family trip",
      status,
      decidedAt: status === "PENDING" ? null : new Date("2026-10-01T10:00:00Z"),
    },
  });

// Two managers with their own teams, an HR admin, and a manager account whose employee is gone.
const seedFixtures = async () => {
  await resetDatabase();

  const managerA = await employee("MGR-A", "Alice");
  const managerB = await employee("MGR-B", "Bob");
  const a1 = await employee("A-1", "Amir", managerA.id);
  const a2 = await employee("A-2", "Ayesha", managerA.id);
  const b1 = await employee("B-1", "Bilal", managerB.id);

  await account("hr@example.com", "HR_ADMIN");
  await account("manager.a@example.com", "MANAGER", managerA.id);
  await account("manager.b@example.com", "MANAGER", managerB.id);
  await account("unlinked@example.com", "MANAGER", null);

  const leaveA1 = await leave(a1.id);
  const leaveA2 = await leave(a2.id);
  const leaveB1 = await leave(b1.id);
  const approvedA1 = await leave(a1.id, "APPROVED");

  return { managerA, managerB, a1, a2, b1, leaveA1, leaveA2, leaveB1, approvedA1 };
};

const login = async (email) => {
  const res = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status}`);
  return { Authorization: `Bearer ${res.body.token}` };
};

module.exports = { app, prisma, request, PASSWORD, resetDatabase, seedFixtures, login };
