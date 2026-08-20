# Teste manual das decisões de importação MTO

Use um projeto exclusivo de teste. Os arquivos são UTF-8 e usam `;` como separador.

## Preparação

1. Selecione um projeto de teste na aplicação.
2. Importe `tests/fixtures/mto-decisions-base.csv`.
3. Confirme a importação e verifique que as três linhas foram gravadas.
4. Importe `tests/fixtures/mto-decisions-conflicts.csv`.
5. Confirme que o modal **Revisar conflitos da importação** apresenta exatamente:
   - uma linha em **Mesma revisão alterada**: `DWG-MTO-DEC-001 | MARK-SAME-001 | 10`, revisão `A → A`;
   - uma linha em **Revisão mais antiga**: `DWG-MTO-DEC-002 | MARK-OLDER-001 | 20`, revisão `B → A`;
   - uma linha em **Revisão não reconhecida**: `DWG-MTO-DEC-003 | MARK-UNKNOWN-001 | 30`, revisão `A → IFC`.
6. Na primeira linha, confirme que as diferenças mostram quantidade `4 → 6`, comprimento `1000 → 1200`, material `S32750 → S32760` e descrição alterada.

## Ações

Repita o preparo antes de cada cenário ou restaure o banco do projeto de teste ao estado posterior à importação base.

### Cancelar importação

1. Clique em **Cancelar importação**.
2. Espere: nenhuma linha do segundo arquivo gravada, nenhum Drawing criado pelo segundo fluxo e todos os itens existentes inalterados.

### Continuar sem resolver pendências

1. Deixe as três linhas como **Deixar pendente**.
2. Clique em **Continuar sem resolver pendências**.
3. Espere: nenhum item do segundo arquivo importado, nenhuma pendência em `toSupersede`, nenhum item existente alterado e mensagem informativa de zero itens.

### Manter existente

1. Selecione **Manter existente** nas três linhas.
2. Clique em **Aplicar decisões e continuar**.
3. Espere: nenhuma linha nova gravada, nenhum item existente alterado, `keptExisting = 3` no resumo da sessão e nenhum ID em `itemsToSupersede`.
4. Como não existe batch novo nesse cenário, o resumo de decisão permanece somente na sessão; nenhum item existente é alterado para registrar a escolha.

### Corrigir como nova revisão

1. Em `MARK-SAME-001`, selecione **Corrigir como nova revisão**.
2. Informe `B` em **Nova revisão**.
3. Deixe as outras duas linhas pendentes e aplique.
4. Espere: a linha corrigida é reanalisada, entra como revisão mais nova e o item `A` anterior entra em `itemsToSupersede`.
5. Repita usando `A`, `0` ou `IFC`: a linha deve continuar bloqueada quando a revisão não for comprovadamente mais nova.

### Corrigir revisão não reconhecida

1. Em `MARK-UNKNOWN-001`, selecione **Corrigir revisão**.
2. Informe `B` em **Nova revisão**.
3. Deixe as outras linhas pendentes e aplique.
4. Espere: somente a revisão `B`, comprovadamente mais nova que `A`, pode entrar e superseder o item anterior.
5. Repita com `A`, `0` e `IFC`: revisão igual, antiga ou ainda desconhecida deve permanecer pendente.

## Verificação final

1. Confira o resumo final: linhas importadas, itens superseded, duplicados ignorados, itens mantidos e pendências restantes.
2. Em DevTools, abra **Application → IndexedDB → NestingAppDB**.
3. Verifique `mtoItems`: somente linhas seguras/corrigidas devem aparecer; pendências não resolvidas não devem existir como novos registros.
4. Verifique `mtoBatches`: não deve existir batch vazio para Cancelar, Continuar sem linhas seguras ou somente Manter existente.
5. Verifique `auditLog`: não deve existir evento de importação nesses três cenários sem commit. Quando houver revisão corrigida importada, confira o resumo `metadata.importDecisions` sem snapshots completos.
