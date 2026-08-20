# Auditoria — Material Utilization em Reports

Data da leitura: 2026-08-04
Escopo: estado atual dos arquivos no worktree. Nenhum arquivo de código foi alterado.

## Resumo factual

- Existe cálculo de aproveitamento individual no motor e nos documentos/relatórios de Cutting Sheet, mas não existe agregação pronta sobre todos os Cutting Sheets.
- O Cutting Sheet não persiste um campo canônico `utilizationPercent`; persiste os comprimentos necessários para recalculá-lo e também snapshots completos da solution.
- Estoque, reserva, emissão/consumo e retorno coexistem em dois níveis: estado corrente nas stores (`inventory`, `materialReservations`, RMV/offcuts) e eventos em `stockMovements`.
- `stockMovements` tem `quantityDelta` e `lengthDelta`, mas não tem `weightDelta`.
- `SCRAP_OFFCUT` existe, porém o fluxo ativo grava `quantityDelta: 0` e `lengthDelta: 0`; o movimento não oferece volume ou peso de scrap diretamente somável.
- Reports já carrega `inventoryItems`, `materialReservations` e `stockMovements`. Não carrega `cuttingSheets`, `returnMaterialVouchers`, `materialTransformations` nem `offcuts`.

## 1. Aproveitamento de nesting por Cutting Sheet

### Motor de otimização

O caminho confirmado é `src/core/allocate.js`.

`allocateParts()` e `allocatePartsWithOffcutReuse()` retornam:

- `stockUsed`;
- `unplacedParts`;
- `totalStockLength`;
- `totalRemaining`;
- `totalTrims`;
- `generatedOffcuts`;
- `minOffcut`.

O aproveitamento é calculado pela função privada `utilizationOf(solution)`:

```text
used = totalStockLength - totalRemaining - totalTrims
utilization = used / totalStockLength
```

Esse valor é uma razão entre `0` e `1`. `runAllocations()` usa `utilizationOf()` para escolher a melhor solução entre FFD/BFD e estratégias de estoque, mas **não acrescenta um campo chamado `utilization`, `utilizationRate` ou `wastePercentage` ao objeto retornado**. O resultado final continua trazendo os totais de comprimento.

### Persistência no Cutting Sheet

O store real é `src/data/cuttingSheets.js`, store IndexedDB `cuttingSheets`.

`normalizeCuttingSheet()` persiste:

- `bars`, incluindo `pieces`;
- `summary`, como objeto aberto;
- `planning`, como objeto aberto;
- `metadata`, como objeto aberto.

O fluxo ativo em `src/main.js` persiste a otimização em `persistCurrentPlan()` e `issueCurrentCuttingSheet()`:

- `bars: lastSolution.stockUsed` ou `prepared.bars`;
- `summary: summarizeSolution(lastSolution)`;
- `planning: buildPlanSnapshot()`, cujo snapshot contém `solution`;
- `metadata.solution: structuredClone(lastSolution)`.

`summarizeSolution()` grava exatamente:

- `totalStockLength`;
- `totalRemaining`;
- `totalTrims`;
- `stockUsedCount`;
- `unplacedCount`.

Portanto, a porcentagem não é persistida diretamente no `summary`, mas seus três componentes de comprimento são persistidos. O snapshot completo também permanece em `planning.solution` e `metadata.solution`. `openCuttingSheetResults()` e `printLinkedCuttingSheetPdf()` reconstroem a solution a partir desses campos.

### Funções que já exibem/calculam a porcentagem individual

- `src/documents/cuttingSheet.js`, `buildCuttingSheetDocument()`: calcula `summary.utilizationPercent` como `totalNested / totalStock * 100` a partir das barras do documento.
- `src/reports/cuttingReport.js`: calcula utilization por barra e o aproveitamento global do relatório a partir de `totalStockLength`, `totalRemaining` e `totalTrims`.
- `src/core/allocate.js`, `utilizationOf()`: calcula a razão apenas para comparar solutions durante a otimização.

Não foi encontrada em `src/core/reportCalculations.js`, `src/data/reports.js` ou outro módulo ativo uma função que percorra todos os Cutting Sheets persistidos e calcule média, média ponderada ou qualquer outro agregado global de nesting.

## 2. Material consumido, reservado, em estoque e retornado

## 2.1 Stock movements

O caminho é `src/data/stockMovements.js`.

`STOCK_MOVEMENT_TYPES` contém:

- `IMPORT_INVENTORY`;
- `RECEIVE_MATERIAL`;
- `RESERVE_STOCK`;
- `RELEASE_RESERVATION`;
- `SPLIT_STOCK`;
- `ISSUE_MATERIAL`;
- `CONSUME_STOCK`;
- `RETURN_OFFCUT`;
- `SCRAP_OFFCUT`;
- `MANUAL_ADJUSTMENT`.

`normalizeStockMovement()` persiste `quantityDelta` e `lengthDelta`, além de `before`, `after` e `metadata`. Não existe `weightDelta`, `weightKg` ou campo equivalente no contrato normalizado do movimento.

`getStockMovements(filters)` permite filtrar por `inventoryItemId`, `projectId`, `movementType`, `sourceDocumentType`, `sourceDocumentId`, `from` e `to`. O módulo não oferece função agregadora; ele lista/filtra movimentos.

## 2.2 Consumido/emitido

Existem duas fontes observáveis:

- Movimentos `ISSUE_MATERIAL` e `CONSUME_STOCK`, normalmente com `quantityDelta` negativo.
- Campos correntes do Inventory, especialmente `issuedQty`, além de `qty` e `balanceQty`.

`src/core/procurementMetrics.js`, em `calculatePoItemMetrics()`, já demonstra o uso combinado:

- soma o valor absoluto de `quantityDelta` de `ISSUE_MATERIAL` em `issued`;
- soma o valor absoluto de `quantityDelta` de `CONSUME_STOCK` em `consumed`;
- lê `inventory.issuedQty`;
- define `used` pelo Inventory quando há Inventory relacionado; sem ele, usa `Math.max(issued, consumed)`.

Assim, o sistema não trata a soma indiscriminada de `ISSUE_MATERIAL + CONSUME_STOCK` como total consumido: esses eventos podem representar etapas diferentes e `procurementMetrics` evita dupla contagem usando o estado corrente como fonte preferencial.

No fluxo de Material Coupon, `src/data/materialCouponActionTransaction.js` registra `ISSUE_MATERIAL` com `quantityDelta: -quantity` e atualiza diretamente `inventory.reservedQty`, `inventory.issuedQty` e `inventory.status`.

## 2.3 Reservado

O caminho é `src/data/materialReservations.js`, store `materialReservations`.

`normalizeMaterialReservation()` persiste:

- `inventoryItemId`;
- `mtoItemId`;
- `materialCouponId` e `materialCouponLineId`;
- `quantity`;
- `status`: `ACTIVE`, `RELEASED`, `CONSUMED` ou `CANCELLED`;
- dados de reserva/liberação e `metadata`.

`listMaterialReservations(filters)` filtra registros, mas não soma reservas.

As reservas também alteram o estado corrente do Inventory (`reservedQty`) e criam `RESERVE_STOCK`. No fluxo de emissão em `src/data/materialCouponIssueTransaction.js`, o movimento `RESERVE_STOCK` é registrado com `quantityDelta: 0`; a quantidade reservada fica em `metadata.reservedQuantity`, enquanto o valor canônico somável está no registro `materialReservations.quantity` e em `inventory.reservedQty`.

`calculatePoItemMetrics()` confirma a precedência existente:

- quando há Inventory relacionado, usa a soma de `inventory.reservedQty`;
- sem Inventory relacionado, soma `quantity` das reservas com `status === ACTIVE`.

## 2.4 Em estoque

O saldo corrente está no Inventory:

- `balanceQty` é usado como quantidade disponível, com fallback para `qty`;
- `reservedQty` representa a parcela reservada;
- `weightKg` permite peso disponível proporcional quando `qty` e `balanceQty` existem.

Em `src/core/reportCalculations.js`, `inventoryAvailableQuantity()` usa `balanceQty` ou `qty`; `availableInventoryWeight()` proporciona `weightKg` pelo saldo. `inventoryIsUsable()` exige status disponível, qualidade aceitável, `reservedQty <= 0` e saldo positivo para a cobertura de MTO.

Em `src/core/procurementMetrics.js`, `stockOnHand` é definido como `available + reserved`, isto é, saldo disponível mais reservado.

## 2.5 Retornado / RMV

O documento persistido está em `src/data/returnMaterialVouchers.js`, store `returnMaterialVouchers`.

`normalizeReturnMaterialVoucher()` persiste `returnedItems`. Cada linha, normalizada por `normalizeRmvLine()` em `src/core/returnMaterialVoucher.js`, pode conter:

- `qty` e `unit`;
- `lengthMm`, além das outras dimensões;
- `weightKg`;
- `status`, `receivedAt`, `receivedBy` e `inventoryItemId`.

`weightKg` pode ser informado ou estimado proporcionalmente por `estimateReturnedWeight(parent, returnedLengthMm)` quando o estoque pai tem comprimento e peso.

O retorno recebido por RMV cria em `src/data/rmvReceiptTransaction.js`:

- novo Inventory item;
- transformação `REUSABLE_OFFCUT` com `quantity`, `lengthMm`, dimensões e `weightKg`;
- movimento `RETURN_OFFCUT` com `quantityDelta` e `lengthDelta`;
- atualização da linha do RMV para recebida.

Também existe retorno operacional de offcut fora do recebimento fiscal de RMV em `src/workflows/processOffcutDisposition.js`, que cria `RETURN_OFFCUT` e um Inventory item reutilizável.

`calculatePoItemMetrics()` soma `quantityDelta` de `RETURN_OFFCUT` em `returned`, mas não existe agregação global de RMVs ou de peso retornado em Reports.

## 3. Scrap

O conceito existe em três contratos:

- `STOCK_MOVEMENT_TYPES.SCRAP_OFFCUT` em `src/data/stockMovements.js`;
- `OFFCUT_STATUS.SCRAP` em `src/data/offcuts.js`;
- `MATERIAL_TRANSFORMATION_TYPES.SCRAP` e `PROCESS_LOSS` em `src/data/materialTransformations.js`.

`materialTransformations` tem campos somáveis `quantity`, `lengthMm`, `widthMm`, `thicknessMm` e `weightKg`. Porém, na busca pelo codebase atual, os produtores encontrados criam somente:

- `CUT_PART`, em `src/core/materialGenealogy.js`;
- `REUSABLE_OFFCUT`, em `src/core/materialGenealogy.js` e `src/data/rmvReceiptTransaction.js`.

Não foi encontrado produtor ativo que grave uma transformação `SCRAP` ou `PROCESS_LOSS`.

No fluxo ativo de descarte `processOffcutDisposition()`:

- o offcut recebe status `scrap` e mantém `length`/`qty` no registro de offcut;
- é criado um `SCRAP_OFFCUT`;
- esse movimento recebe explicitamente `quantityDelta: 0` e `lengthDelta: 0`;
- o motivo fica em `reason`, e referências ficam em `before`, `after` e `metadata`.

O workflow intermediário `returnOffcutsToStock()` preserva `lengthMm`, `widthMm`, `thicknessMm`, `qty` e `weightKg` no objeto de scrap. Entretanto, `normalizeOffcut()` persiste apenas `length` e `qty` como campos dimensionais diretos; não persiste `weightKg`, largura ou espessura como campos canônicos do offcut. O movimento normalizado também não possui peso.

Conclusão: **scrap é classificado**, mas o `SCRAP_OFFCUT` persistido não possui hoje quantidade, comprimento ou peso diretamente somável nos deltas do movimento. Há informação contextual em `before`/`after`/`metadata` e no offcut, especialmente comprimento/quantidade, mas não existe métrica pronta e uniforme de volume ou peso de scrap.

## 4. Dados disponíveis hoje em Reports

O loader atual é `loadReportsData()` em `src/data/reports.js`.

Já são carregados:

- `projects`;
- `equipments`;
- `mtoItems`;
- `purchaseOrders` e `poItems`;
- `receipts`, `receiptLines` e `materialUnits`;
- `inventoryItems`;
- `allocations` de MTO × PO Item;
- `materialReservations` via `listMaterialReservations()`;
- `stockMovements` via `getAllStockMovements()`.

No escopo por projeto, `filterProjectData()` também filtra `materialReservations` e `stockMovements`. Para movimentos sem `projectId` direto, ele reconhece ligações por Inventory e por `metadata.reservationIds`.

Não são carregados por Reports:

- `cuttingSheets` de `src/data/cuttingSheets.js`;
- `returnMaterialVouchers` de `src/data/returnMaterialVouchers.js`;
- `materialTransformations` de `src/data/materialTransformations.js`;
- `offcuts` de `src/data/offcuts.js`.

Em `src/core/reportCalculations.js`, os dados de utilization não são calculados. O uso atual de `materialReservations` e `stockMovements` limita-se principalmente à resolução de Inventory emitido por Equipment TAG em `issuedInventoryTagFactors()`, que lê movimentos `ISSUE_MATERIAL` e seus `metadata.reservationIds`. Não há hoje KPIs agregados de consumido, reservado, estoque, retornado, nesting utilization ou scrap.

Para que esses conceitos documentais estejam presentes no dataset bruto de Reports, seriam necessárias leituras das stores ainda ausentes e o correspondente recorte por projeto. Factualmente, os leitores existentes são:

- `getAllCuttingSheets()`;
- `getAllReturnMaterialVouchers()` ou `getReturnMaterialVouchers()`;
- `listMaterialTransformations()`;
- `getAllOffcuts()` ou `getOffcuts()`.

As informações de estado corrente de estoque/reserva e os eventos de emissão/consumo/retorno já estão disponíveis no dataset atual; Cutting Sheets, documentos RMV, genealogia e registros de offcut não estão.

## Arquivos e contratos relevantes

| Área | Caminho | Contratos relevantes |
|---|---|---|
| Movimentos | `src/data/stockMovements.js` | `STOCK_MOVEMENT_TYPES`, `normalizeStockMovement()`, `quantityDelta`, `lengthDelta` |
| Nesting | `src/core/allocate.js` | `utilizationOf()`, `runAllocations()`, totais de comprimento |
| Cutting Sheet store | `src/data/cuttingSheets.js` | `normalizeCuttingSheet()`, `bars`, `summary`, `planning`, `metadata` |
| Persistência do plano | `src/main.js` | `summarizeSolution()`, `buildPlanSnapshot()`, `persistCurrentPlan()`, `issueCurrentCuttingSheet()` |
| Documento Cutting Sheet | `src/documents/cuttingSheet.js` | `buildCuttingSheetDocument()`, `summary.utilizationPercent` |
| Relatório de corte | `src/reports/cuttingReport.js` | métricas por barra e utilization global da solution |
| Reservas | `src/data/materialReservations.js` | `MATERIAL_RESERVATION_STATUS`, `quantity`, `status` |
| Métricas de Procurement | `src/core/procurementMetrics.js` | `calculatePoItemMetrics()`, `used`, `reserved`, `stockOnHand`, `returned` |
| RMV store | `src/data/returnMaterialVouchers.js` | `normalizeReturnMaterialVoucher()`, `returnedItems` |
| RMV core/transação | `src/core/returnMaterialVoucher.js`, `src/data/rmvReceiptTransaction.js` | `normalizeRmvLine()`, `estimateReturnedWeight()`, `RETURN_OFFCUT` |
| Genealogia | `src/data/materialTransformations.js`, `src/core/materialGenealogy.js` | tipos e dimensões/peso das transformações |
| Scrap/offcuts | `src/data/offcuts.js`, `src/workflows/processOffcutDisposition.js` | `OFFCUT_STATUS.SCRAP`, `SCRAP_OFFCUT` |
| Reports | `src/data/reports.js`, `src/core/reportCalculations.js` | carga atual, recorte por projeto e cálculos existentes |
