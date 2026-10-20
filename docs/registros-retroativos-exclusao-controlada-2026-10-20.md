# Registros retroativos e exclusão controlada — 20/10/2026

Implementação no BPMA/KPlatz atual, workspace A:\Projeto-BPMA-KPlatz, branch main.
O Git estava limpo no início desta manutenção. O tenant-refactor não foi acessado.

## Inventário e resultado por módulo

| Módulo | Data e horário de execução | Resultado da manutenção |
|---|---|---|
| Temperatura dos Equipamentos | Data selecionável já existente; aferição manual retroativa ou desconhecida justificada; hoje automático | Preservados turnos e pendências; exclusão auditada, mês real e recadastro após exclusão |
| Higienização de Hortifruti | Data editável já existente; início/fim reais no retroativo; hoje término +2 minutos | Preservado o histórico do produto inativado; data mantida após salvar; exclusão auditada |
| Qualidade do Óleo | Calendário existente; novo horário único de execução | Retroativo conhecido/desconhecido, hoje automático; sem uso não exige horário; periodicidade da fita e limites preservados |
| Buffet/Amostras | Calendário por serviço já existente; novo horário por item servido | Removido bloqueio de criação retroativa que recusava até DEV; mantidas assinatura, não servido, temperaturas, garrafa e correção |
| Limpeza Diária | Checklist por data/área/item já existente; novo horário de execução ao assinar como responsável | Horário separado da assinatura; funciona individualmente e no lote autorizado; estrutura, turno legado e itens preservados |
| Limpeza Semanal | Semana e itens existentes; seleção da data efetiva dentro da semana e novo horário | Não usa a hora da assinatura como execução; mantém agrupamento/periodicidade, data após salvar e supervisão existente |
| Rastreabilidade | Recebimento manual e importação agora aceitam data; conferência registra horário real ou desconhecido justificado | Datas de fabricação/validade permanecem independentes; XML cria pendências, não execução presumida; nota e itens têm exclusão auditada |
| Chamados de Manutenção | Abertura e conclusão são eventos do chamado, com assinatura/timestamp reais | Esses eventos não são retroagidos; incluída exclusão controlada e retirada de consultas/indicadores/relatórios ativos |
| Etiquetas de Validade / StayLabel | Emissão no momento atual, com manipulação/validade calculadas pelo fluxo existente | Não foi retroagida emissão nem alterado cálculo sanitário de validade; retirada física de emissões substituída por exclusão auditada; módulo continua restrito a DEV |
| Documentos Técnicos/Anexos | Cadastro e gestão documental, sem execução sanitária | Fora da criação/exclusão de procedimentos; preservados |

Também foram inspecionados modelos legados de etiquetas, RegistroInicial, catálogos,
configurações, usuários e permissões. Cadastros não foram tratados como procedimentos.
Os modelos antigos de etiquetas sem uso no fluxo atual não receberam alterações.

Chamados e emissão de etiquetas não constituem lançamento de procedimento sanitário
pretérito: conservar seus timestamps reais evita retroagir abertura, assinatura,
impressão ou validade. A ampliação de uma data de ocorrência independente para esses
fluxos não faz parte desta implementação. O StayLabel continua com seu comportamento
anterior de geração atual; a proteção de exclusão foi ampliada para ele.

## Datas, horários e histórico

Reutilizados date-time.ts, procedure-time.ts, campos nativos de calendário,
UnreportedTimeFields e os componentes de Hortifruti/Temperatura existentes.
ExecutionTimeFields atende os novos horários únicos e aceita prefixo para linhas
independentes do Buffet. WeeklyExecutionFields restringe a data à semana escolhida.

Horário retroativo exige HH:mm válido ou declaração de desconhecimento com justificativa
não vazia (até 1000 caracteres). Não há preenchimento com 07:00/14:00 ou hora atual
para execução passada. Datas futuras e datas explicitamente inválidas são recusadas.
A declaração desconhecida não representa atividade não realizada: Buffet não servido,
óleo sem uso, equipamento em manutenção e checklist pendente preservam suas regras.

createdAt/updatedAt, dataHoraRegistro, assinaturaResponsavelDataHora e demais assinaturas
continuam representando eventos reais do sistema. Nenhum timestamp histórico foi
retroagido ou preenchido automaticamente. A exclusão atualiza excluidoEm; campos
@updatedAt seguem o mecanismo do Prisma, com o valor anterior preservado no snapshot.

A mudança não preenche horários de registros antigos nem os classifica como desconhecidos
sem declaração. Nos novos horários, null/false são defaults seguros. Em relatórios,
horário ausente de registro legado não se transforma em hora de execução presumida.
Os cinco relatórios mensais com novos campos apresentam notas de horário/justificativa
sem redesenhar as tabelas oficiais. O semanal distingue data real da limpeza e assinatura.
Os relatórios genéricos também receberam contexto de execução.

## Exclusão, competência e autorização

Dez destinos protegidos: os sete modelos de procedimentos, nota de recebimento,
ChamadoManutencao e EtiquetaValidadeEmissao. Todos possuem excluidoEm nullable.
Não há exclusão física na funcionalidade nova.

A autorização é verificada no servidor, com usuário da sessão e allowlist de modelos.
Exige perfil DEV/GERENTE/NUTRICIONISTA, acesso ao módulo e permissão específica de
exclusão. COLABORADOR e perfis inválidos não passam mesmo com códigos de permissão
forjados. Revogações pela Gestão de Usuários são respeitadas. StayLabel mantém sua
restrição preexistente a DEV; não foi concedido acesso desse módulo a outros perfis.

O catálogo recebeu exclusão para Limpeza Diária, Semanal e Chamados. Os padrões de
Nutricionista/Gerente foram atualizados, inclusive o código existente de Rastreabilidade.
O registro inicial de permissões segue o padrão autenticado já usado na Personalização:
transação nas tabelas existentes, recarga da sessão e concessões iniciais sem substituir
vínculos existentes. A entrada de Limpeza Diária marca a inicialização; logins seguintes
não restauram permissões revogadas. Sessões anônimas não inicializam o catálogo.

A competência é derivada do registro lido no banco, nunca do mês atual ou do formulário.
Para os sete módulos mensais, reutiliza-se isOperationalMonthClosed, com fechamento
genérico e legado. REABERTO é elegível. FECHADO bloqueia também DEV. Chamados e
Etiquetas consultam o fechamento genérico pelo próprio código; não possuem fechamento
legado. Como na arquitetura existente, ausência de fechamento significa competência
aberta. Não foi criada uma nova interface de fechamento para esses dois módulos.

A transação usa o mesmo advisory lock por módulo e isolamento Serializable das
transições mensais. Revalida a competência sob o lock, lê o registro ativo, grava snapshot
e marca excluidoEm na mesma transação. Falha de auditoria impede exclusão parcial.
Notas excluídas preservam e auditam separadamente cada item. Nenhuma assinatura é
apagada. Exclusão repetida ou ID inexistente é rejeitado.

ExclusaoRegistroOperacional mantém módulo/modelo/ID, todos os campos originais em JSON,
ID/nome/perfil do usuário autenticado, timestamp real e justificativa obrigatória
(até 4000 caracteres). Os snapshots independem da permanência de catálogos e usuários.
A consulta de auditoria é interna, por essa tabela; não foi criado painel público de
snapshots nem possibilidade de restauração nesta etapa.

Os três módulos que já possuíam modal mantêm sua interface, agora com motivo obrigatório
e responsável identificado. Os demais usam o painel comum de exclusão por data, com
confirmação identificando módulo/data/item/responsável. Botões de registros fechados
ou de usuários sem autorização não são apresentados. Após a exclusão, módulos,
históricos, relatórios, dashboard e competências são revalidados.

O middleware do cliente Prisma compartilhado aplica excluidoEm:null a listas, consultas
individuais, contagens, agregações, mutações e filhos/contagem de itens de notas.
Isso inclui transações, dashboard, pendências, relatórios e procura de duplicidades.
A tabela de snapshots não é filtrada. As chaves únicas de Limpeza Diária/Buffet e os
identificadores fiscais de notas agora se aplicam somente a registros ativos.
Recriação não apaga nem reutiliza o registro original.

A limpeza preexistente de placeholders de checklist ainda existe. O middleware a limita
a PENDENTE sem assinaturas, com timestamps de assinatura nulos e ainda ativo. Não se
trata da retirada de procedimento realizado. Originais já excluídos não são removidos
por essa limpeza. Exclusões de cadastros de limpeza também consultam snapshots para
preservar catálogos que tenham história excluída.

## Migration e publicação

Nova migration estrutural necessária (não havia equivalente):
20261020000100_registros_retroativos_exclusao_controlada.

Acrescenta excluidoEm aos dez modelos e horário/declaração/justificativa aos cinco
modelos que não os possuíam. Cria a tabela de auditoria. Substitui índices únicos
incondicionais por índices únicos parciais sobre ativos e mantém os índices de busca.
As operações ficam em BEGIN/COMMIT. Não há UPDATE, DELETE, TRUNCATE, DROP TABLE ou
remoção de colunas na migration. Não recalcula datas, assinaturas ou histórico.
Os índices parciais são expressos no SQL de Migrate; o schema mantém seus índices de busca.

migrate status encontrou 57 migrations: as 56 anteriores aplicadas e somente a nova
pendente no banco configurado localmente. Essa verificação não comprova que esse banco
é o mesmo do serviço publicado. A migration NÃO foi aplicada por esta manutenção.
Nenhum deploy/restart de produção foi realizado.

Antes de publicar o código, aplicar a migration no banco correspondente pelo fluxo
normal do Railway, Pre-deploy Command: npm run prisma:migrate:deploy.
package.json já contém prisma:migrate:deploy. Não é necessário db push.
Publicar esse Prisma Client sem a migration deixaria o banco sem os novos campos.

## Validação e limites da evidência

- prisma:generate (Prisma 6.5.0), prisma validate, lint, build e git diff --check.
- PostgreSQL isolado PGlite: execução das 57 migrations, snapshots anteriores preservados,
  fechamento antigo preservado, defaults, HH:mm, justificativa, unicidade ativa e
  recadastro de Limpeza Diária/Buffet/nota sem remover os originais.
- Actions e Prisma middleware reais com adapter isolado: dez destinos, perfis autorizados,
  bloqueio de outros perfis/permissão revogada/sessão ausente, mês anterior aberto,
  genérico/legado/reaberto/fechado, rejeição de repetição/ID inválido/motivo vazio,
  rollback na falha de auditoria e confirmação de originais/assinaturas em snapshot.
- Sete GETs mensais reais: exclusões não aparecem como execuções ativas.
- Actions reais de limpeza diária/semanal, Buffet e recebimento manual: horários
  conhecidos/desconhecidos, datas reais, lançamento separado e flags independentes.
- Suítes existentes de correções, filtros, retroativos, reabertura, fabricação,
  permissões, upload/logo, identidade visual e tema: executadas.
- Navegador Edge isolado: quatro componentes reais em 1200/390/320px, validação nativa
  de formulário, modal identificado/motivo obrigatório e ausência de overflow.
  Capturas do formulário e confirmação mobile foram inspecionadas.
- Suítes de impressão existentes: HTML/PDF dos sete relatórios e variantes de marca,
  dimensões/reabertura; botão de impressão, paginação comparada e regressão de tema.
  PDFs foram gerados; não houve inspeção manual por leitor de PDF.

Dois testes antigos exigiram adequação: o teste de clique aguardava print síncrono,
embora a impressão agora decodifique imagens assincronamente; o teste de temperatura
fixava duas páginas, mas a fixture atual inclui três equipamentos e já gera seis
páginas no HEAD anterior. Agora compara com o HTML do HEAD e confirma a mesma paginação,
sem alterar o layout de Temperatura para fazer o teste passar.

Não houve login/mutação operacional em produção. Validação funcional por adapter não
equivale a navegação autenticada no Railway; essa conferência depende da publicação
com a migration. A restrição DEV do StayLabel e o fluxo atual de abertura/emissão
permanecem particularidades documentadas acima.

Para repetir o teste SQL isolado, instalar PGlite apenas na pasta ignorada de validação:
npm.cmd install --prefix .data/validation/pg-test --no-save --no-package-lock @electric-sql/pglite
Depois: node scripts/test-operational-migration.cjs.
Nenhuma dependência foi adicionada ao package.json/package-lock do aplicativo.

Não foram executados seed, reset, db push, commit ou push. Não houve escrita no banco
real, exclusão de dados reais ou alteração de registros antigos por esta manutenção.

## Arquivos da manutenção

- docs/registros-retroativos-exclusao-controlada-2026-10-20.md
- prisma/migrations/20261020000100_registros_retroativos_exclusao_controlada/migration.sql
- prisma/schema.prisma
- scripts/test-bpma-adjustments.cjs
- scripts/test-bpma-print.cjs
- scripts/test-client-corrections-print.cjs
- scripts/test-client-corrections.cjs
- scripts/test-monthly-reopening.cjs
- scripts/test-operational-migration.cjs
- scripts/test-operational-record-controls-browser.cjs
- scripts/test-operational-record-controls.cjs
- scripts/test-retroactive-procedure-time.cjs
- src/app/chamados-manutencao/page.tsx
- src/app/controle-buffet-amostras/actions.ts
- src/app/controle-buffet-amostras/page.tsx
- src/app/controle-buffet-amostras/servico/[id]/page.tsx
- src/app/controle-buffet-amostras/servico/[id]/service-items-form.tsx
- src/app/controle-qualidade-oleo/actions.ts
- src/app/controle-qualidade-oleo/page.tsx
- src/app/controle-temperatura-equipamentos/actions.ts
- src/app/controle-temperatura-equipamentos/page.tsx
- src/app/etiquetas-validade/actions.ts
- src/app/etiquetas-validade/historico/page.tsx
- src/app/higienizacao-hortifruti/actions.ts
- src/app/higienizacao-hortifruti/page.tsx
- src/app/historico-operacional/delete-action.ts
- src/app/plano-limpeza/actions.ts
- src/app/plano-limpeza/diario/historico/page.tsx
- src/app/plano-limpeza/diario/page.tsx
- src/app/plano-limpeza/diario/sign-checklist-modal.tsx
- src/app/plano-limpeza/semanal/historico/page.tsx
- src/app/plano-limpeza/semanal/page.tsx
- src/app/plano-limpeza/semanal/sign-checklist-modal.tsx
- src/app/plano-limpeza/utils.ts
- src/app/rastreabilidade-recebimento/actions.ts
- src/app/rastreabilidade-recebimento/delete-note-modal.tsx
- src/app/rastreabilidade-recebimento/nota/[id]/note-items-form.tsx
- src/app/rastreabilidade-recebimento/nota/[id]/page.tsx
- src/app/rastreabilidade-recebimento/nota/nova/manual-note-form.tsx
- src/app/rastreabilidade-recebimento/page.tsx
- src/app/rastreabilidade-recebimento/xml-import-form.tsx
- src/app/relatorios/controle-buffet-amostras/mensal/route.ts
- src/app/relatorios/controle-qualidade-oleo/mensal/route.ts
- src/app/relatorios/plano-limpeza-diario/mensal/route.ts
- src/app/relatorios/plano-limpeza-semanal/mensal/route.ts
- src/app/relatorios/rastreabilidade-recebimento/mensal/route.ts
- src/app/relatorios/report-service.ts
- src/components/forms/execution-time-fields.tsx
- src/components/forms/unreported-time-fields.tsx
- src/components/forms/weekly-execution-fields.tsx
- src/components/operational-delete-button.tsx
- src/components/operational-deletion-panel.tsx
- src/lib/active-buffet-record.ts
- src/lib/active-operational-records.ts
- src/lib/auth-session.ts
- src/lib/execution-report-notes.ts
- src/lib/operational-deletion-permission.ts
- src/lib/operational-deletion.ts
- src/lib/operational-record-modules.ts
- src/lib/permissions.ts
- src/lib/prisma.ts
- src/lib/procedure-time.ts
- src/lib/register-operational-deletion-permissions.ts

## Estado final do Git

Branch main: 46 arquivos rastreados modificados e 17 arquivos novos (incluindo este relatório).
Sem commit ou push. diff --check sem erros, apenas avisos da configuração LF/CRLF.
Os 11 scripts sem navegador passaram; as seis suítes com navegador também passaram.
Build e lint concluídos com sucesso; prisma generate e validate passaram.
