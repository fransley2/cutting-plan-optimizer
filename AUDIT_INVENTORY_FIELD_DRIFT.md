# Auditoria — Inventory Field Drift

Data: 2026-08-05
Escopo: `src/data/inventoryDB.js` lido integralmente e busca dos campos em todo `src/`, exceto o legado congelado. Nenhum arquivo de código foi alterado.

## 1. Identidade física: `id`, `trace`, `traceability`

### Contrato persistido

- A store `inventory` usa **`trace` como keyPath real**: `src/data/database.js:16`.
- A normalização escolhe `trace` por `input.trace || input.traceability || input.id || UUID`: `src/data/inventoryDB.js:44-45`.
- `id` preserva um `input.id` próprio e só cai para `trace` quando ele não existe: `src/data/inventoryDB.js:63`.
- `traceability` preserva primeiro `input.traceability`, depois `input.trace`, depois o `trace` calculado: `src/data/inventoryDB.js:65`.
- `saveInventoryItems()` grava pelo objeto normalizado e exige `normalized.trace`: `src/data/inventoryDB.js:133-143`; `createInventoryItem()` faz o mesmo em `src/data/inventoryDB.js:184-188`.
- `getInventoryItem()` tenta primeiro o keyPath recebido, depois procura por qualquer um dos três aliases: `src/data/inventoryDB.js:191-197`. Update e delete terminam operando pela key `trace`: `src/data/inventoryDB.js:199-215`.

### Escritas identificadas

| Campo | Consumidores que escrevem |
|---|---|
| `id` | Normalização (`src/data/inventoryDB.js:63`); recebimento de unidade física cria os três campos iguais (`src/core/materialUnitPosting.js:37`); split cria novo `id` igual ao novo trace (`src/core/inventorySplit.js:62-66`); retorno operacional de offcut força os três iguais (`src/workflows/processOffcutDisposition.js:88-94`); editor de Inventory envia a identidade do formulário como `trace`, não cria `id` diretamente (`src/ui/inventoryPage.js:529`). |
| `trace` | Normalização (`src/data/inventoryDB.js:45,64`); importador lê a coluna Trace e grava `trace` e `traceability` iguais (`src/data/inventoryImport.js:121-125,192-199`); editor grava `trace` (`src/ui/inventoryPage.js:529,680`); split (`src/core/inventorySplit.js:65`); material unit posting (`src/core/materialUnitPosting.js:37`); offcut operacional (`src/workflows/processOffcutDisposition.js:92`); edição pós-recebimento preserva o keyPath existente (`src/data/materialReceipts.js:151-155`). |
| `traceability` | Normalização (`src/data/inventoryDB.js:65`); importador (`src/data/inventoryImport.js:125,233`); formulário lê `traceability || trace` (`src/ui/inventoryPage.js:579`) e devolve o valor em `trace` (`src/ui/inventoryPage.js:529`); split (`src/core/inventorySplit.js:66`); material unit posting (`src/core/materialUnitPosting.js:37`); offcut operacional (`src/workflows/processOffcutDisposition.js:93`); recebimento preserva `linkedInventory.traceability || linkedInventory.trace` (`src/data/materialReceipts.js:154-155`). |

### Leituras e resolução de identidade

| Consumidor | Uso |
|---|---|
| `src/data/inventoryDB.js:191-197` | Lookup direto pelo keyPath e fallback `id || trace || traceability`. |
| `src/data/cuttingConfirmationTransaction.js:21` | Produz todas as identidades `[id, trace, traceability]`. |
| `src/data/materialCouponIssueTransaction.js:26,98,146,157,216` | Resolve Inventory e persiste referências de Coupon/movimento. |
| `src/data/materialCouponActionTransaction.js:20,45,75,120` | Resolve e atualiza o item em dispatch/release. |
| `src/data/materialUnitPostingTransaction.js:37,44,64` | Detecta traces duplicados e liga Material Unit ao Inventory criado. |
| `src/data/materialReceipts.js:117,121,142,154-155,170,196` | Resolve o item postado, protege trace e persiste referências. |
| `src/data/reports.js:117` | Monta o conjunto de IDs reconhecidos para o recorte de Reports. |
| `src/core/inventorySplit.js:41-49,116-117` | Gera trace do filho e resolve qualquer alias. |
| `src/core/materialCouponReservation.js:3,27,40` | Resolve linhas de Coupon e produz `inventoryItemId`/traceability. |
| `src/core/materialCouponIssue.js:11,103` | Resolve o item físico usado na emissão. |
| `src/core/materialCouponControl.js:26` | Inclui `trace` na identidade pesquisável do Inventory. |
| `src/core/cuttingSheetWorkflow.js:10,39-41,59,110,117` | Resolve estoque físico para o Cutting Sheet. |
| `src/core/cuttingSheetPresentation.js:6,39-41` | Resolve identidade para apresentação do Cutting Sheet. |
| `src/core/genealogyExplorer.js:47,59,164,313,322,432` | Indexa e exibe nós de genealogia por aliases. |
| `src/core/entityReferenceQuality.js:40,53,58,113` | Declara `trace`/`traceability` como campos de compatibilidade. |
| `src/core/reportCalculations.js:208-210,1002-1007` | Indexa Inventory e liga movimentos/POs usando qualquer identidade. |
| `src/core/procurementMetrics.js:51-54` | Liga Material Units e Inventory por `id`, `trace` ou `traceability`. |
| `src/core/operationalReadiness.js:268` | Usa os três como identidade pesquisável. |
| `src/documents/materialCoupon.js:153,161,198` | Resolve Inventory e snapshot de traceability. |
| `src/documents/cuttingSheet.js:119` | Snapshot por `traceability || trace || traceNo`. |
| `src/documents/returnMaterialVoucher.js:93,106,137` | Resolve trace de origem/retorno. |
| `src/reports/labels.js:66` e `src/reports/printVisual.js:343` | Exibição de traceability com fallback. |
| `src/features/materialCoupon/materialCouponService.js:414,428,458,1185,1197,1359` | Seleção, vínculo e lookup de Inventory. |
| `src/ui/inventoryModal.js:30,52-53,92-100,162,205-221` | O seletor usa diretamente `trace` como chave da seleção. |
| `src/ui/inventoryPage.js:140,186,212,334,353-354,579,770,974-991` | ID de linha e exibição usam fallbacks; a grade mostra traceability. |
| `src/ui/procurementPage.js:709,728` | Resolve unidade recebida contra Inventory. |
| `src/ui/workpackPage.js:717,721,742` | Persiste/resolve vínculos de Workpack por `trace || traceability || id`. |
| `src/main.js:1582,2021-2022,2196` | Resolve pais de offcut e registros vinculados ao Workpack. |
| `src/workflows/confirmCuttingSheet.js:103` e `src/workflows/returnMaterialVoucherWorkflow.js:31-33` | Rollback/update e mapa de pais. |

### Os três ficam sincronizados?

Não há invariável que imponha igualdade. `normalizeInventoryItem()` preserva valores explícitos diferentes: com `{ id: 'A', trace: 'B', traceability: 'C' }`, o resultado continua com os três valores distintos (`src/data/inventoryDB.js:45,63-65`). Portanto, a inconsistência é estruturalmente permitida e persistível.

Os fluxos canônicos mais novos criam os três iguais — Material Unit (`src/core/materialUnitPosting.js:37`), split (`src/core/inventorySplit.js:64-66`) e retorno operacional (`src/workflows/processOffcutDisposition.js:91-93`) —, mas importação/edição de registros preexistentes não repara os três aliases como conjunto. O próprio lookup múltiplo em `src/data/inventoryDB.js:193-196` confirma que o sistema admite registros em que eles não são equivalentes.

## 2. Aliases de pai

### Escrita na criação de filhos

| Fluxo | Campos gravados |
|---|---|
| Split de Inventory | `parentStockId = source.id || source.trace` e `parentTraceability = source.traceability || source.trace`: `src/core/inventorySplit.js:62-69`. Não grava `parentInventoryItemId`, `parentInventoryId` ou `parentTrace`. |
| Retorno operacional de offcut | No novo Inventory: `parentStockId`, `parentInventoryItemId` e `parentTraceability`: `src/workflows/processOffcutDisposition.js:88-105`. No registro de Offcut: `parentInventoryItemId` e `metadata.parentTrace`: `src/workflows/processOffcutDisposition.js:114-139`. |
| Fluxo antigo `returnOffcutsToStock` | Modelo intermediário grava `parentInventoryId` e `parentTrace`: `src/workflows/returnOffcutsToStock.js:170-174`; ao montar item retornado converte `parentInventoryId` em `parentStockId`: `src/workflows/returnOffcutsToStock.js:258`. |
| RMV lifecycle | Linha RMV recebe `parentInventoryItemId` e `parentTrace`: `src/data/rmvLifecycleTransaction.js:44-49,66`; metadados repetem `parentInventoryItemId`: `src/data/rmvLifecycleTransaction.js:97-108,131`. |
| Recebimento de RMV | Novo Inventory recebe `parentStockId`, `parentInventoryItemId` e `parentTraceability`: `src/data/rmvReceiptTransaction.js:69-71`; transformação repete `parentInventoryItemId`: `src/data/rmvReceiptTransaction.js:92,189`. |
| Normalização da store | Persiste separadamente todos os cinco, sem unificá-los: `src/data/inventoryDB.js:116-119,126`. |

### Leitores e fallbacks existentes

- O fallback mais completo está em `parentReference()`: `parentInventoryItemId || parentStockId || parentInventoryId || parentTrace || parentTraceability || metadata.parentTrace` (`src/workflows/processOffcutDisposition.js:29-37`).
- RMV aceita `parentInventoryItemId || parentTrace || parentTraceability` para elegibilidade e lookup (`src/workflows/returnMaterialVoucherWorkflow.js:25,31-33`).
- Reports resolve peso retornado por `parentInventoryItemId || parentStockId || parentTraceability` (`src/core/reportCalculations.js:208-219`) e usa a presença específica de `parentStockId` para excluir filhos do KPI de peso recebido (`src/core/reportCalculations.js:1139-1141`).
- `normalizeRmvLine()` aceita `parentInventoryItemId || parentStockId || parentInventory.id || parentInventory.trace` e `parentTraceability || parentTrace || parentInventory.traceability || parentInventory.trace` (`src/core/returnMaterialVoucher.js:110-111`).
- Genealogy prioriza `parentInventoryItemId`; transformações e Offcuts são ligados por esse campo (`src/core/genealogyExplorer.js:329,351,368`; `src/core/materialGenealogy.js:10,22-24,36,58`; `src/data/materialTransformations.js:24,46,55`).
- Workpack aceita `parentTrace || parentTraceability || parentInventoryItemId` (`src/core/workpackMaterials.js:47-49`; `src/core/workpackQuickCreate.js:44-46`; `src/core/workpackOffcuts.js:43`).
- UI de retornos exibe `parentTrace || parentTraceability || metadata.parentTrace` (`src/ui/returnMaterialPage.js:225`); RMV mostra `parentTraceability || traceability` (`src/ui/returnMaterialVoucherModal.js:108`).
- O documento RMV aceita `parentTrace`, `parentTraceability` e aliases de trace do próprio item (`src/documents/returnMaterialVoucher.js:106,137`).

### São substituíveis?

Não. Eles carregam dois tipos de referência:

- `parentInventoryItemId`, `parentStockId` e `parentInventoryId` pretendem apontar para uma identidade de registro, mas podem conter `id` ou `trace` conforme o escritor.
- `parentTraceability` e `parentTrace` são snapshots de rastreabilidade física.

Como `id` e `trace` podem divergir, um valor armazenado apenas em `parentInventoryItemId` não é necessariamente recuperável por um consumidor que lê só `parentTraceability`, e vice-versa. Há dependências específicas: genealogia exige `parentInventoryItemId` (`src/data/materialTransformations.js:46`), enquanto a exclusão de filhos no KPI usa especificamente `parentStockId` (`src/core/reportCalculations.js:1140`). `parentInventoryId` só é escrito/lido no caminho legado/intermediário de retorno (`src/workflows/returnOffcutsToStock.js:173,258`; `src/workflows/processOffcutDisposition.js:33`) e não participa dos demais resolvers.

## 3. Referência a PO Item

### Vínculo persistido principal

O vínculo oficial mais forte é **`metadata.poItemId`**, preenchido com o ID real do PO Item no posting de Material Unit (`src/core/materialUnitPosting.js:51-53`).

- Procurement testa esse ID antes de qualquer fallback textual: `src/core/procurementMetrics.js:16-23`.
- Reports também o testa primeiro em `inferInventoryPoItemId()`: `src/core/reportCalculations.js:291-300`; o ID resolvido alimenta projeto, recebimento e recortes por TAG em `src/core/reportCalculations.js:316-323,343-348,1000-1007`.
- O carregador de Reports considera `metadata.poItemId` uma referência de PO Item: `src/data/reports.js:31`.
- Qualidade referencial e Genealogy também o reconhecem: `src/core/entityReferenceQuality.js:38,296`; `src/core/genealogyExplorer.js:63`.
- Emissão de Material Coupon lê `metadata.poItemId` como vínculo de negócio: `src/core/materialCouponIssue.js:111`.

### `poItem` e `poItemPo`

Eles são snapshots textuais, mas **não são apenas display**:

- `poItem` recebe o número do item da PO, não necessariamente seu ID (`src/core/materialUnitPosting.js:39-40`; `src/data/inventoryDB.js:74`). É exibido por Inventory/Material Coupon/Cutting Sheet/RMV (`src/ui/inventoryModal.js:34,55`; `src/documents/materialCoupon.js:202`; `src/documents/cuttingSheet.js:118`; `src/documents/returnMaterialVoucher.js:127`).
- Procurement usa `po + poItem` como fallback real de matching (`src/core/procurementMetrics.js:20-23`). Purchase Order lifecycle também usa `poItem`, `poItemNumber` ou `item` em decisões de vínculo (`src/core/purchaseOrderLifecycle.js:11-15`). Reports aceita `poItem` como ID legado ou número do item (`src/core/reportCalculations.js:295-300`).
- `poItemPo` é o snapshot combinado `PO-item`, criado no posting (`src/core/materialUnitPosting.js:39`) e também importável/editável (`src/data/inventoryImport.js:38,127`; `src/ui/inventoryPage.js:535,594,1008`). Ele participa de matching de Procurement (`src/core/procurementMetrics.js:23`), Reports (`src/core/reportCalculations.js:300`; `src/data/reports.js:44`) e Cutting Sheet presentation (`src/core/cuttingSheetPresentation.js:63-64`).

Assim, a precedência observada é: ID canônico `metadata.poItemId`; depois aliases legados/textuais (`poItem`, `po + poItem`, `poItemPo`).

## 4. Qualidade: `inspectionStatus`, `acceptanceStatus`, `qualityStatus`

### Significado observado

| Campo | Papel efetivo no código |
|---|---|
| `inspectionStatus` | Resultado da inspeção física em Material Receipt/Material Unit. Controla se uma unidade pode ser postada (`src/core/materialUnitPosting.js:23-29`), cobertura recebida (`src/core/mtoPoItemAllocation.js:360-362`), métricas accepted/hold/rejected (`src/core/procurementMetrics.js:59-61`) e filtros de Reports (`src/core/reportCalculations.js:711,1081`). É importado e exibido no Inventory (`src/data/inventoryImport.js:64,152`; `src/ui/inventoryPage.js:560,609,1022`). |
| `acceptanceStatus` | Campo legado/formal de aceite. É importado/editado/exibido (`src/data/inventoryImport.js:65,153`; `src/ui/inventoryPage.js:561,610,1023`) e serve de fallback para gerar `qualityStatus` (`src/data/inventoryDB.js:27-41`). |
| `qualityStatus` | Estado efetivo de liberação do Inventory. A normalização o prioriza sobre `acceptanceStatus` e assume `ACCEPTED` quando ambos faltam (`src/data/inventoryDB.js:27-41,61,102-103`). É o campo editável “Quality Release” (`src/ui/inventoryPage.js:562,611,634-636,1024`). |

### Disponibilidade para reserva/uso

- `inventoryReservationAvailability()` verifica `qualityStatus || acceptanceStatus || 'accepted'`; **não verifica `inspectionStatus`** (`src/core/materialCouponReservation.js:14-23`). Também exige `status` disponível, `reservedQty <= 0` e `balanceQty > 0`.
- `inventoryIsUsable()` em Reports faz a mesma escolha `qualityStatus || acceptanceStatus || 'ACCEPTED'`; **também não verifica `inspectionStatus`** (`src/core/reportCalculations.js:244-255`).
- O posting de Material Unit é a barreira que verifica diretamente `inspectionStatus === ACCEPTED` (`src/core/materialUnitPosting.js:23-29`) e, ao criar Inventory, grava os três como `ACCEPTED` (`src/core/materialUnitPosting.js:48`).

### Contradições possíveis

Sim. Os três campos são persistidos separadamente e a normalização não os reconcilia (`src/data/inventoryDB.js:100-103`). Um item importado com `inspectionStatus = REJECTED` e sem `qualityStatus`/`acceptanceStatus` recebe `qualityStatus = ACCEPTED` pelo default de `qualityDecision()` (`src/data/inventoryDB.js:27-41`). Esse registro pode então passar nas verificações de reserva/Reports caso `status`, saldo e reserva permitam, porque essas verificações ignoram `inspectionStatus` (`src/core/materialCouponReservation.js:16-23`; `src/core/reportCalculations.js:249-255`).

Também é possível persistir `inspectionStatus = REJECTED`, `acceptanceStatus = REJECTED` e `qualityStatus = ACCEPTED`: o `qualityStatus` explícito tem precedência (`src/data/inventoryDB.js:28-40`). Logo, os campos representam etapas diferentes no fluxo de recebimento, mas, dentro do Inventory, possuem sobreposição suficiente para permitir estados logicamente contraditórios.

## 5. Quantidades

Os seis campos não são simples drift; representam dimensões diferentes, embora o código não imponha uma única equação global entre todos eles.

| Campo | Conceito e uso |
|---|---|
| `totalPoQty` | Quantidade total pedida no PO Item, copiada de `orderedQuantity` no posting (`src/core/materialUnitPosting.js:46`). Também pode vir do import/editor (`src/data/inventoryImport.js:70,158`; `src/ui/inventoryPage.js:548,590,1003`). É snapshot por item físico, portanto não deve ser somado cegamente entre unidades do mesmo PO. |
| `receivedQty` | Quantidade recebida representada pelo registro. No posting recebe `unit.quantity` (`src/core/materialUnitPosting.js:46`); na edição acompanha a nova quantidade da unidade (`src/data/materialReceipts.js:123,158-160`). Procurement calcula recebido como `max(sum(qty dos registros), maior receivedQty reportado)` para evitar dupla contagem de snapshot (`src/core/procurementMetrics.js:36-41`). |
| `qty` | Quantidade nominal/física do registro. Default normalizado é `1` (`src/data/inventoryDB.js:46,86`). Posting e RMV a definem pela unidade/linha (`src/core/materialUnitPosting.js:45`; `src/data/rmvReceiptTransaction.js:56`). |
| `balanceQty` | Saldo atualmente disponível, não derivado automaticamente de `qty - issuedQty - reservedQty`. Na normalização, cai para `qty` quando ausente/placeholder (`src/data/inventoryDB.js:49-60,90,156-175`). Reserva reduz `balanceQty` e aumenta `reservedQty` (`src/data/materialCouponIssueTransaction.js:130-140`); release faz o inverso (`src/data/materialCouponActionTransaction.js:96-105`). |
| `reservedQty` | Quantidade separada do saldo disponível e comprometida por reservas ativas. Reserva: `reserved' = reserved + q` e `balance' = balance - q` (`src/data/materialCouponIssueTransaction.js:135-137`). Dispatch: `reserved' = reserved - q`, sem nova redução de `balanceQty`, porque ela ocorreu na reserva (`src/data/materialCouponActionTransaction.js:54-65`). |
| `issuedQty` | Acumulado despachado/emitido para fabricação. Dispatch faz `issued' = issued + q` e `reserved' = reserved - q` (`src/data/materialCouponActionTransaction.js:54-65`). Aceita o alias de importação `issuedMatQty` na normalização (`src/data/inventoryDB.js:55,89`; `src/ui/inventoryPage.js:592`). |

### Relações matemáticas efetivamente usadas

- Estado inicial típico: `balanceQty = qty`, `reservedQty = 0`, `issuedQty = 0` (`src/core/materialUnitPosting.js:45,50`).
- Após reservar `q`: `balanceQty' = balanceQty - q`; `reservedQty' = reservedQty + q` (`src/data/materialCouponIssueTransaction.js:135-137`).
- Após liberar `q`: `balanceQty' = balanceQty + q`; `reservedQty' = reservedQty - q` (`src/data/materialCouponActionTransaction.js:98-104`).
- Após despachar `q`: `reservedQty' = reservedQty - q`; `issuedQty' = issuedQty + q`; `balanceQty` permanece no valor já reduzido pela reserva (`src/data/materialCouponActionTransaction.js:54-65`).
- Edição da quantidade recebida aplica o delta ao saldo: `balanceQty' = max(0, balanceQty + (newQty - oldQty))`, salvo override explícito (`src/data/materialReceipts.js:147-160`).
- Em métricas de PO, `available = Σ balanceQty`, `reserved = Σ reservedQty` quando há Inventory, `stockOnHand = available + reserved`, `used = Σ issuedQty` quando há Inventory e `pending = max(0, ordered - received)` (`src/core/procurementMetrics.js:44-79`).

Portanto, a relação operacional é por transições. Em um histórico íntegro, `qty` tende a corresponder a `balanceQty + reservedQty + issuedQty` para materiais unitários não retornados/ajustados, mas essa igualdade não é calculada nem validada por `normalizeInventoryItem()`; ajustes manuais, splits, retornos e imports podem quebrá-la.

## 6. Outros campos divergentes/sobrepostos

| Conceito | Campos observados | Evidência |
|---|---|---|
| Heat number | Inventory persiste `heatNo`; Material Unit usa `heatNumber`; documentos e consumidores aceitam ambos. O adapter converte `unit.heatNumber` para `heatNo` (`src/core/materialUnitPosting.js:47`); edição converte de volta entre os dois (`src/data/materialReceipts.js:121-128,156`). Procurement resolve `heatNo` para `heatNumber` (`src/ui/procurementPage.js:728`). |
| Quantidade genérica | Inventory usa `qty`; Material Units/Reservations/Movements usam `quantity`; diversos consumidores usam fallback `qty || quantity`, por exemplo `src/core/workpackGenealogy.js:40,141`, `src/core/workpackMaterials.js:66,112,167` e `src/core/workpackOffcuts.js:48`. |
| Unidade | Inventory usa `unit`; Procurement/Material Unit usa `unitOfMeasure`. O posting faz a conversão (`src/core/materialUnitPosting.js:45`). |
| Localização | Inventory usa `location`/`locationZone`; Material Unit usa `storageLocationId`. O posting e a edição convertem para `location` (`src/core/materialUnitPosting.js:49`; `src/data/materialReceipts.js:157`). |
| Status físico | Inventory usa `status`; Material Unit usa `inventoryStatus` e `postingStatus`. Esses estados são separados no recebimento (`src/data/materialReceipts.js:45,62`), enquanto Inventory normaliza apenas `status` (`src/data/inventoryDB.js:47-48,113`). |
| Tipo do item | `buildInventoryItemFromMaterialUnit()` produz `itemType` (`src/core/materialUnitPosting.js:38`), mas `normalizeInventoryItem()` persiste `type` e não inclui `itemType` (`src/data/inventoryDB.js:70,129-130`). Assim, `itemType` não integra o shape canônico da store após normalização. |
| Drawback/regime | O posting produz `drawback` (`src/core/materialUnitPosting.js:44`), enquanto Inventory persiste `regime` (`src/data/inventoryDB.js:78`) e não inclui `drawback` no retorno normalizado. |
| PO subject | Inventory persiste `poSubject`, aceitando `chronoNumber` como input legado (`src/data/inventoryDB.js:75`). |
| Issued quantity | Shape canônico `issuedQty`, com alias de entrada/display `issuedMatQty` (`src/data/inventoryDB.js:55,89`; `src/ui/inventoryPage.js:592`). |
| Dimensões | Inventory usa `lengthMm`, `widthMm`, `thicknessMm`, `diaMm`; outros fluxos ainda leem `length`, `width`, `thickness`, `diameter` em fallbacks, por exemplo `src/core/workpackMaterials.js:167`, `src/core/workpackQuickCreate.js:53` e `src/ui/workpackQuickCreateModal.js:28`. |

Esses casos variam entre adapters explícitos (como `heatNumber` → `heatNo`) e campos produzidos que não pertencem ao shape normalizado (`itemType`, `drawback`).
