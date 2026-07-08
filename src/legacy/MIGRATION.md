# MIGRATION.md

## Regra

O arquivo `legacy/original.html` Ã© somente referÃªncia.

NÃ£o importar cÃ³digo diretamente dele no app novo.

Ao migrar uma funÃ§Ã£o:

1. Identificar o comportamento no arquivo antigo.
2. Verificar se jÃ¡ existe algo equivalente no app novo.
3. Reaproveitar mÃ³dulo existente quando possÃ­vel.
4. Separar lÃ³gica pura de DOM.
5. Criar funÃ§Ã£o pequena no local correto.
6. Testar no navegador.
7. Marcar como migrado neste arquivo.

---

## Mapa de migraÃ§Ã£o

| FunÃ§Ã£o antiga                                   |              Status | Novo destino                                    | ObservaÃ§Ã£o                                                 |
| ----------------------------------------------- | ------------------: | ----------------------------------------------- | ---------------------------------------------------------- |
| `safeParseFloat`, `safeParseInt`, `safeToFixed` |             Migrado | `src/core/utils.js`                             | Helpers puros                                              |
| `generateUUID`                                  | Migrado/substituÃ­do | `src/core/utils.js`                             | Preferir `crypto.randomUUID()`                             |
| `showToast`                                     |             Migrado | `src/ui/toast.js`                               | UI isolada                                                 |
| `showModal`, `hideModal`                        |             Migrado | `src/ui/modal.js`                               | Modal genÃ©rico                                             |
| `createStockRow`                                |  Migrado/refatorado | `src/ui/dataTable.js` + `src/ui/columns.js`     | Tabela genÃ©rica                                            |
| `createPartRow`                                 |  Migrado/refatorado | `src/ui/dataTable.js` + `src/ui/columns.js`     | Tabela genÃ©rica                                            |
| `parseStockDataFromUI`                          |  Migrado/refatorado | `src/main.js` / `dataTable.js`                  | Coleta de dados da UI                                      |
| `parsePartsDataFromUI`                          |  Migrado/refatorado | `src/main.js` / `dataTable.js`                  | Coleta de dados da UI                                      |
| `allocateParts`                                 |  Migrado/refatorado | `src/core/allocate.js`                          | NÃ£o pode acessar DOM                                       |
| `runAllocations`                                |  Migrado/refatorado | `src/core/allocate.js`                          | Motor principal                                            |
| Upload estoque Excel                            |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Upload peÃ§as Excel                              |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Export Excel                                    |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Salvar plano                                    |             Migrado | `src/data/plans.js`                             | IndexedDB `NestingAppDB`, store `plans`, com migracao do LocalStorage |
| Carregar plano                                  |             Migrado | `src/data/plans.js` + `src/ui/planListModal.js` | Modal reaproveitado com carregamento assincrono            |
| Importar Cupom de Material                      |            Pendente | `src/data/couponImport.js`                      | PrÃ³xima funÃ§Ã£o recomendada                                 |
| InventÃ¡rio IndexedDB                            |           Migrado | `src/data/inventoryDB.js` + `src/data/inventoryImport.js` + `src/ui/inventoryModal.js` | Fluxo de importaÃ§Ã£o, persistÃªncia IndexedDB e adiÃ§Ã£o ao estoque migrados |
| RelatÃ³rio de Corte / Aproveitamento de Nesting PDF | Migrado | `src/reports/cuttingReport.js` | Usa HTML imprimÃ­vel + `window.print()`, sem dependÃªncia externa |
| Fluxo de resultados em fase Ãºnica | Migrado | `index.html`, `src/main.js`, `src/ui/results.js`, `src/styles/app.css` | Substitui janela externa por tela de resultados dentro do app |
| Modal claro de exportaÃ§Ã£o | Migrado | `index.html`, `src/main.js`, `src/styles/app.css` | Substitui modal preto por dialog nativo alinhado ao tema Microsoft 365 |
| Portal Industrial / PÃ¡gina Inicial | Migrado | `index.html`, `src/main.js`, `src/ui/homeDashboard.js`, `src/data/planStats.js`, `src/styles/tokens.css`, `src/styles/app.css` | Aplica DESIGN.md, home async com planos recentes e navegaÃ§Ã£o Industrial Intelligence Portal |
| Gerenciador de Perfil / schema IndexedDB unico | Migrado | `src/data/database.js`, `src/data/profile.js`, `src/ui/profileModal.js`, `src/reports/cuttingReport.js`, `src/main.js` | Centraliza upgrade do `NestingAppDB` v3 e usa perfil em assinaturas de relatorio |
| Gerenciador de Projetos | Migrado | `src/data/entityStore.js`, `src/data/projects.js`, `src/ui/entityListModal.js`, `src/ui/planListModal.js`, `src/main.js`, `index.html` | Biblioteca de projetos independentes de planos, com IndexedDB v4 e modal generico |
| Configuracoes do App / Backup | Migrado | `src/data/appSettings.js`, `src/data/backup.js`, `src/ui/settingsModal.js`, `src/main.js`, `src/ui/dataTable.js`, `index.html` | Modal de configuracoes usando store `settings`, defaults de nesting, catalogo de materiais, rastreabilidade obrigatoria e backup JSON |
| ImpressÃ£o visual                                |           Migrado | `src/reports/printVisual.js`                    | Relatorio A4 imprimivel com uma cut sheet visual por barra usada |
| ImpressÃ£o tabular                               |            Pendente | `src/reports/printTabular.js`                   | RelatÃ³rio separado                                         |
| Cutting Sheet                                   |            Pendente | `src/reports/printCuttingSheet.js`              | RelatÃ³rio separado                                         |
| Pro-style report                                |            Pendente | `src/reports/printPro.js`                       | RelatÃ³rio separado                                         |
| GeraÃ§Ã£o de etiquetas                            |            Pendente | `src/reports/labels.js`                         | Reaproveitar dados da soluÃ§Ã£o                              |
| i18n EN/PT/IT/FR                                |            Pendente | `src/i18n/translations.js`                      | Confirmar necessidade real antes                           |
| Toggle labels/cor/fonte                         |            Pendente | `src/ui/results.js`                             | Passar opÃ§Ãµes para renderizaÃ§Ã£o                            |

## FMS Expansion Roadmap

| Feature | Status | Destination | Notes |
| --- | ---: | --- | --- |
| Audit Log | Migrado | `src/data/auditLog.js` | Data layer only; UI integration pending |
| Stock Movements | Migrado | `src/data/stockMovements.js` | Data layer only; UI integration pending |
| MTO Import | Migrado | `src/data/mtoImport.js` + `src/data/mtoDB.js` + `src/ui/mtoPage.js` | Engineering MTO import moved from modal workflow to dedicated MTO page with editable table, Windows-1252 CSV decoding, and persistence. Matching/nesting integration pending. |
| MTO row add/edit/delete | Migrado | `src/ui/mtoPage.js` + `src/data/mtoDB.js` | MTO page now supports table operations from a toolbar; per-row edit buttons were replaced by toolbar-driven actions. |
| MTO filtered selection | Migrado | `src/ui/mtoPage.js` | Select all respects active filters and search tokens. |
| MTO send to Cut Sheets | Migrado | `src/ui/mtoPage.js` + `src/main.js` | Stages selected valid MTO rows into the planner parts list; nesting is not run automatically. |
| Settings fixed-size modal | Migrado | `src/ui/settingsModal.js` + `src/styles/app.css` | Settings uses fixed modal dimensions with internal section scrolling. |
| Data cleanup dialog | Migrado | `src/ui/dataCleanupDialog.js` | Local cleanup runs from Settings with typed confirmation and can clear MTO separately from inventory. |
| Inventory full page | Migrado | `src/ui/inventoryPage.js` + `src/data/inventoryDB.js` | Inventory page is now the operational management screen with KPIs, tabs, filters, selection and toolbar actions. |
| Inventory filtered selection | Migrado | `src/ui/inventoryPage.js` + `src/ui/inventoryModal.js` | Select all respects active filters in both the full page and the planner selection modal. |
| Inventory row add/edit/delete | Migrado | `src/ui/inventoryPage.js` + `src/data/inventoryDB.js` | Full page supports adding, editing and deleting selected inventory rows; full cleanup remains in Settings. |
| Inventory bulk status update | Migrado | `src/ui/inventoryPage.js` + `src/data/stockMovements.js` + `src/data/auditLog.js` | Bulk status changes create stock movement/audit records when available. |
| Inventory selection modal sizing/search | Migrado | `src/ui/inventoryModal.js` + `src/styles/app.css` | Planner selection modal remains available, is larger, uses token search and filtered select-all. |
| FMS IndexedDB schema | Migrado | `src/data/database.js` | Schema-only foundation; existing stores preserved and optimizer unchanged. |
| MTO Items Store | Migrado | `src/data/mtoItems.js` | CRUD foundation only; matching/nesting integration pending. |
| Cutting Packages Store | Migrado | `src/data/cuttingPackages.js` | CRUD foundation only; UI/workflow integration pending. |
| Material Coupons Store | Migrado | `src/data/materialCoupons.js` | CRUD foundation only; Material Coupon UI/report pending. |
| Cutting Sheets Store | Migrado | `src/data/cuttingSheets.js` | CRUD foundation only; Cutting Sheet UI/report pending. |
| Return Material Vouchers Store | Migrado | `src/data/returnMaterialVouchers.js` | CRUD foundation only; RMV UI/report pending. |
| Offcuts Store | Migrado | `src/data/offcuts.js` | CRUD foundation only; offcut return workflow pending. |
| Audit Log Store | Migrado | `src/data/auditLog.js` | New `auditLog` store with compatibility aliases for existing audit exports. |
| MTO x Inventory Match | Pending | `src/core/materialMatch.js` | Pure matching logic outside allocate.js |
| Material Coupon | Pending | `src/data/materialCoupons.js` + `src/reports/materialCouponReport.js` | Document for issuing selected material |
| Cutting Sheet Document | Pending | `src/data/cuttingSheets.js` + `src/reports/printCuttingSheet.js` | Formal cutting document generated from nesting result |
| RMV | Pending | `src/data/returnMaterialVouchers.js` + `src/reports/returnVoucherReport.js` | Return reusable offcuts or scrap decisions |
| Offcut Return to Inventory | Pending | `src/data/inventoryDB.js` + `src/data/stockMovements.js` | Returned offcuts become new stock items with `parentStockId` |
| Audit History UI | Pending | `src/ui/auditHistoryModal.js` | Searchable local history by project/document/material |
| FMS Backup Coverage | Pending | `src/data/backup.js` | Backup must include all FMS stores |

The existing nesting engine remains unchanged. FMS modules must be added around the existing optimizer. No backend, framework, npm package, or TypeScript migration is planned.
