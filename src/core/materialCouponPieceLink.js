function text(value) {
  return value == null ? '' : String(value).trim();
}

function firstText(...values) {
  return values.map(text).find(Boolean) || '';
}

function firstMeasurement(...values) {
  const value = values.find((candidate) => candidate !== '' && candidate != null && Number.isFinite(Number(candidate)));
  return value == null ? '' : Number(value);
}

function pieceCode(piece, pieceIndex) {
  return firstText(piece.code, piece.pieceCode, piece.mark, piece.pos, piece.position, piece.id, `Piece ${pieceIndex + 1}`);
}

export function cuttingSheetPieceLinkId(cuttingSheetId, pieceId) {
  return `${text(cuttingSheetId)}:${text(pieceId)}`;
}

export function listCuttingSheetPieceLinkOptions(cuttingSheets = []) {
  return cuttingSheets.flatMap((sheet) => (sheet.bars || []).flatMap((bar, barIndex) => (bar.pieces || []).map((piece, pieceIndex) => {
    const code = pieceCode(piece, pieceIndex);
    const cuttingSheetId = text(sheet.id);
    const pieceId = text(piece.id);
    const cuttingSheetNumber = firstText(sheet.number, cuttingSheetId);
    return {
      linkId: cuttingSheetPieceLinkId(cuttingSheetId, pieceId),
      identifier: `${cuttingSheetNumber} / ${code} · ${pieceId}`,
      cuttingSheetId,
      cuttingSheetNumber,
      barId: text(bar.id || bar.barId || `bar-${barIndex + 1}`),
      pieceId,
      pieceCode: code,
      materialDescription: firstText(piece.materialDescription, piece.material, bar.materialDescription, bar.material),
      materialSpec: firstText(piece.materialSpec, piece.specification, piece.spec, bar.materialSpec, bar.specification, bar.spec),
      materialGrade: firstText(piece.materialGrade, piece.grade, bar.materialGrade, bar.grade),
      drawingRef: firstText(piece.drawingRef, piece.drawing, piece.dwgNumber),
      lengthMm: firstMeasurement(piece.cutLengthMm, piece.cutLength, piece.lengthMm, piece.length),
      widthMm: firstMeasurement(piece.widthMm, piece.width, bar.widthMm, bar.width),
      thicknessMm: firstMeasurement(piece.thicknessMm, piece.thickness, bar.thicknessMm, bar.thickness),
      diaMm: firstMeasurement(piece.diaMm, piece.diameterMm, piece.diameter, bar.diaMm, bar.diameterMm, bar.diameter),
    };
  })));
}

export function linkCuttingSheetPiece(coupon = {}, option = {}, linkedAt = '') {
  if (!option.cuttingSheetId || !option.pieceId) return coupon;
  const snapshot = { ...option, linkedAt };
  const existing = Array.isArray(coupon.linkedCuttingSheetPieces) ? coupon.linkedCuttingSheetPieces : [];
  const snapshots = [...existing.filter((item) => item.linkId !== snapshot.linkId), snapshot];
  return {
    ...coupon,
    links: { ...(coupon.links || {}), cuttingSheetPieceIds: snapshots.map((item) => item.linkId) },
    linkedCuttingSheetPieces: snapshots,
  };
}

export function unlinkCuttingSheetPiece(coupon = {}, linkId = '') {
  const snapshots = (coupon.linkedCuttingSheetPieces || []).filter((item) => item.linkId !== linkId);
  return {
    ...coupon,
    links: { ...(coupon.links || {}), cuttingSheetPieceIds: snapshots.map((item) => item.linkId) },
    linkedCuttingSheetPieces: snapshots,
  };
}

export function syncCuttingSheetPieceCouponLinks(sheet = {}, coupon = {}) {
  const selected = new Set((coupon.linkedCuttingSheetPieces || [])
    .filter((item) => item.cuttingSheetId === sheet.id)
    .map((item) => item.pieceId));
  const couponId = text(coupon.id);
  const couponNumber = firstText(coupon.number, coupon.header?.mcCode);
  return {
    ...sheet,
    bars: (sheet.bars || []).map((bar) => ({
      ...bar,
      pieces: (bar.pieces || []).map((piece) => {
        if (selected.has(piece.id)) return { ...piece, linkedMaterialCouponId: couponId, linkedMaterialCouponNumber: couponNumber };
        if (piece.linkedMaterialCouponId !== couponId) return piece;
        const next = { ...piece };
        delete next.linkedMaterialCouponId;
        delete next.linkedMaterialCouponNumber;
        return next;
      }),
    })),
  };
}
