# Auditoria da UI de decisões MTO e do retry de Drawings

Escopo auditado: `src/ui/mtoImportDecisionModal.js`, `src/data/mtoImportDecisions.js`, `src/data/mtoImportWorkflow.js`, os trechos relacionados a `openMtoDrawingSyncDetails` e `renderPendingDrawingSyncBatches` em `src/ui/mtoPage.js`, e as regras `.mto-import-decision*`/`.mto-drawing-sync*` em `src/styles/app.css`. Para rastrear os efeitos no banco e a infraestrutura efetivamente usada pelo modal, também foram consultados `src/ui/modal.js`, `src/data/mtoDB.js`, `src/data/mtoImportTransaction.js`, `src/data/mtoDrawings.js` e `src/data/auditLog.js`.

## 1. Funções exportadas

### `src/ui/mtoImportDecisionModal.js`

| Assinatura | Descrição |
|---|---|
| `openMtoImportDecisionModal(importPlan, initialDecisions, options = {})` | Abre a revisão de conflitos, mantém o estado das escolhas em memória e resolve uma `Promise` com a ação, as decisões e, quando aplicado, o plano efetivo. |

### `src/data/mtoImportDecisions.js`

| Assinatura | Descrição |
|---|---|
| `mtoImportDecisionKey(item = {})` | Produz a chave estável da decisão, priorizando `id` e usando `drawing|mark|pos|revision` como alternativa. |
| `createMtoImportDecisionState(importPlan = {})` | Converte as três categorias pendentes do plano em decisões inicialmente `UNRESOLVED`. |
| `applyMtoImportDecisions({ items = [], impact = {}, importPlan = {}, decisions = [], analyzeImpact = analyzeImportImpact } = {})` | Aplica escolhas em memória, reanalisa somente revisões corrigidas e devolve o plano efetivo seguro e seu resumo de auditoria. |
| `describeMtoItemChanges(existingItem = {}, newItem = {})` | Lista somente diferenças em `qty`, `cutLength`, `material` e `description`. |
| `getZeroMtoImportOutcome(action, effectivePlan = {})` | Classifica o resultado quando o plano efetivo não possui itens importáveis e fornece mensagem/estado para a UI. |

O arquivo também exporta as constantes congeladas `MTO_IMPORT_DECISION` e `MTO_ZERO_IMPORT_OUTCOME`; elas não são funções.

### `src/data/mtoImportWorkflow.js`

| Assinatura | Descrição |
|---|---|
| `retryPendingMtoDrawingSync({ batchId, getMtoBatch = ..., getMtoItemsByBatch = ..., ensureDrawingsForMtoItems = ..., updateMtoBatch = ..., createAuditEvent = ..., now = ... } = {})` | Valida o batch, coalesce tentativas simultâneas por ID e executa o reprocessamento da sincronização de Drawings. |
| `commitMtoThenCreateDrawings({ importPayload, items, projectId, saveImport, createDrawings })` | Salva a importação primeiro e, depois, tenta criar Drawings, retornando separadamente eventual erro dessa segunda etapa. |

Funções internas relacionadas ao retry:

| Assinatura | Descrição |
|---|---|
| `text(value)` | Converte um valor em texto aparado. |
| `unique(values = [])` | Remove valores falsy e duplicados. |
| `usefulError(error)` | Extrai a primeira linha do erro, limitada a 500 caracteres, com fallback textual. |
| `activeDrawingItems(items = [])` | Exclui itens sem Drawing No, `cancelled` ou `superseded` e deduplica Drawing Nos sem diferenciar caixa. |
| `writeRetryAudit(createAudit, batch, previousStatus, finalStatus, requestedDrawingNos, createdCount, error)` | Registra o resultado do retry como `MANUAL_ADJUSTMENT`, com a operação específica no metadata. |
| `runPendingMtoDrawingSync({ batchId, getBatch, getItems, ensureDrawings, updateBatch, createAudit, now })` | Implementa as transições `processing`/`complete`/`failed`, a criação sequencial e o controle de pendências remanescentes. |

O `Map` interno `drawingSyncAttempts` mantém uma `Promise` em andamento por batch e é removido no `finally`.

### `src/ui/mtoPage.js`

| Assinatura | Descrição |
|---|---|
| `filterMtoItems(items, filters)` | Filtra itens MTO por busca textual, Drawing, equipamento, material, disciplina e status. |
| `equipmentHint(item = {})` | Escolhe o hint usado no matching automático de equipamento. |
| `enrichItemsWithEquipment(items = [], equipments = [])` | Acrescenta `equipmentId` somente quando o matching retorna um equipamento único. |
| `renderMtoPage(container, options = {})` | Inicializa o estado da página e executa a primeira renderização. |
| `refreshMtoPage(container, options = {})` | Recupera o estado existente e renderiza novamente a página. |

As funções auditadas `openMtoDrawingSyncDetails(batch)`, `pendingDrawingSyncSort(a, b)` e `renderPendingDrawingSyncBatches(batches, rerender)` são internas, não exportadas.

### `src/styles/app.css`

Não há funções ou exports JavaScript. As regras auditadas cobrem a estrutura, largura, campos e lista do modal de decisões; os cards, ações e modal de detalhes do retry; e a adaptação dos cards de retry abaixo de 760 px.

## 2. Elemento do modal e tratamento de conteúdo

`mtoImportDecisionModal.js` não cria um `<dialog>`. Ele chama `openModal` de `src/ui/modal.js`; esse helper cria um `<div class="modal-overlay">` contendo outro `<div class="modal">`. Portanto, o elemento efetivamente usado por esse modal não é o `<dialog>` nativo mencionado no `AGENTS.md`.

`mtoImportDecisionModal.js` não usa `innerHTML`. Ele cria os elementos com `document.createElement`, insere texto com `textContent`, atualiza o corpo com `replaceChildren` e atribui a revisão digitada pela propriedade `input.value`. Drawing, Mark, POS, descrição, revisões e diferenças vindas da importação entram por esses caminhos de texto/propriedade.

O helper compartilhado `modal.js` usa `innerHTML` para montar uma estrutura fixa do modal e para esvaziar corpo/rodapé. Ele também aceita um `body` textual que seria inserido por `innerHTML`, mas `openMtoImportDecisionModal` passa um `HTMLElement`; nesse fluxo, os dados importados/do usuário não passam pelo ramo de `innerHTML`.

## 3. Efeito de cada decisão no IndexedDB

| Opção | Efeito antes do commit | Efeito no IndexedDB |
|---|---|---|
| **Deixar pendente (`UNRESOLVED`)** | A linha permanece em `unresolvedDecisions`; não entra em `itemsToImport` nem em `itemsToSupersede`. | A linha importada não é gravada e o item existente não é alterado. Se não houver item seguro, `handleImport` encerra sem `saveMtoImport`, logo nenhum batch é criado. Se houver itens seguros no mesmo arquivo, o batch desses itens é gravado e seu `metadata.importDecisions` inclui o resumo da decisão pendente, mas a linha pendente continua fora de `mtoItems`. |
| **Manter existente (`KEEP_EXISTING`)** | A linha entra em `keptExisting` e `resolvedDecisions`; não entra em `itemsToImport` nem em `itemsToSupersede`. | O item existente não recebe `put`, patch ou mudança de status. Se todas as linhas forem `KEEP_EXISTING`, não ocorre `saveMtoImport` nem criação de batch. Em uma importação mista com linhas seguras, o batch gravado inclui a decisão resumida em `metadata.importDecisions`; o item mantido permanece inalterado. |
| **Corrigir como nova revisão (`IMPORT_AS_NEW_REVISION`)** | Disponível apenas para `sameRevisionChanged`. O item é clonado com a revisão informada e `metadata.importDecision`, sem modificar o objeto original, e passa novamente por `analyzeImportImpact`. | Se a reanálise não comprovar revisão mais nova, nada dessa linha é gravado. Se comprovar, o clone corrigido entra em `itemsToImport` e os IDs retornados em `toSupersede` entram em `itemsToSupersede`; após a confirmação, batch, nova linha, itens antigos como `superseded` e auditoria são gravados juntos por `saveMtoImport` → `commitMtoImport`. |
| **Corrigir revisão (`SET_REVISION`)** | Disponível apenas para `unknownRevisions`; usa o mesmo clone, metadata e reanálise da opção anterior. | O efeito no banco é o mesmo: nenhum write se a revisão continuar igual, antiga ou desconhecida; persistência atômica da linha corrigida e da supersedência somente quando `analyzeImportImpact` a classifica em `revisions`. |

`olderRevisions` oferece somente `UNRESOLVED` e `KEEP_EXISTING`; o modal não apresenta correção/importação para essa categoria.

O resumo `metadata.importDecisions` do batch contém contagens e, por decisão, somente `key`, `category`, `decision`, `originalRevision` e `correctedRevision`. O item corrigido gravado contém `metadata.importDecision` com categoria, decisão e revisões original/corrigida.

## 4. Uso de `MANUAL_ADJUSTMENT` na auditoria do retry

Os eventos de conclusão e falha são gravados com `eventType: MANUAL_ADJUSTMENT`. Consequentemente, uma consulta ou filtro somente por `eventType === "MANUAL_ADJUSTMENT"` retorna esses retries junto com outros ajustes manuais que usam o mesmo tipo, como ajustes de inventário.

Sem criar um tipo novo, os retries são distinguíveis pelos dados já gravados:

- `metadata.operation` é `COMPLETE_MTO_DRAWING_SYNC` ou `FAIL_MTO_DRAWING_SYNC`;
- `entityType` é `mtoBatch`;
- `sourceDocumentType` é `MTO`;
- `reason` é `MTO Drawing synchronization retry`.

`getAuditLogEntries` oferece filtros exatos para `eventType`, `entityType` e `sourceDocumentType`, mas não possui filtro nativo por `metadata.operation`. A diferenciação exata pela operação requer filtrar o resultado pelo campo aninhado; a tela de histórico inclui o metadata serializado em sua busca textual.

## 5. Relação entre retry e `ensureDrawingsForMtoItems`

O retry chama `ensureDrawingsForMtoItems` como a operação que efetivamente consulta Drawings existentes e cria os ausentes. Ele não replica o mapeamento dos campos nem chama diretamente `createDrawing`.

Existe uma sobreposição pontual na deduplicação: `activeDrawingItems` deduplica Drawing Nos sem diferenciar caixa antes das chamadas, enquanto `ensureDrawingsForMtoItems` também deduplica candidatos e ignora Drawing Nos já existentes. Fora essa deduplicação, o retry acrescenta a camada de reprocessamento: localiza batch/itens, filtra status MTO, controla concorrência, atualiza `drawingSync`, acompanha criação parcial e registra auditoria.

## 6. Caminhos de escrita de itens MTO e atomicidade

No fluxo do modal de decisões, não foi encontrado caminho de persistência de revisão corrigida ou supersedência fora da transação de importação. `applyMtoImportDecisions` somente monta objetos e arrays em memória. `handleImport` passa `itemsToImport` e `itemsToSupersede` para `saveMtoImport`; essa função normaliza os itens antigos com status `superseded` e chama `commitMtoImport`, que grava batch, itens novos, itens superseded e os dois registros de auditoria na mesma transação IndexedDB.

O retry de Drawings não chama `createMtoItem`, `updateMtoItem`, `updateMtoItemsStatus`, `deleteMtoItems`, `analyzeImportImpact` ou `saveMtoImport`. Ele atualiza somente o batch, cria/consulta Drawings por meio de `ensureDrawingsForMtoItems` e grava o evento de auditoria.

Em outras funcionalidades já existentes no mesmo `mtoPage.js`, há writes de itens MTO fora de `commitMtoImport`:

- vinculação de projeto chama `updateMtoItem(id, { projectId })`;
- vinculação automática ou manual de equipamento chama `updateMtoItem(id, { equipmentId })`;
- criação manual de linha chama `createMtoItem(...)` e aceita o campo `revision` do formulário;
- edição manual chama `updateMtoItem(item.id, readEditPatch(...))`, e `revision` integra `EDITABLE_FIELDS`;
- exclusão manual chama `deleteMtoItems(...)`.

Esses caminhos não são acionados pelo modal de decisões ou pelo retry. Não foi encontrada, nos trechos auditados, uma chamada separada que marque item como `superseded`; a supersedência da importação passa por `itemsToSupersede` na transação unificada.

## 7. Testes relacionados

| Arquivo de produção | Arquivo de teste | O que verifica |
|---|---|---|
| `src/ui/mtoImportDecisionModal.js` | Nenhum teste direto localizado | Não foi localizado teste que importe ou renderize diretamente o modal. |
| `src/data/mtoImportDecisions.js` | `tests/mtoImportDecisions.test.mjs` | Verifica estado inicial, decisões permitidas, bloqueios, reanálise de revisão, supersedência comprovada, imutabilidade, metadata, resumo, identidade estável e os resultados de zero itens. |
| `src/data/mtoImportWorkflow.js` | `tests/mtoDrawingSyncRetry.test.mjs` | Verifica validação do batch, idempotência, filtros/deduplicação, sucesso, falha e retomada parcial, IDs, concorrência, metadata, auditoria e ausência de writes MTO. |
| `src/data/mtoImportWorkflow.js` | `tests/mtoImportWorkflow.test.mjs` | Verifica que o commit da MTO ocorre antes da criação de Drawings e permanece concluído quando a criação falha. |
| `src/data/mtoImportWorkflow.js` | `tests/mtoImportPlan.test.mjs` | No teste de integração do plano, verifica que somente itens importáveis e IDs a superseder chegam ao workflow de commit. |
| `src/ui/mtoPage.js` | `tests/mtoPageFilters.test.mjs` | Verifica os exports de filtros e enriquecimento de equipamento; não exercita `renderPendingDrawingSyncBatches` nem `openMtoDrawingSyncDetails`. |
| `src/styles/app.css` | Nenhum teste direto localizado | Não foi localizado teste automatizado para as regras visuais do modal de decisão ou dos avisos de retry. |

## 8. Resumo factual do fluxo auditado

1. O modal mantém todas as escolhas inicialmente em `UNRESOLVED` e não grava diretamente no banco.
2. Revisões corrigidas só entram no plano efetivo após nova chamada a `analyzeImportImpact` classificá-las como mais novas.
3. A persistência desse plano ocorre por `saveMtoImport` e `commitMtoImport`, incluindo a supersedência na mesma transação.
4. O retry de Drawing trabalha sobre um batch já gravado, atualiza apenas `metadata.drawingSync`, delega a criação idempotente a `ensureDrawingsForMtoItems` e registra um evento de auditoria.
5. A UI de retry seleciona somente batches `pending`, `failed` ou `processing` cujo `projectId` corresponde ao projeto ativo e oferece tentativa individual e detalhes somente leitura.
