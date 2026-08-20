import { exportMtoImportTemplateExcel, listExcelSheetNames, readExcelSheetPreview } from '../data/excel.js';
import {
  MTO_IMPORT_COLUMN_DEFINITIONS,
  mtoColumnMappingFromSuggestions,
  parseMtoFile,
  suggestMtoColumnMappings,
} from '../data/mtoImport.js';
import { analyzeImportImpact } from '../data/mtoDB.js';
import { buildDefaultMtoImportPlan } from '../data/mtoImportPlan.js';
import {
  applyMtoImportDecisions,
  createMtoImportDecisionState,
  getZeroMtoImportOutcome,
} from '../data/mtoImportDecisions.js';
import {
  createMtoImportDecisionReview,
  openMtoImportDecisionModal,
} from './mtoImportDecisionModal.js';

export const MTO_IMPORT_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const MTO_IMPORT_WIZARD_STEPS = Object.freeze([
  { id: 'file', label: 'Arquivo' },
  { id: 'sheet', label: 'Planilha' },
  { id: 'review', label: 'Revisao' },
  { id: 'confirm', label: 'Confirmacao' },
]);

const ALLOWED_EXTENSIONS = Object.freeze(['.xlsx', '.xls', '.csv']);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function mtoValidationGuidance(error) {
  const messages = {
    'Missing drawing': 'Drawing ausente: selecione a coluna que contem o numero do desenho.',
    'Missing mark': 'Mark ausente: selecione a coluna de spool ou marca.',
    'Missing POS': 'Position ausente: selecione a coluna de posicao.',
    'Missing material': 'Material ausente: selecione a coluna que contem o grau ou especificacao do material.',
    'Missing quantity': 'Quantity ausente: selecione a coluna de quantidade.',
    'Invalid quantity format': 'Quantity invalida: corrija valores que nao sao numeros.',
    'Invalid quantity': 'Quantity invalida: use um numero maior que zero.',
    'Missing cut length': 'Length/mm ausente: selecione a coluna de comprimento.',
    'Invalid cut length format': 'Length/mm invalido: corrija valores que nao sao numeros.',
    'Invalid cut length': 'Length/mm invalido: use um numero maior que zero.',
  };
  return messages[error] || error;
}

export function mtoImportFileExtension(fileName = '') {
  const match = text(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] || '';
}

export function validateMtoImportFile(file, { maxSizeBytes = MTO_IMPORT_MAX_FILE_SIZE_BYTES } = {}) {
  const extension = mtoImportFileExtension(file?.name);
  const size = Number(file?.size);
  const errors = [];
  if (!file) errors.push({ code: 'FILE_REQUIRED', message: 'Selecione um arquivo para continuar.' });
  if (file && !ALLOWED_EXTENSIONS.includes(extension)) {
    errors.push({ code: 'FILE_EXTENSION_INVALID', message: 'Use um arquivo .xlsx, .xls ou .csv.' });
  }
  if (file && (!Number.isFinite(size) || size <= 0)) {
    errors.push({ code: 'FILE_EMPTY', message: 'O arquivo selecionado esta vazio.' });
  }
  if (file && Number.isFinite(size) && size > maxSizeBytes) {
    errors.push({
      code: 'FILE_TOO_LARGE',
      message: `O arquivo excede o limite de ${Math.round(maxSizeBytes / 1024 / 1024)} MiB.`,
    });
  }
  return { valid: errors.length === 0, extension, size: Number.isFinite(size) ? size : 0, errors };
}

export function createMtoImportSheetState(sheetNames = []) {
  const names = Array.isArray(sheetNames) ? sheetNames.map(text).filter(Boolean) : [];
  return {
    sheetNames: names,
    selectedSheetName: names[0] || '',
    headerRowInput: '1',
    headerRowIndex: 0,
  };
}

export function selectMtoImportSheet(state, sheetName) {
  const selectedSheetName = text(sheetName);
  if (!state?.sheetNames?.includes(selectedSheetName)) return state;
  return { ...state, selectedSheetName };
}

export function setMtoImportHeaderRow(state, displayedRowNumber) {
  const headerRowInput = String(displayedRowNumber ?? '');
  const rowNumber = Number(headerRowInput);
  const headerRowIndex = Number.isInteger(rowNumber) && rowNumber >= 1 ? rowNumber - 1 : null;
  return { ...state, headerRowInput, headerRowIndex };
}

export function buildMtoImportConfirmationSummary(importPlan = {}) {
  const counts = importPlan.counts || {};
  const lines = [
    `${counts.itemsToImport || 0} linha(s) segura(s) serao importadas`,
    `${counts.itemsToSupersede || 0} item(ns) serao superseded`,
    `${counts.duplicates || counts.ignoredDuplicates || 0} duplicado(s) identico(s) serao ignorados`,
    `${counts.keptExisting || 0} item(ns) serao mantidos existentes`,
    `${counts.unresolvedDecisions ?? counts.pendingDecisions ?? 0} item(ns) permanecem aguardando decisao`,
  ];
  if (counts.consolidatedConflicts) {
    lines.push(`${counts.consolidatedConflicts} grupo(s) duplicado(s) tiveram as quantidades somadas`);
  }
  if (counts.discardedDuplicateRows) {
    lines.push(`${counts.discardedDuplicateRows} linha(s) repetida(s) foram absorvidas ou descartadas`);
  }
  const alerts = [];
  if (counts.olderRevisions > 0) alerts.push(`${counts.olderRevisions} peca(s) tem revisao mais antiga que a existente e aguardam decisao`);
  if (counts.unknownRevisions > 0) alerts.push(`${counts.unknownRevisions} peca(s) tem revisao nao comparavel e aguardam decisao`);
  if (counts.sameRevisionChanged > 0) alerts.push(`${counts.sameRevisionChanged} peca(s) tem a mesma revisao com conteudo alterado e aguardam decisao`);
  if (counts.conflictingRowsInsideFile > 0) alerts.push(`${counts.conflictingRowsInsideFile} linha(s) compartilham Drawing, Mark e POS dentro do arquivo e aguardam decisao`);
  const olderRevisions = (importPlan.pendingDecisions?.olderRevisions || []).map(({ newItem, existingItem }) => ({
    identity: [newItem?.drawing, newItem?.mark, newItem?.pos].map((value) => value || '-').join(' | '),
    existingRevision: existingItem?.revision || '-',
    importedRevision: newItem?.revision || '-',
  }));
  return { lines, alerts, olderRevisions };
}

export function transitionMtoImportConfirmation(state, action) {
  if (action === 'continue' && state.currentStep === 2 && state.review) {
    return { ...state, currentStep: 3, result: undefined };
  }
  if (action === 'back' && state.currentStep === 3) {
    return { ...state, currentStep: 2, result: undefined };
  }
  if (action === 'confirm' && state.currentStep === 3 && state.review) {
    return { ...state, result: state.review };
  }
  if (action === 'cancel') return { ...state, result: null };
  return state;
}

export async function prepareMtoImportReview({
  file,
  sheetName,
  headerRowIndex,
  columnMapping,
  projectId = '',
  parseFile = parseMtoFile,
  prepareItems = async (items) => items,
  analyzeImpact = analyzeImportImpact,
  buildImportPlan = buildDefaultMtoImportPlan,
  createDecisionState = createMtoImportDecisionState,
  applyDecisions = applyMtoImportDecisions,
  openDecisionModal = openMtoImportDecisionModal,
  getZeroOutcome = getZeroMtoImportOutcome,
  isCancelled = () => false,
  onImportPlan = () => {},
} = {}) {
  const parseOptions = {
    projectId,
    metadata: { sourceFileName: file?.name || '' },
    sheetName,
    headerRowIndex,
  };
  if (columnMapping && Object.keys(columnMapping).length) parseOptions.columnMapping = columnMapping;
  const parsed = await parseFile(file, parseOptions);
  if (isCancelled()) return { status: 'cancelled' };
  if (parsed.rejectedItems.length) {
    return {
      status: 'rejected',
      parsed,
      validationErrors: parsed.rejectedItems.map((item, index) => ({
        rowNumber: Number(item.sourceRowNumber) || index + 1,
        errors: item.validationErrors,
      })),
    };
  }

  const items = await prepareItems(parsed.items);
  if (isCancelled()) return { status: 'cancelled' };
  const impact = await analyzeImpact(items, { projectId });
  if (isCancelled()) return { status: 'cancelled' };
  const importPlan = buildImportPlan(items, impact);
  onImportPlan(importPlan);
  let selectedDecisions = createDecisionState(importPlan);
  const resolveDecisions = (decisions) => applyDecisions({
    items,
    impact,
    importPlan,
    decisions,
  });
  let reviewAction = 'default';
  let effectivePlan = null;

  if (importPlan.hasPendingDecisions) {
    const review = await openDecisionModal(importPlan, selectedDecisions, {
      applyDecisions: resolveDecisions,
      getZeroOutcome,
    });
    if (isCancelled()) return { status: 'cancelled' };
    if (review.action === 'cancel') return { status: 'cancelled' };
    reviewAction = review.action;
    selectedDecisions = review.action === 'apply' ? review.decisions : [];
    effectivePlan = review.effectivePlan || null;
  }

  effectivePlan ||= await resolveDecisions(selectedDecisions);
  return {
    status: 'ready',
    file,
    sheetName,
    headerRowIndex,
    columnMapping: { ...(columnMapping || {}) },
    parsed,
    impact,
    importPlan,
    effectivePlan,
    reviewAction,
    itemsToImport: effectivePlan.itemsToImport,
    itemsToSupersede: effectivePlan.itemsToSupersede,
    auditSummary: effectivePlan.auditSummary,
  };
}

export function buildMtoImportMappingState(previewRows = [], headerRowIndex = 0) {
  const headers = Array.isArray(previewRows?.[headerRowIndex]) ? previewRows[headerRowIndex] : [];
  const suggestions = suggestMtoColumnMappings(headers);
  return {
    headers: headers.map(text).filter(Boolean),
    suggestions,
    columnMapping: mtoColumnMappingFromSuggestions(suggestions),
  };
}

function populatedRows(rows = []) {
  return rows.filter((row) => Array.isArray(row) && row.some((cell) => text(cell)));
}

function dataRowCount(rows = []) {
  return Math.max(0, populatedRows(rows).length - 1);
}

function csvRows(csvText) {
  return String(csvText || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => text(line))
    .map((line) => [line]);
}

/**
 * Reads only workbook structure and row counts. Field parsing and MTO
 * validation remain owned by parseMtoFile after the wizard is connected.
 */
export async function inspectMtoImportFile(file, { xlsx = globalThis.XLSX } = {}) {
  const extension = mtoImportFileExtension(file?.name);
  if (extension === '.csv') {
    const rows = csvRows(await file.text());
    const sheets = [{ name: file.name, rowCount: dataRowCount(rows) }];
    return { sheets, totalRows: sheets[0].rowCount };
  }
  if (!xlsx?.read || !xlsx?.utils?.sheet_to_json) {
    throw new Error('SheetJS nao esta disponivel para inspecionar a planilha.');
  }
  const workbook = xlsx.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const sheets = workbook.SheetNames.map((name) => ({
    name,
    rowCount: dataRowCount(xlsx.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' })),
  }));
  return { sheets, totalRows: sheets.reduce((total, sheet) => total + sheet.rowCount, 0) };
}

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content != null) node.textContent = content;
  return node;
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KiB`;
  return `${(size / 1024 / 1024).toFixed(1)} MiB`;
}

function wizardStyles() {
  const style = element('style');
  style.textContent = `
    .mto-import-wizard {
      width: min(1040px, calc(100vw - var(--space-6)));
      max-height: calc(100vh - var(--space-6));
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      background: var(--color-bg);
      color: var(--color-text);
      box-shadow: var(--shadow-lg);
      font-family: var(--font-family);
    }
    .mto-import-wizard-layout,
    .mto-import-wizard-body,
    .mto-import-wizard-file-info,
    .mto-import-wizard-preview,
    .mto-import-wizard-sheet-fields { display: grid; gap: var(--space-4); }
    .mto-import-wizard-layout { max-height: inherit; grid-template-rows: auto minmax(0, 1fr) auto; }
    .mto-import-wizard-header,
    .mto-import-wizard-footer { padding: var(--space-4) var(--space-5); }
    .mto-import-wizard-header { border-bottom: 1px solid var(--color-border); }
    .mto-import-wizard-header h2,
    .mto-import-wizard-header p,
    .mto-import-wizard-body p { margin: 0; }
    .mto-import-wizard-steps { display: flex; gap: var(--space-2); padding: 0; margin: var(--space-4) 0 0; list-style: none; }
    .mto-import-wizard-step { padding: var(--space-2) var(--space-3); border-radius: var(--radius-md); background: var(--color-bg-subtle); color: var(--color-text-muted); }
    .mto-import-wizard-step[aria-current="step"] { background: var(--color-primary); color: var(--color-text-inverse); }
    .mto-import-wizard-body { padding: var(--space-5); overflow: auto; }
    .mto-import-wizard-project,
    .mto-import-wizard-template,
    .mto-import-wizard-dropzone,
    .mto-import-wizard-file-info,
    .mto-import-wizard-preview { padding: var(--space-4); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .mto-import-wizard-project { background: var(--color-bg-subtle); }
    .mto-import-wizard-template {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-4);
      align-items: center;
      border-left: 4px solid var(--color-primary);
      background: var(--color-bg-subtle);
    }
    .mto-import-wizard-template-copy { display: grid; gap: var(--space-2); min-width: 0; }
    .mto-import-wizard-template-copy small { color: var(--color-text-muted); }
    .mto-import-wizard-template .btn { white-space: nowrap; }
    .mto-import-wizard-dropzone { text-align: center; border-style: dashed; background: var(--color-bg-subtle); }
    .mto-import-wizard-dropzone.is-dragging { border-color: var(--color-primary); background: var(--color-success-bg); }
    .mto-import-wizard-errors { margin: 0; color: var(--color-critical); }
    .mto-import-wizard-mapping { display: grid; gap: var(--space-3); }
    .mto-import-wizard-mapping-row { display: grid; grid-template-columns: minmax(130px, .7fr) minmax(190px, 1fr) minmax(180px, 1fr); gap: var(--space-3); align-items: center; }
    .mto-import-wizard-mapping-row small { color: var(--color-text-muted); }
    .mto-import-wizard-mapping-row small[data-confidence="review"] { color: var(--color-critical); }
    .mto-import-wizard-table-wrap { overflow: auto; border: 1px solid var(--color-border); border-radius: var(--radius-md); }
    .mto-import-wizard-table { width: 100%; border-collapse: collapse; white-space: nowrap; }
    .mto-import-wizard-table th,
    .mto-import-wizard-table td { padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-border); text-align: left; }
    .mto-import-wizard-table th { background: var(--color-bg-subtle); color: var(--color-text-muted); }
    .mto-import-wizard-sheet-fields label { display: grid; gap: var(--space-2); }
    .mto-import-wizard-footer { display: flex; justify-content: flex-end; gap: var(--space-2); border-top: 1px solid var(--color-border); }
    @media (max-width: 640px) {
      .mto-import-wizard-template { grid-template-columns: 1fr; }
      .mto-import-wizard-template .btn { justify-self: start; }
      .mto-import-wizard-mapping-row { grid-template-columns: 1fr; }
    }
  `;
  return style;
}

/**
 * Temporary behavior: Continue on Step 3 resolves with a processed import plan
 * until final confirmation becomes Step 4. Cancel resolves with null. No MTO
 * persistence happens here.
 */
export function openMtoImportWizard({
  projectId = '',
  projectName = '',
  inspectFile = inspectMtoImportFile,
  listSheetNames = listExcelSheetNames,
  readSheetPreview = readExcelSheetPreview,
  downloadTemplate = exportMtoImportTemplateExcel,
  prepareItems,
  prepareReview = prepareMtoImportReview,
  onValidationErrors,
} = {}) {
  const state = {
    currentStep: 0,
    steps: MTO_IMPORT_WIZARD_STEPS,
    file: null,
    validation: validateMtoImportFile(null),
    inspection: null,
    inspectionError: '',
    inspecting: false,
    sheet: createMtoImportSheetState(),
    previewRows: [],
    previewError: '',
    loadingPreview: false,
    reviewing: false,
    reviewError: '',
    review: null,
    importPlan: null,
    validationErrors: [],
    mappingHeaders: [],
    mappingSuggestions: [],
    columnMapping: {},
    decisionReview: null,
  };

  return new Promise((resolve) => {
    const dialog = element('dialog', 'mto-import-wizard');
    const layout = element('div', 'mto-import-wizard-layout');
    const header = element('header', 'mto-import-wizard-header');
    const title = element('h2', null, 'Importar MTO');
    const subtitle = element('p', 'text-muted');
    header.append(title, subtitle);
    const steps = element('ol', 'mto-import-wizard-steps');
    state.steps.forEach((step, index) => {
      const item = element('li', 'mto-import-wizard-step', `${index + 1}. ${step.label}`);
      steps.append(item);
    });
    header.append(steps);

    const body = element('section', 'mto-import-wizard-body');
    const templateCard = element('div', 'mto-import-wizard-template');
    const templateCopy = element('div', 'mto-import-wizard-template-copy');
    templateCopy.append(
      element('strong', null, 'Modelo Excel para importação'),
      element('p', null, 'Baixe o arquivo padrão para garantir que os dados sejam reconhecidos corretamente.'),
      element('small', null, 'Obrigatórios: Drawing, Mark, Position, Quantity, Length/mm e Material.'),
    );
    const templateAction = element('div', 'mto-import-wizard-template-copy');
    const templateButton = element('button', 'btn btn-secondary');
    templateButton.type = 'button';
    const templateIcon = element('span', 'material-symbols-outlined', 'download');
    templateIcon.setAttribute('aria-hidden', 'true');
    templateButton.append(templateIcon, element('span', null, 'Baixar modelo Excel'));
    const templateFeedback = element('small', 'text-muted');
    templateFeedback.setAttribute('aria-live', 'polite');
    templateAction.append(templateButton, templateFeedback);
    templateCard.append(templateCopy, templateAction);
    const dropzone = element('div', 'mto-import-wizard-dropzone');
    dropzone.tabIndex = 0;
    dropzone.setAttribute('role', 'button');
    dropzone.setAttribute('aria-label', 'Selecionar ou soltar arquivo MTO');
    dropzone.append(
      element('strong', null, 'Arraste o arquivo MTO para esta area'),
      element('p', 'text-muted', 'Formatos aceitos: .xlsx, .xls e .csv. Limite: 25 MiB.'),
    );
    const choose = element('button', 'btn btn-secondary', 'Selecionar arquivo');
    choose.type = 'button';
    const input = element('input');
    input.type = 'file';
    input.accept = ALLOWED_EXTENSIONS.join(',');
    input.hidden = true;
    dropzone.append(choose, input);

    const status = element('div');
    status.setAttribute('aria-live', 'polite');
    const footer = element('footer', 'mto-import-wizard-footer');
    const cancelButton = element('button', 'btn btn-ghost', 'Cancelar');
    cancelButton.type = 'button';
    const backButton = element('button', 'btn btn-secondary', 'Voltar');
    backButton.type = 'button';
    backButton.disabled = true;
    const continueButton = element('button', 'btn btn-primary', 'Continuar');
    continueButton.type = 'button';
    continueButton.disabled = true;
    footer.append(cancelButton, backButton, continueButton);
    layout.append(header, body, footer);
    dialog.append(wizardStyles(), layout);
    document.body.append(dialog);

    let selectionVersion = 0;
    let previewVersion = 0;
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const cancel = () => {
      state.decisionReview?.cancel();
      finish(null);
    };
    const project = () => {
      const node = element('div', 'mto-import-wizard-project');
      node.append(
        element('strong', null, 'Projeto ativo'),
        element('p', null, text(projectName) || text(projectId) || 'Nenhum projeto ativo'),
      );
      return node;
    };

    const renderStatus = () => {
      const nodes = [];
      if (state.file) {
        const fileInfo = element('div', 'mto-import-wizard-file-info');
        fileInfo.append(
          element('strong', null, state.file.name),
          element('span', 'text-muted', formatFileSize(state.file.size)),
        );
        nodes.push(fileInfo);
      }
      if (state.validation.errors.length) {
        const errors = element('ul', 'mto-import-wizard-errors');
        state.validation.errors.forEach((error) => errors.append(element('li', null, error.message)));
        nodes.push(errors);
      }
      if (state.inspecting) nodes.push(element('p', 'text-muted', 'Lendo estrutura do arquivo...'));
      if (state.inspectionError) nodes.push(element('p', 'mto-import-wizard-errors', state.inspectionError));
      if (state.inspection) {
        const preview = element('div', 'mto-import-wizard-preview');
        preview.append(element('strong', null, `Planilhas encontradas: ${state.inspection.sheets.length}`));
        const list = element('ul');
        state.inspection.sheets.forEach((sheet) => {
          list.append(element('li', null, `${sheet.name}: ${sheet.rowCount} linha(s)`));
        });
        preview.append(list, element('span', 'text-muted', `Total: ${state.inspection.totalRows} linha(s)`));
        nodes.push(preview);
      }
      status.replaceChildren(...nodes);
    };

    const renderPreviewTable = () => {
      const wrap = element('div', 'mto-import-wizard-table-wrap');
      const table = element('table', 'mto-import-wizard-table');
      const tbody = element('tbody');
      state.previewRows.forEach((values, rowIndex) => {
        const row = element('tr');
        const number = element('th', null, String(rowIndex + 1));
        number.scope = 'row';
        row.append(number);
        (Array.isArray(values) ? values : []).forEach((value) => row.append(element('td', null, value)));
        tbody.append(row);
      });
      table.append(tbody);
      wrap.append(table);
      return wrap;
    };

    const refreshColumnMapping = () => {
      const mappingState = buildMtoImportMappingState(state.previewRows, state.sheet.headerRowIndex);
      state.mappingHeaders = mappingState.headers;
      state.mappingSuggestions = mappingState.suggestions;
      state.columnMapping = mappingState.columnMapping;
      state.validationErrors = [];
    };

    const hasRequiredColumnMapping = () => MTO_IMPORT_COLUMN_DEFINITIONS
      .filter(({ required }) => required)
      .every(({ field }) => text(state.columnMapping[field]));

    const loadPreview = async () => {
      const version = ++previewVersion;
      state.loadingPreview = true;
      state.previewRows = [];
      state.previewError = '';
      render();
      try {
        const rows = await readSheetPreview(state.file, state.sheet.selectedSheetName, 15);
        if (version === previewVersion) {
          state.previewRows = Array.isArray(rows) ? rows : [];
          refreshColumnMapping();
        }
      } catch (error) {
        if (version === previewVersion) {
          state.previewError = error?.message || 'Nao foi possivel carregar a previa da planilha.';
        }
      } finally {
        if (version === previewVersion) {
          state.loadingPreview = false;
          render();
        }
      }
    };

    const renderFileStep = () => {
      renderStatus();
      body.replaceChildren(project(), templateCard, dropzone, status);
      continueButton.disabled = !state.validation.valid || state.inspecting || !state.inspection || Boolean(state.inspectionError);
    };

    const renderColumnMapping = () => {
      const card = element('div', 'mto-import-wizard-preview mto-import-wizard-mapping');
      card.append(
        element('strong', null, 'Autocorrecao dos titulos'),
        element('p', 'text-muted', 'O sistema encontrou colunas parecidas. Revise as obrigatorias; continuar aceita este mapeamento apenas para esta importacao.'),
      );
      state.mappingSuggestions.filter(({ required }) => required).forEach((suggestion) => {
        const row = element('label', 'mto-import-wizard-mapping-row');
        row.append(element('strong', null, `${suggestion.label} *`));
        const select = element('select', 'form-control');
        const empty = element('option', null, 'Selecione uma coluna');
        empty.value = '';
        select.append(empty);
        state.mappingHeaders.forEach((header) => {
          const option = element('option', null, header);
          option.value = header;
          option.selected = state.columnMapping[suggestion.field] === header;
          select.append(option);
        });
        select.addEventListener('change', () => {
          state.columnMapping = { ...state.columnMapping, [suggestion.field]: select.value };
          state.validationErrors = [];
          const selected = state.mappingSuggestions.find(({ field }) => field === suggestion.field);
          if (selected) {
            selected.sourceHeader = select.value;
            selected.confidence = select.value ? 'manual' : 'none';
            selected.reason = select.value
              ? 'Coluna escolhida manualmente.'
              : 'Campo obrigatorio sem coluna de origem.';
          }
          render();
        });
        const explanation = element('small', null, suggestion.reason);
        explanation.dataset.confidence = suggestion.confidence;
        row.append(select, explanation);
        card.append(row);
      });
      const optionalMappings = state.mappingSuggestions
        .filter(({ required, sourceHeader }) => !required && sourceHeader)
        .map(({ label, sourceHeader }) => `${label} <- ${sourceHeader}`);
      if (optionalMappings.length) {
        const details = element('details');
        details.append(element('summary', null, `${optionalMappings.length} campo(s) opcional(is) reconhecido(s)`));
        const list = element('ul');
        optionalMappings.forEach((mapping) => list.append(element('li', null, mapping)));
        details.append(list);
        card.append(details);
      }
      return card;
    };

    const renderSheetStep = () => {
      const fields = element('div', 'mto-import-wizard-sheet-fields');
      if (state.sheet.sheetNames.length > 1) {
        const sheetLabel = element('label');
        sheetLabel.append(element('span', null, 'Planilha'));
        const select = element('select', 'form-control');
        state.sheet.sheetNames.forEach((name) => {
          const option = element('option', null, name);
          option.value = name;
          option.selected = name === state.sheet.selectedSheetName;
          select.append(option);
        });
        select.addEventListener('change', () => {
          state.sheet = selectMtoImportSheet(state.sheet, select.value);
          loadPreview();
        });
        sheetLabel.append(select);
        fields.append(sheetLabel);
      } else {
        const onlySheet = element('div', 'mto-import-wizard-project');
        onlySheet.append(element('strong', null, 'Planilha'), element('p', null, state.sheet.selectedSheetName));
        fields.append(onlySheet);
      }

      const headerLabel = element('label');
      headerLabel.append(element('span', null, 'Linha do cabecalho'));
      const headerInput = element('input', 'form-control');
      headerInput.type = 'number';
      headerInput.min = '1';
      headerInput.step = '1';
      headerInput.value = state.sheet.headerRowInput;
      headerInput.addEventListener('input', () => {
        state.sheet = setMtoImportHeaderRow(state.sheet, headerInput.value);
        refreshColumnMapping();
        render();
      });
      headerLabel.append(headerInput, element('span', 'text-muted', 'A linha 1 e usada por padrao.'));
      fields.append(headerLabel);

      const nodes = [project(), fields];
      if (!state.loadingPreview && !state.previewError && state.mappingSuggestions.length) {
        nodes.push(renderColumnMapping());
      }
      if (state.validationErrors.length) {
        const errors = element('div', 'mto-import-wizard-preview');
        errors.append(element(
          'p',
          'mto-import-wizard-errors',
          `A importacao foi cancelada: ${state.validationErrors.length} linha(s) precisam de correcao.`,
        ));
        const grouped = new Map();
        state.validationErrors.forEach((failure) => (failure.errors || []).forEach((error) => {
          grouped.set(error, (grouped.get(error) || 0) + 1);
        }));
        const summaryList = element('ul', 'mto-import-wizard-errors');
        grouped.forEach((count, error) => summaryList.append(element('li', null, `${mtoValidationGuidance(error)} ${count} linha(s).`)));
        errors.append(summaryList, element('small', 'text-muted', 'Abaixo estao as primeiras 12 linhas. Ajuste o mapeamento acima e tente novamente.'));
        const list = element('ul', 'mto-import-wizard-errors');
        state.validationErrors.slice(0, 12).forEach((failure) => {
          list.append(element('li', null, `Linha ${failure.rowNumber}: ${(failure.errors || []).map(mtoValidationGuidance).join(' ')}`));
        });
        if (state.validationErrors.length > 12) {
          list.append(element('li', null, `+${state.validationErrors.length - 12} linha(s) com erro.`));
        }
        errors.append(list);
        nodes.push(errors);
      }
      if (state.loadingPreview) nodes.push(element('p', 'text-muted', 'Carregando previa...'));
      if (state.previewError) nodes.push(element('p', 'mto-import-wizard-errors', state.previewError));
      if (!state.loadingPreview && !state.previewError) nodes.push(renderPreviewTable());
      body.replaceChildren(...nodes);
      continueButton.disabled = state.sheet.headerRowIndex == null
        || state.loadingPreview
        || Boolean(state.previewError)
        || !hasRequiredColumnMapping();
    };

    const renderReviewStep = () => {
      const nodes = [project()];
      if (state.reviewing) nodes.push(element('p', 'text-muted', 'Analisando impacto da importacao...'));
      if (state.reviewError) nodes.push(element('p', 'mto-import-wizard-errors', state.reviewError));
      const reviewCounts = state.review?.effectivePlan?.counts || state.importPlan?.counts;
      if (reviewCounts) {
        const counts = reviewCounts;
        const summary = element('div', 'mto-import-wizard-preview');
        summary.append(element('strong', null, 'Resumo da revisao'));
        const list = element('ul');
        [
          `Novos: ${counts.brandNew || 0}`,
          `Novas revisoes: ${counts.newerRevisions || 0}`,
          `Duplicados: ${counts.duplicates || counts.ignoredDuplicates || 0}`,
          `Mesma revisao alterada: ${counts.sameRevisionChanged || 0}`,
          `Revisoes mais antigas: ${counts.olderRevisions || 0}`,
          `Revisoes nao reconhecidas: ${counts.unknownRevisions || 0}`,
          `Conflitos dentro do arquivo: ${counts.conflictingRowsInsideFile || 0}`,
          `Grupos duplicados consolidados: ${counts.consolidatedConflicts || 0}`,
          `Linhas repetidas absorvidas/descartadas: ${counts.discardedDuplicateRows || 0}`,
          `Itens prontos para importar: ${counts.itemsToImport || 0}`,
          `Itens a superseder: ${counts.itemsToSupersede || 0}`,
          `Pendencias restantes: ${counts.unresolvedDecisions ?? counts.pendingDecisions ?? 0}`,
        ].forEach((line) => list.append(element('li', null, line)));
        summary.append(list);
        nodes.push(summary);
      }
      if (state.decisionReview?.element) nodes.push(state.decisionReview.element);
      body.replaceChildren(...nodes);
      continueButton.disabled = state.reviewing || Boolean(state.reviewError) || !state.review || Boolean(state.decisionReview);
    };

    const renderConfirmationStep = () => {
      const summaryData = buildMtoImportConfirmationSummary(state.review?.effectivePlan);
      const summary = element('div', 'mto-import-wizard-preview');
      summary.append(element('strong', null, 'Analise da importacao'));
      const list = element('ul');
      summaryData.lines.forEach((line) => list.append(element('li', null, line)));
      summaryData.alerts.forEach((line) => list.append(element('li', 'mto-import-wizard-errors', line)));
      summary.append(list);
      summaryData.olderRevisions.slice(0, 8).forEach((revision) => {
        summary.append(element(
          'div',
          null,
          `${revision.identity}: existente REV ${revision.existingRevision}, nova REV ${revision.importedRevision}`,
        ));
      });
      if (summaryData.olderRevisions.length > 8) {
        summary.append(element('small', 'text-muted', `+${summaryData.olderRevisions.length - 8} item(ns) adicionais.`));
      }
      body.replaceChildren(project(), summary);
      continueButton.disabled = !state.review;
    };

    const render = () => {
      subtitle.textContent = state.currentStep === 0
        ? 'Etapa 1: selecione e confira o arquivo antes da importacao.'
        : state.currentStep === 1
          ? 'Etapa 2: escolha a planilha e a linha do cabecalho.'
          : state.currentStep === 2
            ? 'Etapa 3: revise o impacto e as decisoes da importacao.'
            : 'Etapa 4: confirme a importacao antes de salvar.';
      [...steps.children].forEach((item, index) => {
        if (index === state.currentStep) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
      backButton.disabled = state.currentStep === 0 || Boolean(state.decisionReview);
      continueButton.textContent = state.currentStep === 3 ? 'Confirmar importacao' : 'Continuar';
      if (state.currentStep === 0) renderFileStep();
      else if (state.currentStep === 1) renderSheetStep();
      else if (state.currentStep === 2) renderReviewStep();
      else renderConfirmationStep();
    };

    const loadSheetStep = async () => {
      state.currentStep = 1;
      state.previewError = '';
      state.loadingPreview = true;
      render();
      try {
        state.sheet = createMtoImportSheetState(await listSheetNames(state.file));
        if (!state.sheet.selectedSheetName) throw new Error('O arquivo nao contem planilhas.');
        await loadPreview();
      } catch (error) {
        state.loadingPreview = false;
        state.previewError = error?.message || 'Nao foi possivel listar as planilhas do arquivo.';
        render();
      }
    };

    const back = () => {
      if (state.currentStep === 0) return;
      previewVersion += 1;
      if (state.currentStep === 3) {
        const transition = transitionMtoImportConfirmation(state, 'back');
        state.currentStep = transition.currentStep;
        render();
        return;
      }
      state.currentStep -= 1;
      if (state.currentStep < 2) {
        state.review = null;
        state.importPlan = null;
      }
      render();
    };

    const loadReviewStep = async () => {
      state.currentStep = 2;
      state.reviewing = true;
      state.reviewError = '';
      state.review = null;
      state.importPlan = null;
      state.validationErrors = [];
      render();
      try {
        const result = await prepareReview({
          file: state.file,
          sheetName: state.sheet.selectedSheetName,
          headerRowIndex: state.sheet.headerRowIndex,
          columnMapping: state.columnMapping,
          projectId,
          prepareItems,
          isCancelled: () => settled,
          onImportPlan: (importPlan) => {
            state.importPlan = importPlan;
            render();
          },
          openDecisionModal: (importPlan, decisions, decisionOptions) => {
            const review = createMtoImportDecisionReview(importPlan, decisions, decisionOptions);
            state.decisionReview = review;
            state.reviewing = false;
            render();
            return review.result.finally(() => {
              if (state.decisionReview === review) state.decisionReview = null;
            });
          },
        });
        if (settled) return;
        if (result.status === 'cancelled') {
          finish(null);
          return;
        }
        if (result.status === 'rejected') {
          state.currentStep = 1;
          state.validationErrors = result.validationErrors;
          onValidationErrors?.(result.validationErrors);
          state.reviewing = false;
          render();
          return;
        }
        state.review = result;
      } catch (error) {
        if (settled) return;
        state.reviewError = error?.message || 'Nao foi possivel analisar a importacao.';
      } finally {
        if (!settled) {
          state.reviewing = false;
          render();
        }
      }
    };
    const advance = async () => {
      if (continueButton.disabled || !state.file) return;
      if (state.currentStep === 0) {
        await loadSheetStep();
        return;
      }
      if (state.currentStep === 1) {
        await loadReviewStep();
        return;
      }
      if (state.currentStep === 2) {
        const transition = transitionMtoImportConfirmation(state, 'continue');
        state.currentStep = transition.currentStep;
        render();
        return;
      }
      const transition = transitionMtoImportConfirmation(state, 'confirm');
      finish(transition.result);
    };

    const selectFile = async (file) => {
      const version = ++selectionVersion;
      state.file = file || null;
      state.validation = validateMtoImportFile(state.file);
      state.inspection = null;
      state.inspectionError = '';
      state.inspecting = state.validation.valid;
      render();
      if (!state.validation.valid) return;
      try {
        const inspection = await inspectFile(state.file);
        if (version !== selectionVersion) return;
        state.inspection = inspection;
      } catch (error) {
        if (version !== selectionVersion) return;
        state.inspectionError = error?.message || 'Nao foi possivel ler a estrutura do arquivo.';
      } finally {
        if (version === selectionVersion) {
          state.inspecting = false;
          render();
        }
      }
    };

    choose.addEventListener('click', () => input.click());
    templateButton.addEventListener('click', async () => {
      templateButton.disabled = true;
      templateFeedback.className = 'text-muted';
      templateFeedback.textContent = 'Preparando o modelo...';
      try {
        await downloadTemplate({ filename: 'MTO_Import_Template.xlsx' });
        templateFeedback.textContent = 'Modelo baixado. Preencha a aba MTO Template.';
      } catch (error) {
        templateFeedback.className = 'mto-import-wizard-errors';
        templateFeedback.textContent = error?.message || 'Não foi possível baixar o modelo.';
      } finally {
        templateButton.disabled = false;
      }
    });
    input.addEventListener('change', () => selectFile(input.files?.[0]));
    dropzone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    dropzone.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropzone.classList.add('is-dragging');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'));
    dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      dropzone.classList.remove('is-dragging');
      selectFile(event.dataTransfer?.files?.[0]);
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      cancel();
    });
    cancelButton.addEventListener('click', cancel);
    backButton.addEventListener('click', back);
    continueButton.addEventListener('click', advance);
    render();
    dialog.showModal();
  });
}
