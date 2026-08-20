function text(value) { return value == null ? '' : String(value).trim(); }

function hasListValue(value) {
  if (Array.isArray(value)) return value.some((item) => text(item));
  return text(value).split(',').some((item) => text(item));
}

export function vendorProfileCompleteness(vendor = {}) {
  const checks = [
    ['legalName', Boolean(text(vendor.legalName))],
    ['vendorCode', Boolean(text(vendor.vendorCode))],
    ['taxId', Boolean(text(vendor.taxId))],
    ['country', Boolean(text(vendor.country))],
    ['primaryEmail', Boolean(text(vendor.primaryEmail))],
    ['primaryPhone', Boolean(text(vendor.primaryPhone))],
    ['supplyCategories', hasListValue(vendor.supplyCategories)],
    ['qualificationStatus', !['', 'NOT_STARTED'].includes(text(vendor.qualificationStatus).toUpperCase())],
  ];
  const completed = checks.filter(([, valid]) => valid).length;
  return {
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    missing: checks.filter(([, valid]) => !valid).map(([field]) => field),
  };
}

export function vendorQualificationSummary(vendor = {}, today = new Date()) {
  const declared = text(vendor.qualificationStatus).toUpperCase() || 'NOT_STARTED';
  const expiry = text(vendor.qualificationExpiry);
  if (expiry && ['QUALIFIED', 'CONDITIONAL'].includes(declared)) {
    const expiryDate = new Date(`${expiry}T23:59:59`);
    if (!Number.isNaN(expiryDate.getTime()) && expiryDate < today) return 'EXPIRED';
  }
  return declared;
}
