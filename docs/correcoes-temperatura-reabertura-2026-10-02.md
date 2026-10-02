# Diagnóstico e correções — BPMA/KPlatz

## Temperatura

A consulta somente leitura ao Railway encontrou 19 registros cujo status não é CRITICO,
mas cuja ação salva contém "Transferir insumos". Exemplos: IDs 3351, 3322 e 3284,
todos em ALERTA. As regras ativas de refrigeração classificam 5 a 8 °C como ALERTA
e a partir de 8,1 °C como CRITICO. Os limites configurados não foram alterados.

O relatório mensal e o histórico usam a ação armazenada, sem recalcular a temperatura.
A causa estava em `correctiveActionWithPersistence`: ao detectar ALERTA em turnos
consecutivos do mesmo equipamento, retornava a ação da regra CRITICO, mantendo
o status ALERTA. A função é compartilhada pelo formulário e pelas actions; uma
prévia carregada antes de outra aferição pode divergir da avaliação no momento do salvamento.

A persistência agora mantém ALERTA e orienta manutenção, sem transferência:
"Variação aceitável persistente entre turnos. Acionar a manutenção."
A primeira variação mantém a orientação configurada original. CRITICO continua
dependendo exclusivamente da regra correspondente à temperatura medida.

Os 19 registros antigos foram preservados. Sua correção retroativa exige análise
e autorização separada; esta entrega não executa updates em produção.

## Reabertura mensal

Foram auditados Hortifruti, Temperatura, Óleo, Buffet/Amostras, Rastreabilidade,
Limpeza Diária e Limpeza Semanal. As sete actions antigas consultavam somente
os fechamentos específicos. Os sete fechamentos de setembro de 2026 em produção
estão em `FechamentoMensalModulo`; assim, as actions antigas não os reconheciam.
Os componentes antigos de confirmação não estão conectados às páginas atuais.

O componente compartilhado do histórico agora mostra o estado do período e a
confirmação de reabertura para DEV. Tanto a nova action quanto as antigas usam
uma operação compartilhada, que exige DEV e permissão do módulo no servidor.

A transação serializable arquiva integralmente os fechamentos anteriores em
`LogAssinatura.observacao`, como JSON com `operacao: REABERTURA_MENSAL`.
O log contém usuário, perfil, horário, módulo e referência mês/ano, usando
o tipo existente FECHAMENTO_MENSAL. O fechamento específico passa a ABERTO;
o marcador genérico ativo é removido somente após o arquivamento, permitindo
uma nova assinatura pelo fluxo existente. Os logs anteriores, assinaturas
diárias e registros operacionais permanecem intactos.

Falha na auditoria ou em qualquer etapa desfaz toda a operação. Outros módulos,
meses e tipos de limpeza não são alterados. Após o sucesso, são invalidados
os caches do módulo/histórico, dashboard e relatórios, com feedback por redirect.

Nenhuma migration é necessária. Nenhum fechamento de produção foi reaberto
durante o desenvolvimento. As alterações precisam seguir o deploy normal.

## Validação

- `scripts/test-client-corrections.cjs`: classificação, ações, independência entre
  equipamentos, prévia, histórico, relatório, horários e preservação do histórico.
- `scripts/test-monthly-reopening.cjs`: sete módulos; estruturas genérica,
  específica e ambas; DEV e bloqueio de outros perfis; confirmação; auditoria;
  preservação; rollback; reabertura e nova assinatura; isolamento de períodos.
- `scripts/test-bpma-adjustments.cjs`: fotos, obrigatoriedade, filtros e regressões.
- `scripts/test-recebimento-sem-fabricacao.cjs`: regressões de Rastreabilidade.
- `scripts/test-client-corrections-print.cjs`: PDF real em navegador isolado,
  controles de impressão, ausência de overflow e paginação original.

Os testes operacionais usam adaptadores isolados, sem writes no Railway.

## Arquivos alterados

- `src/app/controle-temperatura-equipamentos/persistence.ts`
- `src/app/controle-temperatura-equipamentos/actions.ts`
- `src/app/controle-qualidade-oleo/actions.ts`
- `src/app/controle-buffet-amostras/actions.ts`
- `src/app/higienizacao-hortifruti/actions.ts`
- `src/app/rastreabilidade-recebimento/actions.ts`
- `src/app/plano-limpeza/actions.ts`
- `src/app/historico-operacional/actions.ts`
- `src/components/historico/technical-signature.tsx`
- `src/components/historico/reopen-month-form.tsx` (novo)
- `src/lib/monthly-reopening.ts` (novo)
- `scripts/test-client-corrections.cjs`
- `scripts/test-monthly-reopening.cjs` (novo)
- Este diagnóstico (novo).
