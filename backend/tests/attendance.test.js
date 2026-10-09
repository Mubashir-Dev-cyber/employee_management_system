const { after, before, describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { app, prisma, request, seedFixtures, login } = require("./helpers");
const {
  addDays,
  asDbDate,
  fromCompanyTime,
  isDateKey,
  isWeekend,
  toCompanyTime,
  todayKey,
} = require("../src/utils/companyTime");
const { attendanceStatus } = require("../src/utils/attendanceRules");

// A fixed past week: Tuesday 10 March 2026 is a work day, Saturday 14 March is not.
const TUESDAY = "2026-03-10";
const SATURDAY = "2026-03-14";

const at = (dateKey, time) => fromCompanyTime(dateKey, time);

const checkIn = (employeeId, dateKey, inTime, outTime = null) =>
  prisma.attendance.create({
    data: {
      employeeId,
      date: asDbDate(dateKey),
      checkIn: at(dateKey, inTime),
      checkOut: outTime ? at(dateKey, outTime) : null,
    },
  });

const approvedLeave = (employeeId, dateKey) =>
  prisma.leaveRequest.create({
    data: {
      employeeId,
      type: "Sick",
      startDate: asDbDate(dateKey),
      endDate: asDbDate(dateKey),
      days: 1,
      status: "APPROVED",
      decidedAt: new Date(),
    },
  });

describe("status rules", () => {
  const noon = at(TUESDAY, "12:00");
  const base = { dateKey: TUESDAY, hireDateKey: "2024-01-15", onLeave: false, record: null, now: noon };

  test("weekends and days before hiring are off", () => {
    assert.equal(attendanceStatus({ ...base, dateKey: SATURDAY }), "OFF");
    assert.equal(attendanceStatus({ ...base, hireDateKey: "2026-03-11" }), "OFF");
  });

  test("approved leave wins over everything else on a work day", () => {
    assert.equal(attendanceStatus({ ...base, onLeave: true, record: { checkIn: at(TUESDAY, "09:00") } }), "ON_LEAVE");
  });

  test("late means more than 5 minutes after 09:00", () => {
    assert.equal(attendanceStatus({ ...base, record: { checkIn: at(TUESDAY, "08:40") } }), "PRESENT");
    assert.equal(attendanceStatus({ ...base, record: { checkIn: at(TUESDAY, "09:05") } }), "PRESENT");
    assert.equal(attendanceStatus({ ...base, record: { checkIn: at(TUESDAY, "09:06") } }), "LATE");
  });

  test("no check-in is 'not in yet' until the shift ends, then absent", () => {
    assert.equal(attendanceStatus(base), "NOT_IN");
    assert.equal(attendanceStatus({ ...base, now: at(TUESDAY, "16:59") }), "NOT_IN");
    assert.equal(attendanceStatus({ ...base, now: at(TUESDAY, "17:00") }), "ABSENT");
    assert.equal(attendanceStatus({ ...base, dateKey: "2026-03-09" }), "ABSENT");
  });
});

describe("company time", () => {
  test("converts Pakistan time to UTC and back", () => {
    assert.equal(at(TUESDAY, "09:00").toISOString(), "2026-03-10T04:00:00.000Z");
    assert.equal(at(TUESDAY, "02:30").toISOString(), "2026-03-09T21:30:00.000Z");
    assert.equal(toCompanyTime(new Date("2026-03-10T04:00:00Z")), "09:00");
    assert.equal(todayKey(new Date("2026-03-10T20:00:00Z")), "2026-03-11");
  });

  test("day keys", () => {
    assert.equal(isDateKey("2026-02-28"), true);
    assert.equal(isDateKey("2026-02-30"), false);
    assert.equal(isDateKey("2026-2-3"), false);
    assert.equal(addDays("2026-02-28", 1), "2026-03-01");
    assert.equal(isWeekend(SATURDAY), true);
    assert.equal(isWeekend(TUESDAY), false);
  });
});

describe("attendance API", () => {
  let data;
  let managerA;
  let managerB;
  let hr;

  // Days inside the 7-day correction window. Any 6 days in a row include work days and a weekend day.
  const today = todayKey();
  const recent = [1, 2, 3, 4, 5, 6].map((i) => addDays(today, -i));
  const [workday, otherWorkday] = recent.filter((day) => !isWeekend(day));
  const weekendDay = recent.find((day) => isWeekend(day));

  const correction = (overrides = {}) => ({
    employeeId: data.a1.id,
    date: workday,
    checkIn: "09:00",
    checkOut: "17:00",
    reason: "Fingerprint machine was down",
    ...overrides,
  });

  const requestCorrection = (headers, body) =>
    request(app).post("/api/manager/attendance-corrections").set(headers).send(body);

  const decide = (id, body) => request(app).patch(`/api/attendance-corrections/${id}`).set(hr).send(body);

  const dayView = async (dateKey, headers = managerA) => {
    const res = await request(app).get(`/api/manager/attendance?date=${dateKey}`).set(headers);
    assert.equal(res.status, 200);
    return Object.fromEntries(res.body.rows.map((row) => [row.employee.employeeId, row.record]));
  };

  before(async () => {
    data = await seedFixtures();
    managerA = await login("manager.a@example.com");
    managerB = await login("manager.b@example.com");
    hr = await login("hr@example.com");

    await checkIn(data.a1.id, TUESDAY, "09:20", "17:10");
    await checkIn(data.b1.id, TUESDAY, "08:50", "17:00");
    await approvedLeave(data.a2.id, "2026-03-11");
  });
  after(() => prisma.$disconnect());

  describe("viewing a day", () => {
    test("shows only the manager's team, with statuses and counts", async () => {
      const res = await request(app).get(`/api/manager/attendance?date=${TUESDAY}`).set(managerA);

      assert.equal(res.status, 200);
      assert.equal(res.body.date, TUESDAY);
      assert.equal(res.body.workday, true);
      assert.equal(res.body.shift.start, "09:00");
      assert.deepEqual(
        res.body.rows.map((row) => row.employee.employeeId),
        ["A-1", "A-2"]
      );

      const [amir, ayesha] = res.body.rows.map((row) => row.record);
      assert.deepEqual(
        { status: amir.status, checkIn: amir.checkIn, checkOut: amir.checkOut },
        { status: "LATE", checkIn: "09:20", checkOut: "17:10" }
      );
      assert.equal(ayesha.status, "ABSENT");
      assert.equal(amir.correctable, false); // too long ago
      assert.equal(res.body.counts.LATE, 1);
      assert.equal(res.body.counts.ABSENT, 1);
      assert.equal(res.body.counts.PRESENT, 0);
    });

    test("approved leave shows as on leave", async () => {
      const records = await dayView("2026-03-11");
      assert.equal(records["A-2"].status, "ON_LEAVE");
    });

    test("a weekend is not a work day", async () => {
      const res = await request(app).get(`/api/manager/attendance?date=${SATURDAY}`).set(managerA);

      assert.equal(res.body.workday, false);
      assert.ok(res.body.rows.every((row) => row.record.status === "OFF"));
      assert.equal(res.body.counts.OFF, 2);
    });

    test("defaults to today and refuses bad or future dates", async () => {
      const res = await request(app).get("/api/manager/attendance").set(managerA);
      assert.equal(res.status, 200);
      assert.equal(res.body.date, today);

      for (const date of ["abc", "2026-13-01", "2026-02-30", addDays(today, 1)]) {
        const bad = await request(app).get(`/api/manager/attendance?date=${date}`).set(managerA);
        assert.equal(bad.status, 400, date);
      }
    });
  });

  describe("a member's history", () => {
    test("returns the last 7 days, newest first", async () => {
      const res = await request(app).get(`/api/manager/team/${data.a1.id}/attendance`).set(managerA);

      assert.equal(res.status, 200);
      assert.equal(res.body.records.length, 7);
      assert.equal(res.body.records[0].date, today);
      assert.equal(res.body.records[6].date, addDays(today, -6));
    });

    test("checks days and the team", async () => {
      const url = `/api/manager/team/${data.a1.id}/attendance`;
      assert.equal((await request(app).get(`${url}?days=31`).set(managerA)).body.records.length, 31);

      for (const days of ["0", "32", "abc", "1.5"]) {
        assert.equal((await request(app).get(`${url}?days=${days}`).set(managerA)).status, 400, days);
      }

      const other = await request(app).get(`/api/manager/team/${data.b1.id}/attendance`).set(managerA);
      assert.equal(other.status, 404);
    });
  });

  describe("correction requests", () => {
    let amirCorrection;

    test("a manager can ask HR to fix a recent day", async () => {
      await checkIn(data.a1.id, workday, "09:40", "17:30");

      const res = await requestCorrection(managerA, correction());

      assert.equal(res.status, 201);
      amirCorrection = res.body.correction;
      assert.equal(amirCorrection.status, "PENDING");
      assert.equal(amirCorrection.employeeId, "A-1");
      assert.equal(amirCorrection.requestedBy, "Alice Test");
      assert.deepEqual(amirCorrection.requested, { checkIn: "09:00", checkOut: "17:00" });
      assert.deepEqual(amirCorrection.before, { checkIn: "09:40", checkOut: "17:30" });

      // Nothing changes until HR approves, and the day shows the waiting request.
      const records = await dayView(workday);
      assert.equal(records["A-1"].checkIn, "09:40");
      assert.equal(records["A-1"].status, "LATE");
      assert.deepEqual(records["A-1"].correction, { id: amirCorrection.id, status: "PENDING" });
      assert.equal(records["A-1"].correctable, false);
      assert.equal(records["A-2"].correctable, true);
    });

    test("only one request per day can wait for HR", async () => {
      const res = await requestCorrection(managerA, correction({ checkIn: "08:55" }));
      assert.equal(res.status, 409);
    });

    test("can't ask for another team's member", async () => {
      const res = await requestCorrection(managerA, correction({ employeeId: data.b1.id }));
      assert.equal(res.status, 404);
    });

    test("only work days in the last 7 days, not on leave", async () => {
      const tooOld = await requestCorrection(managerA, correction({ date: addDays(today, -7) }));
      assert.equal(tooOld.status, 400);
      assert.match(tooOld.body.message, /last 7 days/);

      assert.equal((await requestCorrection(managerA, correction({ date: addDays(today, 1) }))).status, 400);
      assert.equal((await requestCorrection(managerA, correction({ date: weekendDay }))).status, 400);
      assert.equal((await requestCorrection(managerA, correction({ date: today, checkIn: "23:58", checkOut: "23:59" }))).status, 400);

      await approvedLeave(data.a1.id, otherWorkday);
      const onLeave = await requestCorrection(managerA, correction({ date: otherWorkday }));
      assert.equal(onLeave.status, 409);
    });

    test("validates the request", async () => {
      const bodies = [
        correction({ checkIn: "09:00", checkOut: "08:00" }),
        correction({ checkIn: "9:00" }),
        correction({ checkIn: "24:00" }),
        correction({ reason: "  " }),
        correction({ reason: undefined }),
        correction({ date: "2026-02-30" }),
        correction({ employeeId: "1" }),
      ];

      for (const body of bodies) {
        assert.equal((await requestCorrection(managerA, body)).status, 422, JSON.stringify(body));
      }
    });

    test("a manager lists only their team's requests", async () => {
      const mine = await request(app).get("/api/manager/attendance-corrections").set(managerA);
      assert.equal(mine.status, 200);
      assert.deepEqual(
        mine.body.corrections.map((c) => c.id),
        [amirCorrection.id]
      );

      const theirs = await request(app).get("/api/manager/attendance-corrections").set(managerB);
      assert.deepEqual(theirs.body.corrections, []);

      assert.equal((await request(app).get("/api/manager/attendance-corrections?status=NOPE").set(managerA)).status, 400);
    });
  });

  describe("HR decisions", () => {
    let amirId;
    let bilalId;

    before(async () => {
      const bilal = await requestCorrection(managerB, correction({ employeeId: data.b1.id, checkOut: null }));
      assert.equal(bilal.status, 201);
      bilalId = bilal.body.correction.id;

      const pending = await request(app).get("/api/attendance-corrections?status=PENDING").set(hr);
      amirId = pending.body.corrections.find((c) => c.employeeId === "A-1").id;
    });

    test("HR sees every team's waiting requests", async () => {
      const res = await request(app).get("/api/attendance-corrections?status=PENDING").set(hr);

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.corrections.map((c) => c.employeeId).sort(), ["A-1", "B-1"]);
    });

    test("approving changes the record and keeps the old times", async () => {
      const res = await decide(amirId, { status: "APPROVED", note: "Checked with security" });

      assert.equal(res.status, 200);
      assert.equal(res.body.correction.status, "APPROVED");
      assert.equal(res.body.correction.decidedBy, "hr");
      assert.equal(res.body.correction.decisionNote, "Checked with security");
      assert.deepEqual(res.body.correction.before, { checkIn: "09:40", checkOut: "17:30" });

      const stored = await prisma.attendanceCorrection.findUnique({ where: { id: amirId } });
      assert.equal(stored.decidedById, (await prisma.admin.findUnique({ where: { email: "hr@example.com" } })).id);

      const records = await dayView(workday);
      assert.equal(records["A-1"].checkIn, "09:00");
      assert.equal(records["A-1"].checkOut, "17:00");
      assert.equal(records["A-1"].status, "PRESENT");
      assert.deepEqual(records["A-1"].correction, { id: amirId, status: "APPROVED" });
      assert.equal(records["A-1"].correctable, true);
    });

    test("a request is decided only once", async () => {
      assert.equal((await decide(amirId, { status: "REJECTED" })).status, 409);
    });

    test("rejecting leaves the record as it was", async () => {
      const res = await decide(bilalId, { status: "REJECTED", note: "No proof" });

      assert.equal(res.status, 200);
      assert.equal(res.body.correction.status, "REJECTED");
      const record = await prisma.attendance.findUnique({
        where: { employeeId_date: { employeeId: data.b1.id, date: asDbDate(workday) } },
      });
      assert.equal(record, null);
    });

    test("without a check-out, approving keeps the recorded one", async () => {
      await checkIn(data.a2.id, workday, "10:00", "17:30");
      const sent = await requestCorrection(managerA, correction({ employeeId: data.a2.id, checkOut: undefined }));
      assert.equal(sent.status, 201);

      await decide(sent.body.correction.id, { status: "APPROVED" });

      const records = await dayView(workday);
      assert.equal(records["A-2"].checkIn, "09:00");
      assert.equal(records["A-2"].checkOut, "17:30");
    });

    test("checks the id and the decision", async () => {
      assert.equal((await decide(99999, { status: "APPROVED" })).status, 404);
      assert.equal((await decide("abc", { status: "APPROVED" })).status, 400);
      assert.equal((await decide(amirId, { status: "MAYBE" })).status, 422);
    });
  });

  test("can't correct a day before the employee was hired", async () => {
    const newcomer = await prisma.employee.create({
      data: {
        employeeId: "A-3",
        firstName: "Asad",
        lastName: "Test",
        email: "a-3@example.com",
        hireDate: asDbDate(today),
        managerId: data.managerA.id,
      },
    });

    const res = await requestCorrection(managerA, correction({ employeeId: newcomer.id }));
    assert.equal(res.status, 400);
    assert.match(res.body.message, /before the employee was hired/);
  });
});
