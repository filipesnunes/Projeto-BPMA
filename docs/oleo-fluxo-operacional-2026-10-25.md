# Etapa 3 — Controle da Qualidade do Óleo e fluxo operacional

Implementado em `A:\Projeto-BPMA-KPlatz`, branch `main`, a partir do Git limpo após a etapa 2. O tenant-refactor não foi acessado. Esta etapa integra exclusivamente Óleo; os arquivos do módulo de Temperatura e do núcleo `src/lib/operational-workflow` não foram modificados.

## Revisão e componentes reutilizados

Reutilizados `saveWorkflow`, `signWorkflow`, `reopenWorkflow`, as políticas de autorização/data/reabertura, versões, eventos imutáveis, assinaturas e vínculos explícitos. Reutilizados também o helper existente de recarga transacional de sessão/permissões, exclusão auditada, fechamento mensal e filtro central de registros ativos.

O formulário mantém `OilRegisterFields`, imagens da fita, regras canônicas, indicação sanitária, alerta de temperatura crítica e previsão de próxima fita. O payload existente foi extraído para `record-payload.ts`, aceitando o cliente Prisma da transação. Não foram alterados limites ou parâmetros sanitários.

A revisão confirmou:

- Temperatura obrigatória quando há utilização; fita opcional.
- Leitura de fita exige pelo menos 120°C; temperatura crítica continua acima de 180°C.
- Resultado sanitário deriva da fita e permanece separado do estado operacional.
- Não utilização dispensa temperatura/fita/horário.
- Previsão da fita continua em três dias após a última aferição válida. É uma indicação, não geração automática de procedimentos.
- Assinatura individual é revisão do supervisor (`assinar_historico`, log SUPERVISOR).
- Assinatura diária é revisão agrupada por responsável técnico (`assinar_dia`, log RESPONSAVEL_TECNICO). Não equivale ao fechamento mensal.

## Unidade, estados e salvamento progressivo

`oilAdapter` usa uma chave estável formada pela data selecionada e UUID. A primeira conclusão cria o registro definitivo, ligado por `fluxoId`; os salvamentos posteriores atualizam a mesma projeção e geram novas versões. A data sozinha não identifica a unidade: podem existir várias verificações independentes no mesmo dia. Abrir a página não cria registro no banco.

| Estado | Significado | Fila principal |
|---|---|---|
| PENDENTE | Verificação iniciada e incompleta | Somente hoje |
| COMPLETO | Dados válidos, aguardando assinatura | Não; disponível no Histórico |
| FECHADO | Versão abrangida por assinatura vigente | Não; disponível no Histórico |
| REABERTO | Antes fechado, aguardando outra assinatura | Sim, inclusive de datas anteriores |

A passagem de dia não muda o estado. O rascunho preserva temperatura, fita, situação de utilização, observações, horário e justificativa disponíveis, sem criar valores fictícios. O botão Salvar preenchimento permite campos obrigatórios ausentes; Concluir preenchimento exige as informações aplicáveis. Dados inválidos são rejeitados. Um preenchimento completo salvo já recebe COMPLETO, sem ser automaticamente assinado.

Rascunhos ficam nas versões do fluxo, fora de medições válidas, relatórios e agregações. Ao tornar incompleto um registro antes completo, sua projeção anterior permanece preservada, mas sai das consultas operacionais até nova conclusão.

A data escolhida fica vinculada à unidade. Hoje, o horário continua automático na primeira conclusão e é preservado nas edições. Para retroativos, o horário real ou a declaração justificada de desconhecimento seguem as regras existentes. O timestamp efetivo do cadastro não é substituído pela data retroativa.

## Assinaturas, reabertura e segurança

As duas formas de validação mantêm senha e permissões próprias. A revisão individual abrange uma verificação; a diária fecha somente as unidades/versões explicitamente selecionadas, de uma única data. Cada assinatura registra mecanismo, responsável, data, log e vínculos. A diária não cria assinaturas individuais extras nem uma assinatura legada genérica que possa abranger registros futuros.

Reabertura exige confirmação explícita, justificativa, competência aberta, versão atual e `modulo.oleo.reabrir_registro`. Pelo botão Editar, exige também permissão de edição da data. Abrir a confirmação e Cancelar não mutam dados.

A assinatura anterior perde apenas a vigência; seus dados e vínculos ficam preservados. A reabertura cria nova versão e eventos atomicamente. Salvar mantém REABERTO. Outra assinatura é obrigatória mesmo sem alteração de conteúdo.

Sessão e permissões são recarregadas dentro da transação. Estado, versão, conteúdo, data e competência também são conferidos nela. A trava por módulo e transações Serializable são as mesmas do núcleo. Chamadas antigas de edição/assinatura individual não alteram registros gerenciados; criação antiga exige agora a identidade/versão do fluxo. A assinatura diária antiga direciona ao escopo versionado quando existem unidades gerenciadas naquele dia.

## Interface, histórico e relatórios

- Rota principal: somente verificações iniciadas pendentes de hoje e todos os reabertos. Sem pendências diárias fictícias.
- `/controle-qualidade-oleo/fluxo`: seleção da data, rascunho, conclusão, assinatura, confirmação de reabertura, exclusão e eventos.
- `/controle-qualidade-oleo/historico`: intervalo de datas, estados, resultado sanitário, responsável, assinatura vigente e seleção para revisão diária. Usuário sem consulta histórica fica limitado a hoje.
- `/controle-qualidade-oleo/legado`: controles anteriores de consulta, filtros, edição e exclusão, limitados a registros legados.
- `/controle-qualidade-oleo/historico/legado`: histórico anterior e fechamento mensal.

O colaborador autorizado continua editando COMPLETO de hoje antes da assinatura. Datas anteriores exigem a permissão retroativa; reabertura não concede automaticamente edição. As páginas são revalidadas após mutações.

O relatório mensal mantém layout e impressão. A assinatura exibida nas verificações gerenciadas vem da versão vigente; REABERTO mostra nova assinatura pendente. Dados, temperaturas, fita, responsáveis, observações e horário de referência são preservados. Rascunhos e excluídos não aparecem como procedimentos concluídos.

## Exclusão e fechamento mensal

A exclusão usa o serviço existente, exige perfil/permissão, justificativa, competência aberta e versão atual. FECHADO só pode ser excluído após reabertura. A exclusão lógica registra dados originais, usuário, horário e evento do fluxo; outras verificações da mesma data não são afetadas. Um novo procedimento recebe identidade própria.

O fechamento mensal mantém as regras anteriores, incluindo a possibilidade de fechar sem exigir assinatura adicional de todos os Completos. Óleo passa a usar o bloqueio compartilhado para REABERTOS aguardando nova assinatura. A trava comum impede fechamento simultâneo incoerente com a reabertura. Nenhum outro módulo recebeu alteração de política de permissões.

## Legados e migrations

`fluxoId = null` identifica registros legados, preservados nas consultas, relatórios e controles anteriores. Não houve criação de assinaturas retroativas, conversão em massa ou presunção de versões antigas. A nova reabertura versionada aplica-se às verificações iniciadas pelo novo fluxo.

Reutilizadas sem alterar SQL:

- `20261024000100_nucleo_fluxo_operacional`;
- `20261024000200_temperatura_fluxo_operacional`.

Nova migration aditiva: `20261024000300_oleo_fluxo_operacional`. Adiciona somente `fluxoId` opcional à tabela de registros de óleo, com índice único e FK para o núcleo. O relacionamento inverso no schema não cria outra coluna. Nenhum dado antigo recebe fluxo ou estado inventado.

A migration foi aplicada somente em PostgreSQL isolado. O teste estrutural compara todos os campos de um registro anterior com assinatura e a assinatura diária antes/depois, confirma vínculo nulo, FK e ausência de adoção histórica.

Não foi consultado ou alterado o banco de produção. Para publicar, a nova migration e suas dependências devem estar aplicadas antes de servir o código, pelo procedimento normal de Prisma Migrate (`npm run prisma:migrate:deploy`). Nenhuma migration foi aplicada pelo `.env` local.

## Validações

- `test-oil-workflow.cjs`: Prisma real/PostgreSQL 16 isolado; quatro estados, rascunhos recuperados, repetição sem duplicar, múltiplas verificações na mesma data, temperatura/fita/não utilização, horário retroativo/desconhecido, permissões, assinaturas individuais/agrupadas, versões antigas rejeitadas, reabertura e assinatura sem edição, exclusão/recadastro, relatório GET, legados e rollback por falha de auditoria.
- Concorrência real: dois salvamentos, assinatura contra edição, duas reaberturas e fechamento mensal contra reabertura. Um único vencedor e estado final coerente.
- `test-oil-workflow-migration.cjs`: PostgreSQL isolado via PGlite, preservação integral de dados legados/assinaturas e integridade estrutural.
- `test-oil-workflow-browser.cjs`: Next em modo produção local, login real e Edge headless; salvar/sair/retornar, concluir/Histórico, assinar/bloquear, cancelar, reabrir com motivo, editar mantendo REABERTO e assinar novamente. Relatório mensal e nove capturas a 1440/390/320 sem overflow; capturas inspecionadas visualmente.
- `test-temperature-workflow.cjs`: regressão integral do piloto com PostgreSQL real, incluindo concorrência.
- `test-operational-workflow.cjs`: contratos e políticas do núcleo.
- `test-monthly-reopening.cjs`: regressão de competências nos sete módulos.
- `test-retroactive-procedure-time.cjs`: ações atuais de Óleo/Temperatura em PostgreSQL e regressões de horários/relatórios e Hortifruti.
- `test-operational-record-controls.cjs`: exclusão/legados dos dez destinos e relatórios; tentativa de criação pelo formulário antigo sem versão rejeitada.
- Prisma generate, Prisma validate, lint, build e diff check.

Os testes usam bancos sintéticos `workflow_<timestamp>` em `127.0.0.1:55479`, no container de validação descrito nos scripts. Não usam a conexão do `.env`. Executar build antes dos testes que usam CSS compilado. A suíte de navegador usa a última base criada pela suíte de Óleo.

## Limites e publicação

A validação de ponta a ponta foi feita em ambiente isolado. Railway, sessões de usuários reais e implantação em produção não foram testados. A aplicação da migration em produção permanece pendente do fluxo de publicação autorizado pelo responsável.

Nenhum módulo administrativo ou adaptador dos cinco módulos restantes foi implementado. O módulo completo de Logs/Auditoria não foi desenvolvido. Evidências locais ficam em `.data/validation/oil-workflow/`, ignorado pelo Git.

Sem commit, push, deploy, seed, reset ou `prisma db push`. Arquivos mantidos no working tree para revisão.

## Arquivos desta etapa

- `docs/oleo-fluxo-operacional-2026-10-25.md`
- `prisma/migrations/20261024000300_oleo_fluxo_operacional/migration.sql`
- `prisma/schema.prisma`
- `scripts/test-oil-workflow-browser.cjs`
- `scripts/test-oil-workflow-migration.cjs`
- `scripts/test-oil-workflow.cjs`
- `scripts/test-operational-record-controls.cjs`
- `scripts/test-retroactive-procedure-time.cjs`
- `src/app/controle-qualidade-oleo/actions.ts`
- `src/app/controle-qualidade-oleo/fluxo/page.tsx`
- `src/app/controle-qualidade-oleo/historico/legacy-history.tsx`
- `src/app/controle-qualidade-oleo/historico/legado/page.tsx`
- `src/app/controle-qualidade-oleo/historico/page.tsx`
- `src/app/controle-qualidade-oleo/legacy-records.tsx`
- `src/app/controle-qualidade-oleo/legado/page.tsx`
- `src/app/controle-qualidade-oleo/page.tsx`
- `src/app/controle-qualidade-oleo/record-payload.ts`
- `src/app/controle-qualidade-oleo/workflow-actions.ts`
- `src/app/controle-qualidade-oleo/workflow-adapter.ts`
- `src/app/controle-qualidade-oleo/workflow-view.tsx`
- `src/app/historico-operacional/actions.ts`
- `src/app/relatorios/controle-qualidade-oleo/mensal/route.ts`
- `src/lib/active-operational-records.ts`
- `src/lib/monthly-periods.ts`
- `src/lib/operational-deletion.ts`
- `src/lib/permissions.ts`
