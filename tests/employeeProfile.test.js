const test = require("node:test");
const assert = require("node:assert/strict");
const employeeService = require("../src/services/humanResource/employee.service");
const fileService = require("../src/services/file.service");
const { models, db1, db2 } = require("../src/models");
const { syncChildRecords } = require("../src/utils/transactionHelper");

test("employee lists use child models instead of JSON columns", () => {
  const employee = models.db1.Employee;
  for (const [field, model] of [
    ["allowances", models.db1.EmployeeAllowance],
    ["family_data", models.db1.EmployeeFamilyMember],
    ["education_history", models.db1.EmployeeEducation],
  ]) {
    assert.equal(employee.rawAttributes[field], undefined);
    assert.equal(employee.associations[field].target, model);
    assert.equal(employee.associations[field].foreignKey, "id_employee");
  }
});

test("employee list sync includes emergency contacts and skips omitted lists", async (t) => {
  const original = employeeService._syncEmployeeList;
  t.after(() => { employeeService._syncEmployeeList = original; });
  const synced = [];
  employeeService._syncEmployeeList = async (_id, items, modelName) => {
    synced.push([modelName, items]);
  };
  await employeeService._syncEmployeeLists(
    7,
    { emergency_contacts: [{ name: "A" }], family_data: [] },
    {},
    null,
    false,
  );
  assert.deepEqual(synced, [
    ["EmployeeEmergencyContact", [{ name: "A" }]],
    ["EmployeeFamilyMember", []],
  ]);
});

test("employee allowance list updates, creates, and removes rows in both databases", async (t) => {
  const primary = models.db1.EmployeeAllowance;
  const secondary = models.db2.EmployeeAllowance;
  const methods = ["findAll", "destroy", "update", "bulkCreate", "findByPk"];
  const originals = [primary, secondary].flatMap((model) =>
    methods.map((method) => [model, method, model[method]]),
  );
  t.after(() => {
    for (const [model, method, original] of originals) model[method] = original;
  });

  const calls = [];
  primary.findAll = async () => [{ id: 11 }, { id: 12 }];
  primary.destroy = async (options) => calls.push(["db1 delete", options.where.id_employee]);
  secondary.destroy = async (options) => calls.push(["db2 delete", options.where.id_employee]);
  primary.update = async (payload) => calls.push(["db1 update", payload]);
  secondary.update = async (payload) => calls.push(["db2 update", payload]);
  primary.bulkCreate = async (rows) => {
    calls.push(["db1 create", rows]);
    return [{ id: 13, toJSON: () => ({ id: 13, ...rows[0] }) }];
  };
  secondary.bulkCreate = async (rows) => calls.push(["db2 create", rows]);
  primary.findByPk = async () => ({ toJSON: () => ({ id: 11 }) });

  await employeeService._syncEmployeeList(
    7,
    [
      { id: 11, allowance: " Transport ", amount: 150000, status: "fixed" },
      { allowance: "Meal", amount: 75000, status: "non-fixed" },
    ],
    "EmployeeAllowance",
    ["allowance", "amount", "status"],
    {},
    {},
    true,
  );

  assert.deepEqual(calls, [
    ["db1 delete", 7],
    ["db2 delete", 7],
    ["db1 create", [{ id_employee: 7, allowance: "Meal", amount: "75000", status: "non-fixed" }]],
    ["db2 create", [{ id_employee: 7, allowance: "Meal", amount: "75000", status: "non-fixed", id: 13 }]],
    ["db1 update", { id_employee: 7, allowance: "Transport", amount: "150000", status: "fixed" }],
    ["db2 update", { id_employee: 7, allowance: "Transport", amount: "150000", status: "fixed" }],
  ]);
});

test("employee list rejects an item ID owned by another employee", async (t) => {
  const model = models.db1.EmployeeFamilyMember;
  const original = model.findAll;
  t.after(() => { model.findAll = original; });
  model.findAll = async () => [{ id: 4 }];

  await assert.rejects(
    employeeService._syncEmployeeList(
      7,
      [{ id: 9, name: "A", relationship: "Child", contact_number: "123", address: "B" }],
      "EmployeeFamilyMember",
      ["name", "relationship", "contact_number", "address"],
      {},
      null,
      false,
    ),
    (error) => error.statusCode === 400,
  );
});

test("employee single-database list sync writes to DB1", async (t) => {
  const primary = models.db1.EmployeeEducation;
  const secondary = models.db2.EmployeeEducation;
  const originals = [
    [primary, "findAll", primary.findAll],
    [primary, "bulkCreate", primary.bulkCreate],
    [secondary, "findAll", secondary.findAll],
    [secondary, "bulkCreate", secondary.bulkCreate],
  ];
  t.after(() => {
    for (const [model, method, original] of originals) model[method] = original;
  });

  const calls = [];
  primary.findAll = async () => [];
  primary.bulkCreate = async (rows, options) => {
    calls.push([rows, options.transaction]);
    return rows.map((row) => ({ toJSON: () => row }));
  };
  secondary.findAll = async () => { throw new Error("DB2 must not be queried"); };
  secondary.bulkCreate = async () => { throw new Error("DB2 must not be written"); };
  const transaction = {};

  await employeeService._syncEmployeeList(
    7,
    [{ level: "S1", institution: "University", major: "Math", from: 2015, to: 2019 }],
    "EmployeeEducation",
    ["level", "institution", "major", "from", "to"],
    transaction,
    null,
    false,
  );

  assert.deepEqual(calls, [[[
    { id_employee: 7, level: "S1", institution: "University", major: "Math", from: 2015, to: 2019 },
  ], transaction]]);
});

test("employee single-database create writes parent and relations to DB1", async (t) => {
  const saved = [
    [db1, "transaction", db1.transaction],
    [db2, "transaction", db2.transaction],
    [models.db1.Employee, "create", models.db1.Employee.create],
    [models.db2.Employee, "create", models.db2.Employee.create],
    [employeeService, "_syncEmployeeLists", employeeService._syncEmployeeLists],
    [employeeService, "_syncFiles", employeeService._syncFiles],
    [employeeService, "getById", employeeService.getById],
  ];
  t.after(() => {
    for (const [object, key, value] of saved) object[key] = value;
  });
  const calls = [];
  db1.transaction = async () => ({
    commit: async () => calls.push("db1 commit"),
    rollback: async () => calls.push("db1 rollback"),
  });
  db2.transaction = async () => { throw new Error("DB2 transaction must not start"); };
  models.db1.Employee.create = async () => {
    calls.push("db1 employee create");
    return { id: 42 };
  };
  models.db2.Employee.create = async () => { throw new Error("DB2 must not be written"); };
  employeeService._syncEmployeeLists = async (_id, _relations, t1, t2, both) => {
    assert.ok(t1);
    assert.equal(t2, null);
    assert.equal(both, false);
    calls.push("db1 lists");
  };
  employeeService._syncFiles = async (_id, _relations, _user, t1, t2, both) => {
    assert.ok(t1);
    assert.equal(t2, null);
    assert.equal(both, false);
    calls.push("db1 files");
  };
  employeeService.getById = async (id) => ({ id });

  const result = await employeeService.createWithRelations(
    { employee_code: "E42" },
    {},
    1,
    false,
  );
  assert.deepEqual(result, { id: 42 });
  assert.deepEqual(calls, [
    "db1 employee create",
    "db1 lists",
    "db1 files",
    "db1 commit",
  ]);
});

test("employee single-database update writes to DB1 and reads the DB1 result", async (t) => {
  const saved = [
    [db1, "transaction", db1.transaction],
    [db2, "transaction", db2.transaction],
    [models.db1.Employee, "update", models.db1.Employee.update],
    [models.db2.Employee, "update", models.db2.Employee.update],
    [employeeService, "_syncEmployeeLists", employeeService._syncEmployeeLists],
    [employeeService, "_syncFiles", employeeService._syncFiles],
    [employeeService, "getById", employeeService.getById],
  ];
  t.after(() => {
    for (const [object, key, value] of saved) object[key] = value;
  });
  const calls = [];
  db1.transaction = async () => ({ commit: async () => calls.push("db1 commit") });
  db2.transaction = async () => { throw new Error("DB2 transaction must not start"); };
  models.db1.Employee.update = async (data) => calls.push(["db1 update", data]);
  models.db2.Employee.update = async () => { throw new Error("DB2 must not be written"); };
  employeeService._syncEmployeeLists = async () => {};
  employeeService._syncFiles = async () => {};
  employeeService.getById = async (id) => ({ id, full_name: "Updated" });

  const result = await employeeService.updateWithRelations(
    42,
    { full_name: "Updated" },
    {},
    1,
    false,
  );
  assert.deepEqual(result, { id: 42, full_name: "Updated" });
  assert.deepEqual(calls, [
    ["db1 update", { full_name: "Updated" }],
    "db1 commit",
  ]);
});

test("employee reads and duplicate checks use DB1", async (t) => {
  const saved = [
    [models.db1.Employee, "findByPk", models.db1.Employee.findByPk],
    [models.db1.Employee, "findOne", models.db1.Employee.findOne],
    [models.db2.Employee, "findByPk", models.db2.Employee.findByPk],
    [models.db2.Employee, "findOne", models.db2.Employee.findOne],
  ];
  t.after(() => {
    for (const [object, key, value] of saved) object[key] = value;
  });
  models.db1.Employee.findByPk = async () => ({ toJSON: () => ({ id: 42 }) });
  models.db1.Employee.findOne = async () => ({ id: 42 });
  models.db2.Employee.findByPk = async () => { throw new Error("DB2 must not be queried"); };
  models.db2.Employee.findOne = async () => { throw new Error("DB2 must not be queried"); };

  assert.deepEqual(await employeeService.getById(42), { id: 42 });
  assert.equal((await employeeService.findDuplicate("E42", "42")).id, 42);
});

test("shared child-record helper uses Model1 for single-database sync", async () => {
  const calls = [];
  const transaction1 = {};
  const Model1 = {
    findAll: async () => [{ id: 1 }, { id: 2 }],
    destroy: async (options) => calls.push(["delete", options.where.id, options.transaction]),
    bulkCreate: async (rows, options) => {
      calls.push(["create", rows, options.transaction]);
      return rows.map((row) => ({ toJSON: () => row }));
    },
    update: async (data, options) => calls.push(["update", data, options.transaction]),
    findByPk: async () => ({ toJSON: () => ({ id: 1 }) }),
  };

  const result = await syncChildRecords({
    Model1,
    Model2: null,
    foreignKey: "id_employee",
    parentId: 42,
    newData: [{ id: 1, name: "Updated" }, { name: "New" }],
    transaction1,
    transaction2: null,
    isDoubleDatabase: false,
  });

  assert.deepEqual(calls, [
    ["delete", [2], transaction1],
    ["create", [{ name: "New", id_employee: 42 }], transaction1],
    ["update", { name: "Updated", id_employee: 42 }, transaction1],
  ]);
  assert.deepEqual(result.summary, {
    totalCreated: 1,
    totalUpdated: 1,
    totalDeleted: 1,
  });
});

test("employee file sync stays on DB1 in single-database mode", async (t) => {
  const primary = models.db1.File;
  const secondary = models.db2.File;
  const saved = [
    [primary, "findAll", primary.findAll],
    [primary, "create", primary.create],
    [secondary, "findAll", secondary.findAll],
    [secondary, "create", secondary.create],
  ];
  t.after(() => {
    for (const [object, key, value] of saved) object[key] = value;
  });
  primary.findAll = async () => [];
  let savedFile;
  primary.create = async (payload) => {
    savedFile = payload;
    return { toJSON: () => payload };
  };
  secondary.findAll = async () => { throw new Error("DB2 must not be queried"); };
  secondary.create = async () => { throw new Error("DB2 must not be written"); };

  await fileService.syncFiles(
    "employees",
    42,
    [{ original_name: "ktp.pdf", stored_name: "a.pdf", url: "/files/employee/a.pdf", mime_type: "application/pdf", size: 10 }],
    { category: "files_ktp", isDoubleDatabase: false },
    {},
    null,
  );
  assert.equal(savedFile.fileable_id, 42);
  assert.equal(savedFile.category, "files_ktp");
});
