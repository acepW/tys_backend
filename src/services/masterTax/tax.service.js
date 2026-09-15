const { Op } = require("sequelize");
const DualDatabaseService = require("../dualDatabase.service");
const { models } = require("../../models");

class TaxService extends DualDatabaseService {
  constructor() {
    super("Tax");
  }

  async getActiveRates(codes, transaction = null) {
    const normalizedCodes = [...new Set(codes.map((code) => code.toUpperCase()))];
    if (normalizedCodes.length === 0) return {};

    const taxes = await models.db1.Tax.findAll({
      where: {
        code: { [Op.in]: normalizedCodes },
        is_active: true,
      },
      transaction,
    });

    const rates = Object.fromEntries(
      taxes.map((tax) => [tax.code.toUpperCase(), Number(tax.rate)]),
    );
    const missingCodes = normalizedCodes.filter((code) => rates[code] === undefined);

    if (missingCodes.length > 0) {
      const error = new Error(
        `Active tax master not found for: ${missingCodes.join(", ")}`,
      );
      error.statusCode = 422;
      throw error;
    }

    return rates;
  }

  async calculate(subTotal, taxPpn, taxPph23, transaction = null) {
    const requestedCodes = [];
    if (taxPpn) requestedCodes.push("PPN");
    if (taxPph23) requestedCodes.push("PPH_23");

    const rates = await this.getActiveRates(requestedCodes, transaction);
    const ppnRate = taxPpn ? rates.PPN : 0;
    const pphRate = taxPph23 ? rates.PPH_23 : 0;

    return {
      ppnRate,
      pphRate,
      ppn: taxPpn ? Math.round(Number(subTotal) * (ppnRate / 100)) : 0,
      pph: taxPph23 ? Math.round(Number(subTotal) * (pphRate / 100)) : 0,
    };
  }
}

module.exports = new TaxService();
