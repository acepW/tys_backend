const test = require("node:test");
const assert = require("node:assert/strict");
const { getNextDeviceUserId } = require("../src/utils/deviceUserId");

test("returns one when no device user ID exists", () => {
  assert.equal(getNextDeviceUserId([]), "1");
});

test("returns the number after the highest numeric device user ID", () => {
  assert.equal(getNextDeviceUserId(["2", "10", "7"]), "11");
});

test("ignores blank and nonnumeric device user IDs", () => {
  assert.equal(getNextDeviceUserId([null, "", "EMP-12", "004"]), "5");
});

test("supports device user IDs larger than JavaScript safe integers", () => {
  assert.equal(
    getNextDeviceUserId(["9007199254740992"]),
    "9007199254740993",
  );
});
