# MIGRATION.md

## Objetivo

Controlar a migração do arquivo legado para a v2 modular.

O arquivo legado analisado nesta rodada foi:

- `legacy/Cutting Plan Optimizer.html`

Este arquivo contém uma tentativa de adicionar um **gerenciador de inventário em Excel com IndexedDB**, mas a implementação foi feita dentro do HTML monolítico. A função deve ser aproveitada como referência, não copiada diretamente para a v2.

---

## Regra geral

O arquivo legado é somente referência.

Não importar, executar ou colar grandes blocos do legado dentro da v2.

Ao migrar qualquer função:

1. Identificar o comportamento no legado.
2. Verificar se já existe equivalente na v2.
3. Reaproveitar módulo existente.
4. Separar lógica pura de DOM.
5. Colocar persistência em `src/data/`.
6. Colocar renderização/interação em `src/ui/`.
7. Conectar no `src/main.js`.
8. Testar no navegador.
9. Atualizar este arquivo.

---

## Diagnóstico desta rodada

### O que foi adicionado no arquivo quebrado

Foi adicionado um fluxo de **Material Inventory com IndexedDB**, composto por:

- botão `Import Inventory` na seção de estoque;
- modal `inventory-modal`;
- upload de arquivo `.xlsx`, `.xls` ou `.csv`;
- parsing de planilha via SheetJS;
- mapeamento fixo de colunas por índice;
- persistência local em IndexedDB;
- busca no inventário carregado;
- seleção em massa;
- adição dos materiais selecionados na tabela de estoque.

### Funções novas detectadas

| Função / Bloco | Tipo | Status | Destino correto na v2 | Observação |
|---|---:|---:|---|---|
| `initDB()` | Persistência | Pendente | `src/data/inventoryDB.js` | Inicializa IndexedDB `NestingAppDB`, store `inventory`, keyPath `trace`. |
| `saveInventoryToDB(data)` | Persistência | Pendente | `src/data/inventoryDB.js` | Salva inventário no IndexedDB. Hoje limpa o store inteiro antes de salvar. |
| `getInventoryFromDB()` | Persistência | Pendente | `src/data/inventoryDB.js` | Retorna todos os itens salvos. Deve garantir DB inicializado antes da leitura. |
| `clearInventoryDB()` | Persistência | Pendente | `src/data/inventoryDB.js` | Limpa o store `inventory`. |
| `COL` mapping | Parsing Excel | Pendente | `src/data/inventoryColumns.js` ou `src/data/inventoryImport.js` | Mapeamento fixo: trace A, categoria D, comprimento J, heat X, material Y, PO Q, item R, qty AH. |
| parsing dentro de `invFileInput.addEventListener('change')` | Parsing Excel | Pendente | `src/data/inventoryImport.js` | Deve virar função pura: `parseInventoryWorkbook(fileOrRows)`. |
| `renderInventoryTable(data)` | UI | Pendente | `src/ui/inventoryModal.js` | Hoje usa `innerHTML` com dados importados. Na v2 deve usar `createElement`, `textContent` ou `dataTable.js`. |
| `invSearchInput.addEventListener('input')` | UI/Filtro | Pendente | `src/ui/inventoryModal.js` | Pode usar função pura `filterInventoryItems(items, term)`. |
| `selectAllInv.addEventListener('change')` | UI | Pendente | `src/ui/inventoryModal.js` | Controle de seleção do modal. |
| `addInvBtn.addEventListener('click')` | Integração UI → Estoque | Pendente | `src/main.js` | Deve chamar `stockTable.addRow(mapInventoryItemToStockRow(item))`, não montar `tr.innerHTML`. |
| `closeInvModal()` | UI | Pendente | `src/ui/inventoryModal.js` | Pode reaproveitar `src/ui/modal.js`. |
| HTML `#inventory-modal` | UI | Pendente | `index.html` ou template em `src/ui/inventoryModal.js` | Melhor gerar via componente/template, não colar bloco Tailwind no shell. |
| botão `#import-inventory-btn` | UI | Pendente | `index.html` | Deve entrar na seção de estoque da v2 com classes do design system, não Tailwind. |

---

## Prováveis causas da quebra

### 1. A função foi adicionada no monólito, não na arquitetura modular

A v2 atual foi desenhada com:

- `src/data/` para persistência e Excel;
- `src/ui/` para renderização;
- `src/main.js` para wiring;
- `dataTable.js` como tabela genérica.

O inventário foi adicionado como bloco direto dentro do HTML antigo, misturando IndexedDB, parsing Excel, renderização e eventos no mesmo lugar.

### 2. Referências de DOM podem estar ausentes na v2

A lógica nova usa estes IDs diretamente:

- `inventory-modal`
- `inventory-search`
- `inventory-table-body`
- `select-all-inventory`
- `close-inventory-modal`
- `cancel-inventory-selection`
- `add-selected-to-stock`
- `upload-inventory-btn`
- `clear-db-btn`
- `inventory-file-input`
- `inventory-file-name`

Se qualquer um desses IDs não existir no `index.html` da v2, o app quebra ao executar `addEventListener` em `null`.

### 3. IndexedDB é usado sem garantia de inicialização

O legado faz:

```js
window.addEventListener('load', initDB);
```

Mas as funções `getInventoryFromDB`, `saveInventoryToDB` e `clearInventoryDB` usam `db.transaction(...)` assumindo que `db` já existe.

Na v2, o correto é:

```js
await initInventoryDB();
```

antes de abrir, salvar, ler ou limpar o inventário.

### 4. A adição ao estoque ignora `dataTable.js`

O legado cria uma linha assim:

```js
const newRow = document.createElement('tr');
newRow.innerHTML = `...`;
stockList.appendChild(newRow);
```

Na v2 isso deve ser:

```js
stockTable.addRow(mapInventoryItemToStockRow(selectedItem));
```

Caso contrário, a tabela genérica é contornada, e o app pode ficar inconsistente.

### 5. Os nomes dos campos não batem com o modelo de estoque

O inventário usa:

```js
{
  material,
  heat,
  desc,
  trace
}
```

A tabela de estoque da v2 espera:

```js
{
  materialGrade,
  heatNumber,
  description,
  traceability
}
```

Por isso é necessário um mapper explícito:

```js
function mapInventoryItemToStockRow(item) {
  return {
    po: item.po,
    item: item.item,
    qty: Number(item.qty) || 1,
    length: Number(item.length) || 0,
    materialGrade: item.material,
    heatNumber: item.heat,
    description: item.desc,
    traceability: item.trace,
  };
}
```

### 6. `innerHTML` com dados vindos de Excel é inseguro e frágil

O Excel pode conter aspas, tags, símbolos ou conteúdo inesperado.

Na v2, não montar células com interpolação direta:

```js
row.innerHTML = `${item.desc}`;
```

Preferir:

```js
cell.textContent = item.desc;
```

ou reaproveitar `dataTable.js`.

---

## Mapa de migração atualizado

| Recurso | Status atual | Próximo destino | Prioridade |
|---|---:|---|---:|
| Motor de otimização | Migrado | `src/core/allocate.js` | Base estável |
| Upload estoque Excel | Migrado | `src/data/excel.js` + `src/main.js` | Base estável |
| Upload peças Excel | Migrado | `src/data/excel.js` + `src/main.js` | Base estável |
| Export Excel | Migrado | `src/data/excel.js` | Base estável |
| Salvar/carregar plano | Migrado | `src/data/plans.js` + `src/ui/planListModal.js` | Base estável |
| Gerenciador de inventário Excel | Detectado no legado quebrado | `src/data/inventoryImport.js`, `src/data/inventoryDB.js`, `src/ui/inventoryModal.js` | Alta |
| Botão Import Inventory | Detectado no legado quebrado | `index.html` + `src/main.js` | Alta |
| Modal Material Inventory | Detectado no legado quebrado | `src/ui/inventoryModal.js` ou template dedicado | Alta |
| Busca no inventário | Detectado no legado quebrado | `src/ui/inventoryModal.js` | Média |
| Selecionar tudo no inventário | Detectado no legado quebrado | `src/ui/inventoryModal.js` | Média |
| Adicionar selecionados ao estoque | Detectado no legado quebrado | `src/main.js`, usando `stockTable.addRow()` | Alta |
| Importar Cupom de Material | Pendente | `src/data/couponImport.js` | Média |
| Impressão visual/tabular/cutting/pro | Pendente | `src/reports/` | Média |
| Etiquetas | Pendente | `src/reports/labels.js` | Baixa |
| i18n | Pendente | `src/i18n/translations.js` | Baixa |

---

## Plano correto para migrar o inventário

### Etapa 1 — Criar persistência

Criar:

```txt
src/data/inventoryDB.js
```

Com funções:

```js
export async function initInventoryDB() {}
export async function saveInventoryItems(items) {}
export async function getInventoryItems() {}
export async function clearInventoryItems() {}
```

### Etapa 2 — Criar parser do Excel

Criar:

```txt
src/data/inventoryImport.js
```

Com funções:

```js
export function parseInventoryRows(rows) {}
export function mapInventoryItemToStockRow(item) {}
```

### Etapa 3 — Criar UI do modal

Criar:

```txt
src/ui/inventoryModal.js
```

Com função principal:

```js
export function openInventoryModal({
  items,
  onUpload,
  onClear,
  onAddSelected
}) {}
```

### Etapa 4 — Conectar no `main.js`

No `main.js`:

```js
import { initInventoryDB, getInventoryItems, saveInventoryItems, clearInventoryItems } from './data/inventoryDB.js';
import { parseInventoryRows, mapInventoryItemToStockRow } from './data/inventoryImport.js';
import { openInventoryModal } from './ui/inventoryModal.js';
```

E adicionar:

```js
await initInventoryDB();
```

antes de usar o inventário.

### Etapa 5 — Adicionar botão no `index.html`

Adicionar na seção de estoque:

```html
<button class="btn btn-secondary" id="import-inventory-btn">Importar Inventário</button>
```

Não usar classes Tailwind na v2.

---

## Prompt para Codex

Use este prompt para migrar o inventário sem quebrar o app:

```txt
Use `legacy/Cutting Plan Optimizer.html` only as reference.

Task: migrate the Material Inventory feature into the modular v2 app.

Do not copy the legacy block directly.

Expected behavior:
- User clicks `Importar Inventário`.
- App opens an inventory modal.
- User uploads an Excel inventory file.
- App parses rows using the legacy column mapping.
- App saves parsed inventory into IndexedDB.
- App lists inventory items in the modal.
- User can search inventory items.
- User can select one or more inventory items.
- User can add selected items into the stock table.
- Added items must use `stockTable.addRow()`.
- Do not use `innerHTML` for imported Excel values.

Create:
- `src/data/inventoryDB.js`
- `src/data/inventoryImport.js`
- `src/ui/inventoryModal.js`

Modify only:
- `index.html`
- `src/main.js`
- `legacy/MIGRATION.md`

Rules:
- Do not change `src/core/allocate.js`.
- Do not change the optimizer behavior.
- Do not add framework.
- Do not add build step.
- Do not use Tailwind classes.
- Reuse `src/ui/modal.js` and `src/ui/dataTable.js` if practical.
- Keep IndexedDB logic isolated from UI.
- Keep Excel parsing isolated from UI.
- Keep DOM event wiring in `main.js`.

After coding:
- Explain changed files.
- Explain how to test.
- Confirm optimize/export/save/load still work.
```

---

## Status final desta análise

O inventário deve ser migrado, mas não deve ser mantido como bloco colado dentro do HTML.

Status recomendado:

```txt
Gerenciador de Inventário Excel / IndexedDB: Detectado, não migrado, pendente refatoração modular.
```
