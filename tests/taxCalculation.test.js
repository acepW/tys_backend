const test = require("node:test");
const assert = require("node:assert/strict");
const taxService = require("../src/services/masterTax/tax.service");

test("PP 20 and PPH 4 ayat 2 are calculated as invoice deductions", async (t) => {
  const originalGetActiveRates = taxService.getActiveRates;
  t.after(() => {
    taxService.getActiveRates = originalGetActiveRates;
  });

  taxService.getActiveRates = async (codes) => {
    assert.deepEqual(codes, ["PPN", "PPH_23", "PP_20", "PPH_4_AYAT_2"]);
    return {
      PPN: 11,
      PPH_23: 2,
      PP_20: 0.5,
      PPH_4_AYAT_2: 2.5,
    };
  };

  const result = await taxService.calculate(
    100000,
    true,
    true,
    null,
    true,
    true,
  );

  assert.equal(result.ppn, 11000);
  assert.equal(result.pph, 2000);
  assert.equal(result.pp_20, 500);
  assert.equal(result.pph_4_ayat_2, 2500);
  assert.equal(result.total, 106000);
});

test("new invoice deductions default to zero for existing callers", async (t) => {
  const originalGetActiveRates = taxService.getActiveRates;
  t.after(() => {
    taxService.getActiveRates = originalGetActiveRates;
  });

  taxService.getActiveRates = async (codes) => {
    assert.deepEqual(codes, ["PPH_23"]);
    return { PPH_23: 2 };
  };

  const result = await taxService.calculate(100000, false, true);

  assert.equal(result.pph, 2000);
  assert.equal(result.pp_20, 0);
  assert.equal(result.pph_4_ayat_2, 0);
});
