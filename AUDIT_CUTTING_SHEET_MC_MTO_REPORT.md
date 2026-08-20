# Auditoria — Cutting Sheet × Material Coupon × MTO para relatório de cortes

## Escopo e base observada

Auditoria somente leitura do código atual do worktree em 2026-08-01. O checkout já estava amplamente modificado antes desta auditoria; este documento descreve o estado corrente dos arquivos, não apenas o conteúdo de `HEAD`.

Caminhos reais confirmados:

- persistência de Cutting Sheet: `src/data/cuttingSheets.js`;
- persistência de Material Coupon: `src/data/materialCoupons.js`;
- persistência de MTO: `src/data/mtoDB.js` (a antiga unidade `src/data/mtoItems.js` está removida no worktree atual);
- schema IndexedDB: `src/data/database.js`;
- relatório de corte PDF/print: `src/reports/cuttingReport.js`;
- módulo Reports existente: `src/core/reportCalculations.js`, `src/data/reports.js`, `src/ui/reportsUI.js` e `src/ui/reportsExport.js`;
- exports Excel/SheetJS: `src/data/excel.js`.

Arquivos auxiliares consultados para confirmar como os objetos livres das stores são montados e interpretados: `src/core/cuttingSheetWorkflow.js`, `src/core/materialCouponIssue.js`, `src/core/cutExecution.js`, `src/documents/cuttingSheet.js`, `src/documents/materialCoupon.js`, `src/features/materialCoupon/materialCouponService.js`, `src/ui/cuttingSheetsPage.js` e `src/main.js`.

## Respostas

### 1. Como a Cutting Sheet referencia um Material Coupon hoje?

A referência canônica no registro de `cuttingSheets` é o campo top-level **`materialCouponId`**, normalizado como **string única** por `normalizeCuttingSheet()` (`src/data/cuttingSheets.js`, linhas 62–81). Não é array. A store tem `keyPath: "id"` e índice não único `materialCouponId` (`src/data/database.js`, linhas 70–77).

Há referências redundantes/snapshots além do campo canônico:

- `metadata.materialCouponNumber`: referência textual ao número do MC, usada para exibição/relatório (`src/main.js`, linhas 2380–2390; `src/documents/cuttingSheet.js`, linhas 57–73);
- durante a emissão validada, cada barra e cada peça recebe `materialCouponId`, e cada uma recebe também `materialCouponLineId` (`src/core/cuttingSheetWorkflow.js`, linhas 96–123);
- no vínculo opcional de peças individuais, a peça pode receber `linkedMaterialCouponId` e `linkedMaterialCouponNumber` (`src/core/materialCouponPieceLink.js`, linhas 69–88). Isso é um vínculo adicional por peça, não substitui o `cuttingSheets.materialCouponId` top-level.

Portanto: hoje a Cutting Sheet aponta para **um MC por ID estável único** em `materialCouponId`; número textual e IDs repetidos em barras/peças são dados auxiliares.

### 2. Como um Material Coupon referencia a linha MTO de origem?

O vínculo operacional é feito **por ID estável na linha do MC**, no campo exato **`mtoItemId`**. As linhas ficam duplicadas nos caminhos persistidos `items[]` e `metadata.coupon.lines[]`: `toRecord()` grava `payload.lines` nos dois (`src/features/materialCoupon/materialCouponService.js`, linhas 234–251), e `normalizeMaterialCoupon()` mantém IDs próprios das linhas em ambos os caminhos (`src/data/materialCoupons.js`, linhas 35–74).

Ao emitir o MC, `linkMaterialCouponLinesToMto()`:

- preserva `line.mtoItemId` ou o alias legado `line.mtoId` quando já presente;
- grava `mtoItemId` com `mtoItem.id` quando resolve o vínculo;
- grava ainda `mtoLinkMethod`, `identCode`, `tag`, `equipmentId` e `equipment` como contexto/snapshot (`src/core/materialCouponIssue.js`, linhas 50–59 e 93–130).

As linhas do MC também podem carregar strings **`drawing`**, **`mark`** e **`pos`** quando vêm do Inventory/Workpack (`src/features/materialCoupon/materialCouponService.js`, linhas 411–442). O documento/extract normaliza somente a referência de desenho para **`drawingUse`** (`src/documents/materialCoupon.js`, linhas 179–230); `mark` e `pos` não fazem parte das colunas do extract atual.

Conclusão: o modelo atual suporta **os dois**, mas com papéis diferentes. **`mtoItemId` é a referência estável**; `drawing`/`drawingUse`, `mark` e `pos` são snapshots textuais auxiliares e podem não existir em todas as linhas. Linhas ambíguas ou não resolvidas podem permanecer sem `mtoItemId` (`src/core/materialCouponIssue.js`, linhas 103–139).

### 3. Onde fica “quantas peças foram cortadas”?

Não existe um campo direto persistido como `cutQuantity`, `piecesCut` ou equivalente na Cutting Sheet.

As peças planejadas/persistidas ficam em **`cuttingSheets[].bars[].pieces[]`**. O contador usado hoje pela UI e pelo documento de Cutting Sheet é a soma de **`bar.pieces.length`**:

- `src/ui/cuttingSheetsPage.js`, linhas 229–237 e 275–276;
- `src/documents/cuttingSheet.js`, linhas 147–176, em que `summary.totalPieces` é calculado com `bars.reduce(... bar.pieces.length ...)`.

O relatório PDF/print também percorre `solution.stockUsed[].pieces[]` e gera uma linha visual por elemento do array (`src/reports/cuttingReport.js`, linhas 461–477, 500–518 e 558–605).

Na confirmação de execução, cada elemento de `bars[].pieces[]` recebe **`actualCutLengthMm`**, além de `plannedCutLengthMm` e `cutVarianceMm`; não recebe um campo booleano “cortada” nem uma quantidade cortada. O documento inteiro passa para `status: "cut"` quando confirmado. `src/core/cutExecution.js` considera ainda **`piece.qty`** no cálculo de comprimento real total (`actualCutLengthMm * (piece.qty || 1)`), mas os contadores existentes de peças não somam `qty`: contam elementos de `pieces[]`.

Assim, no comportamento existente, a quantidade exibida de peças é **contada a partir de `bars[].pieces.length`**. Para afirmar que foram efetivamente cortadas, o dado adicional existente é o status da Cutting Sheet (`status === "cut"`) e o snapshot de execução, não um contador próprio.

### 4. Onde fica “quem solicitou”?

Não existe hoje um campo canônico chamado `requestedBy`, `requester`, `solicitante` ou equivalente nas stores `cuttingSheets`, `materialCoupons` ou `mtoItems`.

Os campos próximos existentes são:

- Material Coupon, top-level: **`createdBy`** (ID do usuário) e **`createdByName`** (nome), em `materialCoupons` (`src/data/materialCoupons.js`, linhas 55–74). Na criação corrente, `src/main.js` fornece `currentProfile.id` e `currentProfile.name`;
- Material Coupon, payload: **`metadata.coupon.responsible.issuing`**, preenchido inicialmente com o usuário corrente e atualizado na emissão (`src/features/materialCoupon/materialCouponService.js`, linhas 181–227; `src/core/materialCouponWorkflow.js`, linhas 50–51). O extract chama isso de **`mcIssuingResponsible`** (`src/documents/materialCoupon.js`, linhas 179–230);
- Cutting Sheet: **`createdBy`**, **`updatedBy`**, `releasedBy` top-level e `metadata.preparedBy` quando fornecido. No fluxo de salvamento atual mostrado em `src/main.js`, `updatedBy` é preenchido, mas `createdBy` não é explicitamente fornecido naquele save (`src/main.js`, linhas 2369–2390);
- MTO batch tem `importedBy`; cada `mtoItem` não possui solicitante/criador no normalizador (`src/data/mtoDB.js`, linhas 70–130).

Portanto, “quem solicitou” **não existe como conceito persistido inequívoco**. Os candidatos existentes representam coisas diferentes: criador do MC (`createdBy`/`createdByName`), responsável pela emissão (`metadata.coupon.responsible.issuing` / `mcIssuingResponsible`) ou preparador da Cutting Sheet (`metadata.preparedBy`). O código atual não declara nenhum deles como “solicitante”.

### 5. Como o projeto é referenciado em Cutting Sheet, MC e MTO item?

As três entidades possuem o mesmo nome de campo top-level: **`projectId`**, normalizado como string:

- Cutting Sheet: `projectId` (`src/data/cuttingSheets.js`, linha 65), indexado na store;
- Material Coupon: `projectId` (`src/data/materialCoupons.js`, linha 59), indexado na store;
- MTO item: `projectId` (`src/data/mtoDB.js`, linha 95), indexado na store `mtoItems`.

O schema não impõe chave estrangeira; os índices são não únicos (`src/data/database.js`, linhas 48–77).

Há uma diferença de robustez no preenchimento:

- a Cutting Sheet tenta gravar `project.id`, depois IDs de contexto (`activeProjectId`/`projectData.projectId`), em `src/main.js`, linhas 2369–2375;
- o MC usa `resolveProjectId(...)`, mas, se não resolver, aceita `payload.projectId` e por último **`payload.header.project`**, que pode ser nome/texto (`src/features/materialCoupon/materialCouponService.js`, linhas 234–251);
- o MTO item usa `input.projectId` ou `batch.projectId` (`src/data/mtoDB.js`, linhas 88–130).

Portanto, a intenção/campo é o mesmo `projectId` estável nas três entidades, mas o MC possui fallback textual que pode produzir valor não canônico. Não há garantia estrutural de que os três valores sempre correspondam ao mesmo registro de projeto.

### 6. Nome exato do campo de material em cada entidade e field drift

**MTO item**

- campo canônico persistido: **`material`** (`src/data/mtoDB.js`, linha 118);
- a store `mtoItems` indexa `material` (`src/data/database.js`, linhas 48–59).

**Material Coupon**

- não há material top-level no registro;
- nas linhas `items[]` / `metadata.coupon.lines[]`, o campo de grau/material é **`materialGrade`**;
- existe separadamente **`materialDescription`** e, dependendo da origem/vínculo, **`identCode`**/`sapCode` (`src/features/materialCoupon/materialCouponService.js`, linhas 411–442; `src/documents/materialCoupon.js`, linhas 179–230).

**Cutting Sheet**

- não há material top-level normalizado;
- o snapshot de estoque/barra usa predominantemente **`materialGrade`**: o relatório de corte lê `bar.materialGrade` (`src/reports/cuttingReport.js`, linhas 446–458 e 585–591);
- a peça de demanda usa predominantemente **`material`**: o relatório tabular lê `piece.material` (`src/reports/cuttingReport.js`, linhas 461–477), e o documento normaliza `piece.material` antes de aliases como `piece.materialGrade` e, depois, `bar.materialGrade` (`src/documents/cuttingSheet.js`, linhas 110–131).

O field drift **afeta especificamente a Cutting Sheet**, porque o mesmo documento combina o material de estoque em `bar.materialGrade` com o material da peça em `piece.material`. O Material Coupon usa `materialGrade` como campo da linha para o grau, não `material`; MTO usa `material`.

### 7. Existe utilitário genérico de export CSV?

Não há um utilitário **compartilhado/genérico** de CSV.

Há duas implementações locais e quase duplicadas, fora de SheetJS:

- `csvCell()` e montagem/download manual de CSV em `src/ui/auditPage.js`, linhas 196–209;
- `csvCell()` e montagem/download manual de CSV em `src/ui/dataQualityPage.js`, linhas 162–172.

Também existe export JSON nativo no backup, com `JSON.stringify`, `Blob` e download por link (`src/data/backup.js`, linhas 196–212).

Logo, não é correto dizer que toda exportação passa por SheetJS/xlsx. As exportações de planilha em `src/data/excel.js` passam por `XLSX`, incluindo `exportMaterialCouponExtract`, `exportMaterialCouponControlDatabase`, `exportMaterialCouponExcel` e `exportReportsDashboardExcel`; CSV de Audit/Data Quality e JSON de backup não passam.

### 8. `reportCalculations.js` já calcula peças cortadas por MC/projeto/material?

Não.

`src/core/reportCalculations.js` é o cálculo puro do **Reports Phase 1** para disponibilidade de material, demanda MTO, Procurement/PO, recebimento e Inventory. A entrada carregada por `src/data/reports.js` contém `projects`, `equipments`, `mtoItems`, `purchaseOrders`, `poItems`, `receipts`, `receiptLines`, `materialUnits`, `inventoryItems`, `allocations`, `materialReservations` e `stockMovements`; ela não carrega `cuttingSheets` nem `materialCoupons` (`src/data/reports.js`, linhas 149–198).

A função principal é **`calculateReportsDashboard(data, options)`** (`src/core/reportCalculations.js`, linhas 777–960). Ela produz os dashboards `executive`, `availability` e `receiving`. As agregações por projeto/material existentes — por exemplo `buildDemandAnalysis()`, `projectBreakdown()` e `reportMaterialKey()` — tratam cobertura da demanda, estoque disponível, material em trânsito/faltante e recebimento. Nenhuma lê `bars[].pieces[]`, `materialCouponId`, linhas de MC ou status de Cutting Sheet.

Portanto, não há função existente nesse módulo que calcule “peças cortadas por MC/projeto/material”.

### 9. Mapa exato dos campos relevantes existentes

| Conceito | Cutting Sheet | Material Coupon | MTO item |
|---|---|---|---|
| ID da entidade | `id` | `id` | `id` |
| Projeto | `projectId` | `projectId` | `projectId` |
| Número do documento | `number` | `number` / `metadata.coupon.header.mcCode` | não aplicável |
| Vínculo CS → MC | `materialCouponId` | — | — |
| Número textual do MC na CS | `metadata.materialCouponNumber` | `number` / `metadata.coupon.header.mcCode` | — |
| Linhas/peças | `bars[].pieces[]` | `items[]` e `metadata.coupon.lines[]` | um registro por item/linha |
| Vínculo de linha do MC → MTO | — | `items[].mtoItemId` / `metadata.coupon.lines[].mtoItemId` | `id` |
| Método do vínculo MTO | — | `mtoLinkMethod` | — |
| Drawing | peça: `dwgNumber` ou `drawing`/`drawingRef` | linha: `drawing`; extract: `drawingUse` | `drawing` |
| Mark | peça: `mark` | linha: `mark` quando disponível | `mark` |
| POS | peça: `pos` (alias lido: `position`) | linha: `pos` quando disponível | `pos` |
| Material | barra: `materialGrade`; peça: `material` | linha: `materialGrade` | `material` |
| Descrição do material | barra/peça: `materialDescription` ou `description` | linha: `materialDescription` | `description` |
| Quantidade | sem contador top-level; contagem atual por `bars[].pieces.length`; peça pode carregar `qty` | linha: `qty` | `qty` |
| Evidência de corte | documento: `status === "cut"`; peça executada: `actualCutLengthMm` | — | status pode ser `cut`, mas não é usado pelo relatório de corte atual |
| Criador | `createdBy` | `createdBy`, `createdByName` | não existe no item; lote usa `importedBy` |
| Responsável pela emissão/preparo | `metadata.preparedBy` quando fornecido | `metadata.coupon.responsible.issuing`; extract: `mcIssuingResponsible` | não existe |
| Solicitante explícito | não existe | não existe | não existe |

## Observação sobre o relatório de corte já existente

`src/reports/cuttingReport.js` é um gerador de HTML para impressão/PDF. Ele recebe um `solution` em memória e `projectData`; não consulta IndexedDB e não faz junção entre `cuttingSheets`, `materialCoupons` e `mtoItems`. Ele já apresenta Cutting Sheet/MC por números textuais em `projectData`, conta peças colocadas para KPIs e lista Drawing/Mark/POS/material por peça, mas não resolve IDs entre as três stores.
