const quotationService = require("../services/quotation/quotation.service");
const { successResponse, errorResponse } = require("../utils/response");
const { Op } = require("sequelize");

class QuotationController {
  /**
   * Get all quotations
   */
  async getAll(req, res) {
    try {
      const {
        is_double_database,
        id_company,
        id_customer,
        status,
        search,
        date_from,
        date_to,
        page,
        limit,
      } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      let obj = {};

      // Search by quotation number or title
      if (search) {
        obj = {
          [Op.or]: [
            { quotation_no: { [Op.like]: `%${search}%` } },
            { quotation_title_indo: { [Op.like]: `%${search}%` } },
            { quotation_title_mandarin: { [Op.like]: `%${search}%` } },
          ],
        };
      }

      // Filter by company
      if (id_company) obj.id_company = id_company;

      // Filter by customer
      if (id_customer) obj.id_customer = id_customer;

      // Filter by status
      if (status) obj.status = status;

      // Filter by date range
      if (date_from || date_to) {
        obj.date = {};
        if (date_from) obj.date[Op.gte] = date_from;
        if (date_to) obj.date[Op.lte] = date_to;
      }

      const quotations = await quotationService.getAllWithRelations(
        { where: obj },
        parseInt(page),
        parseInt(limit),
        isDoubleDatabase,
      );

      return successResponse(
        res,
        quotations,
        "Quotations retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Get quotation by ID
   */
  async getById(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      const quotation = await quotationService.getById(
        id,
        {},
        isDoubleDatabase,
      );

      if (!quotation) {
        return errorResponse(res, "Quotation not found", 404);
      }

      return successResponse(
        res,
        quotation,
        "Quotation retrieved successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Create quotation with nested categories, services, products, and fields
   */
  async create(req, res) {
    try {
      const { is_double_database, quotation_category, ...quotationData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validation for quotation data
      if (!quotationData.id_company) {
        return errorResponse(res, "id_company is required", 400);
      }

      if (!quotationData.id_customer) {
        return errorResponse(res, "id_customer is required", 400);
      }

      if (!quotationData.date) {
        return errorResponse(res, "date is required", 400);
      }

      if (!quotationData.quotation_no) {
        return errorResponse(res, "quotation_no is required", 400);
      }

      if (!quotationData.quotation_title_indo) {
        return errorResponse(res, "quotation_title_indo is required", 400);
      }

      if (!quotationData.quotation_title_mandarin) {
        return errorResponse(res, "quotation_title_mandarin is required", 400);
      }

      // Validate quotation_category is an array
      if (quotation_category && !Array.isArray(quotation_category)) {
        return errorResponse(res, "quotation_category must be an array", 400);
      }

      // Validate each category
      if (quotation_category && quotation_category.length > 0) {
        for (let i = 0; i < quotation_category.length; i++) {
          const category = quotation_category[i];

          if (!category.id_category) {
            return errorResponse(
              res,
              `id_category is required for category at index ${i}`,
              400,
            );
          }

          if (!category.foot_note) {
            return errorResponse(
              res,
              `foot_note is required for category at index ${i}`,
              400,
            );
          }

          // Validate services array
          if (category.services && !Array.isArray(category.services)) {
            return errorResponse(
              res,
              `services must be an array for category at index ${i}`,
              400,
            );
          }

          // Validate each service
          if (category.services) {
            for (let j = 0; j < category.services.length; j++) {
              const service = category.services[j];

              if (!service.id_service_pricing) {
                return errorResponse(
                  res,
                  `id_service_pricing is required for service at index ${j} in category ${i}`,
                  400,
                );
              }

              if (!service.product_name_indo) {
                return errorResponse(
                  res,
                  `product_name_indo is required for service at index ${j} in category ${i}`,
                  400,
                );
              }

              if (!service.product_name_mandarin) {
                return errorResponse(
                  res,
                  `product_name_mandarin is required for service at index ${j} in category ${i}`,
                  400,
                );
              }

              if (
                service.price_idr == null ||
                service.price_idr === undefined
              ) {
                return errorResponse(
                  res,
                  `price_idr is required for service at index ${j} in category ${i}`,
                  400,
                );
              }

              if (
                service.price_rmb == null ||
                service.price_rmb === undefined
              ) {
                return errorResponse(
                  res,
                  `price_rmb is required for service at index ${j} in category ${i}`,
                  400,
                );
              }

              if (service.qty == null || service.qty === undefined) {
                return errorResponse(
                  res,
                  `qty is required for service at index ${j} in category ${i}`,
                  400,
                );
              }
            }
          }

          // Validate products array
          if (category.products && !Array.isArray(category.products)) {
            return errorResponse(
              res,
              `products must be an array for category at index ${i}`,
              400,
            );
          }

          // Validate each product
          if (category.products) {
            for (let j = 0; j < category.products.length; j++) {
              const product = category.products[j];

              if (product.index == null || product.index === undefined) {
                return errorResponse(
                  res,
                  `index is required for product at index ${j} in category ${i}`,
                  400,
                );
              }

              // Validate fields array
              if (product.fields && !Array.isArray(product.fields)) {
                return errorResponse(
                  res,
                  `fields must be an array for product at index ${j} in category ${i}`,
                  400,
                );
              }
            }
          }
        }
      }

      // Set default values
      const preparedQuotationData = {
        ...quotationData,
        status: quotationData.status || "pending",
        id_user_create: req.user.id,
        is_active:
          quotationData.is_active !== undefined
            ? quotationData.is_active
            : true,
      };

      const result = await quotationService.createWithNested(
        preparedQuotationData,
        quotation_category || [],
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Quotation created successfully",
        201,
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Update quotation with nested categories, services, products, and fields
   */
  async update(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, quotation_category, ...quotationData } =
        req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Check if quotation exists
      const existing = await quotationService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Quotation not found", 404);
      }

      // Validate quotation_category is an array if provided
      if (quotation_category && !Array.isArray(quotation_category)) {
        return errorResponse(res, "quotation_category must be an array", 400);
      }

      // Validate each category if provided
      if (quotation_category && quotation_category.length > 0) {
        for (let i = 0; i < quotation_category.length; i++) {
          const category = quotation_category[i];

          // Validate services array
          if (category.services && !Array.isArray(category.services)) {
            return errorResponse(
              res,
              `services must be an array for category at index ${i}`,
              400,
            );
          }

          // Validate products array
          if (category.products && !Array.isArray(category.products)) {
            return errorResponse(
              res,
              `products must be an array for category at index ${i}`,
              400,
            );
          }

          // Validate fields in products
          if (category.products) {
            for (let j = 0; j < category.products.length; j++) {
              const product = category.products[j];

              if (product.fields && !Array.isArray(product.fields)) {
                return errorResponse(
                  res,
                  `fields must be an array for product at index ${j} in category ${i}`,
                  400,
                );
              }
            }
          }
        }
      }

      const result = await quotationService.updateWithNested(
        id,
        quotationData,
        quotation_category || [],
        isDoubleDatabase,
      );

      return successResponse(res, result, "Quotation updated successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Sync payments for a quotation
   * Body: { payments: [{ ...header, id?, payment_list: [{ ...list, id?, services: [{ ...svc, id? }] }] }] }
   */
  async syncPayment(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database, payments } = req.body;
      const isDoubleDatabase = is_double_database !== false;

      // Validasi quotation
      const quotation = await quotationService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!quotation) {
        return errorResponse(res, "Quotation not found", 404);
      }

      // Validasi payments array
      if (!payments || !Array.isArray(payments)) {
        return errorResponse(res, "payments must be an array", 400);
      }

      const requiredPaymentFields = [
        "payment_time_indo",
        "payment_time_mandarin",
        "total_payment_idr",
        "total_payment_rmb",
        "currency_type",
        "payment_to",
      ];

      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];

        for (const field of requiredPaymentFields) {
          if (payment[field] == null || payment[field] === "") {
            return errorResponse(
              res,
              `${field} is required for payment at index ${i}`,
              400,
            );
          }
        }

        if (!["idr", "rmb"].includes(payment.currency_type)) {
          return errorResponse(
            res,
            `currency_type must be 'idr' or 'rmb' for payment at index ${i}`,
            400,
          );
        }

        if (
          payment.payment_list !== undefined &&
          !Array.isArray(payment.payment_list)
        ) {
          return errorResponse(
            res,
            `payment_list must be an array for payment at index ${i}`,
            400,
          );
        }

        if (payment.payment_list) {
          for (let j = 0; j < payment.payment_list.length; j++) {
            const list = payment.payment_list[j];
            const requiredListFields = [
              "service_name_indo",
              "service_name_mandarin",
              "price_idr",
              "price_rmb",
              "payment_type",
            ];

            for (const field of requiredListFields) {
              if (list[field] == null || list[field] === "") {
                return errorResponse(
                  res,
                  `${field} is required for payment_list at index ${j} in payment ${i}`,
                  400,
                );
              }
            }

            if (list.services !== undefined && !Array.isArray(list.services)) {
              return errorResponse(
                res,
                `services must be an array for payment_list at index ${j} in payment ${i}`,
                400,
              );
            }

            if (list.services) {
              for (let k = 0; k < list.services.length; k++) {
                if (!list.services[k].id_quotation_service) {
                  return errorResponse(
                    res,
                    `id_quotation_service is required for service at index ${k} in payment_list ${j} in payment ${i}`,
                    400,
                  );
                }
              }
            }
          }
        }
      }

      const result = await quotationService.syncPayment(
        id,
        payments,
        isDoubleDatabase,
      );

      return successResponse(
        res,
        result,
        "Quotation payments synced successfully",
      );
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Approve quotation
   */
  async approve(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if quotation exists
      const existing = await quotationService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Quotation not found", 404);
      }

      const result = await quotationService.update(
        id,
        { status: "approved", id_user_approve: req.user.id },
        isDoubleDatabase,
      );

      return successResponse(res, result, "Quotation approved successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Reject quotation
   */
  async reject(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database = true } = req.body || {};
      const isDoubleDatabase = is_double_database;

      // Check if quotation exists
      const existing = await quotationService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Quotation not found", 404);
      }

      const result = await quotationService.update(
        id,
        { status: "rejected", id_user_reject: req.user.id },
        isDoubleDatabase,
      );

      return successResponse(res, result, "Quotation rejected successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }

  /**
   * Delete quotation
   */
  async delete(req, res) {
    try {
      const { id } = req.params;
      const { is_double_database } = req.query;
      const isDoubleDatabase = is_double_database !== "false";

      // Check if quotation exists
      const existing = await quotationService.findById(
        id,
        {},
        isDoubleDatabase,
      );
      if (!existing) {
        return errorResponse(res, "Quotation not found", 404);
      }

      await quotationService.delete(id, isDoubleDatabase);

      return successResponse(res, null, "Quotation deleted successfully");
    } catch (error) {
      return errorResponse(res, error.message);
    }
  }
}

module.exports = new QuotationController();
