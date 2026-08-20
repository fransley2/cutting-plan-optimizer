function text(value) {
  return value == null ? '' : String(value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function identifiers(item = {}) {
  return [item.id, item.trace, item.traceability, item.inventoryItemId, item.sourceInventoryId]
    .map(text)
    .filter(Boolean);
}

function couponPayload(coupon = {}) {
  return coupon.metadata?.coupon && typeof coupon.metadata.coupon === 'object'
    ? coupon.metadata.coupon
    : coupon;
}

function couponLines(coupon = {}) {
  const payload = couponPayload(coupon);
  if (Array.isArray(payload.lines)) return payload.lines;
  return Array.isArray(coupon.items) ? coupon.items : [];
}

function findByIdentifier(records, sought) {
  const key = text(sought);
  if (!key) return null;
  return records.find((record) => identifiers(record).includes(key)) || null;
}

function barInventoryReference(bar = {}) {
  const stock = bar.stockItem || bar.inventoryItem || bar.stock || {};
  return text(
    bar.inventoryItemId
    || bar.sourceInventoryId
    || stock.id
    || bar.trace
    || bar.traceability
    || stock.trace
    || stock.traceability,
  );
}

function reservationForInventory(reservations, inventoryItem, barReference) {
  return reservations.find((reservation) => {
    const reference = text(reservation.inventoryItemId);
    return reference && (reference === text(barReference) || identifiers(inventoryItem).includes(reference));
  }) || null;
}

function lineForInventory(lines, reservation, inventoryItem, barReference) {
  if (reservation?.materialCouponLineId) {
    const linked = lines.find((line) => text(line.id) === text(reservation.materialCouponLineId));
    if (linked) return linked;
  }
  return lines.find((line) => {
    const reference = text(line.inventoryItemId || line.inventoryId || line.traceability || line.trace);
    return reference && (reference === text(barReference) || identifiers(inventoryItem).includes(reference));
  }) || null;
}

export function isCuttingSheetCouponEligible(coupon = {}) {
  const payload = couponPayload(coupon);
  return Boolean(text(coupon.id || coupon.number || payload.id || payload.header?.mcCode));
}

export function prepareCuttingSheetIssue({
  solution = {},
  projectId = '',
  workpackId = '',
  coupon = null,
  inventoryItems = [],
  reservations = [],
} = {}) {
  const sourceBars = Array.isArray(solution.stockUsed) ? solution.stockUsed : [];
  const errors = [];
  const warnings = [];

  if (!sourceBars.length) errors.push({ code: 'CUTTING_SHEET_BARS_REQUIRED' });
  if (!coupon) errors.push({ code: 'MATERIAL_COUPON_REQUIRED' });
  if (coupon && text(projectId) && text(coupon.projectId) && text(projectId) !== text(coupon.projectId)) {
    errors.push({ code: 'MATERIAL_COUPON_PROJECT_MISMATCH' });
  }
  if (coupon && text(workpackId) && text(coupon.workpackId) && text(workpackId) !== text(coupon.workpackId)) {
    errors.push({ code: 'MATERIAL_COUPON_WORKPACK_MISMATCH' });
  }
  if (Array.isArray(solution.unplacedParts) && solution.unplacedParts.length) {
    warnings.push({ code: 'UNPLACED_PARTS_EXCLUDED', count: solution.unplacedParts.length });
  }

  const lines = coupon ? couponLines(coupon) : [];
  const usableReservations = (Array.isArray(reservations) ? reservations : [])
    .filter((reservation) => !['RELEASED', 'CANCELLED'].includes(upper(reservation.status)));
  const bars = sourceBars.map((sourceBar, barIndex) => {
    const bar = structuredClone(sourceBar);
    const reference = barInventoryReference(bar);
    const inventoryItem = findByIdentifier(inventoryItems, reference);
    if (!reference || !inventoryItem) {
      errors.push({ code: 'CUTTING_BAR_INVENTORY_NOT_FOUND', barIndex, reference });
      return bar;
    }
    const reservation = reservationForInventory(usableReservations, inventoryItem, reference);
    const line = lineForInventory(lines, reservation, inventoryItem, reference);
    if (!line) {
      errors.push({ code: 'CUTTING_BAR_NOT_COVERED_BY_COUPON', barIndex, reference });
      return bar;
    }
    const inventoryItemId = text(inventoryItem.id || inventoryItem.trace || inventoryItem.traceability);
    const materialCouponLineId = text(line.id || reservation?.materialCouponLineId);
    return {
      ...bar,
      inventoryItemId,
      materialCouponId: text(coupon?.id),
      materialCouponLineId,
      traceability: text(bar.traceability || inventoryItem.traceability || inventoryItem.trace),
      pieces: (Array.isArray(bar.pieces) ? bar.pieces : []).map((piece) => ({
        ...piece,
        materialCouponId: text(coupon?.id),
        materialCouponLineId,
      })),
    };
  });

  return { valid: errors.length === 0, errors, warnings, bars };
}

export function cuttingSheetIssueErrorMessage(error = {}) {
  const messages = {
    CUTTING_SHEET_BARS_REQUIRED: 'O resultado não possui barras alocadas para emitir a Cutting Sheet.',
    MATERIAL_COUPON_REQUIRED: 'Selecione um Material Coupon rastreável antes de emitir a Cutting Sheet.',
    MATERIAL_COUPON_PROJECT_MISMATCH: 'O Material Coupon pertence a outro projeto.',
    MATERIAL_COUPON_WORKPACK_MISMATCH: 'O Material Coupon pertence a outro Workpack.',
    CUTTING_BAR_INVENTORY_NOT_FOUND: `O material ${error.reference || `da barra ${Number(error.barIndex) + 1}`} não foi encontrado no Inventory.`,
    CUTTING_BAR_NOT_COVERED_BY_COUPON: `O material ${error.reference || `da barra ${Number(error.barIndex) + 1}`} não está coberto pelo Material Coupon selecionado.`,
  };
  return messages[error.code] || error.code || 'Não foi possível validar a emissão da Cutting Sheet.';
}
