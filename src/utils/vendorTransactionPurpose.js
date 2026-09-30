const TRANSACTION_PURPOSES = ["Company Services", "Internal General Affairs"];

const isValidTransactionPurpose = (value) =>
  value == null || TRANSACTION_PURPOSES.includes(value);

module.exports = { TRANSACTION_PURPOSES, isValidTransactionPurpose };
