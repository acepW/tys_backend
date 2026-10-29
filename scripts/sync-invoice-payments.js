// Migrates invoices to the FAT Internal approval flow (docs/invoice-approval-fat.md).
// Safe to run more than once.
//   1. Creates invoice_payments.
//   2. Matches invoices.status and invoice_verification_progress.status to the
//      models: payment verification, revision and tax invoice values.
//      Signing was dropped: SPV approval now uploads the invoice file and moves the
//      invoice straight to "waiting for payment", so invoices still "approved" or
//      "signing" move there and both values leave invoices.status. Progress rows
//      keep them as history.
//   3. Adds invoices.tax_invoice_status. Invoices with a tax invoice number become
//      "issued"; paid invoices with PPN but no tax invoice become "requested", as
//      an accepted payment now requests it.
//   4. Invoices already paid the old way (AR & AP typed the payment in) get one
//      accepted invoice_payments row from invoices.payment_*, so accepted payments
//      always add up to invoices.payment_amount. The old proof_of_payment link is
//      kept on the invoice and copied into the row's note.
const { models, db1, db2 } = require("../src/models");

// Matches the column to the model's ENUM when it lacks `marker` or still has `removed`.
async function syncStatus(name, model, table, marker, removed = null) {
  const queryInterface = model.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(table);
  const type = columns.status.type.toLowerCase();
  if (type.includes(marker) && !(removed && type.includes(`'${removed}'`))) return;
  const { status } = model.rawAttributes;
  await queryInterface.changeColumn(table, "status", {
    type: status.type,
    allowNull: status.allowNull,
    defaultValue: status.defaultValue,
    comment: status.comment,
  });
  console.log(`[${name}] ~ ${table}.status matches the model`);
}

async function migrateSchema(name, dbModels) {
  await dbModels.InvoicePayment.sync({ alter: false });
  const [moved] = await dbModels.Invoice.sequelize.query(`UPDATE invoices
    SET status = 'waiting for payment' WHERE status IN ('approved', 'signing')`);
  if (moved.affectedRows)
    console.log(`[${name}] ${moved.affectedRows} approved/signing invoices moved to waiting for payment`);
  await syncStatus(name, dbModels.Invoice, "invoices", "waiting for revision", "signing");
  await syncStatus(name, dbModels.InvoiceVerificationProgress,
    "invoice_verification_progress", "revision approved");
  await addTaxInvoiceStatus(name, dbModels.Invoice);
}

async function addTaxInvoiceStatus(name, model) {
  const queryInterface = model.sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("invoices");
  if (columns.tax_invoice_status) return;
  const { tax_invoice_status: column } = model.rawAttributes;
  await queryInterface.addColumn("invoices", "tax_invoice_status", {
    type: column.type,
    allowNull: column.allowNull,
    defaultValue: column.defaultValue,
    comment: column.comment,
    after: "tax_invoice_date",
  });
  const [issued] = await model.sequelize.query(`UPDATE invoices
    SET tax_invoice_status = 'issued' WHERE tax_invoice_no IS NOT NULL`);
  const [requested] = await model.sequelize.query(`UPDATE invoices
    SET tax_invoice_status = 'requested'
    WHERE tax_invoice_no IS NULL AND tax_ppn = 1 AND status = 'paid'`);
  console.log(`[${name}] + invoices.tax_invoice_status (${issued.affectedRows} issued, ${requested.affectedRows} requested)`);
}

async function backfillPayments() {
  const [invoices] = await db1.query(`
    SELECT i.id, i.payment_amount, i.payment_method, i.proof_of_payment,
      COALESCE(i.payment_date, i.updated_at) transfer_date,
      p.id_user, COALESCE(p.created_at, i.updated_at) verified_at
    FROM invoices i
    LEFT JOIN invoice_verification_progress p ON p.id = (
      SELECT MAX(id) FROM invoice_verification_progress
      WHERE id_invoice = i.id AND status = 'paid')
    LEFT JOIN invoice_payments ip ON ip.id_invoice = i.id
    WHERE i.status = 'paid' AND i.payment_amount > 0 AND ip.id IS NULL`);
  for (const invoice of invoices) {
    const t1 = await db1.transaction();
    const t2 = await db2.transaction();
    try {
      const data = {
        id_invoice: invoice.id,
        amount: invoice.payment_amount,
        transfer_date: invoice.transfer_date,
        bank_name: null,
        payment_method: invoice.payment_method || "transfer",
        status: "accepted",
        note: invoice.proof_of_payment
          ? `Migrated payment, proof: ${invoice.proof_of_payment}`
          : "Migrated payment",
        id_user_create: invoice.id_user,
        id_user_verify: invoice.id_user,
        verified_at: invoice.verified_at,
      };
      const payment = await models.db1.InvoicePayment.create(data, { transaction: t1 });
      if (await models.db2.Invoice.findByPk(invoice.id, { transaction: t2 }))
        await models.db2.InvoicePayment.create({ ...data, id: payment.id }, { transaction: t2 });
      await t1.commit();
      await t2.commit();
    } catch (error) {
      await t1.rollback();
      await t2.rollback();
      throw error;
    }
  }
  console.log(`[db1/db2] invoice payments backfilled: ${invoices.length}`);
}

const run = async () => {
  try {
    for (const [name, dbModels] of [["db1", models.db1], ["db2", models.db2]])
      await migrateSchema(name, dbModels);
    await backfillPayments();
    console.log("Invoice payment migration finished");
  } finally {
    await Promise.allSettled([db1.close(), db2.close()]);
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
