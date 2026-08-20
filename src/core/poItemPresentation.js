import { inferPurchaseOrderMaterialFields } from './purchaseOrderImport.js';

function numberValue(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function localizedSpecNumber(value) {
  const parsed = numberValue(value);
  return parsed > 0 ? parsed.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '';
}

function descriptionSpecValue(description, labelPattern, defaultUnit = '') {
  const match = String(description || '').match(new RegExp(
    `(?:^|[,;/\\n])\\s*(?:${labelPattern})\\s*:?\\s*([0-9]+(?:[.,][0-9]+)?)\\s*(MM|M|INCHES|INCH|IN|°|DEG)?`,
    'im',
  ));
  if (!match) return '';
  const unit = String(match[2] || defaultUnit).toUpperCase().replace(/^DEG$/, '°');
  return `${match[1]}${unit ? ` ${unit === 'INCHES' || unit === 'INCH' ? 'IN' : unit.toLowerCase()}` : ''}`.trim();
}

function descriptionTag(description = '') {
  const source = String(description);
  return String(source.match(/\b(?:PROD|KBD|SPK)(?:\s*\/\s*(?:PROD|KBD|SPK))*\s*\/\s*TAG\s*:?[ \t]*([^\r\n,;]+)/i)?.[1]
    || source.match(/\bTAG\s*:?[ \t]*([^\r\n,;]+)/i)?.[1]
    || '').trim();
}

function descriptionMrItem(description = '') {
  return String(String(description).match(/\bMR\s*ITEM\s*:?\s*([^\r\n,;]+)/i)?.[1] || '').trim();
}

function summaryType(poItem, materialGrade) {
  const lines = String(poItem.description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) => line.length <= 90
    && !/\b(?:PROD|KBD|SPK)(?:\s*\/\s*[A-Z]+)*\s*\/\s*TAG\s*:?/i.test(line)
    && !/^(?:OD|ID|WT|BEND\s+WT|BEND\s+ANGLE|BEND\s+RADIUS|TANGENT\s+LENGTH|MR\s+ITEM)\s*:?/i.test(line)
    && !/^(?:PR|RQ\.?\s*CENTER|COMMODITY\s+CODE)\b/i.test(line)
    && line.toUpperCase() !== String(materialGrade || '').toUpperCase());
  return candidate || poItem.itemType || poItem.materialCategory || poItem.itemClassification || 'Material';
}

export function poItemTechnicalPresentation(poItem = {}) {
  const description = String(poItem.description || '');
  const inferred = inferPurchaseOrderMaterialFields(description);
  const tag = String(poItem.equipmentDestination || descriptionTag(description) || '').trim();
  const mrItem = descriptionMrItem(description);
  const material = String(poItem.materialGrade || inferred.materialGrade || '').trim();
  const odNumber = numberValue(poItem.diameterOdMm) || numberValue(inferred.diameterOdMm);
  const wtNumber = numberValue(poItem.thicknessMm) || numberValue(inferred.thicknessMm);
  const od = odNumber ? `${localizedSpecNumber(odNumber)} mm` : descriptionSpecValue(description, 'OD', 'MM');
  const id = descriptionSpecValue(description, 'ID', 'MM');
  const wt = wtNumber ? `${localizedSpecNumber(wtNumber)} mm` : descriptionSpecValue(description, 'WT', 'MM');
  const bendWt = descriptionSpecValue(description, 'BEND\\s+WT', 'MM');
  const angleNumber = numberValue(poItem.degree) || numberValue(inferred.degree);
  const bendAngle = angleNumber ? `${localizedSpecNumber(angleNumber)} °` : descriptionSpecValue(description, 'BEND\\s+ANGLE', '°');
  const bendRadius = descriptionSpecValue(description, 'BEND\\s+RADIUS');
  const tangentLength = descriptionSpecValue(description, 'TANGENT\\s+LENGTH');
  const type = summaryType(poItem, material);
  const dimensions = [odNumber ? localizedSpecNumber(odNumber) : od.replace(/\s*mm$/i, ''), wtNumber ? localizedSpecNumber(wtNumber) : wt.replace(/\s*mm$/i, '')]
    .filter(Boolean).join(' x ');
  const details = [
    ['OD', od], ['ID', id], ['WT', wt], ['Bend WT', bendWt], ['Bend angle', bendAngle],
    ['Bend radius', bendRadius], ['Tangent length', tangentLength], ['MR item', mrItem],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value }));
  return {
    tag,
    mrItem,
    type,
    material,
    dimensions,
    summary: [type, material, dimensions ? `D${dimensions}` : ''].filter(Boolean).join(' · '),
    details,
    searchText: [poItem.itemNumber, tag, mrItem, material, poItem.materialCode, poItem.identCode, poItem.traceability, poItem.itemType, type, description]
      .filter(Boolean).join(' ').toLocaleLowerCase(),
  };
}
