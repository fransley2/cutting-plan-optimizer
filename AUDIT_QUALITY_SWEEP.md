# AUDIT — Quality Sweep

Data da auditoria: 2026-08-04
Escopo: `src/core/`, `src/data/`, `src/ui/`, `src/reports/`, `src/documents/`, `src/workflows/`, `src/features/`, `src/main.js`, `index.html` e testes. Nenhum arquivo de código foi alterado.

## 1. Código morto

Critério: uma função exportada foi marcada quando seu identificador aparece somente na própria declaração em todo `src/`, `tests/` e `index.html`. Testes contam como consumidores. A confiança é alta para referências ES Modules normais; reflexão, acesso por string ou consumidores externos ao repositório podem escapar da busca.

### Exports sem consumidor encontrado

| Arquivo | Export | Confiança |
|---|---|---|
| `src/core/materialCouponReservation.js:45` | `applyMaterialCouponReservation` | Alta |
| `src/core/materialMatching.js:265` | `getMaterialKeyFromInventory` | Alta |
| `src/core/utils.js:3` | `safeParseFloat` | Alta; ocorrências homônimas existem apenas no legado congelado, sem importar este export |
| `src/core/utils.js:77` | `safeParseInt` | Alta; ocorrências homônimas existem apenas no legado congelado, sem importar este export |
| `src/core/utils.js:88` | `generateId` | Alta |
| `src/data/auditLog.js:125` | `getAuditLogEntry` | Alta |
| `src/data/cuttingSheets.js:114` | `getCuttingSheets` | Alta |
| `src/data/cuttingSheets.js:131` | `deleteCuttingSheets` | Alta |
| `src/data/cuttingSheets.js:138` | `clearCuttingSheets` | Alta |
| `src/data/inventoryImport.js:238` | `filterInventoryItems` | Alta |
| `src/data/materialReceipts.js:207` | `updateMaterialUnit` | Alta |
| `src/data/materialReceipts.js:212` | `getMaterialReceipt` | Alta |
| `src/data/materialReceipts.js:216` | `listMaterialReceipts` | Alta |
| `src/data/materialReceipts.js:217` | `listMaterialReceiptLines` | Alta |
| `src/data/materialReceipts.js:218` | `listMaterialUnits` | Alta |
| `src/data/materialReservations.js:52` | `updateMaterialReservation` | Alta |
| `src/data/materialReservations.js:59` | `deleteMaterialReservation` | Alta |
| `src/data/mtoPoItemAllocations.js:138` | `getMtoPoItemAllocation` | Alta |
| `src/data/offcuts.js:76` | `createOffcut` | Alta |
| `src/data/offcuts.js:101` | `getOffcuts` | Alta |
| `src/data/offcuts.js:118` | `deleteOffcuts` | Alta |
| `src/data/offcuts.js:125` | `clearOffcuts` | Alta |
| `src/data/organizations.js:60` | `deleteOrganization` | Alta |
| `src/data/plans.js:65` | `getPlan` | Alta |
| `src/data/plans.js:74` | `deletePlan` | Alta |
| `src/data/planStats.js:62` | `buildPlanKpis` | Alta |
| `src/data/purchaseOrders.js:132` | `listPurchaseOrderRevisions` | Alta |
| `src/data/returnMaterialVouchers.js:115` | `updateReturnMaterialVoucher` | Alta |
| `src/data/returnMaterialVouchers.js:127` | `deleteReturnMaterialVouchers` | Alta |
| `src/data/returnMaterialVouchers.js:134` | `clearReturnMaterialVouchers` | Alta |
| `src/data/taskSheets.js:52` | `getTaskSheet` | Alta |
| `src/data/taskSheets.js:60` | `deleteTaskSheet` | Alta |
| `src/data/workpackLinks.js:169` | `deleteWorkpackLink` | Alta |
| `src/ui/drawingPage.js:323` | `getSelectedDrawingId` | Alta |
| `src/ui/equipmentPage.js:667` | `getSelectedEquipmentId` | Alta |
| `src/ui/resultsWindow.js:9` | `renderResultsWindowContent` | Alta; o próprio módulo declara-se descontinuado |
| `src/ui/returnMaterialPage.js:342` | `refreshReturnMaterialPage` | Alta |
| `src/ui/workpackPage.js:1116` | `getSelectedWorkpackId` | Alta |
| `src/reports/cuttingReport.js:480` | `openVisualPdfReport` | Alta |
| `src/documents/materialCouponExcel.js:295` | `inserirRodape` | Alta |

### Arquivos inteiros sem importador

- `src/data/planStats.js` — certeza alta: nenhum `import` estático ou dinâmico e nenhum uso em teste; só aparece em documentação de migração.
- `src/ui/profileModal.js` — certeza alta: nenhum `import` estático ou dinâmico encontrado.

`src/main.js` foi tratado como entrypoint. Arquivos alcançados indiretamente por um módulo importado não foram marcados como órfãos.

## 2. `innerHTML` com dado potencialmente não confiável

### RISCO — dado de banco, importação ou formulário

- `src/ui/inventoryModal.js:83` — **(c) RISCO**, `item` vem de IndexedDB ou Excel (`getInventoryItems`/`readExcelFile`); `buildRowMarkup(item)` escapa os campos com `escapeHtml`, reduzindo o risco prático, mas o sink continua recebendo dados importados.
- `src/ui/modal.js:67` — **(c) RISCO potencial**, quando `body` é `string`, seu conteúdo é atribuído a outro `innerHTML`; a origem depende de cada chamador de `openModal`.
- `src/ui/results.js:83` — **(c) RISCO mitigado**, interpola `solution` e métricas do Planner; `kpiCard` aplica `escapeHtml` aos valores.
- `src/ui/results.js:182` — **(c) RISCO mitigado**, interpola propriedades de `piece` vindas do Planner/MTO; campos textuais passam por `escapeHtml`; a cor vem do mapa interno.
- `src/ui/results.js:196` — **(c) RISCO mitigado**, tabela usa `solution.stockUsed`; campos de barra passam por `escapeHtml`.
- `src/ui/results.js:234` — **(c) RISCO mitigado**, tabela usa `solution.unplacedParts`; campos de peça passam por `escapeHtml`.
- `src/ui/results.js:309` — **(c) RISCO mitigado**, dados de barras/PO/material/traceability são interpolados, com escape explícito; `renderBarSegments` também escapa labels, mas gera estilos percentuais por interpolação numérica.

### SEGURO — estrutura estática/controlada

- `src/ui/inventoryModal.js:69` — **(a) SEGURO**, limpeza com string vazia.
- `src/ui/inventoryModal.js:126` — **(a) SEGURO**, markup estático do modal, sem interpolação.
- `src/ui/modal.js:12` — **(a) SEGURO**, scaffold estático do overlay.
- `src/ui/modal.js:66` e `:69` — **(a) SEGURO**, limpeza com string vazia.
- `src/ui/results.js:259` — **(a) SEGURO**, bloco estático de assinaturas.
- `src/main.js:938`, `:975`, `:976`, `:2523`, `:2524` — **(a) SEGURO**, somente limpeza com string vazia.

### Legado congelado (`src/legacy/`, não importado/executado)

- **(a) SEGURO/limpeza ou estático:** `src/legacy/Cutting Plan Optimizer.html:1221,1223,1333,1335,1759,1815,1936,1937,1954,2143,2146,2214,2580,2582,2586`; `src/legacy/original.html:1061,1063,1487,1543,1664,1665,1682,1871,1874,1942,2773,2775,2779`.
- **(b) SEGURO/controlado:** `src/legacy/Cutting Plan Optimizer.html:1644,1657,1667,1701,1710,1729,1733,1762`; `src/legacy/original.html:1372,1385,1395,1429,1438,1457,1461,1490` — traduções/configuração interna e valores numéricos controlados.
- **(c) RISCO:** `src/legacy/Cutting Plan Optimizer.html:1232,1290,1353,1373,1618,1682,1722,1797,1841,1866,1973`; `src/legacy/original.html:1081,1101,1346,1410,1450,1525,1569,1594,1701` — linhas, peças, planos ou nomes provenientes de arquivo/formulário são interpolados sem uma garantia uniforme de escape.
- `src/legacy/MIGRATION2.md:126,186` são exemplos de documentação, não sinks executáveis.

## 3. Nomes de campo divergentes entre stores

### Workpack — `src/data/workpacks.js`

- Identidade: `id`; número de negócio: `wpNo`; vínculos: `projectId`, `equipmentId`.
- Quantidades/esforço: `peopleCount`, `plannedManHours`, `actualManHours`, `dailyCapacity`; não existe quantidade material ou peso canônico.
- Datas: coexistem `plannedStart`/`plannedFinish` e `plannedStartDate`/`plannedFinishDate`; a normalização grava os dois pares. Datas reais usam `actualStartDate`/`actualFinishDate`; auditoria usa `createdAt`/`updatedAt`.
- Status: `status`, em maiúsculas; valores legados `ACTIVE` e `CLOSED` são convertidos.
- Drift confirmado: dois nomes persistidos para o mesmo conceito de início/fim planejado (`plannedStart` versus `plannedStartDate`, `plannedFinish` versus `plannedFinishDate`).

### Documents / Document Hub — `src/core/documentRegister.js`

- Não existe `src/data/documents.js`; o hub monta um registro derivado.
- Identidade: `id`, `documentType`, `documentNumber`, `sourceEntityType`, `sourceEntityId`.
- Projeto/status/data: `projectId`, `status`, `updatedAt`; vínculo operacional: `workpackId`.
- Drift absorvido pelo adaptador: Material Coupon usa `number || header.mcCode`; datas escolhem `updatedAt || issuedAt || createdAt`; Cutting Sheet usa `updatedAt || releasedAt`; RMV usa `updatedAt || issuedAt`; Workpack usa `updatedAt || createdAt`.
- Não há quantidade, peso ou identidade material no registro do hub.

### Genealogy — `src/data/materialTransformations.js` e `src/core/materialGenealogy.js`

- Identidade: `id`, `outputId`; pai: `parentInventoryItemId`; saída classificada por `outputType`.
- Quantidade/peso/dimensões: `quantity`, `weightKg`, `lengthMm`, `widthMm`, `thicknessMm`.
- Projeto/status/data: `projectId`, sem `status`; somente `createdAt`/`createdBy`.
- Vínculos: `workpackId`, `cuttingSheetId`, `cuttingSheetBarId`, `materialCouponId`, `materialCouponLineId`, `mtoItemId`, `drawingRevisionId`.
- Drift confirmado: Genealogy usa `quantity`, enquanto Inventory e Offcuts usam `qty`. Posição é normalizada como `position`, enquanto MTO usa `pos`. Não há `materialGrade`, `identCode`, `traceability` ou `heatNo` próprios na transformação; a identidade física depende de IDs.

### Inventory — `src/data/inventoryDB.js`

- Identidade física: coexistem `id`, `trace` e `traceability`; `trace` vira a chave principal efetiva.
- Identidade material: `identCode`, `sapCode`, `materialGrade`, `materialDescription`, `materialClassification`, `type`, `profile`.
- Quantidade/peso: `qty`, `receivedQty`, `issuedQty`, `balanceQty`, `reservedQty`, `totalPoQty`, `weightKg`; dimensões usam sufixo `Mm`.
- Datas: `receivedDate`, `exitDate`, `createdAt`, `updatedAt`; `nfArrival` é um campo separado de chegada fiscal.
- Projeto/status: `projectId`, `status`; qualidade também aparece em `inspectionStatus`, `acceptanceStatus` e `qualityStatus`.
- Drift confirmado: múltiplos nomes de identidade (`id`/`trace`/`traceability`); múltiplos aliases de pai (`parentStockId`, `parentInventoryItemId`, `parentInventoryId`, `parentTraceability`, `parentTrace`); PO Item aparece como `poItem`, `poItemPo` e `metadata.poItemId` em consumidores; qualidade possui três campos de status parcialmente sobrepostos.

### Offcuts — `src/data/offcuts.js`

- Identidade: `id`, `traceability`; pais/saídas: `parentInventoryItemId`, `newInventoryItemId`.
- Material: `material`, `heat`.
- Quantidade/dimensão: `qty`, `length`; não existe `weightKg`, largura ou espessura canônica.
- Projeto/status/data: `projectId`, `status`, `disposition`, `createdAt`, `updatedAt`.
- Drift confirmado: `material` versus `materialGrade`; `heat` versus Inventory `heatNo`; `length` versus `lengthMm`; `qty` versus Genealogy `quantity`. O identificador `traceability` não tem o alias `trace` usado no Inventory.

## 4. Consistência de modal/dialog

### Totais

- Modal genérico `modal.js` (overlay + `div`): **62 pontos diretos de abertura**.
- `<dialog>` nativo com `showModal()`: **3 pontos de abertura**, representando três fluxos.
- Relação atual: **62 genéricos / 3 nativos**.

### `<dialog>` nativo

- `index.html:831` + `src/main.js:2916` — `#export-modal`.
- `src/ui/materialCouponTemplateModal.js:37,194` — diálogo criado por `document.createElement('dialog')` e aberto por `showModal()`.
- `src/ui/mtoImportWizard.js:745` — wizard abre seu `<dialog>` nativo (criado no próprio módulo).

### Modal genérico — pontos diretos

- `src/features/materialCoupon/materialCouponService.js:451,482,811,1222,1440`
- `src/main.js:2086,2216,2449,2606,2651`
- `src/ui/auditPage.js:78`; `src/ui/dataCleanupDialog.js:57`; `src/ui/entityListModal.js:121`
- `src/ui/drawingPage.js:666,769,824`; `src/ui/equipmentPage.js:919,1069,1134`
- `src/ui/inventoryModal.js:150`; `src/ui/inventoryPage.js:689,732,824,856`
- `src/ui/mtoImportDecisionModal.js:169`; `src/ui/mtoPage.js:855,984,1176,1218,1430,1530,1614`
- `src/ui/newDocumentModal.js:52`; `src/ui/pieceLabelTemplateModal.js:39`
- `src/ui/procurementPage.js:460,507,534,590,633,642,664,677,698,765,787`
- `src/ui/projectManagerPage.js:239,302`; `src/ui/returnMaterialPage.js:254`
- `src/ui/returnMaterialVoucherModal.js:68,137`; `src/ui/settingsModal.js:176,205,494`
- `src/ui/sobremetalModal.js:30`; `src/ui/taskSheetModal.js:123`; `src/ui/usersPage.js:132,247`
- `src/ui/workpackPage.js:232,454,1366,1457`; `src/ui/workpackQuickCreateModal.js:233`

Wrappers como `planListModal.js` chamam outro módulo que termina em um dos pontos acima e não foram contados novamente como uma implementação distinta.

## 5. Tokens de design escapando

Foram encontradas **660 ocorrências reais** de hex/rgb/rgba fora de `src/styles/tokens.css`. A busca bruta retornou 668 matches; oito eram seletores de ID ou entidades HTML, discriminados abaixo. Valores iguais no mesmo arquivo são consolidados com todas as linhas em que aparecem.

### JavaScript com cores hardcoded

- `src/core/pieceColors.js`: `#4299e1` (2), `#ed8936` (3), `#48bb78` (4), `#f6e05e` (5), `#667eea` (6), `#9f7aea` (10), `#f56565` (11), `#38b2ac` (12), `#ed64a6` (13), `#a0aec0` (14), `#22505F` (94), `#1f2937` e `#ffffff` (106).
- `src/reports/cuttingReport.js`: `#22505F` (212), `#6B8F9C` (213), `#8B2C2C` (214), `#FFF2CC` (215), `#FFFFFF` (216), `#D8E1E5` (217), `#1F2937` (218), `#6B7280` (219), `#f8fbfc` (235,312), `#fff7f7` (237), `#247a4a`/`#f5fff8` (238), `#fff` (241,245,260,269,281,283,284,316,318), `#f7f9fa` (244), `#d8dee1` (258,337), `#B8C8D0` (259), `#111827` (260,268,276,277,283–285), `#4b5563` (260,269,286), `#f0f0f0` (261), `#e3e3e3` (262), `#f7f7f7` (263), `#d1d5db` (265–267), `#374151` (282,289,326), `#6b7280` (287,288), `#f2f6f8` (293), `#d8e1e5` (294), `#f4f7f8` (325), `#fbfcfd` (326).
- `src/reports/labels.js`: `#fff` (147,149,150), `#172b34` (147), `#22505f` (149,150), `rgba(255,255,255,.55)` (151), `#9fb2b9`, `#c8d3d7`, `#8b2c2c` (152), `#607681` (152,154,156), `#dce3e6` (153), `#edf3f5` (154).
- `src/reports/materialCouponReport.js`: `#fff` (397,408), `#000` (398,406,427,434,441,467,470,471,475,489,525,526,531,532,546–548,568,582,591), `#d9d9d9` (476), `#f2f2f2` (518,545), `#555` (549).
- `src/reports/printVisual.js`: `#ffffff` (447,461,622,715,938,948,949,964), `#1d1d1f` (448,488,507,545,599,643,663,822,865,898,922,927,939,940,953,954,959), `#e5e5e7` (471,623,638,694,756,757,802,839,864,896,916,950,951), `#86868b` (496,515,536,589,650,655,668,684,761,803,846,933), `#f5f5f7` (525,616,637,693,801,821,845), `#e8f4fd`/`#d6ecfc` (564), `#e7f7ef`/`#d3f1e3` (569), `#fff4e6`/`#ffe8cc` (574), `#f3ebff`/`#e8deff` (578), `#fff0ef`/`#ffdeda` (582), `#fafafa` (637,863,895), `rgba(255,255,255,0.3)` (714), `#999` (745), `#d1d1d6` (758,759,906,965), `#fecaca` (779,780), `#fee2e2` (781,782), `#991b1b` (784), `#34c759` (875), `#ff9500` (880).
- `src/reports/returnMaterialVoucherReport.js`: `#fff` (432,442), `#000` (433,440,460,468,475,499,502,503,505,516,537,538,543,544,558–560,580,594,601), `rgba(0,0,0,0.25)` (463), `#d9d9d9` (506), `#f2f2f2` (534,557), `#555` (561).
- `src/reports/summaryReport.js`: `#ffffff` (18,33,234,335,569,574,589,590,599), `#1d1d1f` (22,65,87,142,201,220,262,282,439,459,493,549,558,575,576,581,594,595), `#e5e5e7` (44,235,250,314,373,374,419,458,491,525,591,592), `#86868b` (74,96,133,191,269,274,287,303,378,420,532,563), `#f5f5f7` (122,162,249,313,418,438,531), `#e8f4fd`/`#d6ecfc` (166), `#e7f7ef`/`#d3f1e3` (171), `#fff4e6`/`#ffe8cc` (176), `#f3ebff`/`#e8deff` (180), `#fff0ef`/`#ffdeda` (184), `#fafafa` (249,457,490), `rgba(255,255,255,0.4)` (334), `#999` (362), `#d1d1d6` (375,376,506), `#fecaca` (396,397), `#fee2e2` (398,399), `#991b1b` (401), `#34c759` (469), `#ff9500` (474), `#9ca3af` (570).
- `src/ui/reportsExport.js`: `#fff` (144,146,174,179), `#172b34` (144,161), `#c7d4d9` (146,152), `#22505f` (148,150,159,166,174), `#6b8f9c` (149), `#52666e` (151,156,160,162), `#dce5e8` (153,177), `#edf3f5` (156), `#cad8dc` (159,165), `#f8fbfc` (159), `#9fb2b9` (168), `#6c7e85` (168,176,177), `#b9c9cf` (173), `#f2f6f7` (175), `#e8eef0` (178), `rgba(34,80,95,.16)` (178).
- `src/ui/reportsUI.js`: `#44515a` (454), `#22505F` (482,505,524,543,588,633,680), `#e5eaed` (490,524,552,619,646,683), `#6B8F9C` (544), `#8B2C2C` (545), `rgba(34,80,95,.14)` (589), `#d29b00` (639), `#D97800` (679).
- `src/main.js:249,250` e `src/ui/nestingPlanWorkspace.js:146` contêm quatro matches de `#add`, que são seletores de ID e **não cores**. `src/ui/inventoryModal.js:23`, `src/reports/materialCouponReport.js:12`, `src/reports/returnMaterialVoucherReport.js:14` e `src/reports/summaryReport.js:634` contêm `&#039;`, entidade HTML; são os outros quatro falsos positivos.

### CSS com cores hardcoded

- `src/styles/users.css`: `#244C5A` (2), `#ED8B00` (3), `#EEF2F3` (34), `#CBD5D9` (40), `#FFF` (43,79,261), `#F3F7F8` (86), `#FCE8E6` (243).
- `src/features/materialCoupon/materialCoupon.css`: `#244c5a` (15,76,303), `#b88716` (77), `#287a52` (78), `#edf5f7` (180,181), `#d7b45e` (300), `#fff2cc` (300,509,606,610), `#75520a` (300), `#83b89b`/`#e2f3e9`/`#185c3b` (301), `#e7a04d`/`#fff0dc`/`#884900` (302), `#7fa7b5`/`#e5f0f4` (303), `#b7bdc3`/`#edf0f2`/`#4b5563` (304), `#cf8b8b`/`#f8e4e4`/`#8b2c2c` (305), `#9da9b0`/`#eef2f4`/`#455a64` (306), `#8b2c2c` (406,652), `#d3bd7d` (508), `#eeeeeb` (699), `#000` (844,846,853,854,856–858,860,899,901,903), `#fff` (845,902,908), `#d9d9d9` (853), `#f2f2f2` (870), `#bfbfbf` (874), `#555` (875).
- `src/styles/app.css`: 168 valores/variantes hardcoded; ocorrências completas por famílias principais: branco `#fff` (53,104,295,297,299,301,436,437,503,519,554,569,589,592,598–600,637,651,661,669,677,678,1144,1225,2161,2169,2472,4357,4360,4366,4389,4396,4402,4417,4422,4427,4441,4480,4484,4485,4501,4526,4529,4533,4548,4553,4564,4570,4583,4656); amarelo editável `#fff2cc` (387,420,423,674,3271,3317,4654,4699,5046); crítico `#8b2c2c` (419,424), `#8B2C2C` (4369,4380,4855,4857,4874), `#fbeaea` (419,424,668,675), `rgba(139,44,44,.12)` (2152); petrol `#22505F` aparece por variáveis/fallbacks próximos ao bloco Reports e `rgba(34,80,95,...)` em 265,1744,3318,4358,4410,4678,4682,4810,4815; laranja `#d29b00` (449,614,4494), `#D97800` (4541,4574,4580,4586); verdes `#3f7f5f` (448,615,633,1862), `#107C10` (4367,4378), `#137a4a` (2151), `#72a27c` (3273), `#8DBAA5` (4752), `#3B7F5A` (4873); neutros recorrentes `#edf4f6` (521,529,604,673,1781,1877), `#dce5e8` (631), `#E6EEF0` (4539,4577,4813,4866), `#EDF3F5` (4520,4544,4751), `#E9EAEB` (2133,4838), `#d1d5db` (2486–2490). Demais literais estão em `app.css:300,302,386,387,419–426,448,449,459,484,521,529,579,585,588,604,613–615,631,633,641,668,673–675,1203,1413,1497,1499,1781–1783,1862,1863,1900,1901,2133,2141,2151,2152,2173,2190,2194,2474,2478,2480,2482,2493,2637,2748,2866,3270–3273,3317,3318,3586,3596,3698,4357–4381,4389–4451,4494–4586,4654–4700,4751–4874,5046,5967,6182,6184`.

### Espaçamentos e tamanhos `px` repetidos fora dos tokens

Os valores mais repetidos que formam uma escala paralela ao design system são:

| Valor | Ocorrências | Concentração observada |
|---|---:|---|
| `4px` | 63 | `app.css`, uma em `materialCoupon.css` |
| `6px` | 29 | `app.css`, `materialCoupon.css`, `users.css` |
| `8px` | 29 | `app.css`, `materialCoupon.css`, `users.css` |
| `10px` | 30 | `app.css`, `users.css` |
| `16px` | 19 | `app.css`, `materialCoupon.css`, `users.css` |
| `20px` | 14 | `app.css`, `users.css` |
| `24px` | 19 | `app.css`, `users.css` |
| `32px` | 23 | `app.css`, `users.css` |

Também aparecem `1px` 312 vezes (principalmente bordas), `2px` 76 vezes, `3px` 58 vezes e `999px` 30 vezes (pílulas). Entre tamanhos de layout repetidos: `180px` 20 vezes, `220px` 21, `260px` 22, `720px` 13 e `1120px` 5. Esses números misturam necessidades geométricas legítimas e valores de escala; a auditoria apenas confirma a repetição literal fora de `tokens.css`.
