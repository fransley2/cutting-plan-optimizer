# Auditoria focada — `openModal()` e `innerHTML`

Data da auditoria: 2026-08-04
Escopo: todas as chamadas de `openModal()` encontradas em `src/`, excluindo a própria declaração em `src/ui/modal.js` e o legado congelado. Nenhum arquivo de código foi alterado.

## Critério

`src/ui/modal.js` só encaminha o conteúdo para `innerHTML` quando `typeof body === 'string'`. Quando `body` é um `HTMLElement`, ele é anexado diretamente com `append()`.

Classificação usada:

- **SEGURO**: o argumento `body` resolve para `HTMLElement`/`DocumentFragment`, ou seria uma string integralmente estática.
- **MITIGADO**: string interpolada cujo conteúdo variável é escapado antes de chegar a `openModal()`.
- **RISCO REAL**: string interpolada com dado potencialmente não confiável e sem escape.

## Resultado consolidado

| Classificação | Quantidade |
|---|---:|
| SEGURO | 62 |
| MITIGADO | 0 |
| RISCO REAL | 0 |
| **Total** | **62** |

Nenhuma chamada atual passa uma string como `body`. Logo, o ramo que cria um `<div>` e atribui `innerHTML = body` em `src/ui/modal.js` não é alcançado por nenhum dos 62 consumidores atuais. Títulos interpolados não entram nesse sink: `openModal()` os atribui por `titleEl.textContent`.

## Classificação por ponto de chamada

| Caminho:linha | Classificação | Argumento `body` e evidência |
|---|---|---|
| `src/features/materialCoupon/materialCouponService.js:451` | SEGURO | `select`, criado por `node('select', ...)`; `HTMLSelectElement`. |
| `src/features/materialCoupon/materialCouponService.js:482` | SEGURO | `select`, criado por `node('select', ...)`; `HTMLSelectElement`. |
| `src/features/materialCoupon/materialCouponService.js:811` | SEGURO | `body`, criado por `node('div', ...)`; `HTMLDivElement`. |
| `src/features/materialCoupon/materialCouponService.js:1222` | SEGURO | `list`, retornado por `selectionList(...)`; o helper constrói e retorna elemento DOM. Dados de MTO são inseridos nos nós, não enviados como string-body. |
| `src/features/materialCoupon/materialCouponService.js:1440` | SEGURO | `body`, criado por `node('p', ..., texto)`; `HTMLParagraphElement`. A interpolação de `label` ocorre no conteúdo do elemento, não no argumento string de `openModal()`. |
| `src/main.js:2086` | SEGURO | Adaptador `openConfirmation({ body })`; o único chamador atual, `src/ui/cuttingSheetsPage.js:129`, passa `body` criado por `node('div', ...)`. |
| `src/main.js:2216` | SEGURO | `body`, criado explicitamente com `document.createElement('p')`. |
| `src/main.js:2449` | SEGURO | `body`, criado com `document.createElement('form')`. |
| `src/main.js:2606` | SEGURO | `wrapper`, criado com `document.createElement('div')`. |
| `src/main.js:2651` | SEGURO | `wrapper`, criado com `document.createElement('div')`. |
| `src/ui/auditPage.js:78` | SEGURO | `body`, criado por `node('div', ...)`; dados do registro de auditoria são colocados em elementos DOM. |
| `src/ui/dataCleanupDialog.js:57` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/drawingPage.js:662` | SEGURO | `form`, retornado por `buildDrawingForm(...)`; `HTMLFormElement`. |
| `src/ui/drawingPage.js:765` | SEGURO | `body`, retornado por `createInfoModalContent(...)`; elemento DOM. |
| `src/ui/drawingPage.js:820` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/entityListModal.js:121` | SEGURO | `wrapper`, criado com `document.createElement('div')`. |
| `src/ui/equipmentPage.js:915` | SEGURO | `body`, criado com `document.createElement('div')`; recebe o formulário como nó filho. |
| `src/ui/equipmentPage.js:1065` | SEGURO | `body`, retornado por `createInfoModalContent(...)`; elemento DOM. |
| `src/ui/equipmentPage.js:1130` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/inventoryModal.js:150` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/inventoryPage.js:689` | SEGURO | `form`, retornado por `renderItemForm(...)`; elemento de formulário. |
| `src/ui/inventoryPage.js:732` | SEGURO | `form`, retornado por `renderItemForm(...)`; elemento de formulário. |
| `src/ui/inventoryPage.js:824` | SEGURO | `body`, criado por `el('div', ...)`; `HTMLDivElement`. |
| `src/ui/inventoryPage.js:856` | SEGURO | `body`, criado por `el('div', ...)`; `HTMLDivElement`. |
| `src/ui/mtoImportDecisionModal.js:169` | SEGURO | `body`, criado por `element('div', ...)`; `HTMLDivElement`. |
| `src/ui/mtoPage.js:855` | SEGURO | `body`, elemento DOM construído para o editor de alocações MTO × PO Item. |
| `src/ui/mtoPage.js:984` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/mtoPage.js:1176` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/mtoPage.js:1218` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/mtoPage.js:1430` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/mtoPage.js:1530` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/mtoPage.js:1614` | SEGURO | `body`, criado por `createEl('div', ...)`. |
| `src/ui/newDocumentModal.js:52` | SEGURO | `body`, criado por `element('div', ...)`. |
| `src/ui/pieceLabelTemplateModal.js:39` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/projectManagerPage.js:239` | SEGURO | `form`, retornado por `buildProjectForm(...)`; elemento de formulário. |
| `src/ui/projectManagerPage.js:302` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/procurementPage.js:460` | SEGURO | `buildPurchaseOrderImportModalBody()` retorna elemento DOM construído por helpers `node`/`formGrid`. |
| `src/ui/procurementPage.js:507` | SEGURO | `form`, retornado por `formGrid()`; elemento DOM. |
| `src/ui/procurementPage.js:534` | SEGURO | `form`, retornado por `formGrid(...)`; elemento DOM. |
| `src/ui/procurementPage.js:590` | SEGURO | `form`, retornado por `formGrid(...)`; elemento DOM. |
| `src/ui/procurementPage.js:633` | SEGURO | `deletionBlockedBody(...)` retorna elemento DOM; os bloqueadores são adicionados como nós. |
| `src/ui/procurementPage.js:642` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/procurementPage.js:664` | SEGURO | `deletionBlockedBody(...)` retorna elemento DOM; os bloqueadores são adicionados como nós. |
| `src/ui/procurementPage.js:677` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/procurementPage.js:698` | SEGURO | `form`, retornado por `formGrid(...)`; elemento DOM. |
| `src/ui/procurementPage.js:765` | SEGURO | `form`, retornado por `formGrid(...)`; elemento DOM. |
| `src/ui/procurementPage.js:787` | SEGURO | `form`, retornado por `formGrid(...)`; elemento DOM. |
| `src/ui/returnMaterialPage.js:254` | SEGURO | `body`, criado por `node('div')`. |
| `src/ui/returnMaterialVoucherModal.js:68` | SEGURO | `confirmation`, criado por `node('div', ...)`. |
| `src/ui/returnMaterialVoucherModal.js:137` | SEGURO | `body`, retornado por `renderBody(rmv)`; elemento DOM. |
| `src/ui/settingsModal.js:176` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/settingsModal.js:205` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/settingsModal.js:494` | SEGURO | `body`, elemento DOM que agrega navegação e seções de configuração. |
| `src/ui/sobremetalModal.js:30` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/taskSheetModal.js:123` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/usersPage.js:132` | SEGURO | `form.element`, elemento DOM retornado por `buildUserForm(...)`. |
| `src/ui/usersPage.js:247` | SEGURO | `body`, criado por `node('div', ...)`. |
| `src/ui/workpackPage.js:232` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/workpackPage.js:454` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/workpackPage.js:1362` | SEGURO | `form`, retornado por `buildWorkpackForm(...)`; elemento de formulário. |
| `src/ui/workpackPage.js:1453` | SEGURO | `body`, criado com `document.createElement('div')`. |
| `src/ui/workpackQuickCreateModal.js:233` | SEGURO | `body`, elemento DOM do assistente de criação rápida de Workpack. |

## Conclusão sobre risco real

Não foi encontrado risco real no caminho `openModal()` → string `body` → `innerHTML`. Não há correção a propor para os consumidores atuais, porque nenhum deles usa o contrato de string. Esta conclusão é específica ao argumento `body` de `openModal()`; não reclassifica outros usos independentes de `innerHTML` já registrados em `AUDIT_QUALITY_SWEEP.md`.
