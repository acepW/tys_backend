const VENDOR_ITEM_TAX_FLAGS = ["tax_ppn", "tax_pph_23", "tax_pp_20", "tax_pph_4_ayat_2"];

/** Error message for the first invalid vendor item, or null. fieldName is used in messages. */
function validateVendorItems(items, fieldName = "vendor_items") {
  if (!Array.isArray(items)) return `${fieldName} must be an array`;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const at = `${fieldName}[${i}]`;
    if (!item || typeof item !== "object" || Array.isArray(item)) return `${at} must be an object`;
    if (!String(item.item_name || "").trim()) return `${at}.item_name is required`;
    if (item.category != null && typeof item.category !== "string")
      return `${at}.category must be a string`;
    for (const field of ["price_idr", "price_rmb"])
      if (item[field] == null || item[field] === "" || !Number.isFinite(Number(item[field])))
        return `${at}.${field} must be a number`;
    for (const flag of VENDOR_ITEM_TAX_FLAGS)
      if (item[flag] !== undefined && typeof item[flag] !== "boolean")
        return `${at}.${flag} must be a boolean`;
  }
  return null;
}

module.exports = { VENDOR_ITEM_TAX_FLAGS, validateVendorItems };
