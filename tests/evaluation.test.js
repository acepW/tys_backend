const test = require("node:test");
const assert = require("node:assert/strict");
const controller = require("../src/controllers/humanResource/evaluation.controller");
const service = require("../src/services/humanResource/evaluation.service");
const { models } = require("../src/models");

function response() {
  return {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return body; },
  };
}

test("evaluation create requires a valid type", async () => {
  const res = response();
  await controller.create({ body: { type: "monthly", id_employee: 1 }, user: { id: 5 } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /type must be probation or annual/);
});

test("evaluation create validates counts", async () => {
  const res = response();
  await controller.create({ body: { type: "probation", id_employee: 1, sick_days: -1 }, user: { id: 5 } }, res);
  assert.equal(res.code, 400);
  assert.match(res.body.message, /sick_days must be a non-negative integer/);
});

test("evaluation defaults position, department and hire date from the employee", async (t) => {
  const originals = {
    employee: models.db1.Employee.findByPk,
    create: models.db1.Evaluation.create,
    getById: service.getById,
  };
  t.after(() => {
    models.db1.Employee.findByPk = originals.employee;
    models.db1.Evaluation.create = originals.create;
    service.getById = originals.getById;
  });
  models.db1.Employee.findByPk = async () => ({ id_position: 3, id_department: 4, hire_date: "2026-07-01" });
  let saved;
  models.db1.Evaluation.create = async (data) => { saved = data; return { id: 10, toJSON: () => ({ id: 10 }) }; };
  service.getById = async (id) => ({ id });

  const res = response();
  await controller.create({
    body: { type: "annual", id_employee: 1, id_department: 9, working_days: 66, present_days: 60, late_minutes: 45,
      attendance_assessment: "87.5", is_double_database: false },
    user: { id: 5 },
  }, res);

  assert.equal(res.code, 201);
  assert.equal(saved.id_position, 3);
  assert.equal(saved.id_department, 9);
  assert.equal(saved.hire_date, "2026-07-01");
  assert.equal(saved.sick_days, 0);
  assert.equal(saved.type, "annual");
  assert.equal(saved.late_minutes, 45);
  assert.equal(saved.attendance_assessment, 87.5);
  assert.equal(saved.id_user_create, 5);
});
