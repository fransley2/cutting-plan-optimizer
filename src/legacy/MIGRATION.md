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
| Usuários por operador / schema IndexedDB único | Migrado | `src/data/database.js`, `src/data/users.js`, `src/data/userSession.js`, `src/ui/usersPage.js`, `src/main.js` | Migra o perfil global uma única vez, só permite apagar usuários sem referência histórica em Material Coupon e seleciona a identidade por aba via `sessionStorage`; autoria nova permanece limitada ao Material Coupon |
| Gerenciador de Projetos | Migrado | `src/data/entityStore.js`, `src/data/projects.js`, `src/ui/entityListModal.js`, `src/ui/planListModal.js`, `src/main.js`, `index.html` | Biblioteca de projetos independentes de planos, com IndexedDB v4 e modal generico |
| Configuracoes do App / Backup | Migrado | `src/data/appSettings.js`, `src/data/backup.js`, `src/ui/settingsModal.js`, `src/main.js`, `src/ui/dataTable.js`, `index.html` | Modal de configuracoes usando store `settings`, defaults de nesting, catalogo de materiais, rastreabilidade obrigatoria e backup JSON |
| ImpressÃ£o visual                                |           Migrado | `src/reports/printVisual.js`                    | Relatorio A4 imprimivel com uma cut sheet visual por barra usada |
| ImpressÃ£o tabular                               |            Pendente | `src/reports/printTabular.js`                   | RelatÃ³rio separado                                         |
| Cutting Sheet                                   |            Pendente | `src/reports/printCuttingSheet.js`              | RelatÃ³rio separado                                         |
| Pro-style report                                |            Pendente | `src/reports/printPro.js`                       | RelatÃ³rio separado                                         |
| GeraÃ§Ã£o de etiquetas                            |            Migrado | `src/reports/labels.js`                         | Etiquetas físicas por peça em templates Pimaco A4 e Carta selecionáveis, com Mark/POS, Drawing, comprimento e rastreabilidade da barra |
| i18n EN/PT-BR                                   |             Migrado | `src/i18n/index.js`                             | Catálogo central, seletor no topo e em Configurações, persistência em App Settings e tradução de conteúdo dinâmico |
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
| Inventory availability ownership | Migrado | `src/data/inventoryImport.js` + `src/data/inventoryDB.js` + `src/core/materialCouponReservation.js` | Legacy spreadsheet `Disponibilidade` is ignored; operational availability is controlled by app status, balance and reservations. |
| Material Coupon lifecycle and approval | Migrado | `src/core/materialCouponWorkflow.js` + `src/features/materialCoupon/materialCouponService.js` + `src/main.js` | Auditable approval, issue, dispatch, receive, close, reopen, cancel, reservation release, deletion and revision actions. |
| Material Coupon data intake and history | Migrado | `src/features/materialCoupon/materialCouponService.js` | Inventory/MTO selection, manual lines, editable dimensions and combined audit/stock-movement history. |
| Inventory selection modal sizing/search | Migrado | `src/ui/inventoryModal.js` + `src/styles/app.css` | Planner selection modal remains available, is larger, uses token search and filtered select-all. |
| FMS IndexedDB schema | Migrado | `src/data/database.js` | Schema-only foundation; existing stores preserved and optimizer unchanged. |
| MTO Items Store | Migrado | `src/data/mtoItems.js` | CRUD foundation only; matching/nesting integration pending. |
| Cutting Packages Store | Migrado | `src/data/cuttingPackages.js` | CRUD foundation only; UI/workflow integration pending. |
| Material Coupons Store | Migrado | `src/data/materialCoupons.js` | CRUD foundation only; Material Coupon UI/report pending. |
| Cutting Sheets Store and workspace | Migrado | `src/data/cuttingSheets.js` + `src/ui/cuttingSheetsPage.js` | Dedicated register/workspace persists nesting bars and reopens full saved solutions; legacy summary-only plans return to the editor. |
| Return Material Voucher workflow | Migrado | `src/data/returnMaterialVouchers.js` + `src/workflows/returnMaterialVoucherWorkflow.js` + `src/ui/returnMaterialVoucherModal.js` | Draft, issue, partial receipt, Inventory creation, audit, Excel extract and formal A4 landscape report. |
| Offcuts Store | Migrado | `src/data/offcuts.js` | CRUD foundation only; offcut return workflow pending. |
| Audit Log Store | Migrado | `src/data/auditLog.js` | New `auditLog` store with compatibility aliases for existing audit exports. |
| MTO x Inventory Match | Pending | `src/core/materialMatch.js` | Pure matching logic outside allocate.js |
| Material Coupon | Pending | `src/data/materialCoupons.js` + `src/reports/materialCouponReport.js` | Document for issuing selected material |
| Cutting Sheet Document | Pending | `src/data/cuttingSheets.js` + `src/reports/printCuttingSheet.js` | Formal cutting document generated from nesting result |
| RMV | Migrado | `src/data/returnMaterialVouchers.js` + `src/reports/returnMaterialVoucherReport.js` | Fiscal return keeps offcuts pending until partial or complete warehouse receipt. |
| Return Material / Offcut disposition | Migrado | `src/ui/returnMaterialPage.js` + `src/workflows/returnOffcutsToStock.js` + `src/workflows/processOffcutDisposition.js` + `src/data/inventoryDB.js` + `src/data/returnMaterialVouchers.js` + `src/data/stockMovements.js` + `src/data/auditLog.js` | A single Return Material screen combines the issued RMV register with reusable-offcut disposition and document creation; direct stock return and scrap remain auditable. |
| Audit History UI | Migrado | `src/ui/auditPage.js` + `src/core/auditHistory.js` | Histórico unificado e pesquisável por projeto, documento, material, entidade, ação e data; inclui movimentos de estoque e exportação CSV. |
| Atomic Cutting Confirmation | Migrado | `src/data/cuttingConfirmationTransaction.js` + `src/workflows/confirmCuttingSheet.js` | Cutting Sheet, Inventory, movimentos, genealogia, retalhos e auditoria são confirmados em uma única transação IndexedDB com rollback nativo. |
| Atomic Material Coupon Issue | Migrado | `src/data/materialCouponIssueTransaction.js` + `src/features/materialCoupon/materialCouponService.js` | Emissão, reserva de Inventory, registro de reserva, movimento e auditoria são persistidos em uma única transação IndexedDB. |
| Atomic Material Coupon Inventory Actions | Migrado | `src/data/materialCouponActionTransaction.js` + `src/main.js` | Despacho, liberação e cancelamento de Coupon emitido persistem documento, Inventory, reservas, movimentos e auditoria em uma única transação IndexedDB com rollback nativo. |
| Atomic RMV Receipt | Migrado | `src/data/rmvReceiptTransaction.js` + `src/workflows/returnMaterialVoucherWorkflow.js` | Recebimento parcial ou completo persiste RMV, novo retalho no Inventory, Offcut, genealogia, movimento e auditoria em uma única transação; o rollback compensatório foi removido. |
| Atomic RMV Lifecycle | Migrado | `src/data/rmvLifecycleTransaction.js` + `src/workflows/returnMaterialVoucherWorkflow.js` | Emissão e cancelamento persistem RMV, Offcuts e auditoria em uma única transação, com validação do estado persistido, rastreabilidade única e rollback nativo. |
| Actual vs Planned Cut Execution | Migrado | `src/core/cutExecution.js` + `src/data/cutExecutionTransaction.js` + `src/ui/cuttingSheetsPage.js` | O operador registra medidas reais por peça e sobra antes da confirmação; desvios exigem justificativa e a genealogia/RMV passam a usar os valores físicos auditados. |
| Workpack Material Genealogy | Migrado | `src/core/workpackGenealogy.js` + `src/ui/workpackPage.js` | A aba Traceability reconstrói material original, peças, retalho, RMV e retorno ao Inventory somente por vínculos explícitos; referências incompletas permanecem visíveis para correção. |
| Workpack Relationship Register | Migrado | `src/core/workpackRelations.js` + `src/data/workpackLinks.js` + `src/ui/workpackPage.js` | `workpackLinks` substitui os arrays de Drawing, MTO, Inventory, Coupon, Cutting Sheet, RMV, plano e Offcut; dados antigos são migrados uma vez e vínculos inativos impedem o reaparecimento de referências removidas. |
| Material Coupon Control Relational Export | Migrado | `src/core/materialCouponControl.js` + `src/data/excel.js` + `src/main.js` | O Excel de Materiais Emitidos enriquece as linhas com responsáveis auditados, Workpack, desenhos, Cutting Sheet/Nesting, RMV, local e dimensões/quantidades devolvidas sem alterar o parser. |
| Stable Child Project IDs | Migrado | `src/core/projectIdentity.js` + `src/data/projectIdentityMigration.js` + Project selectors | Registros filhos usam o UUID do Projeto; aliases legados são migrados no startup e nomes continuam sendo exibidos na interface e nos relatórios. |
| Project Data Quality Workspace | Migrado | `src/core/projectDataQuality.js` + `src/ui/dataQualityPage.js` | Governance apresenta aliases legados, referências desconhecidas e conflitos de Projeto, com filtros, correção automática estrita e exportação CSV. |
| Procurement & Material Receiving | Migrado | `src/data/organizations.js` + `src/data/purchaseOrders.js` + `src/data/materialReceipts.js` + `src/ui/procurementPage.js` | Receiving usa cartões de PO com progresso, lista contextual de materiais e modal de lotes por PO Item. Cada lote registra Heat, quantidade, NF, data, traceabilidade, QC, checklist, localização, dimensões e peso, sem confundir chegada, aceite e disponibilidade no Inventory. |
| Procurement Derived Metrics | Migrado | `src/core/procurementMetrics.js` | Ordered, Received, Accepted, HOLD, Available, Reserved, Issued, Consumed, Returned e Pending são calculados a partir dos registros de origem. |
| Atomic Material Unit Posting | Migrado | `src/core/materialUnitPosting.js` + `src/data/materialUnitPostingTransaction.js` + `src/ui/procurementPage.js` | Unidades físicas aceitas são lançadas explicitamente no Inventory; unidade, saldo disponível, movimento `RECEIVE_MATERIAL` e auditoria são persistidos juntos, com repetição idempotente e rollback nativo. |
| PO Database & Bulk Import | Migrado | `src/core/purchaseOrderImport.js` + `src/data/purchaseOrderFiles.js` + `src/data/purchaseOrderImportTransaction.js` + `src/ui/procurementPage.js` | PO Database separa lista e detalhe; a importação abre no modal compartilhado e aceita PDF/Excel/CSV/TSV ou texto tabulado. POs SAP em PDF são lidas por blocos de item, preservando Material Details, Qty, UM, Price e Delivery Date. Classificação, tipo, OD, espessura, grade e comprimento são inferidos quando há evidência explícita, inclusive com conversão de polegadas para milímetros. Drawback exige decisão Sim/Não por item e pode ser aplicado em massa; Equipment Destination saiu da importação e fica reservado à alocação PO Item × MTO. |
| Procurement Excel Exports | Migrado | `src/core/procurementExport.js` + `src/data/excel.js` + `src/ui/procurementPage.js` | A base completa exporta PO, itens, recebimentos, unidades físicas e revisões em abas separadas. O relatório gerencial mostra pedido, recebido, saldo, percentuais e consumo por PO e unidade de medida, evitando somar EA com M. |
| Cut Sheets Register Actions | Migrado | `src/ui/cuttingSheetsPage.js` + `src/main.js` | Nesting Plans podem ser abertos, editados e excluídos com confirmação, desativação de vínculos de Workpack e auditoria; Cutting Sheets mantêm ações operacionais de resultado e impressão sem exclusão indiscriminada. |
| Nesting Plan Editor Command Bar | Migrado | `src/ui/nestingPlanWorkspace.js` + `src/main.js` | O editor mantém nome e estado visíveis, salva diretamente no IndexedDB após a primeira identificação e diferencia rascunho/alterado/otimizado/salvo. No resultado, salvar, criar novo e emitir Cutting Sheet ficam no cabeçalho; Coupon, vínculo com Workpack e exportação ficam no menu contextual. |
| Cut Sheets / Nesting Results pagination | Migrado | `src/ui/cuttingSheetsPage.js` + `src/ui/results.js` + `src/main.js` | Cut Sheets permanece na página 1 e o Nesting Results original é renderizado na página 2 sem mudança de fase; o snapshot de `plan.solution` ou `cuttingSheet.metadata.solution` continua alimentando `renderResults()`. |
| Drawing to MTO Navigation | Migrado | `src/ui/drawingPage.js` + `src/main.js` | Drawing Info abre a MTO já filtrada por projeto, número do desenho e equipamento. |
| MTO Import and Export Menu | Migrado | `src/ui/mtoPage.js` + `src/data/excel.js` | O menu nativo de três pontos concentra importação e exportação; o Excel exporta as linhas visíveis e preserva valores numéricos. |
| Workpack Task Sheet | Migrado | `src/core/taskSheet.js` + `src/data/taskSheets.js` + `src/ui/taskSheetModal.js` + `src/ui/workpackPage.js` + `src/data/excel.js` | Documento versionado do Workpack gerado de MTO/Cutting Sheet para Cutting, Beveling e Cleaning; datas, durações, quantidades, execução e notas são editáveis em tabela, com auditoria, backup e Excel separado por estação. |
| Workpack linked-document PDF batch | Migrado | `src/ui/workpackPage.js` + `src/main.js` | A aba Documents abre sequencialmente os relatórios PDF/imprimíveis já existentes de Material Coupon, Cutting Sheet e Saved Plan; registros sem dados suficientes e Task Sheets sem exportador PDF são ignorados com resumo ao usuário. |
| FMS Backup Coverage | Migrado | `src/data/backup.js` | Backup v4 enumera dinamicamente todas as stores, preserva dados binários e datas, valida integridade SHA-256 e mantém restauração transacional, incluindo Procurement e Receiving. |

The existing nesting engine remains unchanged. FMS modules must be added around the existing optimizer. No backend, framework, npm package, or TypeScript migration is planned.
