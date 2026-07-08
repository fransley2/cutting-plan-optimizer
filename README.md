# Cutting Plan Optimizer — v2 (Saipem CTCO)

Reestruturação do app original (arquivo único de ~3000 linhas) em módulos ES nativos,
sem build step, sem framework. Abrir com Live Server (VS Code) ou `python -m http.server`
— **não** abrir com `file://` direto, pois ES modules exigem HTTP.

## Estrutura

```
index.html                 shell HTML, só estrutura
src/
  styles/
    tokens.css              cores, fontes, espaçamento (fonte única de verdade do design)
    app.css                 componentes: card, KPI, tabela, filtro, botão, diagrama de corte
  core/
    utils.js                helpers puros (parse, format, id)
    allocate.js              ← MOTOR DE OTIMIZAÇÃO (FFD/BFD), 100% portado, sem DOM
  ui/
    dataTable.js             tabela editável genérica (substitui createStockRow/createPartRow duplicados)
    columns.js               config de colunas de Estoque e Peças (dados, não código)
    results.js               renderização de KPIs + diagrama de corte
    toast.js
  data/
    plans.js                 salvar/carregar planos (localStorage)
    excel.js                 import/export via SheetJS
  main.js                    único ponto de wiring (event listeners)
```

## Por que essa estrutura (aplicando as 7 perguntas em cada decisão)

- **Sem React/Vue/build step.** O app é majoritariamente formulário + tabela + um
  diagrama SVG-like em `div`s. ES modules nativos do navegador já dão import/export,
  escopo e organização — um framework aqui seria peso sem ganho (pergunta 1: *does this
  need to exist?* → não).
- **Sem Tailwind CDN.** Você tem um design system fechado e específico (cores exatas,
  fonte exata, componentes Fluent/Power BI). Um utility-framework genérico não ajuda
  aqui — ele existia no original só por conveniência inicial. `tokens.css` + `app.css`
  são ~230 linhas e cobrem 100% da UI, com controle total sobre o resultado visual.
- **SheetJS (xlsx) mantido.** Parsing de planilha é complexo o suficiente para não
  reinventar (pergunta 5: *installed dependency? → use it*).
- **`allocate.js` sem `Promise`.** O original envolvia o algoritmo síncrono em uma
  `Promise` sem motivo (não há nada assíncrono). Isso foi removido. Se um plano muito
  grande travar a UI no futuro, a solução correta é um Web Worker — não uma Promise
  decorativa.
- **`crypto.randomUUID()`** no lugar do gerador de UUID manual do original — plataforma
  nativa faz isso melhor (pergunta 4).
- **`structuredClone()`** no lugar de `JSON.parse(JSON.stringify(...))` — mesma lógica,
  nativo do navegador.
- **Uma tabela genérica (`dataTable.js`)** no lugar de duas implementações quase
  idênticas (`createStockRow`, `createPartRow` no original, ~160 linhas somadas).
  Agora é ~100 linhas reutilizáveis + duas listas de colunas de ~10 linhas cada.

## O que já funciona nesta v2

- Sidebar + top app bar (navegação por âncora entre as seções)
- Dados do Projeto (Projeto, Cliente, Equipamento, Workpack)
- Cadastro de Estoque e Peças (tabela editável, colar do Excel, duplicar/excluir linha)
- Upload de planilha .xlsx/.csv para Estoque e Peças
- Motor de otimização completo (FFD + BFD, kerf, retalho mínimo, aparo, estratégias de
  uso de estoque)
- Resultados: KPIs (estilo Power BI) + diagrama de corte por barra
- Export para Excel do plano otimizado
- **Salvar / Carregar Plano** — modal genérico (`ui/modal.js`) + listagem com busca
  (`ui/planListModal.js`), persistindo em `localStorage` via `data/plans.js`

## O que ainda falta portar do arquivo original

Cada um destes deve seguir o mesmo padrão: lógica pura em `core/` ou `data/`, DOM em
`ui/`, sem misturar.

1. **Importar Cupom de Material** (parsing de célula por endereço/label no Excel) —
   pode virar `data/couponImport.js`, função pura que recebe o worksheet e devolve um
   objeto de dados do projeto.
2. **Inventário via IndexedDB** — vale um módulo `data/inventoryDB.js` com as mesmas
   4 funções do original (init, save, get, clear), mais um modal reaproveitando
   `dataTable.js` (mesma estrutura de tabela genérica) e `ui/modal.js` (já pronto).
3. **Impressão (visual / tabular / cutting sheet / pro-style)** — cada modo de
   impressão pode virar uma função em `reports/print*.js` que monta HTML a partir da
   `solution` (mesmo formato de dados que `results.js` já usa) — reaproveita 100% do
   `allocate.js`.
4. **Geração de etiquetas** — `reports/labels.js`, mesma ideia.
5. **i18n** — o original tem 4 idiomas com muita string duplicada. Antes de portar,
   vale confirmar: os 4 idiomas são realmente usados na operação, ou só en/pt-br
   cobrem 100% dos casos reais? (pergunta 1 da sua regra). Se sim, um
   `i18n/translations.js` simples com `{ en: {...}, 'pt-br': {...} }` resolve.
6. **Toggle de labels / cor / fonte no diagrama** — são flags de estado simples,
   cabem como parâmetros extras em `renderCutSheets(container, solution, options)`.

## Próximo passo sugerido no Codex/VS Code

Abra este projeto e peça, item por item da lista acima, aplicando a mesma regra das
7 perguntas antes de cada função nova. O algoritmo (`allocate.js`) e o design system
(`tokens.css`/`app.css`) não devem mudar — são a base estável do resto.
