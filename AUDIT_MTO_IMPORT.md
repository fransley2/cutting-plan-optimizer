# Auditoria do fluxo de importação MTO

Data da auditoria: 2026-07-31
Escopo: leitura do código atual, sem alteração de código-fonte. Este arquivo é o único artefato criado pela auditoria.

## Resumo executivo

- Há **um único fluxo de importação MTO executável hoje**: o incorporado em `src/ui/mtoPage.js`.
- `src/ui/mtoImportModal.js` **não existe no working tree atual**: aparece como excluído em `git status --short`. A versão ainda acessível em `HEAD` foi lida apenas para permitir a comparação histórica pedida neste relatório.
- A navegação lateral `data-phase="mto"`, o botão `Importar MTO` do planner e `showPhase('mto')` levam todos à página `mtoPage.js`; não há import nem chamada atual de `openMtoImportModal`.
- O fluxo ativo classifica impacto como peça nova, duplicada, revisão substitutiva ou revisão mais antiga; tenta vincular a MTO a **equipamentos já existentes** e cria drawings ausentes automaticamente.
- A gravação principal é atômica em uma transação IndexedDB `readwrite` sobre `mtoBatches`, `mtoItems`, `auditLog` e `auditEvents`.
- A criação dos drawings ocorre **antes** dessa transação e em transações próprias. A marcação de itens anteriores como `superseded` ocorre **depois** dela, também em transações próprias. Portanto, o fluxo completo de revisão não é uma única transação atômica.
- O diagnóstico de divergência era verdadeiro para a antiga implementação: o modal removido não analisava impacto, não vinculava equipamento, não criava drawing e não bloqueava linhas rejeitadas antes do clique de gravação. Porém, hoje não há duas telas ativas divergentes; há um fluxo ativo e uma implementação histórica removida.

## Arquivos lidos e limite do escopo

Fluxos e navegação:

- `src/ui/mtoPage.js` — lido por completo; fluxo ativo.
- `HEAD:src/ui/mtoImportModal.js` — lido por completo via Git; arquivo ausente/excluído no working tree.
- `src/main.js` e `index.html` — inspecionados nos pontos de importação, renderização e navegação MTO.

Cadeia de parsing, revisão, duplicidade, vínculo e persistência:

- `src/data/mtoImport.js`
- `src/data/excel.js`
- `src/data/mtoDB.js`
- `src/data/mtoImportTransaction.js`
- `src/data/mtoDrawings.js`
- `src/data/drawings.js`
- `src/data/equipments.js`
- `src/data/auditLog.js`
- `src/data/database.js`
- `src/data/idb.js`

`src/ui/modal.js` e `src/ui/toast.js` foram identificados como infraestrutura visual, mas não participam de parsing, comparação de revisão, duplicidade, vínculo de domínio ou gravação da MTO; por isso suas APIs não entram no inventário abaixo. As partes de Procurement, Workpack e Cut Sheets de `mtoPage.js` também não fazem parte da importação auditada.

## 1. Funções exportadas por arquivo envolvido

### `src/ui/mtoPage.js`

| Assinatura | Descrição |
|---|---|
| `filterMtoItems(items, filters)` | Filtra linhas MTO por texto, drawing, equipamento, material, disciplina e status. |
| `equipmentHint(item = {})` | Escolhe o texto usado na tentativa de vínculo automático, priorizando `tag`, depois `equipmentName` e `constructionActivity`. |
| `async renderMtoPage(container, options = {})` | Inicializa o estado da página MTO e renderiza o workspace completo. |
| `async refreshMtoPage(container, options = {})` | Reaproveita o estado existente do container e renderiza novamente a página MTO. |

Referências: `src/ui/mtoPage.js:206`, `src/ui/mtoPage.js:981`, `src/ui/mtoPage.js:1902`, `src/ui/mtoPage.js:1909`.

### `HEAD:src/ui/mtoImportModal.js` — removido/inativo

| Assinatura | Descrição |
|---|---|
| `openMtoImportModal(options = {})` | Abria o modal antigo, fazia parse/preview do arquivo e chamava `saveMtoImport` no botão de confirmação. |

Referência histórica: `HEAD:src/ui/mtoImportModal.js:102`. Não existe consumidor de `openMtoImportModal` nem arquivo equivalente separado no código atual.

### `src/data/mtoImport.js`

| Assinatura | Descrição |
|---|---|
| `decodeMtoTextFromArrayBuffer(arrayBuffer)` | Decodifica CSV em UTF-8, tenta Windows-1252 e usa fallback byte a byte. |
| `normalizeMtoHeaderKey(header)` | Normaliza cabeçalhos para comparação tolerante a acentos, símbolos e algumas variantes corrompidas. |
| `parseMtoCsvText(value, options = {})` | Converte CSV delimitado, incluindo células entre aspas, em objetos por cabeçalho. |
| `validateMtoItem(item)` | Valida drawing, mark, POS, material, quantidade positiva e comprimento de corte positivo. |
| `normalizeMtoRow(row, options = {})` | Mapeia aliases de colunas para o schema MTO e preserva a linha original/metadados de engenharia. |
| `parseMtoRows(rows, options = {})` | Normaliza e valida todas as linhas, separando aceitas e rejeitadas e produzindo contagens do lote. |
| `async parseMtoFile(file, options = {})` | Lê CSV ou delega Excel ao SheetJS e retorna lote, itens, aceitos, rejeitados e metadados do arquivo. |

Constante exportada relevante: `MTO_REQUIRED_FIELDS`, com `drawing`, `mark`, `pos`, `qty`, `material` e `cutLength`; a validação efetiva é implementada por `validateMtoItem`.

Referências: `src/data/mtoImport.js:3`, `src/data/mtoImport.js:79`, `src/data/mtoImport.js:103`, `src/data/mtoImport.js:186`, `src/data/mtoImport.js:208`, `src/data/mtoImport.js:219`, `src/data/mtoImport.js:279`, `src/data/mtoImport.js:307`.

### `src/data/excel.js`

| Assinatura | Descrição |
|---|---|
| `readExcelFile(file, { raw = false } = {})` | Lê a primeira worksheet com o `XLSX` global e devolve objetos ou matriz bruta. |
| `exportSolutionToExcel(solution, filename = 'Optimized_Cutting_Plan.xlsx')` | Exporta uma solução de nesting e offcuts. |
| `exportMtoItemsExcel(items = [], options = {})` | Exporta linhas MTO no schema canônico de colunas. |
| `exportTaskSheetExcel(taskSheet, options = {})` | Exporta uma Task Sheet por estação de trabalho. |
| `exportPurchaseOrderDatabaseExcel(data, options = {})` | Exporta o banco operacional de Procurement em múltiplas abas. |
| `exportPurchaseOrderProgressExcel(data, options = {})` | Exporta progresso de POs e itens. |
| `exportMaterialCouponExtract(coupons, options = {})` | Exporta o extrato de Material Coupons. |
| `exportMaterialCouponControlDatabase(coupons, options = {})` | Exporta a base de controle de Material Coupons. |
| `exportMaterialCouponExcel(coupon, options = {})` | Exporta um Material Coupon individual. |
| `exportReturnMaterialVoucherExcel(rmv, options = {})` | Exporta um Return Material Voucher. |
| `exportReportsDashboardExcel(dashboard = {}, options = {})` | Exporta KPIs e tabelas do dashboard de Reports. |

Constante exportada relevante: `MTO_EXPORT_COLUMNS`, definição das colunas do export MTO. Somente `readExcelFile` participa do caminho de importação auditado.

Referências: `src/data/excel.js:22`, `src/data/excel.js:37`, `src/data/excel.js:91`, `src/data/excel.js:103`, `src/data/excel.js:121`, `src/data/excel.js:159`, `src/data/excel.js:171`, `src/data/excel.js:180`, `src/data/excel.js:190`, `src/data/excel.js:202`, `src/data/excel.js:220`, `src/data/excel.js:342`.

### `src/data/mtoDB.js`

| Assinatura | Descrição |
|---|---|
| `compareRevisions(oldRev, newRev)` | Compara revisões alfabéticas/numéricas e retorna `same`, `newer`, `older` ou `unknown`. |
| `async saveMtoImport({ batch, items })` | Normaliza e revalida o lote, cria o evento de auditoria e delega a gravação atômica. |
| `async createMtoItem(input)` | Normaliza e grava uma linha MTO isolada. |
| `async getAllMtoBatches()` | Lista todos os lotes MTO. |
| `async getMtoBatch(id)` | Busca um lote MTO pelo ID. |
| `async getMtoItems(filters = {})` | Lista, filtra e ordena itens MTO, ocultando `superseded` por padrão. |
| `getMtoItemsByBatch(batchId)` | Lista os itens de um lote, incluindo superseded. |
| `async analyzeImportImpact(newItems = [], options = {})` | Compara os novos itens com itens atuais e classifica novos, revisões, duplicados, revisões antigas e IDs a superseder. |
| `async getMtoItem(id)` | Busca uma linha MTO pelo ID. |
| `async updateMtoItem(id, patch)` | Normaliza e grava uma alteração em uma linha MTO. |
| `async updateMtoItemsStatus(ids = [], status)` | Atualiza o status de vários itens mediante uma gravação independente por item. |
| `async updateMtoBatch(id, patch)` | Atualiza um lote MTO existente. |
| `async deleteMtoBatch(id)` | Exclui os itens vinculados e depois o lote, usando operações independentes. |
| `async deleteMtoItem(id)` | Exclui uma linha MTO pelo ID. |
| `async deleteMtoItems(ids = [])` | Exclui uma coleção deduplicada de IDs MTO. |
| `async clearMtoData()` | Limpa os stores de itens e lotes MTO. |

Constantes exportadas: `MTO_BATCH_STATUS` e `MTO_ITEM_STATUS`.

Referências: `src/data/mtoDB.js:10`, `src/data/mtoDB.js:17`, `src/data/mtoDB.js:162`, `src/data/mtoDB.js:211`, `src/data/mtoDB.js:245`, `src/data/mtoDB.js:252`, `src/data/mtoDB.js:257`, `src/data/mtoDB.js:262`, `src/data/mtoDB.js:268`, `src/data/mtoDB.js:272`, `src/data/mtoDB.js:317`, `src/data/mtoDB.js:322`, `src/data/mtoDB.js:331`, `src/data/mtoDB.js:336`, `src/data/mtoDB.js:345`, `src/data/mtoDB.js:352`, `src/data/mtoDB.js:358`, `src/data/mtoDB.js:365`.

### `src/data/mtoImportTransaction.js`

| Assinatura | Descrição |
|---|---|
| `async commitMtoImport({ batch, items, auditEvent })` | Grava lote, itens e os dois registros de auditoria numa única transação `readwrite`, convertendo falhas em erros de domínio. |

Referência: `src/data/mtoImportTransaction.js:44`.

### `src/data/mtoDrawings.js`

| Assinatura | Descrição |
|---|---|
| `async ensureDrawingsForMtoItems(items = [], options = {})` | Cria um drawing `DRAFT` por Drawing No ainda inexistente no projeto, com equipamento/código apenas quando o grupo possui valor único. |
| `async linkDrawingsForMtoItemsToEquipment(items = [], equipmentId, options = {})` | Garante os drawings das linhas selecionadas e os atualiza para o equipamento informado. |

Referências: `src/data/mtoDrawings.js:16`, `src/data/mtoDrawings.js:57`.

### `src/data/drawings.js`

| Assinatura | Descrição |
|---|---|
| `async createDrawing(input = {})` | Normaliza, valida projeto/número e grava um drawing. |
| `async updateDrawing(id, patch = {})` | Atualiza um drawing ou cria nova revisão quando a revisão muda. |
| `async createDrawingRevision(id, patch = {})` | Marca a revisão atual como superseded e cria um novo registro de revisão. |
| `async deleteDrawing(id)` | Exclui um drawing pelo ID. |
| `async getDrawing(id)` | Busca um drawing pelo ID. |
| `async getDrawingByDrawingNo(drawingNo, filters = {})` | Busca por Drawing No e prefere a revisão atual. |
| `async listDrawings(filters = {})` | Lista drawings por projeto, equipamento, workpack, status, documento ou flag de revisão atual. |

Referências: `src/data/drawings.js:87`, `src/data/drawings.js:95`, `src/data/drawings.js:110`, `src/data/drawings.js:136`, `src/data/drawings.js:142`, `src/data/drawings.js:148`, `src/data/drawings.js:158`.

### `src/data/equipments.js`

| Assinatura | Descrição |
|---|---|
| `findEquipmentMatch(equipments = [], hint)` | Procura correspondência exata normalizada primeiro em tags e depois em `clientTag`, `name` e `code`. |
| `async createEquipment(input = {})` | Normaliza, valida unicidade e grava um equipamento. |
| `async updateEquipment(id, patch = {})` | Atualiza um equipamento após normalização e validação de unicidade. |
| `async deleteEquipment(id)` | Exclui um equipamento pelo ID. |
| `async getEquipment(id)` | Busca um equipamento pelo ID. |
| `async listEquipments(filters = {})` | Lista equipamentos filtrados por projeto/status. |
| `async migrateEquipmentClassifications(equipmentTypeIdsByName = new Map())` | Migra classificação e tipo canônico dos equipamentos existentes. |
| `async findEquipmentByHint(hint, filters = {})` | Lista equipamentos no escopo e aplica `findEquipmentMatch`. |

Referências: `src/data/equipments.js:206`, `src/data/equipments.js:228`, `src/data/equipments.js:236`, `src/data/equipments.js:249`, `src/data/equipments.js:255`, `src/data/equipments.js:261`, `src/data/equipments.js:267`, `src/data/equipments.js:297`.

### `src/data/auditLog.js`

| Assinatura | Descrição |
|---|---|
| `normalizeAuditEvent(input = {})` | Converte uma entrada no schema canônico de evento de auditoria. |
| `async createAuditEvent(input)` | Grava um evento no store canônico e, quando presente, no store legado. |
| `async createAuditLogEntry(input)` | Normaliza e grava no store `auditLog`. |
| `async getAllAuditEvents()` | Alias para listar todas as entradas canônicas. |
| `async getAllAuditLogEntries()` | Lista auditoria em ordem cronológica inversa. |
| `async getAuditEvents(filters = {})` | Alias para consulta filtrada de auditoria. |
| `async getAuditLogEntry(id)` | Busca um evento pelo ID. |
| `async getAuditLogEntries(filters = {})` | Filtra eventos por referências e intervalo de datas. |
| `getAuditEventsForEntity(entityType, entityId)` | Consulta eventos de uma entidade específica. |
| `async deleteAuditEvent(id)` | Exclui o evento canônico e sua cópia legada, quando aplicável. |
| `async deleteAuditLogEntry(id)` | Exclui uma entrada do store canônico. |
| `async clearAuditEvents()` | Limpa auditoria canônica e legada. |
| `async clearAuditLog()` | Limpa apenas o store canônico. |

Constante exportada: `AUDIT_EVENT_TYPES`. No fluxo auditado, somente `normalizeAuditEvent` é chamada diretamente.

Referências: `src/data/auditLog.js:7`, `src/data/auditLog.js:48`, `src/data/auditLog.js:96`, `src/data/auditLog.js:105`, `src/data/auditLog.js:111`, `src/data/auditLog.js:115`, `src/data/auditLog.js:121`, `src/data/auditLog.js:125`, `src/data/auditLog.js:130`, `src/data/auditLog.js:135`, `src/data/auditLog.js:139`, `src/data/auditLog.js:148`, `src/data/auditLog.js:154`, `src/data/auditLog.js:163`.

### `src/data/database.js`

| Assinatura | Descrição |
|---|---|
| `getDB()` | Abre/reutiliza `NestingAppDB` versão 22 e aplica o upgrade centralizado de schema. |

Referência: `src/data/database.js:247`.

### `src/data/idb.js`

| Assinatura | Descrição |
|---|---|
| `openDatabase(name, version, upgrade)` | Abre e mantém em cache uma conexão IndexedDB, tratando upgrade, bloqueio, erro e mudança de versão. |
| `idbGetAll(db, storeName)` | Executa `getAll` em transação `readonly`. |
| `idbGet(db, storeName, key)` | Executa `get` em transação `readonly`. |
| `idbPut(db, storeName, value)` | Executa um `put` em uma transação `readwrite` de um único store. |
| `idbDelete(db, storeName, key)` | Executa um `delete` em uma transação `readwrite` de um único store. |
| `idbClear(db, storeName)` | Executa `clear` em uma transação `readwrite` de um único store. |
| `idbRequest(request)` | Converte um `IDBRequest` em Promise. |
| `idbTransaction(db, storeNames, mode, operation)` | Executa uma operação sobre um ou vários stores e resolve somente no `oncomplete`. |

Referências: `src/data/idb.js:8`, `src/data/idb.js:37`, `src/data/idb.js:45`, `src/data/idb.js:53`, `src/data/idb.js:62`, `src/data/idb.js:71`, `src/data/idb.js:80`, `src/data/idb.js:87`.

## 2. Análise dos dois fluxos

### Fluxo A — `src/ui/mtoPage.js` (ativo)

#### Calcula impacto de revisão?

**Sim.** Depois do parse e do vínculo em memória com equipamento, chama `analyzeImportImpact(enrichedItems, { projectId })` (`src/ui/mtoPage.js:1757`). A análise usa a chave `drawing|mark|pos` (`src/data/mtoDB.js:148`) e classifica:

- `brandNew`: não há item atual com a mesma chave;
- `duplicates`: mesma chave e mesma revisão; mudanças de conteúdo são apenas registradas em `contentChanged`, mas o item ainda é classificado como duplicado e não é importado;
- `revisions`: revisão considerada mais nova **ou** comparação `unknown`;
- `olderRevisions`: revisão considerada mais antiga;
- `toSupersede`: ID do item existente para todos os casos que não são `same`, inclusive `older` e `unknown`.

A comparação (`src/data/mtoDB.js:162`) entende:

- letra → número como nova revisão;
- número → letra como revisão antiga;
- letras isoladas por ordem alfabética;
- strings somente numéricas por valor numérico;
- formatos diferentes desses como `unknown`.

A página mostra a contagem e exige confirmação; quando há revisão antiga, muda o rótulo para “Confirmar mesmo assim” (`src/ui/mtoPage.js:1124-1163`). Duplicados são removidos de `itemsToImport`; revisões antigas não são removidas se o usuário confirmar (`src/ui/mtoPage.js:1103-1106`, `1764`).

#### Vincula equipamento e cria desenho automaticamente?

**Sim, com limites importantes.**

- Não cria equipamentos. Carrega equipamentos já existentes do projeto e tenta preencher `equipmentId` em memória (`src/ui/mtoPage.js:1755-1757`).
- O hint prioriza `tag`, depois `equipmentName` e `constructionActivity` (`src/ui/mtoPage.js:981-992`).
- A resolução procura correspondência exata normalizada primeiro em `equipmentTags`, depois `clientTag`, `name` e `code`; em ambiguidade escolhe o primeiro e emite `console.warn` (`src/data/equipments.js:206-225`).
- Cria automaticamente um drawing `DRAFT` por Drawing No inexistente no projeto (`src/ui/mtoPage.js:1763`; `src/data/mtoDrawings.js:16-54`).
- O drawing novo recebe `equipmentId` apenas se todas as linhas candidatas daquele Drawing No resultarem em um único equipamento não vazio. Se não houver um único valor, o drawing é criado sem equipamento.
- Um drawing já existente não é relincado durante a importação. A função de bulk link posterior, separada da importação, pode criar/atualizar drawings para um equipamento escolhido (`src/data/mtoDrawings.js:57-82`).

#### Onde e em qual transação grava?

`saveMtoImport` grava:

- o cabeçalho/lote em `mtoBatches`;
- as linhas em `mtoItems`;
- o evento canônico em `auditLog`;
- a cópia de compatibilidade em `auditEvents`.

Os quatro stores participam de **uma única transação IndexedDB `readwrite`**, declarada em `src/data/mtoImportTransaction.js:6` e aberta em `src/data/mtoImportTransaction.js:49`. Qualquer falha deve abortar o conjunto; `tests/mtoDB.test.mjs` cobre rollback quando o put em `auditLog` falha.

Fora dessa transação:

- cada drawing é gravado antecipadamente em `drawings` por um `idbPut`, portanto em sua própria transação `readwrite` (`src/data/drawings.js:87-92`; `src/data/idb.js:53-60`);
- depois da importação, cada item antigo é marcado `superseded` por `updateMtoItemsStatus`, que dispara um `updateMtoItem`/`idbPut` independente por ID (`src/data/mtoDB.js:322-334`).

#### Ordem efetiva

1. Exige `projectId`; sem projeto nem abre o processamento (`src/ui/mtoPage.js:1727-1735`).
2. Faz parse do CSV/Excel, normaliza e valida cada linha (`1743-1746`).
3. Se existir qualquer `rejectedItem`, mostra erros e encerra antes de vínculos ou writes (`1747-1754`).
4. Lista equipamentos e enriquece itens em memória com `equipmentId` (`1755-1756`).
5. Analisa impacto de revisão/duplicidade (`1757`).
6. Pede confirmação ao usuário (`1758-1762`).
7. Cria os drawings ausentes (`1763`).
8. Exclui duplicados da lista a importar e, se nada restar, encerra — drawings podem já ter sido criados (`1764-1771`).
9. `saveMtoImport` normaliza e **revalida**; só então abre a transação atômica dos quatro stores (`1773-1785`; `src/data/mtoDB.js:211-242`).
10. Marca os itens anteriores como `superseded` em writes independentes (`1786-1788`).

Logo, a ordem pedida é: **validação → análise/confirmação → criação de drawing → gravação da MTO → marcação dos itens antigos como superseded**.

### Fluxo B — `HEAD:src/ui/mtoImportModal.js` (histórico, removido e inativo)

#### Calcula impacto de revisão?

**Não.** A versão removida importava somente `parseMtoFile` e `saveMtoImport`; não chamava `analyzeImportImpact`, `compareRevisions` ou qualquer detector próprio de duplicidade/revisão. O único tratamento de duplicidade disponível era a validação interna de IDs repetidos em `saveMtoImport`; isso não equivale a comparar a identidade de negócio `drawing|mark|pos` ou revisões.

#### Vincula equipamento e cria desenho automaticamente?

**Não.** Não importava nem chamava `equipments.js`, `mtoDrawings.js` ou `drawings.js`. Os itens eram enviados ao save exatamente como saíam do parser, salvo pela normalização interna de persistência.

#### Onde e em qual transação grava?

Chamava o mesmo `saveMtoImport`. Portanto, lote, linhas e auditoria usavam os mesmos stores `mtoBatches`, `mtoItems`, `auditLog` e `auditEvents` na mesma transação atômica `readwrite` descrita acima.

#### Ordem efetiva

1. Ao selecionar o arquivo, chamava `parseMtoFile`, que normalizava e validava as linhas.
2. Mostrava preview com `Accepted`/`Rejected`, contagens e erros, mas não impedia o usuário de clicar em `Import MTO` quando havia rejeições.
3. No clique, chamava `saveMtoImport` com **todos** os `parsed.items`.
4. `saveMtoImport` revalidava tudo; qualquer linha inválida fazia a Promise rejeitar antes de abrir a transação.
5. Se válido, gravava a MTO na transação atômica dos quatro stores.

Logo, a ordem histórica era: **parse/validação para preview → tentativa de gravação → revalidação bloqueante dentro do save → gravação da MTO**. Não havia criação de drawing nem etapa de equipamento.

## 3. Divergência de cobertura de validação

### Conclusão atual

Não há hoje duas telas executáveis para divergirem: `mtoImportModal.js` foi removido e não há referência atual ao seu export. Portanto, a formulação estrita “as duas telas ainda divergem” **não é verdadeira no runtime atual**, pois só `mtoPage.js` está ativo.

### Comparação com o modal removido

O diagnóstico histórico de divergência é **confirmado**, com esta precisão:

| Cobertura | `mtoPage.js` ativo | Modal removido |
|---|---|---|
| Normalização e seis validações de campos | Sim | Sim |
| Revalidação imediatamente antes do write | Sim | Sim |
| Bloqueio explícito ao detectar qualquer linha rejeitada, antes de outros efeitos | Sim | Não; só o save bloqueava depois do clique |
| Exibição detalhada dos erros quando o save lança `MTO_IMPORT_VALIDATION_FAILED` | Sim | Não; mostrava toast genérico de falha ao salvar |
| Projeto ativo obrigatório na UI antes do parse | Sim | Não; aceitava `projectId` vazio |
| Comparação por `drawing|mark|pos` | Sim | Não |
| Classificação nova/duplicada/revisão nova/revisão antiga | Sim | Não |
| Confirmação do impacto e alerta de revisão antiga | Sim | Não |
| Exclusão de duplicados de negócio da importação | Sim | Não |
| Vínculo automático com equipamento existente | Sim | Não |
| Criação automática de drawing | Sim | Não |

Assim, as duas implementações compartilhavam a validação básica de campos e a barreira final de `saveMtoImport`; a divergência estava na **orquestração e cobertura pré-write**, sobretudo projeto, impacto de revisão/duplicidade, feedback detalhado, equipamento e drawing.

## 4. Fluxo principal, secundário e órfão

### Principal atual: `mtoPage.js`

Evidências:

- a navegação lateral define `data-phase="mto"` em `index.html:42`;
- o container ativo é `#mto-phase` em `index.html:122`;
- `src/main.js:50` importa `renderMtoPage` e `refreshMtoPage`;
- `showPhase('mto')` chama `renderOrRefreshMtoPage` em `src/main.js:292`;
- `renderOrRefreshMtoPage` chama a página em `src/main.js:1137-1152`;
- o botão `#import-mto-btn` do planner chama `openMtoImportFlow`, que somente executa `showPhase('mto')` (`src/main.js:2771-2773`, `3058`).

### Órfão/removido: `mtoImportModal.js`

- O arquivo não está presente no working tree e aparece como `D src/ui/mtoImportModal.js`.
- `rg` não encontra import ou chamada atual de `openMtoImportModal`.
- Mesmo na árvore `HEAD`, `git grep` encontra `openMtoImportModal` apenas dentro do próprio arquivo, isto é, a implementação já não tinha consumidor naquela árvore.

Portanto, `mtoPage.js` é inequivocamente o fluxo principal. O modal antigo era órfão e agora está removido; não há um segundo fluxo secundário operacional.

## 5. Estado real consolidado

O estado atual é um único fluxo rico concentrado na página MTO. Ele compartilha parser e persistência com a antiga implementação, mas acrescenta guardas de UI, análise de revisão/duplicidade, resolução de equipamento existente e criação automática de drawings. A gravação do lote/itens/auditoria é atômica, porém a criação prévia dos drawings e a marcação posterior dos itens antigos como `superseded` ficam fora dessa fronteira transacional. Nenhuma solução ou alteração de arquitetura é proposta neste relatório.
