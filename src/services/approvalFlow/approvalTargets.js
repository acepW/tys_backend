// Features governed by approval_flows, keyed by approval_flows.approval_for.
// statuses: document status that waits for someone's action (approve/reject or a
//   process step such as signing or payment) -> default approval_flows.label,
//   which tells admins what acting at that status means.
// scopes: document column compared with the approver's own department/division.
// A scope a feature does not list falls back to "all".
module.exports = {
  "service pricing": {
    model: "ServicePricing",
    label: "Service Pricing",
    numberField: "service_serial_number",
    statuses: { pending: "Approve / Reject Service Pricing" },
    scopes: { division: "id_division" },
  },
  quotation: {
    model: "Quotation",
    label: "Quotation",
    numberField: "quotation_no",
    statuses: { pending: "Approve / Reject Quotation" },
    baseWhere: { is_history: false },
  },
  // Stored as the PreOrder model/pre_orders table; the business name is purchase order.
  "purchase order": {
    model: "PreOrder",
    label: "Purchase Order",
    numberField: "pre_order_no",
    statuses: { pending: "Approve / Reject Purchase Order" },
  },
  contract: {
    model: "Contract",
    label: "Contract",
    numberField: "contract_no",
    statuses: {
      pending: "Submit Contract",
      "on verification": "Approve / Reject Contract",
      approved: "Send Contract to Customer",
      "sending to customer": "Approve / Reject Contract by Customer",
    },
  },
  invoice: {
    model: "Invoice",
    label: "Invoice",
    numberField: "invoice_no",
    statuses: {
      pending: "Submit Invoice",
      "on verification": "Approve / Reject Invoice",
      approved: "Signing Invoice",
      signing: "Send Invoice for Payment",
      "waiting for payment": "Input Payment Invoice",
    },
  },
  "debit note": {
    model: "DebitNote",
    label: "Debit Note",
    numberField: "debit_note_no",
    statuses: {
      pending: "Submit Debit Note",
      "on verification": "Approve / Reject Debit Note",
      approved: "Input Payment Debit Note",
    },
  },
  vendor: {
    model: "Vendor",
    label: "Vendor",
    numberField: "vendor_application_no",
    statuses: { pending: "Approve / Reject Vendor" },
    scopes: { department: "id_department_request" },
  },
  // A vendor revision is a vendor_edit row; while it is pending the vendor itself
  // sits at "request revision" and waits on this approval, not on its own.
  "vendor revision": {
    model: "VendorEdit",
    label: "Vendor Revision",
    numberField: "vendor_application_no",
    statuses: { pending: "Approve / Reject Vendor Revision" },
    scopes: { department: "id_department_request" },
  },
  "payment request": {
    model: "PaymentRequest",
    label: "Payment Request",
    numberField: "payment_request_no",
    statuses: {
      pending: "Approve / Reject Payment Request by Dept Manager",
      "approve dept manager": "Approve / Reject Payment Request by FAT",
      "approve fat": "Approve / Reject Payment Request by Manager FAT",
      "approve manager fat": "Approve / Reject Payment Request by Director",
      "approve director": "Approve / Reject Payment Request by Cashier",
      "approve cashier": "Input Payment Payment Request",
    },
    scopes: { department: "id_department_request" },
  },
  // Manual inventory entries have no document number; tasks show the item name.
  "inventory request": {
    model: "InventoryRequest",
    label: "Inventory Request",
    numberField: "item_name",
    statuses: { pending: "Approve / Reject Inventory Request" },
  },
};
