// Credit note reports (docs/invoice-cancellation-paid.md R13, fase G): balance per
// customer, list, detail (where it came from, what it paid) and a customer ledger.
// Balances are computed from the allocations up to a date, not from
// credit_notes.balance, so they can be read for any day.
const { Op } = require("sequelize");
const { models } = require("../../models");
const { fail } = require("../procurement/shared");

const cents = (value) => Math.round(Number(value || 0) * 100);
const fromCents = (value) => value / 100;
const plain = (row) => (row?.toJSON ? row.toJSON() : row);
const SOURCES = ["invoice", "debit_note"];
const CURRENCIES = ["idr", "rmb"];
const STATUSES = ["open", "used up"];

const parseDate = (value, field, endOfDay) => {
  if (value === undefined || value === null || value === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) fail(`${field} must be a date YYYY-MM-DD`);
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  if (Number.isNaN(date.getTime())) fail(`${field} must be a valid date`);
  return date;
};

const toId = (value, field) => {
  if (value === undefined || value === null || value === "") return null;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) fail(`${field} must be a positive integer`);
  return id;
};

const oneOf = (value, field, values) => {
  if (value === undefined || value === null || value === "") return null;
  if (!values.includes(value)) fail(`${field} must be one of: ${values.join(", ")}`);
  return value;
};

// { data, pagination } when page and limit are given, else the whole array.
const paginate = (rows, query) => {
  const page = parseInt(query.page, 10);
  const limit = parseInt(query.limit, 10);
  if (!(page > 0 && limit > 0)) return rows;
  return {
    data: rows.slice((page - 1) * limit, page * limit),
    pagination: { total: rows.length, total_page: Math.ceil(rows.length / limit), current_page: page, per_page: limit },
  };
};

const customerAttributes = ["id", "company_name_indo", "company_name_mandarin", "customer_code"];
const companyAttributes = ["id", "company_name", "initial_company"];
const documentNumber = (allocation) =>
  allocation.target_type === "invoice" ? allocation.invoice?.invoice_no : allocation.debit_note?.debit_note_no;

class ReportCreditNoteService {
  // Credit notes matching the common filters, with customer and company.
  async _creditNotes(query, { asOf = null, extraWhere = {}, include = [] } = {}) {
    const where = { is_active: true, ...extraWhere };
    const idCustomer = toId(query.id_customer, "id_customer");
    const idCompany = toId(query.id_company, "id_company");
    const currency = oneOf(query.currency_type, "currency_type", CURRENCIES);
    const source = oneOf(query.source_type, "source_type", SOURCES);
    if (idCustomer) where.id_customer = idCustomer;
    if (idCompany) where.id_company = idCompany;
    if (currency) where.currency_type = currency;
    if (source) where.source_type = source;
    if (asOf) where.date = { ...(where.date || {}), [Op.lte]: asOf };
    return (
      await models.db1.CreditNote.findAll({
        where,
        include: [
          { model: models.db1.Customer, as: "customer", attributes: customerAttributes },
          { model: models.db1.Company, as: "company", attributes: companyAttributes },
          ...include,
        ],
        order: [["date", "ASC"], ["id", "ASC"]],
      })
    ).map(plain);
  }

  async _allocations(idCreditNotes, { asOf = null, include = [] } = {}) {
    if (!idCreditNotes.length) return [];
    const where = { id_credit_note: idCreditNotes, is_active: true };
    if (asOf) where.date = { [Op.lte]: asOf };
    return (
      await models.db1.CreditNoteAllocation.findAll({ where, include, order: [["date", "ASC"], ["id", "ASC"]] })
    ).map(plain);
  }

  // Customer name filter, done here because the name lives on the customer.
  _matchesCustomer(row, search) {
    if (!search) return true;
    const text = String(search).toLowerCase();
    return [row.customer?.company_name_indo, row.customer?.company_name_mandarin, row.customer?.customer_code]
      .some((value) => String(value || "").toLowerCase().includes(text));
  }

  /**
   * 1. Balance per customer, company, currency and source (deposits of invoice and
   * debit note money do not mix, P16), as of a date (default today).
   * Filters: id_customer, id_company, currency_type, source_type, search (customer),
   * as_of (YYYY-MM-DD), has_balance (default true), page + limit.
   */
  async balances(query = {}) {
    const asOf = parseDate(query.as_of, "as_of", true) || new Date();
    const creditNotes = (await this._creditNotes(query, { asOf })).filter((row) => this._matchesCustomer(row, query.search));
    const allocations = await this._allocations(creditNotes.map((row) => row.id), { asOf });
    const used = new Map();
    for (const allocation of allocations) {
      const entry = used.get(allocation.id_credit_note) || { transfer: 0, deposit: 0, last: null };
      entry[allocation.type] += cents(allocation.amount);
      entry.last = allocation.date;
      used.set(allocation.id_credit_note, entry);
    }
    const groups = new Map();
    for (const row of creditNotes) {
      const key = [row.id_customer, row.id_company, row.currency_type, row.source_type].join("|");
      const group = groups.get(key) || {
        customer: row.customer,
        company: row.company,
        currency_type: row.currency_type,
        source_type: row.source_type,
        credit_note_count: 0,
        issued: 0,
        used_transfer: 0,
        used_deposit: 0,
        last_activity: null,
      };
      const use = used.get(row.id) || { transfer: 0, deposit: 0, last: null };
      group.credit_note_count += 1;
      group.issued += cents(row.amount);
      group.used_transfer += use.transfer;
      group.used_deposit += use.deposit;
      for (const date of [row.date, use.last])
        if (date && (!group.last_activity || new Date(date) > new Date(group.last_activity))) group.last_activity = date;
      groups.set(key, group);
    }
    const hasBalance = String(query.has_balance ?? "true") !== "false";
    const rows = [...groups.values()]
      .map((group) => ({
        ...group,
        issued: fromCents(group.issued),
        used_transfer: fromCents(group.used_transfer),
        used_deposit: fromCents(group.used_deposit),
        used: fromCents(group.used_transfer + group.used_deposit),
        balance: fromCents(group.issued - group.used_transfer - group.used_deposit),
      }))
      .filter((row) => !hasBalance || row.balance > 0)
      .sort((a, b) =>
        String(a.customer?.company_name_indo || "").localeCompare(String(b.customer?.company_name_indo || ""))
        || (a.company?.id ?? 0) - (b.company?.id ?? 0)
        || a.currency_type.localeCompare(b.currency_type)
        || a.source_type.localeCompare(b.source_type));
    const totals = {};
    for (const row of rows) {
      const total = (totals[row.currency_type] ||= { issued: 0, used: 0, balance: 0 });
      total.issued += cents(row.issued);
      total.used += cents(row.used);
      total.balance += cents(row.balance);
    }
    for (const total of Object.values(totals))
      for (const key of Object.keys(total)) total[key] = fromCents(total[key]);
    const result = paginate(rows, query);
    return { as_of: asOf, totals, ...(Array.isArray(result) ? { data: result } : result) };
  }

  /**
   * 2. One row per credit note: source document, settlement, used for transfers
   * and as deposit, balance and status (open / used up).
   * Filters: id_customer, id_company, currency_type, source_type, status,
   * date_from / date_to (credit note date), search (credit note, invoice or debit
   * note number, or customer), page + limit.
   */
  async list(query = {}) {
    const status = oneOf(query.status, "status", STATUSES);
    const from = parseDate(query.date_from, "date_from", false);
    const to = parseDate(query.date_to, "date_to", true);
    const date = {};
    if (from) date[Op.gte] = from;
    if (to) date[Op.lte] = to;
    const creditNotes = await this._creditNotes(query, {
      extraWhere: Object.getOwnPropertySymbols(date).length ? { date } : {},
      include: this._sourceIncludes(),
    });
    const allocations = await this._allocations(creditNotes.map((row) => row.id));
    const search = String(query.search || "").toLowerCase();
    const rows = creditNotes
      .map((row) => {
        const own = allocations.filter((allocation) => allocation.id_credit_note === row.id);
        const sum = (type) => own.filter((item) => item.type === type).reduce((total, item) => total + cents(item.amount), 0);
        const balance = cents(row.amount) - sum("transfer") - sum("deposit");
        return {
          id: row.id,
          credit_note_no: row.credit_note_no,
          date: row.date,
          customer: row.customer,
          company: row.company,
          currency_type: row.currency_type,
          source_type: row.source_type,
          source: this._source(row),
          settlement: row.paid_cancellation?.settlement ?? null,
          amount: Number(row.amount),
          used_transfer: fromCents(sum("transfer")),
          used_deposit: fromCents(sum("deposit")),
          balance: fromCents(balance),
          status: balance > 0 ? "open" : "used up",
        };
      })
      .filter((row) => !status || row.status === status)
      .filter((row) => !search || [row.credit_note_no, row.source.number, row.customer?.company_name_indo, row.customer?.customer_code]
        .some((value) => String(value || "").toLowerCase().includes(search)))
      .reverse(); // newest first
    return paginate(rows, query);
  }

  _sourceIncludes() {
    const db = models.db1;
    // A new array per include: Sequelize changes include objects, so they cannot be shared.
    const project = () => [
      { model: db.Contract, as: "contract", attributes: ["id", "contract_no"] },
      { model: db.PreOrder, as: "pre_order", attributes: ["id", "pre_order_no"] },
    ];
    return [
      { model: db.Invoice, as: "invoice", attributes: ["id", "invoice_no", "total", "status"], include: project() },
      { model: db.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no", "total", "status"], include: project() },
      {
        model: db.InvoicePaidCancellation,
        as: "paid_cancellation",
        attributes: [
          "id", "status", "reason", "service_condition", "settlement", "invoice_total", "invoice_paid",
          "invoice_kept", "invoice_amount", "debit_note_paid", "debit_note_amount", "approved_at", "completed_at",
        ],
      },
    ];
  }

  // The cancelled document the money came from, with its CT/PO.
  _source(row) {
    const document = row.source_type === "debit_note" ? row.debit_note : row.invoice;
    return {
      type: row.source_type,
      id: document?.id ?? null,
      number: row.source_type === "debit_note" ? document?.debit_note_no : document?.invoice_no,
      total: document ? Number(document.total) : null,
      contract_no: document?.contract?.contract_no ?? null,
      pre_order_no: document?.pre_order?.pre_order_no ?? null,
    };
  }

  _allocationIncludes() {
    const db = models.db1;
    // A new array per include: Sequelize changes include objects, so they cannot be shared.
    const project = () => [
      { model: db.Contract, as: "contract", attributes: ["id", "contract_no"] },
      { model: db.PreOrder, as: "pre_order", attributes: ["id", "pre_order_no"] },
    ];
    return [
      { model: db.Invoice, as: "invoice", attributes: ["id", "invoice_no", "status"], include: project() },
      { model: db.DebitNote, as: "debit_note", attributes: ["id", "debit_note_no", "status"], include: project() },
      { model: db.User, as: "user_create", attributes: ["id", "name", "email"] },
      { model: db.File, as: "payment_proof", required: false, where: { is_active: true } },
    ];
  }

  _target(allocation) {
    const document = allocation.target_type === "invoice" ? allocation.invoice : allocation.debit_note;
    return {
      type: allocation.target_type,
      id: document?.id ?? null,
      number: documentNumber(allocation) ?? null,
      contract_no: document?.contract?.contract_no ?? null,
      pre_order_no: document?.pre_order?.pre_order_no ?? null,
    };
  }

  /** 3. One credit note: where it came from and what it paid, with the running balance. */
  async detail(id) {
    const idCreditNote = toId(id, "id");
    const [row] = await this._creditNotes({}, {
      extraWhere: { id: idCreditNote },
      include: [
        ...this._sourceIncludes(),
        { model: models.db1.User, as: "user_create", attributes: ["id", "name", "email"] },
      ],
    });
    if (!row) fail("Credit note not found", 404);
    let balance = cents(row.amount);
    const allocations = (await this._allocations([row.id], { include: this._allocationIncludes() })).map((allocation) => {
      balance -= cents(allocation.amount);
      return {
        id: allocation.id,
        date: allocation.date,
        type: allocation.type,
        target: this._target(allocation),
        amount: Number(allocation.amount),
        balance: fromCents(balance),
        note: allocation.note,
        user: allocation.user_create,
        payment_proof: allocation.payment_proof || [],
      };
    });
    return {
      id: row.id,
      credit_note_no: row.credit_note_no,
      date: row.date,
      customer: row.customer,
      company: row.company,
      currency_type: row.currency_type,
      amount: Number(row.amount),
      balance: fromCents(balance),
      status: balance > 0 ? "open" : "used up",
      note: row.note,
      user: row.user_create,
      source: { ...this._source(row), cancellation: row.paid_cancellation },
      allocations,
    };
  }

  /**
   * 4. Ledger of one customer, like a receivable card: opening balance at date_from,
   * every credit note issued (+) and used (−) in the period with the running
   * balance, and the closing balance; one ledger per company, currency and source.
   * On the same day a credit note comes before its uses.
   */
  async ledger(query = {}) {
    const idCustomer = toId(query.id_customer, "id_customer");
    if (!idCustomer) fail("id_customer is required");
    const from = parseDate(query.date_from, "date_from", false);
    const to = parseDate(query.date_to, "date_to", true) || new Date();
    if (from && from > to) fail("date_from cannot be after date_to");
    const creditNotes = await this._creditNotes({ ...query, id_customer: idCustomer }, {
      asOf: to,
      include: this._sourceIncludes(),
    });
    const allocations = await this._allocations(creditNotes.map((row) => row.id), {
      asOf: to,
      include: this._allocationIncludes(),
    });
    const byId = new Map(creditNotes.map((row) => [row.id, row]));
    const groups = new Map();
    const groupOf = (row) => {
      const key = [row.id_company, row.currency_type, row.source_type].join("|");
      if (!groups.has(key))
        groups.set(key, {
          company: row.company,
          currency_type: row.currency_type,
          source_type: row.source_type,
          opening: 0,
          entries: [],
        });
      return groups.get(key);
    };
    const add = (group, entry) => {
      if (from && new Date(entry.date) < from) group.opening += entry.change;
      else group.entries.push(entry);
    };
    for (const row of creditNotes)
      add(groupOf(row), {
        date: row.date,
        order: 0,
        id: row.id,
        kind: "issued",
        credit_note_no: row.credit_note_no,
        document: this._source(row),
        description: `Credit note from cancelled ${row.source_type === "debit_note" ? "debit note" : "invoice"} ${this._source(row).number || ""}`.trim(),
        change: cents(row.amount),
      });
    for (const allocation of allocations) {
      const row = byId.get(allocation.id_credit_note);
      add(groupOf(row), {
        date: allocation.date,
        order: 1,
        id: allocation.id,
        kind: allocation.type === "deposit" ? "used as deposit" : "transferred",
        credit_note_no: row.credit_note_no,
        document: this._target(allocation),
        description: allocation.note,
        change: -cents(allocation.amount),
      });
    }
    const ledgers = [...groups.values()].map((group) => {
      let running = group.opening;
      const entries = group.entries
        .sort((a, b) => new Date(a.date) - new Date(b.date) || a.order - b.order || a.id - b.id)
        .map(({ order, change, ...entry }) => {
          running += change;
          return {
            ...entry,
            amount_in: change > 0 ? fromCents(change) : 0,
            amount_out: change < 0 ? fromCents(-change) : 0,
            balance: fromCents(running),
          };
        });
      return {
        company: group.company,
        currency_type: group.currency_type,
        source_type: group.source_type,
        opening_balance: fromCents(group.opening),
        entries,
        closing_balance: fromCents(running),
      };
    });
    const customer = creditNotes[0]?.customer
      || plain(await models.db1.Customer.findByPk(idCustomer, { attributes: customerAttributes }));
    if (!customer) fail("Customer not found", 404);
    return { customer, date_from: from, date_to: to, ledgers };
  }
}

module.exports = new ReportCreditNoteService();
