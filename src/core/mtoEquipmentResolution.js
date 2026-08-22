import { equipmentTags } from './equipmentPortfolio.js';
import { normalizeTechnicalTag } from './technicalTag.js';

export const MTO_TAG_RESOLUTION = Object.freeze({
  MISSING_TAG: 'missing-tag',
  RESOLVED: 'resolved',
  UNMATCHED: 'unmatched',
  AMBIGUOUS: 'ambiguous',
});

export function resolveMtoEquipmentByTag(item = {}, equipments = []) {
  const tag = String(item?.tag ?? '').trim();
  const normalizedTag = normalizeTechnicalTag(tag);
  if (!normalizedTag) {
    return { status: MTO_TAG_RESOLUTION.MISSING_TAG, tag: '', equipment: null, matches: [] };
  }

  const matches = (Array.isArray(equipments) ? equipments : []).filter((equipment) => (
    equipmentTags(equipment).some((equipmentTag) => normalizeTechnicalTag(equipmentTag) === normalizedTag)
  ));
  if (matches.length === 1) {
    return { status: MTO_TAG_RESOLUTION.RESOLVED, tag, equipment: matches[0], matches };
  }
  return {
    status: matches.length > 1 ? MTO_TAG_RESOLUTION.AMBIGUOUS : MTO_TAG_RESOLUTION.UNMATCHED,
    tag,
    equipment: null,
    matches,
  };
}
