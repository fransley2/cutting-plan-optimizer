import { legacyPlanToCuttingSheetDraft } from '../core/cuttingSheetPlanning.js';
import { getAllPlans } from './plans.js';
import { getAllCuttingSheets, saveCuttingSheet } from './cuttingSheets.js';
import { ensureWorkpackLink, listWorkpackLinks, unlinkWorkpackTarget, WORKPACK_LINK_TARGETS } from './workpackLinks.js';

function text(value) { return value == null ? '' : String(value).trim(); }

export async function migratePlansToCuttingSheets({ actor = '' } = {}) {
  const [plans, initialSheets, links] = await Promise.all([getAllPlans(), getAllCuttingSheets(), listWorkpackLinks()]);
  const sheets = [...initialSheets];
  const migrated = [];

  for (const plan of plans) {
    const planName = text(plan?.name);
    if (!planName) continue;
    const existing = sheets.find((sheet) => text(sheet.number).toLowerCase() === planName.toLowerCase()) || null;
    const skipped = Boolean(existing?.metadata?.migratedFromLegacyPlan
      && text(existing.metadata.legacyPlanSavedAt) === text(plan.savedAt));
    const saved = skipped ? existing : await saveCuttingSheet(legacyPlanToCuttingSheetDraft(plan, existing));
    if (!skipped) {
      if (!existing) sheets.push(saved);
      else sheets.splice(sheets.indexOf(existing), 1, saved);
    }

    const legacyLinks = links.filter((link) => link.targetType === WORKPACK_LINK_TARGETS.NESTING_PLAN
      && link.targetId === planName && link.status === 'ACTIVE');
    const workpackIds = new Set([
      text(saved.workpackId),
      ...legacyLinks.map((link) => text(link.workpackId)),
    ].filter(Boolean));
    for (const workpackId of workpackIds) {
      const sourceLink = legacyLinks.find((link) => link.workpackId === workpackId);
      await ensureWorkpackLink({
        projectId: saved.projectId || sourceLink?.projectId || '',
        workpackId,
        targetType: WORKPACK_LINK_TARGETS.CUTTING_SHEET,
        targetId: saved.id,
        linkedBy: actor,
        metadata: { migratedFromTargetType: WORKPACK_LINK_TARGETS.NESTING_PLAN, legacyPlanName: planName },
      });
    }
    for (const link of legacyLinks) await unlinkWorkpackTarget(link.id, actor);
    migrated.push({ planName, cuttingSheet: saved, skipped });
  }
  return { migrated, total: migrated.length, changed: migrated.filter((item) => !item.skipped).length };
}
