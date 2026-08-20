# Auditoria — vínculo MTO × PO Item

Data: 2026-07-31
Escopo: auditoria somente leitura de `src/core/mtoPoItemAllocation.js`, seus imports e seus consumidores atuais. Nenhum código foi corrigido.

## Resumo executivo

- O arquivo real da lógica de domínio é `src/core/mtoPoItemAllocation.js`, com 367 linhas.
- O módulo está **estruturalmente completo**: `node --check` passou, todas as chaves/parênteses fecham e todas as cinco funções exportadas possuem retorno coerente com o contrato consumido hoje.
- Não foi encontrada função terminando no meio, parâmetro sintaticamente ausente, objeto de retorno cortado ou caminho externo que retorne `undefined` acidentalmente.
- Os seis `return;` sem valor encontrados nas linhas 114, 134, 145, 171, 178 e 187 pertencem ao callback de `groups.forEach` dentro do gerador de sugestões. Eles apenas encerram o processamento do grupo corrente; a função externa continua e retorna `{ suggestions, issues }` na linha 201.
- Todas as funções exportadas estão vivas: têm consumidor de produção direto ou são chamadas internamente por outra função exportada que possui consumidor de produção.
- Foram identificadas duas lacunas de coerência, embora não sejam sinais de truncamento:
  1. a validação aceita vínculo sem `projectId` quando MTO e PO Item estão ambos sem projeto;
  2. a normalização contém o literal corrompido `MÂ²`, portanto a entrada Unicode normal `M²` não é reconhecida como `M2`.
- Os testes focados existentes passaram: 2 arquivos, 2 aprovados, 0 falhas.

## Estado do arquivo no Git

`src/core/mtoPoItemAllocation.js` aparece atualmente como `??` em `git status --short`, ou seja, existe no working tree e é importado pelo código atual, mas ainda não está rastreado pelo Git. O adaptador de persistência `src/data/mtoPoItemAllocations.js` também está nessa condição.

Isso não impede seu uso pelo navegador no estado atual do diretório, mas é relevante para descrever o estado real do código auditado.

## 1. Integridade estrutural

### Sintaxe e fechamento

- `node --check src/core/mtoPoItemAllocation.js`: aprovado.
- Total lido: 367 linhas.
- A declaração exportada `MTO_PO_ITEM_ALLOCATION_STATUS` fecha corretamente nas linhas 1–4.
- As cinco funções exportadas fecham corretamente e possuem retorno explícito:
  - `mtoDemandQuantity`: linhas 63–69;
  - `suggestMtoPoItemAllocationsByIdentCode`: linhas 76–202;
  - `validateMtoPoItemAllocation`: linhas 204–246;
  - `validateMtoPoItemAllocationBatch`: linhas 248–273;
  - `buildMtoProcurementCoverage`: linhas 292–367.

### Parâmetros faltando

Não há parâmetro sintaticamente faltando. Todos os parâmetros públicos são declarados e possuem defaults defensivos:

- objetos usam `= {}`;
- coleções usam `= []`;
- unidade de demanda usa `= 'EA'`.

Também não foi encontrado consumidor passando argumento posicional incompatível com as assinaturas atuais.

### Objetos retornados incompletos

Não há objeto aparentemente cortado ou propriedade exigida pelos consumidores que esteja ausente:

- sugestões retornam os campos persistidos pelo adaptador de dados;
- issues retornam código, projeto, IDENT CODE, IDs envolvidos e mensagem;
- validação individual retorna validade, erros, unidade e totais usados no cálculo;
- validação em lote retorna validade global, resultado por entrada e erros achatados com índice;
- cobertura retorna MTO, unidade, demanda, quantidades, pendências, status e detalhes de alocação/recebimento.

Os consumidores atuais não desestruturam nem acessam alguma propriedade ausente desses retornos.

## 2. Funções exportadas

### `mtoDemandQuantity(mtoItem = {}, unitOfMeasure = 'EA')`

**O que o nome indica:** converter a demanda de uma linha MTO para a unidade usada pelo PO Item.

**O que o corpo faz:**

- `M`: usa `requiredLength / 1000` ou `qty × cutLength / 1000`;
- `KG`: usa `weightKg`;
- `M2`: usa `externalSurfaceM2`;
- demais unidades: usa `qty`.

**Completude:** completa estruturalmente e coerente com o nome. Todos os caminhos retornam número.

**Lacuna observada:** `unit()` reconhece `M2` e o texto corrompido `MÂ²`, mas não a string Unicode correta `M²` (`src/core/mtoPoItemAllocation.js:20`). A prova isolada mostrou:

- `mtoDemandQuantity({ qty: 7, externalSurfaceM2: 12 }, 'M2')` → `12`;
- `mtoDemandQuantity({ qty: 7, externalSurfaceM2: 12 }, 'M²')` → `7`.

Nesse segundo caso a unidade cai no fallback de quantidade `EA`, apesar de o nome/finalidade da função sugerir normalização equivalente.

**Chamadas de produção:**

- internamente pelo gerador de sugestões (`src/core/mtoPoItemAllocation.js:161`);
- internamente pelo validador individual (`:216`);
- internamente pelo cálculo de cobertura (`:353`);
- importada em `src/main.js:140`, repassada à página MTO em `src/main.js:1053` e chamada por `src/ui/mtoPage.js:524`;
- importada em `src/core/reportCalculations.js:1` e chamada em `src/core/reportCalculations.js:312`.

**Teste direto:** `tests/mtoPoItemAllocation.test.mjs:10-12`.

### `suggestMtoPoItemAllocationsByIdentCode({ mtoItems = [], poItems = [], existingAllocations = [], allocations = [], drafts = [] } = {})`

**O que o nome indica:** sugerir vínculos automáticos MTO × PO Item usando IDENT CODE.

**O que o corpo faz:**

1. reúne vínculos ativos existentes e drafts;
2. agrupa MTOs elegíveis por projeto e IDENT CODE;
3. exige projeto e IDENT CODE;
4. procura PO Items não cancelados no mesmo projeto e com IDENT CODE idêntico;
5. rejeita ausência, ambiguidade, saldo insuficiente, conflito de unidade e par já vinculado;
6. somente sugere quando um único PO Item pode cobrir integralmente a demanda restante do grupo;
7. retorna `{ suggestions, issues }`.

**Completude:** completa e coerente com o comportamento conservador descrito no comentário da própria função (`src/core/mtoPoItemAllocation.js:72-75`). Os `return;` internos são saídas do callback por grupo, não retornos ausentes da função exportada.

**Objeto de sugestão:** contém `projectId`, `mtoLineId`, `poItemId`, `allocatedQuantity`, `unitOfMeasure`, `matchMethod` e `matchedIdentCode`; esses campos são aceitos por `normalizeMtoPoItemAllocation` em `src/data/mtoPoItemAllocations.js:26-46`.

**Objeto de issue:** contém `code`, `projectId`, `matchedIdentCode`, `mtoLineIds`, `poItemIds` e `message`, montados de forma centralizada em `src/core/mtoPoItemAllocation.js:49-58`.

**Chamadas de produção:**

- importada em `src/main.js:140`, repassada em `src/main.js:1054` e chamada pelo modal de vínculo em `src/ui/mtoPage.js:500`;
- importada em `src/core/reportCalculations.js:1` e chamada em `src/core/reportCalculations.js:798` para produzir alocações automáticas efetivas no relatório.

**Testes diretos:** `tests/mtoPoItemAllocation.test.mjs:133-210`, cobrindo sugestão normal, fallback legado de IDENT, pontuação, ambiguidade, saldo, demanda restante, conflito de unidade e escopo de projeto.

### `validateMtoPoItemAllocation({ allocation = {}, mtoItem = {}, poItem = {}, existingAllocations = [] } = {})`

**O que o nome indica:** validar uma alocação individual entre uma demanda MTO e um PO Item.

**O que o corpo faz:** verifica referências de MTO/PO Item, incompatibilidade de projeto, quantidade positiva, duplicidade do par, unidade conflitante, excesso da demanda MTO e excesso do saldo do PO Item.

**Retorno:**

```text
{
  valid,
  errors,
  unitOfMeasure,
  demandQuantity,
  mtoAllocatedBefore,
  poAllocatedBefore
}
```

**Completude:** completa estruturalmente. O retorno é coerente com os consumidores e cada regra acrescenta um erro com `code` e `message`.

**Lacuna observada:** não existe erro `PROJECT_REQUIRED`. A função só gera `PROJECT_MISMATCH` quando **ambos** os projetos estão preenchidos e são diferentes (`src/core/mtoPoItemAllocation.js:222-224`). Em prova isolada, uma MTO e um PO Item com IDs válidos, quantidade válida e ambos sem `projectId` produziram `valid: true`. Isso é uma lacuna de cobertura da validação, não um corpo truncado nem parâmetro ausente.

**Chamadas de produção:** não há import direto fora do próprio módulo. É chamada por `validateMtoPoItemAllocationBatch` em `src/core/mtoPoItemAllocation.js:256`; portanto está viva indiretamente no fluxo de persistência.

**Testes diretos:** `tests/mtoPoItemAllocation.test.mjs:16-55`.

### `validateMtoPoItemAllocationBatch({ allocations = [], mtoItems = [], poItems = [], existingAllocations = [] } = {})`

**O que o nome indica:** validar um lote, considerando o efeito cumulativo de cada alocação sobre as seguintes.

**O que o corpo faz:** indexa MTOs e PO Items, remove das existentes os mesmos IDs que estão sendo atualizados, valida as alocações em ordem e acrescenta cada entrada aceita ao conjunto usado pela próxima validação.

**Retorno:**

```text
{
  valid,
  results,
  errors
}
```

`results` preserva `index`, `allocation` e todos os campos da validação individual; `errors` acrescenta o índice da entrada.

**Completude:** completa e coerente com o nome. O acúmulo sequencial permite detectar excesso/duplicidade produzidos dentro do próprio lote.

**Chamadas de produção:** importada por `src/data/mtoPoItemAllocations.js:7` e chamada em `src/data/mtoPoItemAllocations.js:106`, antes dos `put` da transação de persistência.

**Teste direto:** `tests/mtoPoItemAllocation.test.mjs:57-84`. O caminho integrado também é coberto por `tests/mtoPoItemAllocationsData.test.mjs`.

### `buildMtoProcurementCoverage({ mtoItems = [], purchaseOrders = [], poItems = [], allocations = [], receipts = [], receiptLines = [], materialUnits = [] } = {})`

**O que o nome indica:** construir a cobertura de Procurement para cada demanda MTO.

**O que o corpo faz:**

- ignora receipts cancelados e alocações canceladas;
- agrupa Material Units por receipt line e receipt lines por PO Item;
- distribui recebimento e aceite proporcionalmente entre as alocações do PO Item;
- calcula demanda, alocado, recebido, aceito, pendência de compra e de recebimento;
- classifica o status operacional;
- devolve uma linha de cobertura para cada MTO de entrada.

**Retorno por MTO:** contém `mtoItem`, `unitOfMeasure`, `demandQuantity`, `allocatedQuantity`, `receivedQuantity`, `acceptedQuantity`, `pendingPurchaseQuantity`, `pendingReceiptQuantity`, `status` e `allocations`. Cada detalhe de allocation contém a alocação, PO Item, Purchase Order, receipt lines, Material Units e quantidades recebida/aceita.

**Completude:** completa e coerente com o nome. Não há ramo sem retorno dentro do `map`, e o array final sempre é devolvido.

**Chamadas de produção:** importada por `src/data/mtoPoItemAllocations.js:6` e chamada em `src/data/mtoPoItemAllocations.js:156` por `listMtoProcurementCoverage`. Essa função de dados é importada em `src/main.js:152`, repassada à página em `src/main.js:1049` e consumida por `src/ui/mtoPage.js:489` e `src/ui/mtoPage.js:1816`.

**Testes diretos:** `tests/mtoPoItemAllocation.test.mjs:86-131`, incluindo rateio proporcional e receipt line legado sem Material Units.

## Constante exportada

### `MTO_PO_ITEM_ALLOCATION_STATUS`

Não é função, mas faz parte da API pública. Expõe `ACTIVE` e `CANCELLED` (`src/core/mtoPoItemAllocation.js:1-4`). É usada internamente e importada pelo adaptador `src/data/mtoPoItemAllocations.js:5`, que a usa para normalização, gravação ativa e cancelamento (`:37`, `:103`, `:128`). A declaração está completa.

## 3. Mapa de imports e chamadas atuais

| Consumidor | Importa/usa | Situação |
|---|---|---|
| `src/main.js:140` | `mtoDemandQuantity`, `suggestMtoPoItemAllocationsByIdentCode` | Ativo; injeta ambos em `mtoPage.js`. |
| `src/ui/mtoPage.js:500,524` | funções recebidas via `options` | Ativo; sugestão automática e saldo da demanda no modal MTO × PO. |
| `src/core/reportCalculations.js:1` | `mtoDemandQuantity`, `suggestMtoPoItemAllocationsByIdentCode` | Ativo; cálculo de pendência e sugestões de cobertura em Reports. |
| `src/data/mtoPoItemAllocations.js:4-8` | status, cobertura e validação em lote | Ativo; validação pré-write, normalização de status e consulta de cobertura. |
| `src/core/mtoPoItemAllocation.js:256` | `validateMtoPoItemAllocation` | Ativo internamente através da validação em lote. |
| `tests/mtoPoItemAllocation.test.mjs:2-8` | todas as funções exportadas | Cobertura direta de unidade. |
| `tests/mtoPoItemAllocationsData.test.mjs` | adaptador de dados que usa o core | Cobertura integrada de persistência. |

Nenhuma função exportada está órfã no código atual.

## 4. Resultado objetivo das perguntas

1. **Função truncada, chave não fechada ou return externo ausente:** não encontrado.
2. **Parâmetros faltando:** não encontrado na assinatura nem nos consumidores atuais.
3. **Objeto retornado incompleto:** não encontrado em relação aos contratos usados hoje.
4. **Corpos coerentes com os nomes:** sim, para as cinco funções exportadas.
5. **Lacunas reais, mas não truncamento:** ausência de exigência de projeto no validador individual e falha de normalização da unidade Unicode `M²`.
6. **Chamadas atuais:** todas as funções exportadas têm uso de produção direto ou indireto; nenhuma está órfã.

## Validação executada

- `node --check src/core/mtoPoItemAllocation.js` — aprovado.
- `node --test tests/mtoPoItemAllocation.test.mjs tests/mtoPoItemAllocationsData.test.mjs` — 2 testes aprovados, 0 falhas.
- Nenhuma correção foi aplicada.
