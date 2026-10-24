# Etapa 2 — fluxo operacional de Temperatura dos Equipamentos

Implementação no BPMA/KPlatz atual (`A:\Projeto-BPMA-KPlatz`). O tenant-refactor não foi acessado. Somente Temperatura recebeu adaptador; os demais seis módulos mantêm seus fluxos.

## Núcleo e adaptador

Reutilizados `operational-workflow/policy.ts`, `contracts.ts` e `service.ts`: políticas de edição/reabertura, controle de versão, transações Serializable, trava por módulo compartilhada com fechamento/exclusão, eventos e vínculos imutáveis de assinatura.

`workflow-adapter.ts` identifica a unidade pelo ID do equipamento, data de referência e turno. Após exclusão auditada, uma nova aferição recebe sufixo UUID, preservando o fluxo anterior. A conferência transacional de identidades ativas impede duplicidades mesmo com UUIDs diferentes. Manhã e tarde são independentes.

`ControleTemperaturaEquipamento.fluxoId` relaciona a projeção definitiva ao fluxo. `FluxoOperacional.preenchimentoCompleto` controla sua presença nas consultas operacionais; `excluidoEm` registra a exclusão. O filtro central mantém rascunhos fora de relatórios, dashboards e agregações, preservando os registros legados.

## Estados e salvamento

| Estado | Significado | Lista principal |
|---|---|---|
| PENDENTE | Faltam informações obrigatórias | Somente hoje |
| COMPLETO | Preenchido, aguardando validação | Não; disponível no Histórico |
| FECHADO | Versão com assinatura formal vigente | Não; disponível no Histórico |
| REABERTO | Antes fechado, aguardando nova assinatura | Sim, inclusive de datas anteriores |

A passagem do dia não altera estados. A fila também apresenta aferições previstas sem criar linhas vazias no banco.

Cada salvamento grava versão imutável, conteúdo, rascunho, progresso e autoria. A ausência de informação obrigatória permite salvar parcialmente. Campos inválidos são rejeitados. A projeção definitiva só nasce quando completa; ao remover informação obrigatória, a projeção anterior é preservada, mas deixa de aparecer como aferição válida até nova conclusão.

`record-payload.ts` reutiliza categoria, limites, regras, ações corretivas e persistência de alerta no turno seguinte. Os critérios sanitários não foram alterados. O horário de hoje continua automático na primeira conclusão e é preservado nas edições. O retroativo exige horário real ou declaração justificada de horário desconhecido. Inativo/Manutenção não inventam temperatura ou horário. O timestamp original de lançamento é preservado.

A evidência usa o componente e validador existentes. No piloto, os bytes ficam no rascunho versionado e na projeção `fotoBase64`, evitando gravação de arquivo fora da transação. URLs existentes continuam legíveis. A configuração de foto obrigatória em alerta/crítico é respeitada.

## Assinaturas e reabertura

A revisão individual mantém `assinar_historico`. A assinatura diária mantém a autorização de responsável técnico e `assinar_dia`. Ambas verificam senha, geram o log existente e vinculam explicitamente aferições/versões.

A assinatura agrupada fecha apenas o conjunto selecionado, atomicamente. Não cria uma assinatura diária legada genérica que possa abranger registros futuros ou antigos fora do conjunto. Assinaturas legadas existentes não são sobrescritas.

Reabrir exige `modulo.temperatura.reabrir_registro`, justificativa, confirmação, competência aberta e versão atual. Pelo botão Editar, exige também permissão de edição da data. Abrir a confirmação ou cancelar não altera dados.

A reabertura remove somente a vigência da assinatura, cria nova versão e eventos, preservando assinatura e vínculos anteriores. Salvar mantém REABERTO. Somente nova assinatura da versão atual volta a FECHADO, mesmo sem mudanças de conteúdo.

Sessão e permissões são recarregadas dentro da transação, assim como a conferência de estado, versão, conteúdo e competência. Os caminhos antigos de edição/assinatura individual rejeitam aferições gerenciadas. A criação antiga encaminha ao núcleo e exige identidade/versão. A assinatura diária antiga orienta usar seleção versionada quando existem fluxos no dia.

## Páginas, histórico, exclusão e competência

- Rota principal: pendências de hoje e todos os reabertos, destacados.
- `/fluxo`: seleção, preenchimento, consulta, assinatura, confirmação de reabertura e exclusão.
- `/historico`: consulta por data e assinatura das versões selecionadas. Colaborador autorizado consulta e edita hoje antes da assinatura; datas anteriores seguem permissões de histórico.
- `/legado`: controles anteriores de consulta, filtros, edição e exclusão de aferições legadas.
- `/historico/legado`: histórico anterior e acesso ao fechamento mensal.

As páginas são revalidadas após mutações. A exclusão exige justificativa, permissão, competência aberta e versão atual. FECHADO precisa de reabertura antes de excluir. A auditoria conserva os dados originais; o outro turno não é afetado e pode haver novo lançamento após a exclusão.

O fechamento mensal mantém sua trava e, no piloto, recarrega a autorização dentro da transação. Bloqueia REABERTOS não excluídos. Não adiciona exigência de assinatura para Pendentes/Completos além das regras anteriores.

O relatório mensal usa a assinatura vigente de cada fluxo. Reabertos exibem nova assinatura pendente sem herdar assinatura diária antiga. Rascunhos ficam fora das medições válidas. Layout, impressão, horários e situação operacional foram preservados.

## Compatibilidade e migrations

Aferições com `fluxoId = null` permanecem legadas, com consultas, relatórios, assinaturas e controles anteriores. Não houve adoção automática, versões retroativas ou conversão em massa. A nova reabertura versionada aplica-se às aferições do piloto; não presume o conteúdo abrangido por assinaturas antigas.

Reutilizada, sem alterar seu SQL: `20261024000100_nucleo_fluxo_operacional`.

Preparada: `20261024000200_temperatura_fluxo_operacional`. Adiciona vínculo opcional, unicidade/FK e campos de controle do fluxo. O preenchimento de metadados deriva a completude da versão vigente nas tabelas do núcleo. Não altera temperaturas, assinaturas, responsáveis ou datas de aferições antigas. A preservação foi testada aplicando a migration sobre dados anteriores.

**Não foram aplicadas migrations em produção ou no banco do `.env`.** Ambas devem estar aplicadas antes de servir a nova versão, pelo fluxo normal de Prisma Migrate (`npm run prisma:migrate:deploy`). Não houve concessão automática da permissão de reabertura; ela continua administrável pela Gestão de Usuários.

## Validações executadas

- `test-operational-workflow.cjs`: núcleo, políticas, versões, escopo, transições e rollback.
- `test-operational-workflow-migration.cjs`: PostgreSQL isolado via PGlite; constraints, imutabilidade e ambas as migrations, inclusive dados e assinatura legada preexistentes.
- `test-temperature-workflow.cjs`: Prisma real e PostgreSQL 16 isolado; migrations via Migrate, sessões sintéticas, rascunhos, estados, permissões, fotos obrigatórias/opcionais, horários, assinatura individual/agrupada, reabertura, exclusão/recadastro, relatórios, legados e rollback por falha de auditoria.
- Concorrência no PostgreSQL real: dois salvamentos, assinatura contra edição e fechamento mensal contra reabertura, verificando um único vencedor e o estado final.
- `test-temperature-workflow-browser.cjs`: Next de produção local, login real e Edge; rascunho/reentrada, conclusão/Histórico, assinatura/bloqueio, cancelamento, reabertura justificada, edição mantendo REABERTO e nova assinatura; relatório e nove capturas em 1440/390/320, sem overflow. Capturas também inspecionadas visualmente.
- `test-retroactive-procedure-time.cjs`: nova suíte PostgreSQL de Temperatura e regressões de horários/relatórios, Hortifruti e Óleo.
- `test-operational-record-controls.cjs`: controles legados, exclusão e regressões dos demais módulos/relatórios.
- `test-monthly-reopening.cjs`: competências nos sete módulos.
- `npm.cmd run prisma:generate`, `npx.cmd prisma validate`, `npm.cmd run lint` e `npm.cmd run build`: passaram. Build informa apenas o aviso preexistente de Browserslist desatualizado.

Os testes PostgreSQL criam bancos sintéticos `workflow_<timestamp>` exclusivamente no container descrito no cabeçalho do script, em `127.0.0.1:55479`; não usam a conexão do `.env`. Build deve preceder o teste de navegador e os testes que usam o CSS compilado. Executar a suíte PostgreSQL antes da suíte de navegador, que usa suas últimas fixtures.

## Limites e revisão

O piloto foi validado de ponta a ponta no ambiente isolado. Não foram validados Railway, dados/usuários reais ou implantação em produção. As suítes históricas que dependem do antigo formulário de criação não representam a nova API; a cobertura do piloto está nas suítes PostgreSQL e navegador acima. Nenhum outro adaptador foi desenvolvido.

Sem commit, push, deploy, seed, reset ou `prisma db push`. Os arquivos permanecem no working tree para revisão. Evidências em `.data/validation/temperature-workflow/`, ignorado pelo Git.

## Arquivos desta etapa

- `docs/fluxo-operacional-2026-10-24.md`
- `docs/temperatura-fluxo-operacional-2026-10-24.md`
- `prisma/migrations/20261024000200_temperatura_fluxo_operacional/migration.sql`
- `prisma/schema.prisma`
- `scripts/test-monthly-reopening.cjs`
- `scripts/test-operational-record-controls.cjs`
- `scripts/test-operational-workflow-migration.cjs`
- `scripts/test-operational-workflow.cjs`
- `scripts/test-retroactive-procedure-time.cjs`
- `scripts/test-temperature-workflow-browser.cjs`
- `scripts/test-temperature-workflow.cjs`
- `src/app/controle-temperatura-equipamentos/actions.ts`
- `src/app/controle-temperatura-equipamentos/fluxo/page.tsx`
- `src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx`
- `src/app/controle-temperatura-equipamentos/historico/legado/page.tsx`
- `src/app/controle-temperatura-equipamentos/historico/page.tsx`
- `src/app/controle-temperatura-equipamentos/legacy-records.tsx`
- `src/app/controle-temperatura-equipamentos/legado/page.tsx`
- `src/app/controle-temperatura-equipamentos/page.tsx`
- `src/app/controle-temperatura-equipamentos/record-payload.ts`
- `src/app/controle-temperatura-equipamentos/workflow-actions.ts`
- `src/app/controle-temperatura-equipamentos/workflow-adapter.ts`
- `src/app/controle-temperatura-equipamentos/workflow-view.tsx`
- `src/app/historico-operacional/actions.ts`
- `src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts`
- `src/lib/active-operational-records.ts`
- `src/lib/monthly-periods.ts`
- `src/lib/operational-deletion.ts`
- `src/lib/operational-workflow/contracts.ts`
- `src/lib/operational-workflow/service.ts`
- `src/lib/permissions.ts`

`git diff --check` passou. Arquivos mantidos sem commit/push para revisão.
