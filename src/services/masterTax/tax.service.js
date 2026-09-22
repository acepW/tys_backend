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

  async calculate(
    subTotal,
    taxPpn,
    taxPph23,
    transaction = null,
    taxPp20 = false,
    taxPph4Ayat2 = false,
  ) {
    const requestedCodes = [];
    if (taxPpn) requestedCodes.push("PPN");
    if (taxPph23) requestedCodes.push("PPH_23");
    if (taxPp20) requestedCodes.push("PP_20");
    if (taxPph4Ayat2) requestedCodes.push("PPH_4_AYAT_2");

    const rates = await this.getActiveRates(requestedCodes, transaction);
    const ppnRate = taxPpn ? rates.PPN : 0;
    const pphRate = taxPph23 ? rates.PPH_23 : 0;
    const pp20Rate = taxPp20 ? rates.PP_20 : 0;
    const pph4Ayat2Rate = taxPph4Ayat2 ? rates.PPH_4_AYAT_2 : 0;
    const numericSubTotal = Number(subTotal);
    const ppn = taxPpn ? Math.round(numericSubTotal * (ppnRate / 100)) : 0;
    const pph = taxPph23 ? Math.round(numericSubTotal * (pphRate / 100)) : 0;
    const pp20 = taxPp20
      ? Math.round(numericSubTotal * (pp20Rate / 100))
      : 0;
    const pph4Ayat2 = taxPph4Ayat2
      ? Math.round(numericSubTotal * (pph4Ayat2Rate / 100))
      : 0;

    return {
      ppnRate,
      pphRate,
      pp20Rate,
      pph4Ayat2Rate,
      ppn,
      pph,
      pp_20: pp20,
      pph_4_ayat_2: pph4Ayat2,
      total: numericSubTotal + ppn - pph - pp20 - pph4Ayat2,
    };
  }
}

module.exports = new TaxService();
