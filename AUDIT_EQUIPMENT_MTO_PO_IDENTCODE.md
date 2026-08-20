# Auditoria — Equipment, MTO, PO e IDENT CODE

Data da leitura: 2026-08-03
Escopo: estado atual dos arquivos no worktree. Auditoria somente leitura do código; nenhum módulo foi alterado.

## Resumo factual

- O arquivo real da Home é `src/ui/homeDashboard.js`.
- A Home calcula readiness por TAG em `buildOperationalReadiness()` (`src/core/operationalReadiness.js`), mas delega a fórmula de feasibility a `calculateReportsDashboard()` (`src/core/reportCalculations.js`), que é a mesma função usada pela tela de Reports (`src/ui/reportsUI.js`). Portanto, no estado atual, Home e Reports não têm fórmulas independentes.
- Reports já aceita `equipmentTag` como filtro e a Home chama o mesmo cálculo repetidamente, uma vez por TAG retornada por `reportEquipmentTagOptions()`.
- O vínculo persistido PO Item → MTO é feito na store `mtoPoItemAllocations`, pelos campos `poItemId` e `mtoLineId`. O Equipment é alcançado no MTO por `equipmentId` e/ou pela TAG resolvida no item/equipamento. `purchaseOrderItems` não possui `equipmentId`; possui apenas o texto `equipmentDestination`, que não participa dessa cadeia relacional.
- `expectedDeliveryDate` e `contractualDeliveryDate` são editáveis depois da importação no editor de PO Item em `src/ui/procurementPage.js`.
- Já existe um gerador automático de IDENT CODE: `generatePurchaseOrderIdentCode()` em `src/core/purchaseOrderImport.js`. Ele é aplicado no parsing quando o código está vazio e também pode ser acionado na revisão da importação em Procurement.
- Não existe store, entidade ou documento formal de OSDR/NCR. Existem apenas campos genéricos de inspeção/condição/observação no recebimento.
- Existem status logísticos manuais de PO/PO Item, inclusive produção e embarque. Não há entidade de tracking físico, eventos de transporte ou localização do material antes da chegada.

## 1. Readiness e feasibility por Equipment TAG

### Caminho real da Home

`src/ui/homeDashboard.js` renderiza a seção **Material Readiness**, os KPIs **Critical Items**, **Ready Equipment** e **Blocked Equipment**, e a tabela **Equipment Readiness** com as colunas `TAG`, `Equipment`, `Availability`, `Demand`, `Critical items` e `Status`.

`renderHomeDashboard()` carrega os dados por `options.loadDashboardData()`, chama `buildOperationalReadiness(data)` e apenas renderiza o resultado. A fórmula não está no DOM/renderizador da Home.

### Função que calcula por TAG

`buildOperationalReadiness()` em `src/core/operationalReadiness.js`:

1. Obtém as TAGs por `reportEquipmentTagOptions(data)`.
2. Para cada TAG, chama `calculateReportsDashboard(data, { equipmentTag: option.value, today })`.
3. Lê os KPIs `materialAvailability` e `criticalItems` do dashboard calculado.
4. Usa `dashboard.assumptions.demandItemCount` como `demandItems`.
5. Classifica a linha por `readinessStatus()`:
   - sem demanda: `NOT_PLANNED`;
   - `criticalItems > 0`: `BLOCKED`;
   - availability ≥ `0.999999`: `READY`;
   - caso contrário: `PARTIAL`.

Ela também chama `calculateReportsDashboard(data, { today })` sem TAG para os KPIs agregados da Home.

### Reuso e acoplamento

O cálculo é reaproveitável. `buildOperationalReadiness()` está em `src/core/operationalReadiness.js`, recebe dados e opções e não acessa DOM. A parte de apresentação fica em `src/ui/homeDashboard.js`.

O núcleo de feasibility é `calculateReportsDashboard()` em `src/core/reportCalculations.js`. `src/ui/reportsUI.js` também chama essa função em `currentDashboard()`, passando `state.selectedEquipmentTag`, e popula o seletor com `reportEquipmentTagOptions()`.

Conclusão: **Home e Reports calculam feasibility pela mesma função hoje**. A Home acrescenta somente a classificação operacional `READY`/`PARTIAL`/`BLOCKED`/`NOT_PLANNED` e as contagens de Equipment/Workpack sobre o resultado comum. Não foi encontrada uma segunda fórmula de availability na UI da Home.

### Como a TAG entra no cálculo comum

Em `src/core/reportCalculations.js`:

- `reportEquipmentTagOptions()` reúne TAGs de Equipments ativos (`equipmentTags`, `tags` ou `clientTag`) e também TAGs de MTO ativo.
- `mtoTags()` prefere `item.tag`/`item.clientTag`; se não houver, consulta `item.equipmentId` e só herda a TAG do Equipment quando houver exatamente uma TAG vinculada.
- `calculateReportsDashboard()` filtra os MTO items pela TAG escolhida e restringe os saldos de PO à parcela de allocations ligada aos MTO items selecionados.
- Availability vem de `requiredCoverage(materialRows)`; critical items são `itemRows.filter(row => row.critical).length`.

Assim, “quantos equipamentos” na Home significa a quantidade de linhas/TAGs produzidas por `reportEquipmentTagOptions()`, e “quais são críticos” são as linhas cujo `readinessStatus()` resulta em `BLOCKED` por terem `criticalItems > 0`. Uma entidade Equipment com várias TAGs pode produzir várias linhas; a unidade operacional mostrada é a TAG, não necessariamente um registro único da store `equipments`.

## 2. Preenchimento real de `identCode`

### O que pode ser contado pelo código

Não é possível obter, apenas pela leitura estática do repositório, a quantidade **atual persistida no navegador**. Os registros vivem em IndexedDB e não há snapshot/backup de produção versionado nesta raiz. Também não existe função/KPI que conte preenchidos versus vazios em MTO items, PO Items ou linhas de Material Coupon.

Portanto, a contagem factual disponível nesta auditoria é:

| Conceito | Preenchidos hoje | Vazios hoje | Evidência disponível |
|---|---:|---:|---|
| MTO items persistidos | não determinável pelo código | não determinável pelo código | store `mtoItems`; `identCode` é normalizado, filtrável e opcional |
| PO Items persistidos | não determinável pelo código | não determinável pelo código | store `purchaseOrderItems`; `identCode` é normalizado e opcional |
| Material Coupon lines persistidas | não determinável pelo código | não determinável pelo código | linhas ficam em `materialCoupons.metadata.coupon.lines`; não há índice nem contador por `identCode` |

### Evidências sobre optionalidade/preenchimento

- MTO: `normalizeItem()` em `src/data/mtoDB.js` grava `identCode: text(input.identCode)`. A validação não o torna obrigatório. A importação reconhece a coluna `IdentCode`; fixtures em `tests/mtoImport.test.mjs` usam `PP-SD-168-19`.
- PO Item: `normalizePurchaseOrderItem()` em `src/data/purchaseOrders.js` grava `identCode: text(input.identCode)`. Os campos obrigatórios validados são PO, item number e quantidade; `identCode` não é obrigatório.
- Material Coupon: `src/data/materialCoupons.js` persiste o documento e suas `metadata.coupon.lines`. `materialCouponService.js` copia `identCode` do MTO/material ao criar linha manual a partir de MTO, mas linhas podem existir sem esse valor.
- `calculateReportsDashboard()` expõe apenas `automaticIdentCodeLinks` e `automaticIdentCodeIssues` dentro de `assumptions`; isso conta sugestões/issues da execução, não preenchidos/vazios por store.

Fixtures comprovam o contrato esperado, não a população real. Exemplos recorrentes são `PP-SD-168-19`, `PP-SD-219-10`, `PP-CS-273-28` e códigos genéricos `ID-1`, `ID-100` usados em testes unitários.

## 3. Formato observado dos IDENT CODEs

O padrão de domínio implementado pelo gerador é:

`<tipo de material>-<classificação>-<diâmetro inteiro>-<espessura inteira>[-<grau inteiro>]`

`generatePurchaseOrderIdentCode()` em `src/core/purchaseOrderImport.js`:

- traduz o tipo por `materialTypeIdentCode()`;
- traduz a classificação por `materialClassificationIdentCode()`;
- acrescenta diâmetro externo e espessura, truncados para inteiros por `identDimension()`;
- para `BEND`, acrescenta também o grau, igualmente truncado;
- retorna vazio se qualquer parte obrigatória não puder ser obtida.

Prefixos de tipo visíveis no mapa `MATERIAL_TYPE_CODES` incluem, entre outros: `PP` (process pipe), `BD` (bend), `PL` (plate), `WC` (welding consumables), `GA` (gasket), `BE` (beam), `TB` (tube), `RB` (round bar), `FT` (fitting), `EL` (elbow), `FL` (flange), `BO` (bolt), `NU` (nut) e `WA` (washer).

Classificações visíveis em `MATERIAL_CLASSIFICATION_CODES`:

- `CS`: carbon steel;
- `SD`: superduplex/super duplex;
- `DX`: duplex;
- `SS`: stainless steel.

Exemplo realista repetido em fixtures: `PP-SD-168-19`, isto é, process pipe + superduplex + OD aproximadamente 168.3 mm truncado para 168 + espessura aproximadamente 19.1 mm truncada para 19. Os testes também usam identificadores artificiais `ID-*`; estes demonstram igualdade/vínculo, mas não uma convenção de engenharia.

O gerador já é usado em dois pontos:

- `normalizePurchaseOrderImportRow()` gera o código quando `row.identCode` está vazio;
- a revisão de importação em `src/ui/procurementPage.js` chama `generatePurchaseOrderIdentCode(row)` para linhas ainda vazias e informa quantos foram gerados.

Não foi encontrado gerador equivalente na importação de MTO nem em `src/data/equipments.js`.

## 4. Cadeia real PO Item → Equipment

A cadeia persistida é **transitiva**, não direta:

1. `purchaseOrderItems.id` identifica o PO Item.
2. Um registro da store `mtoPoItemAllocations` guarda `poItemId` e `mtoLineId`.
3. `mtoLineId` referencia `mtoItems.id`.
4. O MTO item guarda `equipmentId` em `src/data/mtoDB.js` e também pode guardar `tag`/`equipmentName`.
5. `equipmentId` referencia `equipments.id`; as TAGs canônicas do Equipment ficam em `equipmentTags`, com `clientTag` como compatibilidade/primeira TAG.

O registro de allocation também guarda `projectId`, `allocatedQuantity`, `unitOfMeasure`, `matchMethod` e `matchedIdentCode`, mas não `equipmentId`.

O PO Item não possui `equipmentId` em `normalizePurchaseOrderItem()`. Ele possui `equipmentDestination`, texto importado/editável, porém esse campo não é usado por `buildMtoProcurementCoverage()`, `calculateReportsDashboard()` ou pela validação da allocation para resolver Equipment.

### Como o IDENT CODE participa

`suggestMtoPoItemAllocationsByIdentCode()` em `src/core/mtoPoItemAllocation.js` agrupa MTO items por `projectId + identCode` e procura PO Items elegíveis com o mesmo `projectId` e o mesmo `identCode` normalizado. Para compatibilidade, `mtoIdentCode()` usa `mtoItem.identCode` e, se vazio, cai para `mtoItem.material`; nesse fallback a sugestão recebe `matchSource: MATERIAL_FALLBACK` e `matchConfidence: LOW`.

Quando a sugestão é persistida, `saveMtoPoItemAllocations()` valida os IDs contra as stores `mtoItems` e `purchaseOrderItems` e grava a allocation. Em Reports, `calculateReportsDashboard()` também inclui sugestões automáticas em memória como allocations efetivas para o cálculo, sem afirmar que foram persistidas.

Logo, IDENT CODE é usado de fato no algoritmo de sugestão/cálculo atual, mas não substitui a relação persistida `poItemId` ↔ `mtoLineId`, e não liga diretamente PO Item a Equipment.

## 5. Data prevista/contratual de entrega

Os dois campos existem em `normalizePurchaseOrderItem()` (`src/data/purchaseOrders.js`):

- `contractualDeliveryDate`;
- `expectedDeliveryDate`.

Na importação, `src/data/purchaseOrderImportTransaction.js` grava `row.deliveryDate` em `expectedDeliveryDate`. O parser `normalizePurchaseOrderImportRow()` normaliza `deliveryDate` para ISO. Nessa transação, `contractualDeliveryDate` não é preenchido a partir da mesma coluna.

Após a importação, ambos são editáveis. O caminho da tela é `src/ui/procurementPage.js`, função `openPoItemEditor(po, item)`, com inputs de data:

- `Contractual Delivery` → `contractualDeliveryDate`;
- `Expected Delivery` → `expectedDeliveryDate`.

O submit chama `state.dependencies.savePurchaseOrderItem()` com os valores do formulário. Mesmo quando já existe rastreabilidade, somente `itemNumber` e `unitOfMeasure` são desabilitados; os campos de entrega permanecem editáveis.

Reports considera atraso usando `expectedDeliveryDate || contractualDeliveryDate` em `src/core/reportCalculations.js`; a data prevista tem precedência sobre a contratual.

## 6. Discrepância de recebimento, OSDR e NCR

Não foi encontrada store, entidade, relatório ou fluxo denominado OSDR, NCR, discrepancy ou non-conformance. Também não foram encontrados campos específicos para over, short, damaged, shortage de recebimento ou número/status de OSDR/NCR.

O que existe em `src/data/materialReceipts.js` é controle genérico de inspeção:

- Material Receipt: `status`;
- Material Receipt Line: `visualCondition`, `inspectionStatus`, `remarks`, `heatNumber`, `supplierBatchNumber`;
- Material Unit: `inspectionStatus`, `inventoryStatus`, `postingStatus`.

O schema de `src/data/database.js` indexa `inspectionStatus` em `materialReceiptLines`/`materialUnits`. O cálculo de Reports exclui unidades `REJECTED` e o cálculo de disponibilidade também trata estados de qualidade como `REJECTED`, `HOLD`, `ON_HOLD` e quarentena como indisponíveis.

Entretanto, a tela ativa de recebimento em `src/ui/procurementPage.js` cria a linha explicitamente com `inspectionStatus: ACCEPTED`; ela oferece `remarks`, mas não apresenta um fluxo de rejeição, dano, falta, NCR ou OSDR. Assim, os campos genéricos comportam uma condição/inspeção, mas **não constituem rastreamento formal de discrepância**.

## 7. Status logístico do fornecedor

Há status logísticos manuais, além de ordered/received/pending:

- PO (`PURCHASE_ORDER_STATUS` em `src/data/purchaseOrders.js`): `DRAFT`, `ISSUED`, `ACKNOWLEDGED`, `IN_PRODUCTION`, `PARTIALLY_SHIPPED`, `SHIPPED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`, `CANCELLED`.
- PO Item, no editor de `src/ui/procurementPage.js`: `OPEN`, `IN_PRODUCTION`, `SHIPPED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`, `CANCELLED`.

Esses valores são editáveis na tela de Procurement e persistidos no campo simples `status` da PO ou do PO Item. Logo, o sistema consegue registrar nominalmente “em produção” e “embarcado”.

Não foi encontrada store de shipment/expediting, eventos de tracking, transportadora, porto, embarcação, tracking number, datas de saída/chegada por etapa ou localização física em trânsito. O rótulo “Em trânsito” em Reports representa saldo comprado ainda não recebido, calculado a partir de allocation/PO balance; não prova um evento logístico `SHIPPED` nem uma posição física.

Conclusão precisa: o rastreamento não se limita estritamente a pedido versus recebido, porque existem status manuais de produção/embarque; porém a visibilidade pré-chegada limita-se a esses valores de `status` e às datas do PO Item, sem histórico ou tracking logístico físico próprio.

## Arquivos e contratos relevantes

| Área | Caminho | Funções/campos principais |
|---|---|---|
| Home | `src/ui/homeDashboard.js` | `renderHomeDashboard()`, tabela `equipmentReadinessTable()` |
| Readiness por TAG | `src/core/operationalReadiness.js` | `buildOperationalReadiness()`, `readinessStatus()` |
| Reports/feasibility | `src/core/reportCalculations.js` | `calculateReportsDashboard()`, `reportEquipmentTagOptions()`, `mtoTags()`, `requiredCoverage()` |
| UI Reports | `src/ui/reportsUI.js` | `currentDashboard()`, filtro `selectedEquipmentTag` |
| Allocation core | `src/core/mtoPoItemAllocation.js` | `suggestMtoPoItemAllocationsByIdentCode()`, `validateMtoPoItemAllocation()`, `buildMtoProcurementCoverage()` |
| Allocation persistence | `src/data/mtoPoItemAllocations.js` | `mtoLineId`, `poItemId`, `matchedIdentCode`, `saveMtoPoItemAllocations()` |
| PO persistence | `src/data/purchaseOrders.js` | `normalizePurchaseOrder()`, `normalizePurchaseOrderItem()`, datas, IDENT CODE e status |
| PO parsing/gerador | `src/core/purchaseOrderImport.js` | `generatePurchaseOrderIdentCode()`, `normalizePurchaseOrderImportRow()` |
| PO import transaction | `src/data/purchaseOrderImportTransaction.js` | `expectedDeliveryDate: row.deliveryDate` |
| Procurement UI | `src/ui/procurementPage.js` | `openPoItemEditor()`, revisão/geração de IDENT CODE, editor de status/datas |
| MTO | `src/data/mtoDB.js` | `normalizeItem()`, `identCode`, `equipmentId`, `tag` |
| Equipment | `src/data/equipments.js` | `normalizeEquipment()`, `equipmentTags`, `clientTag`; não há `identCode` |
| Material Coupon | `src/data/materialCoupons.js`, `src/features/materialCoupon/materialCouponService.js` | `metadata.coupon.lines`, `line.identCode`, `mtoItemId`, `equipmentId`, `tag` |
| Recebimento | `src/data/materialReceipts.js` | `visualCondition`, `inspectionStatus`, `remarks`; sem OSDR/NCR |
| Schema | `src/data/database.js` | stores `mtoItems`, `purchaseOrderItems`, `materialCoupons`, `materialReceipts`, `materialReceiptLines`, `materialUnits`, `mtoPoItemAllocations` |
