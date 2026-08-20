function text(value) { return value == null ? '' : String(value).trim(); }

export function nextProjectDocumentNumber(records = [], projectShortCode = '', documentCode = 'DOC') {
  const prefix = `${text(projectShortCode).toUpperCase() || 'PROJECT'}_FAB_${text(documentCode).toUpperCase()}-`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`^${escaped}(\\d+)(?:_.*)?$`, 'i');
  const highest = (Array.isArray(records) ? records : []).reduce((maximum, record) => {
    const match = text(record?.number || record?.name).match(expression);
    return match ? Math.max(maximum, Number(match[1]) || 0) : maximum;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(3, '0')}`;
}

export function matchesProjectDocumentNumber(value, projectShortCode = '', documentCode = 'DOC') {
  const prefix = `${text(projectShortCode).toUpperCase() || 'PROJECT'}_FAB_${text(documentCode).toUpperCase()}-`;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\d{3,}(?:_.*)?$`, 'i').test(text(value));
}

export const nextCuttingSheetNumber = (records, projectShortCode) => nextProjectDocumentNumber(records, projectShortCode, 'CS');
export const nextNestingPlanNumber = (records, projectShortCode) => nextProjectDocumentNumber(records, projectShortCode, 'CS');
