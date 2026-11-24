// Master of the interview report form (docs/recruitment-interview-requirement.md,
// fase H-B), against an in-memory table (single database).
const test = require("node:test");
const assert = require("node:assert/strict");
const { Op } = require("sequelize");
const service = require("../src/services/humanResource/recruitment/reportItem.service");
const { models, db1 } = require("../src/models");

function mockItems(t, rows) {
  const Model = models.db1.RecruitmentReportItem;
  const kept = ["findAll", "findByPk", "count", "max", "create", "update"].map((key) => [key, Model[key]]);
  const keptTransaction = db1.transaction;
  t.after(() => {
    for (const [key, value] of kept) Model[key] = value;
    db1.transaction = keptTransaction;
  });
  const table = rows.map((row) => ({ ...row }));
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) =>
    value && typeof value === "object" && Op.ne in value ? row[key] != value[Op.ne] : (row[key] ?? null) === value);
  Model.findAll = async ({ where }) =>
    table.filter((row) => matches(row, where)).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id).map((row) => ({ ...row }));
  Model.findByPk = async (id) => (table.find((row) => row.id == id) ? { ...table.find((row) => row.id == id) } : null);
  Model.count = async ({ where }) => table.filter((row) => matches(row, where)).length;
  Model.max = async (field) => Math.max(0, ...table.map((row) => row[field]));
  Model.create = async (data) => {
    const row = { id: Math.max(0, ...table.map((item) => item.id)) + 1, ...data };
    table.push(row);
    return { ...row };
  };
  Model.update = async (data, { where }) => {
    const rows = table.filter((row) => matches(row, where));
    for (const row of rows) Object.assign(row, data);
    return [rows.length];
  };
  db1.transaction = async () => ({ LOCK: { UPDATE: "UPDATE" }, commit: async () => {}, rollback: async () => {} });
  return table;
}

const item = (id, section, group, name, data = {}) => ({
  id, section, group_name: group, group_description: group ? `${group} desc` : null, item_name: name,
  item_description: null, is_optional: false, sort_order: id * 10, is_active: true, ...data,
});
const items = () => [
  item(1, "Gaya Kerja", "Respon terhadap Lingkungan", "Adaptasi"),
  item(2, "Gaya Kerja", "Respon terhadap Lingkungan", "Komunikasi"),
  item(3, "Gaya Kerja", "Respon terhadap Tekanan", "Emosi"),
  item(4, "Pola Kerja", null, "Produktivitas", { is_optional: true, item_description: "Kuantitas" }),
  item(5, "Hasil Interview", "Faktor Utama", "Motivasi"),
  item(6, "Hasil Interview", "Faktor Lain", "Kemampuan Memimpin", { is_optional: true }),
  item(7, "Hasil Interview", "Faktor Utama", "Etika lama", { is_active: false }),
];

const fails = (status, pattern) => (error) => error.statusCode === status && pattern.test(error.message);

test("the form groups active items by section, then group, with the KS–BS scale", async (t) => {
  mockItems(t, items());
  const form = await service.form();
  assert.deepEqual(form.scale.map((option) => option.value), ["KS", "K", "C", "B", "BS"]);
  assert.deepEqual(
    form.sections.map((section) => [section.name, section.groups.map((group) => [group.name, group.items.map((row) => row.name)])]),
    [
      ["Gaya Kerja", [["Respon terhadap Lingkungan", ["Adaptasi", "Komunikasi"]], ["Respon terhadap Tekanan", ["Emosi"]]]],
      ["Pola Kerja", [[null, ["Produktivitas"]]]],
      ["Hasil Interview", [["Faktor Utama", ["Motivasi"]], ["Faktor Lain", ["Kemampuan Memimpin"]]]],
    ],
  );
  assert.deepEqual(form.sections[1].groups[0].items[0], { id: 4, name: "Produktivitas", description: "Kuantitas", is_optional: true });
  assert.equal(form.sections[0].groups[0].description, "Respon terhadap Lingkungan desc");
  assert.equal((await service.list()).length, 6);
  assert.equal((await service.list({ includeInactive: true })).length, 7);
});

test("HR adds an item; it goes last unless sort_order is given", async (t) => {
  const table = mockItems(t, items());
  const created = await service.create({ section: " Hasil  Interview ", group_name: "Faktor Lain", item_name: "Bahasa Inggris", is_optional: true }, false);
  assert.deepEqual([created.section, created.sort_order, created.is_optional, created.is_active], ["Hasil Interview", 80, true, true]);
  await service.create({ section: "Pola Kerja", item_name: "Ketelitian", sort_order: 45 }, false);
  assert.deepEqual((await service.list()).map((row) => row.item_name).slice(3, 5), ["Produktivitas", "Ketelitian"]);
  assert.equal(table.length, 9);
});

test("an item needs a section and a name, unique within its section and group", async (t) => {
  mockItems(t, items());
  await assert.rejects(service.create({ item_name: "X" }, false), fails(400, /section is required/));
  await assert.rejects(service.create({ section: "Pola Kerja", item_name: " " }, false), fails(400, /item_name is required/));
  await assert.rejects(service.create({ section: "Gaya Kerja", group_name: "Respon terhadap Lingkungan", item_name: "Adaptasi" }, false),
    fails(400, /already exists/));
  // The same name in another group, or as an inactive item, is fine.
  await service.create({ section: "Gaya Kerja", group_name: "Respon terhadap Tekanan", item_name: "Adaptasi" }, false);
  await service.create({ section: "Hasil Interview", group_name: "Faktor Utama", item_name: "Etika lama" }, false);
  await assert.rejects(service.create({ section: "Pola Kerja", item_name: "Y", sort_order: -1 }, false),
    fails(400, /sort_order must be a whole number/));
  await assert.rejects(service.create({ section: "Pola Kerja", item_name: "Y", is_optional: "yes" }, false),
    fails(400, /is_optional must be true or false/));
});

test("HR edits and deactivates an item; reactivating checks the name again", async (t) => {
  const table = mockItems(t, items());
  await service.update(4, { item_description: "Jumlah pekerjaan", is_optional: false }, false);
  assert.deepEqual([table[3].item_description, table[3].is_optional, table[3].item_name], ["Jumlah pekerjaan", false, "Produktivitas"]);
  await assert.rejects(service.update(4, { section: "" }, false), fails(400, /section is required/));
  await assert.rejects(service.update(2, { item_name: "Adaptasi" }, false), fails(400, /already exists/));
  await service.deactivate(1, false);
  assert.equal(table[0].is_active, false);
  assert.ok(!(await service.list()).some((row) => row.id === 1));
  await service.update(2, { item_name: "Adaptasi" }, false); // free now that item 1 is inactive
  await assert.rejects(service.update(1, { is_active: true }, false), fails(400, /already exists/));
  await assert.rejects(service.update(99, {}, false), fails(404, /not found/));
});
