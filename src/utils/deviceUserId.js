const getNextDeviceUserId = (deviceUserIds = []) => {
  let highestId = 0n;

  for (const value of deviceUserIds) {
    const normalizedValue = String(value ?? "").trim();
    if (!/^\d+$/.test(normalizedValue)) continue;

    const numericValue = BigInt(normalizedValue);
    if (numericValue > highestId) highestId = numericValue;
  }

  return String(highestId + 1n);
};

module.exports = { getNextDeviceUserId };
