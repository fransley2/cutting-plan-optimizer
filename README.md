# Cutting Plan Optimizer — SAIPEM CTCO

Aplicação web para planejamento de corte, gestão de materiais e fluxo de fabricação.
É construída com JavaScript e ES Modules nativos, sem framework e sem etapa de build.

## Executar localmente

Use um servidor HTTP local; não abra o `index.html` diretamente com `file://`.

```powershell
python -m http.server 8000
```

Depois, abra `http://localhost:8000` em uma versão atual do Microsoft Edge ou Google
Chrome. A sincronização por pasta compartilhada depende da File System Access API.

## Funcionalidades principais

- projetos, equipamentos, desenhos e MTO;
- compras, previsões de entrega e recebimento de materiais;
- inventário, reservas, movimentos de estoque e rastreabilidade;
- Workpacks, Material Coupons, Cutting Sheets e RMV;
- otimização FFD/BFD com kerf, trim, offcuts e múltiplas passagens;
- relatórios operacionais, impressão, etiquetas e exportações Excel/PDF;
- identidade multiusuário por sessão e trilha de auditoria;
- IndexedDB como banco local de trabalho;
- sincronização opcional entre usuários por pasta de rede compartilhada.

## Arquitetura

```text
index.html                    shell da aplicação
src/
  core/                       regras de domínio e otimização
    allocate.js               motor puro de nesting; não acessa DOM ou persistência
    fileAdapters/             interface de arquivos, adapter web e stub Electron
    syncManager.js            versões, conflitos, locks, heartbeat e watchers
  data/                       IndexedDB, importação, exportação e metadados
  ui/                         páginas, componentes e interação com o usuário
  reports/                    relatórios, impressão e apresentações
  workflows/                  transações e fluxos entre módulos
  styles/                     tokens e componentes visuais
tests/                        testes Node sem build step
```

O IndexedDB continua sendo a cópia rápida de trabalho. Regras de negócio não ficam
misturadas com renderização, e `src/core/allocate.js` permanece isolado como motor puro
de otimização.

## Sincronização por pasta compartilhada

A sincronização permite usar uma pasta UNC ou unidade mapeada selecionada pelo picker
do navegador como alternativa a um backend em nuvem.

- a pasta é selecionada com `showDirectoryPicker()` e o directory handle é persistido
  no IndexedDB;
- a aplicação valida permissão de escrita antes de salvar a configuração;
- cada store sincronizável possui seu próprio arquivo JSON versionado;
- antes de gravar, o `SyncManager` relê a versão remota e bloqueia sobrescritas quando
  detecta conflito;
- falhas de rede ou permissão mantêm o trabalho local e colocam o indicador em modo
  offline;
- a pill da topbar mostra os estados sincronizado, pendente, sincronizando, bloqueado,
  editando em outra aba e offline;
- o popover informa pendências, último sync, pasta selecionada e ações disponíveis.

### Locks

Ao editar uma área sincronizada, o sistema cria um arquivo `.lock` ao lado do JSON.
O lock contém `userId`, `userName`, `acquiredAt` e `sessionId`, recebe heartbeat e
expira após 15 minutos sem atualização.

A identidade do navegador/dispositivo é persistida em `localStorage`; a sessão da aba
fica em `sessionStorage`, sobrevivendo a reloads sem confundir abas diferentes. Quando
o mesmo usuário encontra um lock de outra aba ou dispositivo, a UI oferece **Assumir
aqui**. Locks de outro usuário permanecem somente leitura e podem ser liberados por uma
ação administrativa confirmada.

O arquivo de dados é observado por polling leve e o arquivo de lock por polling mais
curto. A expiração também é verificada em memória, permitindo atualizar a UI sem uma
nova tentativa explícita de edição.

> A File System Access API expõe o nome do directory handle, mas não fornece ao
> JavaScript o caminho UNC completo selecionado.

## Testes

Execute toda a suíte com:

```powershell
node --test
```

Os testes incluem otimização, persistência, transações, importações, relatórios,
conflitos de versão, onboarding da pasta compartilhada, operação offline e ciclo de
vida dos locks.

## Compatibilidade e restrições

- JavaScript ES Modules, HTML e CSS nativos;
- sem framework de UI e sem build step;
- File System Access API suportada principalmente por navegadores Chromium;
- o adapter Electron existe apenas como interface preparada para integração futura;
- `legacy/original.html` é somente uma referência histórica e não é executado.
