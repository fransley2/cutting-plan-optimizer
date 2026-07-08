# MIGRATION.md

## Regra

O arquivo `legacy/original.html` é somente referência.

Não importar código diretamente dele no app novo.

Ao migrar uma função:

1. Identificar o comportamento no arquivo antigo.
2. Verificar se já existe algo equivalente no app novo.
3. Reaproveitar módulo existente quando possível.
4. Separar lógica pura de DOM.
5. Criar função pequena no local correto.
6. Testar no navegador.
7. Marcar como migrado neste arquivo.

---

## Mapa de migração

| Função antiga                                   |              Status | Novo destino                                    | Observação                                                 |
| ----------------------------------------------- | ------------------: | ----------------------------------------------- | ---------------------------------------------------------- |
| `safeParseFloat`, `safeParseInt`, `safeToFixed` |             Migrado | `src/core/utils.js`                             | Helpers puros                                              |
| `generateUUID`                                  | Migrado/substituído | `src/core/utils.js`                             | Preferir `crypto.randomUUID()`                             |
| `showToast`                                     |             Migrado | `src/ui/toast.js`                               | UI isolada                                                 |
| `showModal`, `hideModal`                        |             Migrado | `src/ui/modal.js`                               | Modal genérico                                             |
| `createStockRow`                                |  Migrado/refatorado | `src/ui/dataTable.js` + `src/ui/columns.js`     | Tabela genérica                                            |
| `createPartRow`                                 |  Migrado/refatorado | `src/ui/dataTable.js` + `src/ui/columns.js`     | Tabela genérica                                            |
| `parseStockDataFromUI`                          |  Migrado/refatorado | `src/main.js` / `dataTable.js`                  | Coleta de dados da UI                                      |
| `parsePartsDataFromUI`                          |  Migrado/refatorado | `src/main.js` / `dataTable.js`                  | Coleta de dados da UI                                      |
| `allocateParts`                                 |  Migrado/refatorado | `src/core/allocate.js`                          | Não pode acessar DOM                                       |
| `runAllocations`                                |  Migrado/refatorado | `src/core/allocate.js`                          | Motor principal                                            |
| Upload estoque Excel                            |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Upload peças Excel                              |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Export Excel                                    |             Migrado | `src/data/excel.js`                             | Usar SheetJS                                               |
| Salvar plano                                    |             Migrado | `src/data/plans.js`                             | IndexedDB `NestingAppDB`, store `plans`, com migracao do LocalStorage |
| Carregar plano                                  |             Migrado | `src/data/plans.js` + `src/ui/planListModal.js` | Modal reaproveitado com carregamento assincrono            |
| Importar Cupom de Material                      |            Pendente | `src/data/couponImport.js`                      | Próxima função recomendada                                 |
| Inventário IndexedDB                            |           Migrado | `src/data/inventoryDB.js` + `src/data/inventoryImport.js` + `src/ui/inventoryModal.js` | Fluxo de importação, persistência IndexedDB e adição ao estoque migrados |
| Relatório de Corte / Aproveitamento de Nesting PDF | Migrado | `src/reports/cuttingReport.js` | Usa HTML imprimível + `window.print()`, sem dependência externa |
| Fluxo de resultados em fase única | Migrado | `index.html`, `src/main.js`, `src/ui/results.js`, `src/styles/app.css` | Substitui janela externa por tela de resultados dentro do app |
| Modal claro de exportação | Migrado | `index.html`, `src/main.js`, `src/styles/app.css` | Substitui modal preto por dialog nativo alinhado ao tema Microsoft 365 |
| Impressão visual                                |            Pendente | `src/reports/printVisual.js`                    | Não misturar com UI principal                              |
| Impressão tabular                               |            Pendente | `src/reports/printTabular.js`                   | Relatório separado                                         |
| Cutting Sheet                                   |            Pendente | `src/reports/printCuttingSheet.js`              | Relatório separado                                         |
| Pro-style report                                |            Pendente | `src/reports/printPro.js`                       | Relatório separado                                         |
| Geração de etiquetas                            |            Pendente | `src/reports/labels.js`                         | Reaproveitar dados da solução                              |
| i18n EN/PT/IT/FR                                |            Pendente | `src/i18n/translations.js`                      | Confirmar necessidade real antes                           |
| Toggle labels/cor/fonte                         |            Pendente | `src/ui/results.js`                             | Passar opções para renderização                            |
