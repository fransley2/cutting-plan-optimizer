import { getDB } from './database.js';
import { idbGet, idbPut } from './idb.js';
import { DEFAULT_LANGUAGE, normalizeLanguage } from '../i18n/index.js';

const STORE_NAME = 'settings';
const SETTINGS_ID = 'appSettings';

export const CUTTING_METHOD_PRESETS = [
  { id: 'laser', label: 'Laser', kerf: 1 },
  { id: 'plasma', label: 'Plasma', kerf: 4 },
  { id: 'oxyfuel', label: 'Oxicorte', kerf: 6 },
  { id: 'bandsaw', label: 'Serra de Fita', kerf: 3 },
];

export const DEFAULT_MATERIALS_CATALOG = [
  'API 5L X52', 'API 5L X60', 'A36', 'A106 Gr B',
  'A333 Gr 6', 'AISI 316L', 'AISI 304', 'A516 Gr 70',
];

export const DEFAULT_REPORT_HEADER = Object.freeze({
  companyName: 'Saipem do Brasil',
  subtitle: '',
  logoUrl: 'https://i.ibb.co/wZZQrZW0/Saipem-logo-300px.png',
  documentTitles: Object.freeze({
    cuttingPlan: 'Cutting Plan Report',
    materialCoupon: 'MATERIAL COUPON',
    returnMaterialVoucher: 'RETURNED MATERIAL VOUCHER',
  }),
});

export const DEFAULT_MATERIAL_COUPON_FORM = Object.freeze({
  docNumber: 'FORM-SDB-EXE-FAB-018-E-R01',
  docRevision: '01',
  docRevisionDate: '13/12/2025',
  docReference: 'STD_GR-SDB-EXE-FAB-008-E',
  reference: '',
  notes: '',
});

export const DEFAULT_RETURN_MATERIAL_VOUCHER_FORM = Object.freeze({
  docNumber: 'FORM-SDB-EXE-FAB-019-E-R01',
  docRevision: '01',
  docRevisionDate: '06/01/2026',
  docReference: 'STD_GR-SDB-EXE-FAB-008-E',
  origin: '',
  destination: '',
  reference: '',
  notes: '',
});

export const DEFAULT_MATERIAL_COUPON_REPORT_LAYOUT = Object.freeze([
  ['serialNumber',3],['sapCode',6],['itemType',6],['materialDescription',20],['qty',3],['unit',3],['diaMm',4],['thicknessMm',5],
  ['widthMm',4],['lengthMm',4],['weightKg',4],['materialGrade',6],['traceability',8],['heatNo',6],['mir',4],['equipment',4],['poItem',4],['nfArrival',4],['notes',6],
].map(([key,width]) => Object.freeze(key === 'widthMm' ? { key, width } : { key, width, visible: true })));

const DEFAULTS = {
  id: SETTINGS_ID,
  language: DEFAULT_LANGUAGE,
  defaultKerf: 5,
  defaultMinOffcut: 500,
  defaultStockStrategy: 'best-fit',
  defaultTrimEnabled: false,
  defaultLeftTrim: 0,
  defaultRightTrim: 0,
  requireTraceability: false,
  activeProjectName: '',
  materialsCatalog: DEFAULT_MATERIALS_CATALOG,
  reportHeader: DEFAULT_REPORT_HEADER,
  materialCouponForm: DEFAULT_MATERIAL_COUPON_FORM,
  returnMaterialVoucherForm: DEFAULT_RETURN_MATERIAL_VOUCHER_FORM,
  materialCouponReportLayout: DEFAULT_MATERIAL_COUPON_REPORT_LAYOUT,
};

export function normalizeReportHeader(rawReportHeader = {}) {
  const raw = rawReportHeader && typeof rawReportHeader === 'object' ? rawReportHeader : {};
  const rawTitles = raw.documentTitles && typeof raw.documentTitles === 'object' ? raw.documentTitles : {};
  const legacyTitle = String(raw.documentTitle || '').trim();
  const cuttingPlanTitle = String(rawTitles.cuttingPlan || '').trim();
  const materialCouponTitle = String(rawTitles.materialCoupon || '').trim();
  const returnMaterialVoucherTitle = String(rawTitles.returnMaterialVoucher || '').trim();
  return {
    companyName: String(raw.companyName || DEFAULT_REPORT_HEADER.companyName).trim(),
    subtitle: String(raw.subtitle || '').trim(),
    logoUrl: String(raw.logoUrl || DEFAULT_REPORT_HEADER.logoUrl).trim(),
    documentTitles: {
      ...DEFAULT_REPORT_HEADER.documentTitles,
      ...rawTitles,
      cuttingPlan: cuttingPlanTitle || legacyTitle || DEFAULT_REPORT_HEADER.documentTitles.cuttingPlan,
      materialCoupon: materialCouponTitle || DEFAULT_REPORT_HEADER.documentTitles.materialCoupon,
      returnMaterialVoucher: returnMaterialVoucherTitle || DEFAULT_REPORT_HEADER.documentTitles.returnMaterialVoucher,
    },
  };
}

export async function getAppSettings() {
  const db = await getDB();
  const saved = await idbGet(db, STORE_NAME, SETTINGS_ID);
  const merged = { ...DEFAULTS, ...(saved || {}) };
  return {
    ...merged,
    language: normalizeLanguage(merged.language),
    reportHeader: normalizeReportHeader(saved?.reportHeader),
    materialCouponForm: { ...DEFAULT_MATERIAL_COUPON_FORM, ...(saved?.materialCouponForm || {}) },
    returnMaterialVoucherForm: { ...DEFAULT_RETURN_MATERIAL_VOUCHER_FORM, ...(saved?.returnMaterialVoucherForm || {}) },
    materialCouponReportLayout: Array.isArray(saved?.materialCouponReportLayout) ? saved.materialCouponReportLayout : DEFAULT_MATERIAL_COUPON_REPORT_LAYOUT.map((item) => ({ ...item })),
  };
}

export async function saveAppSettings(partialSettings) {
  const current = await getAppSettings();
  const db = await getDB();
  const partialReportHeader = partialSettings?.reportHeader;
  const mergedReportHeader = partialReportHeader === undefined
    ? current.reportHeader
    : {
      ...current.reportHeader,
      ...partialReportHeader,
      documentTitles: {
        ...current.reportHeader.documentTitles,
        ...(partialReportHeader?.documentTitles || {}),
      },
    };
  const updated = {
    ...current,
    ...(partialSettings || {}),
    id: SETTINGS_ID,
    language: normalizeLanguage(partialSettings?.language ?? current.language),
    reportHeader: normalizeReportHeader(mergedReportHeader),
    materialCouponForm: { ...current.materialCouponForm, ...(partialSettings?.materialCouponForm || {}) },
    returnMaterialVoucherForm: { ...current.returnMaterialVoucherForm, ...(partialSettings?.returnMaterialVoucherForm || {}) },
  };
  await idbPut(db, STORE_NAME, updated);
  return updated;
}

export async function getActiveProjectName() {
  const settings = await getAppSettings();
  return settings.activeProjectName || '';
}

export async function setActiveProjectName(name) {
  const settings = await saveAppSettings({ activeProjectName: name || '' });
  return settings.activeProjectName || '';
}
