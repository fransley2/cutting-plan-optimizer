function text(value) {
  return value == null ? '' : String(value).trim();
}

function timestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function entry(input = {}) {
  return {
    id: text(input.id),
    documentType: text(input.documentType),
    documentNumber: text(input.documentNumber) || 'No document number',
    projectId: text(input.projectId),
    workpackId: text(input.workpackId),
    status: text(input.status) || 'N/A',
    updatedAt: text(input.updatedAt),
    sourceEntityType: text(input.sourceEntityType),
    sourceEntityId: text(input.sourceEntityId),
  };
}

export function normalizeDocumentRegister({ materialCoupons = [], cuttingSheets = [], returnMaterialVouchers = [], workpacks = [] } = {}) {
  const records = [];
  const add = (items, mapper) => (Array.isArray(items) ? items : []).forEach((item) => {
    try {
      if (item && typeof item === 'object') records.push(entry(mapper(item)));
    } catch (error) {
      console.warn('Registro de documento inválido ignorado.', error);
    }
  });
  add(materialCoupons, (coupon) => ({
    id: coupon.id,
    documentType: 'Material Coupon',
    documentNumber: coupon.number,
    projectId: coupon.projectId,
    workpackId: coupon.workpackId,
    status: coupon.status,
    updatedAt: coupon.updatedAt || coupon.issuedAt || coupon.createdAt,
    sourceEntityType: 'MaterialCoupon',
    sourceEntityId: coupon.id,
  }));
  add(cuttingSheets, (sheet) => ({ id: sheet.id, documentType: 'Cutting Sheet', documentNumber: sheet.number, projectId: sheet.projectId, workpackId: sheet.workpackId, status: sheet.status, updatedAt: sheet.updatedAt || sheet.releasedAt, sourceEntityType: 'CuttingSheet', sourceEntityId: sheet.id }));
  add(returnMaterialVouchers, (rmv) => ({ id: rmv.id, documentType: 'Return Material Voucher', documentNumber: rmv.number, projectId: rmv.projectId, workpackId: rmv.workpackId, status: rmv.status, updatedAt: rmv.updatedAt || rmv.issuedAt, sourceEntityType: 'ReturnMaterialVoucher', sourceEntityId: rmv.id }));
  add(workpacks, (workpack) => ({
    id: workpack.id,
    documentType: 'Workpack',
    documentNumber: workpack.wpNo,
    projectId: workpack.projectId,
    workpackId: workpack.id,
    status: workpack.status,
    updatedAt: workpack.updatedAt || workpack.createdAt,
    sourceEntityType: 'Workpack',
    sourceEntityId: workpack.id,
  }));
  return records.sort((a, b) => {
    const aDate = timestamp(a.updatedAt);
    const bDate = timestamp(b.updatedAt);
    if (!aDate && !bDate) return a.documentNumber.localeCompare(b.documentNumber);
    if (!aDate) return 1;
    if (!bDate) return -1;
    return bDate - aDate;
  });
}
