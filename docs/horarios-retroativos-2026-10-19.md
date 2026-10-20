# Horários de procedimentos retroativos — BPMA/KPlatz

## Diagnóstico e comportamento

Temperatura não armazenava um horário próprio de aferição. Seu relatório usava
`createdAt` somente quando o lançamento ocorria na própria data de referência;
retroativos apareciam sem horário. Hortifruti já armazenava início e término,
mas forçava término em início +2 minutos e duração 2. Óleo não possui horário
de execução em seu formulário/modelo/relatório; não foi criado um.

- Temperatura: no dia atual, horário automático do sistema; em novas aferições
  retroativas em operação, horário real HH:mm obrigatório ou declaração explícita
  de horário desconhecido com justificativa. Turnos e pendências foram preservados.
  Manutenção/inativo não recebem horário de aferição inventado.
- Hortifruti: comportamento diário de início e término automático +2 minutos
  preservado; no retroativo, início/término manuais e consistentes no mesmo dia.
  Não é inferida uma data de término no dia seguinte. O cálculo diário continua
  admitindo a virada de meia-noite já existente.
- Horário desconhecido: opção compartilhada e justificativa obrigatória até
  1000 caracteres. Não implica dispensa de temperatura, equipamento, produto,
  responsável ou dos demais dados obrigatórios. O formulário orienta que apenas
  procedimentos efetivamente realizados sejam lançados.
- Alterar a data limpa horários anteriores. Voltar para hoje restaura o modo
  automático diário. Não são atribuídos 07:00, 14:00 ou horários presumidos.
- Óleo: seleção de data existente preservada; somente adicionado o bloqueio de
  datas futuras, sem campo de horário nem alterações nas regras de qualidade.

## Persistência e apresentação

Novos campos de Temperatura: `horarioAfericao` (VARCHAR(5), nullable),
`horarioNaoInformado` (boolean, default false) e `justificativaHorario` (texto nullable).
Hortifruti reutiliza início/término/duração, agora nullable para não inventar
valores quando o horário é desconhecido; acrescenta os mesmos dois campos de
declaração/justificativa. Nessas declarações, os horários e a duração ficam null.

`data` continua representando o procedimento. `createdAt` e `updatedAt` continuam
sob controle do banco/Prisma; valores enviados pelo cliente não são copiados nesses campos.
O responsável continua vindo da sessão. Nenhum registro histórico foi regravado.

Consultas e históricos identificam retroativos comparando referência com a data
real de criação e apresentam o horário e os metadados. Os relatórios preservam as
colunas e a orientação: Temperatura usa a coluna Horário e mostra justificativas
abaixo da tabela, sem inseri-las na coluna estreita; Hortifruti usa Início/Término
e Observações. O relatório genérico conserva o cadastro real e acrescenta a
identificação da aferição quando disponível. Durações desconhecidas não são
apresentadas como zero; totais parciais são identificados como minutos conhecidos.

Legados não recebem horários por backfill: o fallback de Temperatura usa criação
somente quando foi no mesmo dia. Um retroativo antigo sem hora armazenada permanece
sem hora, sem converter automaticamente essa ausência em uma declaração justificada.

## Migration e publicação

Única migration nova: `20261019000100_horarios_procedimentos_retroativos`.
É transacional e não destrutiva: adiciona campos, permite null nos três campos de
tempo de Hortifruti e valida o formato/justificativas das novas declarações.
Não contém UPDATE, DELETE, DROP TABLE ou alteração em assinaturas/auditoria.
As constraints adicionais são satisfeitas pelos legados com default false.

Prisma generate 6.5.0 e Prisma validate passaram. Migrate status encontrou
56 migrations, apenas a nova pendente no banco configurado. Não foi confirmada
a equivalência desse destino com o serviço publicado e não houve aplicação local.
O Docker local não está ativo; a migration não foi executada em PostgreSQL de teste.

Antes de publicar o código, aplicar pelo fluxo normal do serviço Railway correto,
com `npm run prisma:migrate:deploy` no Pre-deploy Command. As novas consultas
dependem das colunas; publicar sem essa etapa pode produzir P2022. Não houve deploy,
seed, reset, db push, commit ou push nesta implementação.

## Testes

- `test-retroactive-procedure-time.cjs`: ações e relatórios reais com adapters
  sintéticos; automático diário, manhã 07:35, tarde 14:47, desconhecido com justificativa,
  intervalo manual de Hortifruti, legados, Óleo sem campo de hora, duplicidade,
  meses fechados, horários/datas inválidos ou futuros e metadados não adulteráveis.
- Componentes reais: +2 diário, término manual retroativo, justificativa required,
  troca de data sem horários residuais e retorno ao comportamento do dia atual.
- `test-client-corrections.cjs`, `test-bpma-adjustments.cjs`,
  `test-monthly-reopening.cjs` e `test-visual-personalization.cjs`: passaram.
- `test-visual-personalization-print.cjs`: sete relatórios, logos/dimensões e
  estados existentes, impressão/PDF. Seletor de teste atualizado para o cabeçalho
  em grid já presente no projeto, sem alterar seu layout de produção.
- `test-retroactive-procedure-time-print.cjs`: três fixtures reais de formulário
  em desktop, 390 e 320 px; duas rotas mensais, horários e justificativas, impressão
  após decodificar imagens e dois PDFs. Capturas de HTML em modo impressão foram
  inspecionadas; não houve inspeção manual por um leitor de PDF.
- Lint, build e git diff --check passaram. Build mantém aviso Browserslist antigo.

Os testes não conectaram ao banco real nem usaram usuários reais. Os handlers dos
componentes foram exercitados isoladamente; a navegação autenticada em produção
e a execução da migration permanecem pendentes. Artefatos ficam em `.data/validation`.

## Arquivos

Schema/migration; helpers `procedure-time.ts`, `procedure-time-audit.tsx` e
`unreported-time-fields.tsx`; formulários, ações e históricos de Temperatura e
Hortifruti; validação de data de Óleo; renderers mensais de Temperatura/Hortifruti;
relatório genérico; scripts de regressão e este documento.

Autenticação, permissões, parâmetros sanitários, assinaturas, regras de fechamento,
outros módulos operacionais e tenant-refactor não foram modificados.
