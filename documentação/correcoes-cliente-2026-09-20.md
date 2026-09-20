# Correções do cliente — BPMA/KPlatz

Implementação em `A:\Projeto-BPMA-KPlatz`, aplicativo `bpma-app`, branch `main`. O diretório estava limpo antes das alterações. Não houve trabalho no `tenant-refactor`, alteração de arquitetura, commit ou push.

## Mapeamento da persistência e impacto

| Pedido | Persistência existente | Ajuste e impacto |
| --- | --- | --- |
| Nome dos bolos | `ControleBuffetAmostraRegistro.itemNome` identifica o slot; `observacao` recebe o texto livre do checklist | O relatório mensal selecionava apenas o nome do slot. Agora seleciona também `observacao` e apresenta `Bolo 1 - Chocolate` para slots `Bolo N`. Sem observação, mantém o slot. Usa o snapshot de cada registro, sem inventar sabor ou criar campo. |
| Não servido | `ControleBuffetAmostraRegistro.status = NAO_SERVIDO` | Excluído apenas do agrupamento para renderização do relatório mensal. Não escreve no banco nem muda checklist, histórico, assinatura ou status. Grupos sem itens servidos não geram páginas vazias. |
| Horário da temperatura | `ControleTemperaturaEquipamento.createdAt`; não existe horário de aferição separado | Acrescentada coluna Horário em cada turno, `HH:mm`, no fuso `America/Sao_Paulo`. Não usa emissão ou `updatedAt`. Sem timestamp válido ou quando a data de criação não corresponde à data operacional, exibe `-`. O dado representa o momento em que a aferição foi registrada, não um horário informado separadamente pelo colaborador. |
| Persistência da temperatura | Equipamento por nome, categoria, data, turno, status operacional, temperatura; regras configuráveis por categoria; `turnoManha`/`turnoTarde` no catálogo | Consulta a última gravação do turno imediatamente anterior previsto do mesmo equipamento. Manhã→Tarde, Tarde→dia seguinte e equipamentos com um único turno são contemplados. Ausência, registro distante, normalização, outra categoria ou equipamento fora de operação não disparam persistência. Escalona somente a regra de alerta que menciona persistência no turno seguinte e a mesma faixa. Reutiliza a ação crítica configurada de transferência/manutenção; fallback centralizado para o texto solicitado. Prévia e Server Action compartilham a regra. Limites, categoria, status e política de foto não mudam. |
| Produto descontinuado | `HigienizacaoHortifrutiOpcao` não tinha campo de atividade. Os registros guardam `produtoUtilizado` como texto, sem FK para a opção | A Server Action bloqueava exclusão quando encontrava uso. Adicionado `ativo`: com histórico, inativa; sem histórico, exclui a opção. Formulário e validação aceitam somente opções ativas em novos registros. Edição pode conservar a opção original já inativa. Snapshots históricos e relatórios não dependem da atividade da opção. |
| Dois minutos | `inicioProcesso`, `terminoProcesso`, `duracaoMinutos` | Reutilizados os três campos. Término somente leitura, recalculado no cliente e no servidor. `23:59`→`00:01` salva duração 2. Horários antigos permanecem quando uma edição não muda o início. Nenhuma atualização em massa. A Data do Procedimento continua editável na criação, como antes. |
| Fita opcional | `fitaOleo` já anulável; `status` obrigatório; `orientacao` texto; `temperaturaCritica` independente | Removida exigência HTML e da Server Action. Sem fita: `fitaOleo = null`, `status = null`, orientação vazia. Relatório usa `-`; histórico identifica ausência de aferição. A temperatura continua obrigatória em uso. A restrição de 120°C aplica-se somente à leitura de fita; alerta acima de 180°C é preservado mesmo sem fita. Com fita, regras canônicas/configuradas continuam sendo usadas. |
| Periodicidade | Sem agenda/periodicidade ou equipamento individual no modelo de óleo | Aviso baseado na última aferição real do módulo, com fita não vazia e equipamento em uso: próxima prevista = data + 3 dias. Não usa registros apenas de temperatura para adiar a previsão, não seleciona fita automaticamente e não cria bloqueio. |

## Migration e publicação

Arquivo: `prisma/migrations/20260920120000_ajustes_operacionais_cliente/migration.sql`.

- Adiciona `ativo`, inicialmente verdadeiro, ao catálogo de Hortifruti.
- Permite `NULL` no status do registro de óleo para representar ausência de teste, sem inventar adequação, descarte ou falta de utilização.
- Inativa, uma única vez, a opção `Antimicrobial Fruit & Vegetable Treatment`. O mecanismo operacional é genérico para outras opções; o nome específico aparece apenas nessa atualização de dados da migration.
- Não altera registros operacionais antigos, temperaturas, sabores, horários, assinaturas ou fechamentos.

**Migration criada, não aplicada.** Deve ser aplicada pelo fluxo de publicação antes de servir a nova versão. A tentativa de consulta somente leitura ao banco falhou com `PrismaClientInitializationError`; portanto não foi possível confirmar a quantidade real de registros vinculados ao produto. A opção será inativada conservadoramente na publicação, independentemente dessa quantidade. A preservação foi validada com histórico simulado.

Nenhum `prisma db push`, seed, reset ou comando de migration que altere banco foi executado. `prisma:generate` apenas regenerou o cliente local.

## Validação

- `npm.cmd run prisma:generate`: passou, Prisma Client 6.5.0.
- `npm.cmd run lint`: passou, sem erros ou avisos ESLint. O CLI informa a depreciação futura de `next lint`.
- `npm.cmd run build`: passou, Next.js 15.5.12. Aviso informativo sobre a base Browserslist desatualizada.
- `git diff --check`: passou.
- `node scripts/test-bpma-adjustments.cjs`: regressões existentes de filtros, datas, fotos opcionais/obrigatórias, edição e relatório Hortifruti passaram.
- `node scripts/test-client-corrections.cjs`: Server Actions, páginas e rotas reais com adaptador em memória. Cobertura dos cenários solicitados, incluindo criação/edição, histórico, fechamento de óleo, assinatura, mudança de mês, virada da meia-noite, catálogo inativo, escape HTML e estados dos formulários.
- `node scripts/test-client-corrections-print.cjs`: navegador headless isolado, quatro PDFs, controles ocultos na impressão e ausência de transbordamento horizontal. Fixture Buffet: duas páginas para dois serviços/dias; Temperatura: duas páginas para dois equipamentos, uma A4 horizontal por equipamento; Hortifruti e óleo: uma página cada.
- `node scripts/test-bpma-print.cjs`: passou; botão aciona impressão, fica oculto no PDF e a geometria de cabeçalho, tabelas e rodapé do Hortifruti permaneceu idêntica à versão anterior.

Artefatos locais em `.data/validation/`: `buffet-client.pdf`, `temperature-client.pdf`, `hortifruti-client.pdf`, `oil-client.pdf` e seus HTML/PNG. Os testes não usam conexão ao banco real. Não houve homologação integrada com dados de produção nem publicação.

## Arquivos alterados

- `prisma/schema.prisma`
- `src/app/controle-buffet-amostras`: nenhuma alteração no checklist ou nas actions; ajuste exclusivamente em `src/app/relatorios/controle-buffet-amostras/mensal/route.ts`.
- `src/app/controle-temperatura-equipamentos/actions.ts`
- `src/app/controle-temperatura-equipamentos/automatic-corrective-action-fields.tsx`
- `src/app/controle-temperatura-equipamentos/page.tsx`
- `src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts`
- `src/app/higienizacao-hortifruti/actions.ts`
- `src/app/higienizacao-hortifruti/catalog.ts`
- `src/app/higienizacao-hortifruti/opcoes/page.tsx`
- `src/app/higienizacao-hortifruti/page.tsx`
- `src/app/higienizacao-hortifruti/utils.ts`
- `src/app/controle-qualidade-oleo/actions.ts`
- `src/app/controle-qualidade-oleo/historico/page.tsx`
- `src/app/controle-qualidade-oleo/oil-register-fields.tsx`
- `src/app/controle-qualidade-oleo/oil-status-badge.tsx`
- `src/app/controle-qualidade-oleo/page.tsx`
- `src/app/controle-qualidade-oleo/utils.ts`
- `src/app/relatorios/controle-qualidade-oleo/mensal/route.ts`
- `src/app/relatorios/report-service.ts`
- `src/app/dashboard/service.ts`

Novos arquivos:

- `prisma/migrations/20260920120000_ajustes_operacionais_cliente/migration.sql`
- `src/app/controle-temperatura-equipamentos/persistence.ts`
- `src/app/higienizacao-hortifruti/process-time-fields.tsx`
- `scripts/test-client-corrections.cjs`
- `scripts/test-client-corrections-print.cjs`
- `documentação/correcoes-cliente-2026-09-20.md`

Status final verificado: 20 arquivos rastreados modificados e 6 arquivos novos, sem staging, commit ou push. Arquivos de validação e perfil temporário do navegador ficam em `.data`, ignorado pelo Git.
