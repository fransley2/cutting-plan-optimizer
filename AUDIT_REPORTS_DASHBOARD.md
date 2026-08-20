# Auditoria — Reports / Dashboard Executivo

## Escopo

Auditoria somente de leitura do fluxo vigente em:

- `src/core/reportCalculations.js`
- `src/data/reports.js`
- `src/ui/reportsUI.js`
- `src/ui/reportsExport.js`

As referências abaixo apontam para as linhas do estado atual desses arquivos.

## 1. Origem do valor exibido como `IDENT CODE`

Não existe uma única função que gere o valor nas três tabelas. Existe um único **campo de apresentação**, chamado `material`, que as três definições de coluna exibem sob o rótulo `IDENT CODE` (`reportCalculations.js`, linhas 746–775), mas ele é preenchido por dois caminhos diferentes:

1. **Top 10 itens em falta** e **Top 10 materiais críticos**
   - `buildDemandAnalysis()` cria as linhas por item com `material: mtoMaterialDescriptor(item)` (linhas 359–383 e 430–448).
   - A linha agregada por material conserva `group.material`, que foi inicializado pelo mesmo `mtoMaterialDescriptor(item)` do primeiro item que criou o grupo (linhas 365–375 e 451–468).
   - Portanto, essas duas tabelas usam `mtoMaterialDescriptor()`.

2. **Top 10 POs atrasadas**
   - `overdueRows()` cria cada linha com `material: materialDescriptor(balance.item)` (linhas 560–578).
   - O argumento é o PO Item (`balance.item`), e não o item MTO.

Na UI, `renderTable()` não procura outro campo: para cada coluna lê literalmente `record?.[column.key]`; como a chave da coluna é `material`, exibe `record.material` (`reportsUI.js`, linhas 527–570). No modo apresentação/PDF, `tableCell()` também lê `row?.[column.key]` (`reportsExport.js`, linhas 49–69 e 112–123). A exportação Excel recebe o mesmo dashboard sem remapear `material` em `reportsExport.js` (linhas 212–218).

## 2. Campos e ordem exata de fallback

### Duas tabelas baseadas em demanda MTO

`mtoMaterialDescriptor(record)` (linhas 75–80) aplica esta prioridade:

1. `mtoIdentCode(record)`, cuja própria prioridade é:
   1. `record.identCode`
   2. `record.material`
2. `record.materialCode`
3. `record.sapCode`
4. `record.description`
5. literal `IDENT CODE não informado`

Logo, nessas tabelas `materialGrade` **não participa** do valor mostrado. `material` participa explicitamente como fallback imediato de `identCode`, antes de `materialCode`, `sapCode` e `description` (`mtoIdentCode()`, linhas 46–48; `mtoMaterialDescriptor()`, linhas 75–80).

### Tabela de POs atrasadas

`materialDescriptor(record)` (linhas 67–73), aplicado ao PO Item, usa esta prioridade:

1. primeiro valor truthy entre `record.identCode`, `record.materialCode`, `record.sapCode`;
2. primeiro valor truthy entre `record.material`, `record.materialGrade`;
3. primeiro valor truthy entre `record.profile`, `record.type`, `record.category`, `record.materialCategory`;
4. primeiro valor truthy entre `record.description`, `record.materialDescription`;
5. literal `Material não identificado`.

Assim, os exemplos citados são compatíveis com o código atual: um IDENT real pode vir de `identCode`; graus como `S32750`/`S32751` podem vir de `material` ou `materialGrade`; e uma descrição como `DNV SMLS 450 DSU` pode chegar pelo fallback de `description`/`materialDescription` (ou por outro campo anterior caso o registro a tenha armazenado ali).

Há ainda uma lógica separada de **chave de agrupamento/casamento**, que não é o texto diretamente renderizado:

- `reportMaterialKey()` prioriza `identCode || materialCode || sapCode`; depois combina/faz fallback com `material || materialGrade || grade`, perfil/categoria e descrição (linhas 82–97).
- Para MTO, `reportMtoMaterialKey()` primeiro chama `mtoIdentCode()`, de modo que `material` também pode ser tratado como chave `ident:` quando `identCode` falta; só depois delega a `reportMaterialKey()` (linhas 99–102).

## 3. Classificação do problema observado

Não é apenas um rótulo alternativo aplicado a um dado semanticamente único. O contrato derivado realmente mistura campos semanticamente diferentes no mesmo campo `material` antes de chegar à tela:

- `mtoMaterialDescriptor()` colapsa `identCode`, `material`, `materialCode`, `sapCode` e `description` em uma única string;
- `materialDescriptor()` colapsa ainda `materialGrade`, campos de perfil/categoria e `materialDescription` na mesma string;
- as linhas resultantes guardam somente `material`, sem guardar junto qual campo forneceu o valor (`buildDemandAnalysis()`, linhas 430–468; `overdueRows()`, linhas 567–577).

Portanto, no modelo entregue à UI/exportação há um **bug de dado/contrato de apresentação**: campos distintos são deliberadamente fundidos e a proveniência é perdida. O rótulo fixo `IDENT CODE` torna essa mistura visível e também é semanticamente incompatível com os fallbacks, mas trocar mentalmente o rótulo não faria os valores passarem a ser IDENT CODE.

Essa perda não ocorre no carregamento bruto de `reports.js`: ele carrega os registros completos de MTO e PO Items e os passa como `mtoItems` e `poItems` para o cálculo (linhas 149–187). A perda acontece na transformação em `reportCalculations.js`, ao construir o view model das tabelas.

## 4. Dados já disponíveis sobre recebimento, status e capacidade de fabricar

### Quantidade recebida por PO Item

Já é calculada por `calculatePoBalances()` (linhas 254–289):

- `receivedByPoItem`: soma `receiptLine.receivedQuantity` por `receiptLine.poItemId`, excluindo recebimentos cancelados;
- `inventoryReceivedByPoItem`: fallback/contraprova baseada nos itens de inventário ligados ao PO Item, usando `item.receivedQty || item.qty`;
- campo derivado por PO Item: `received`, limitado a `ordered` e definido como o maior entre o total das receipt lines e o total inferido do inventário;
- campos associados: `item`, `order`, `ordered`, `unit` e `projectId`.

`reports.js` já carrega as fontes necessárias: `getAllPurchaseOrderItems()`, `getAllMaterialReceipts()`, `getAllMaterialReceiptLines()`, `getAllMaterialUnits()` e `getInventoryItems()` (linhas 1–10 e 159–187). No retorno público atual, os saldos individuais ficam internos ao cálculo; a aba Recebimento expõe agregações por unidade e semana, não uma tabela por PO Item.

### Quantidade pendente de recebimento

Também é calculada por `calculatePoBalances()` no campo `pending` por PO Item (linhas 273–288):

- se o PO Item ou a PO estiver em status fechado, `pending = 0`;
- caso contrário, `pending = max(0, ordered - received)`.

Os agregados existentes são:

- `quantitiesByUnit()` e `measureByUnit()` para total comprado/recebido por unidade (linhas 679–700);
- `poBalanceByUnit()`, que retorna por unidade os campos `unit`, `purchased`, `received` e `pending` (linhas 703–714);
- `pendingPoIds`, conjunto de POs que têm algum balance com `pending > 0` (linhas 861–864);
- `overdueRows()`, com `orderedQty`, `receivedQty` e `pendingQty` por PO Item atrasado (linhas 560–578).

### Status de cada PO Item

Os status brutos já estão disponíveis em `balance.item.status` e `balance.order.status`, pois os objetos completos são preservados nos campos `item` e `order` de cada balance (linhas 273–287). O cálculo usa:

- `activePoItems()` para excluir PO Items sem quantidade ou cancelados e itens de POs canceladas (linhas 150–160);
- `CLOSED_PO_STATUSES = CLOSED, COMPLETED, RECEIVED` para zerar o pendente quando o item ou a ordem está fechado (linhas 3–6 e 278–285);
- `overdueRows()` para identificar atraso quando há `pending > 0` e `expectedDeliveryDate || contractualDeliveryDate` é anterior à data de referência; suas linhas contêm `daysOverdue`, mas não um campo `status` derivado (linhas 560–578);
- `openPoCount`, que conta POs, não PO Items, cujo status não é fechado (linhas 865–866).

Não existe nesses arquivos uma função ou campo derivado que classifique **cada PO Item** como “não iniciado”, “parcial” ou “completo”. Esses estados podem ser inferidos de `ordered`, `received`, `pending` e dos status brutos, mas a classificação nominal não é calculada nem retornada hoje. “Atrasado” existe como seleção em `overdueRows()` e como `daysOverdue`, também sem um campo nominal `status: 'atrasado'`.

### Capacidade de fabricar (`feasibility`)

O que já existe é cobertura de demanda por disponibilidade:

- `buildDemandAnalysis()` calcula, por item MTO e por grupo projeto/material, `requiredQty`, `availableQty`, `inTransitQty`, `shortageQty`, `missingQty`, pesos correspondentes, `coverage` e `critical` (linhas 359–471).
- `requiredCoverage()` calcula a cobertura geral, por peso quando todos os grupos têm pesos completos ou por quantidade caso contrário, retornando `{ value, basis }` (linhas 474–485).
- `projectBreakdown()` agrega por projeto os campos `required`, `available`, `inTransit`, `missing` e `percentage = available / required` (linhas 488–516).
- O dashboard executivo publica esse resultado em `charts.manufacturableByProject`; a UI apresenta `percentage` como “Pode Fabricar (%)” (cálculo: linhas 841–887; UI: linhas 314–339).

Existe filtro por Equipment Tag: `reportEquipmentTagOptions()`, `equipmentTags()` e `mtoTags()` resolvem as tags (linhas 112–147), e `calculateReportsDashboard()` filtra os MTO Items pela tag escolhida (linhas 781–840). Portanto, é possível recalcular o dashboard para uma tag/equipamento selecionado. Porém, não existe hoje um retorno agregado simultaneamente **por equipamento** equivalente a `projectBreakdown()`; o resultado por equipamento depende da aplicação de um filtro de tag, e `manufacturableByProject` continua estruturalmente sendo uma lista por projeto dentro daquele escopo.

## 5. Limites hardcoded das tabelas “Top 10”

Sim. Há limites hardcoded em dois níveis:

1. No cálculo:
   - `topShortages` termina em `.slice(0, 10)` (`reportCalculations.js`, linhas 844–847);
   - `topCriticalMaterials` termina em `.slice(0, 10)` (linhas 848–851);
   - a tabela de POs atrasadas recebe `overdue.slice(0, 10)` (linhas 852 e 888–892).

2. Na UI:
   - `renderTable()` aplica novamente `.slice(0, 10)` a **toda** tabela renderizada, depois da ordenação feita pelo usuário (`reportsUI.js`, linhas 510–515 e 527–555).

Consequência descritiva do comportamento atual: nas três tabelas executivas o cálculo já entrega no máximo dez registros; a UI volta a limitar a dez. Como a UI ordena somente o conjunto já truncado recebido do cálculo, uma ordenação na tela reorganiza esses dez registros, não refaz o ranking sobre o conjunto completo. O modo apresentação/PDF e a exportação recebem as linhas já truncadas pelo cálculo; `reportsExport.js` não impõe um “Top 10” próprio.
