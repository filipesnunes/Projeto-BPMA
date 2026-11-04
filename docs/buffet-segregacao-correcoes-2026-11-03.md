# Buffet / Amostras — correção de registros seguida de assinatura

Evolução posterior: o pedido de [horário coletivo retroativo](buffet-horario-coletivo-2026-11-03.md)
passou a autorizar substituição explícita de horários editáveis. O bloqueio absoluto
de alteração de horário descrito nesta etapa foi substituído por edição explícita
com preservação do antes/depois nas versões e auditoria do fluxo versionado.

Nova política aprovada pelo responsável: nutricionista habilitada pode corrigir
informações já registradas por outra pessoa e assinar o serviço completo.
Branch: `estabilizacao/experiencia-anterior-2026-10-28`, inicialmente limpa,
base `cb4be39`. Sem commit, push ou deploy nesta manutenção.

## Diagnóstico e distinção de autoria

`workflowReviewEligibility` somava os usuários de todas as versões materiais e
os responsáveis dos itens. Um evento SALVAMENTO de uma correção colocava a
nutricionista no mesmo conjunto de quem fez o lançamento original.

Somente o ramo de Amostras agora usa `buffetAuthorshipEligibility`:

- Localiza a primeira versão que contém a aferição de cada registro ativo.
- Confere o responsável original, o autor daquela versão e o evento correspondente
  CRIACAO, SALVAMENTO ou CORRECAO_REGISTRO.
- Confere a preservação do responsável nas versões seguintes.
- Autores de correções posteriores não passam a ser executores originais.
- A nutricionista responsável pelo lançamento original continua impedida de
  assinar sua própria execução, com indicação do item no motivo.
- Autoria ausente, divergente ou vínculo legado continua exigindo regularização
  autorizada. Um item extra vazio não comprova execução; a classificação anterior
  Não servido também não comprova uma aferição posteriormente introduzida.

Uma correção histórica já representada por SALVAMENTO pode ser reconhecida pelas
versões existentes, sem criar eventos retroativos ou reatribuir os itens.
Essa política não comprova fatos físicos fora do sistema: uma nova aferição
deve manter sua autoria própria, em vez de ser apresentada como correção de outra pessoa.

Os ramos de Temperatura e Rastreabilidade mantêm o bloqueio por participação em
preenchimento/correção. Óleo e os demais módulos mantêm suas regras anteriores.
Não houve alteração em `service.ts`, permissões, schema ou migrations.

## Trilha de correção

O adaptador do Buffet compara os registros anteriores com os dados efetivamente
persistidos após a validação coletiva. Para correções de registros que já têm
evidência de execução, grava um evento CORRECAO_REGISTRO contendo:

- Usuário, data/hora, serviço e versões anterior/nova nos campos de FluxoEvento.
- Registro/item, nome e responsável original.
- Campos alterados e valores anteriores/posteriores.
- Justificativa opcional, limitada a 4.000 caracteres.

O conteúdo estruturado utiliza o campo `justificativa` já existente. Não foi
necessária nova tabela, coluna ou migration. As versões imutáveis continuam
contendo os snapshots completos; o evento facilita consultar a diferença.

A gravação dos itens, evento, versão e estado acontece na transação existente.
Se a auditoria falhar, os itens e versões também são revertidos. Salvamento sem
diferença material não cria evento fictício de correção.

O executor e a data/hora do lançamento original não são substituídos pelo corretor.
Uma tentativa explícita de substituir um horário original já registrado é
rejeitada; a informação complementar pode ser registrada na observação ou na
justificativa. Campos de horário reenviados sem indicação de edição continuam
preservando o valor salvo. Horários retroativos originalmente ausentes mantêm
as regras existentes de preenchimento/justificativa.

Serviços assinados permanecem bloqueados para edição comum. A reabertura exige
autorização e justificativa, retira a vigência da assinatura anterior, preserva
a evidência e exige nova assinatura sobre a nova versão.

## Interface e arquivos

Histórico e página do serviço continuam consultando a mesma elegibilidade.
O Histórico apresenta os autores, datas e versões das correções. Na consulta
do serviço, o histórico de validações detalha item, executor e antes/depois.
O painel informa quando o serviço está apto à assinatura da usuária atual.
Foi retirada a orientação antiga que exigia outro profissional apenas por
participação em correção. Senha e demais impedimentos continuam no servidor.

Arquivos novos:

- `src/app/controle-buffet-amostras/authorship.ts`
- `src/app/controle-buffet-amostras/correction-audit.ts`
- `src/app/controle-buffet-amostras/correction-evidence.ts`
- `src/app/controle-buffet-amostras/correction-history.tsx`
- `scripts/test-buffet-corrections.cjs`
- `scripts/test-buffet-corrections-browser.cjs`
- Este relatório.

Arquivos alterados:

- `src/lib/operational-workflow/review-eligibility.ts`
- `src/app/controle-buffet-amostras/workflow-adapter.ts`
- `src/app/controle-buffet-amostras/row-save.ts`
- `src/app/controle-buffet-amostras/service-review.ts`
- `src/app/controle-buffet-amostras/workflow-history.ts`
- `src/app/controle-buffet-amostras/service-history.ts`
- `src/app/controle-buffet-amostras/historico/legacy-page.tsx`
- `src/app/controle-buffet-amostras/servico/[id]/service-items-form.tsx`
- `src/components/group-workflow-panel.tsx`, com mudanças de política restritas a Amostras.
- `scripts/test-supervision-signatures.cjs`
- `scripts/test-supervision-signatures-browser.cjs`
- Relatório da correção estrutural, com referência a esta mudança de política.

## Validação

Node 22.23.4, Next.js 15.5.12 e Prisma Client 6.5.0. PostgreSQL local na porta
55479, bancos com dados sintéticos. A configuração externa do `.env` não foi usada
para testes de escrita nem alterada.

| Casos do pedido | Evidência automatizada |
| --- | --- |
| 1 | Colaborador executa e nutricionista assina |
| 2–3, 5–6 | Correção de vários itens, auditoria dos valores, versões e autores, seguida de assinatura |
| 4 | Dois executores distintos preservados após correções e assinatura da nutricionista |
| 7–13 | Parcial, perfis/RT/permissão, senha, competência e versão obsoleta bloqueados |
| 14–16 | Edição de assinado bloqueada; reabertura, correção e nova assinatura preservam as evidências anteriores |
| 17–18 | Legado/autoria inconclusiva e execução própria continuam bloqueados; correção histórica com origem comprovada é reconhecida |
| 19 | Histórico, consulta e relatório preservam executor e identificam corretor/supervisor |
| 20 | Suíte de supervisão dos sete módulos, com 22 cenários aprovados |
| Integridade adicional | Falha na auditoria reverte toda a operação; horário original não é reescrito |

Prisma Generate, TypeScript, lint e build completo passaram. A compilação inclui
as verificações de narrowing após o retorno específico de Amostras.
Regressões de Buffet estrutural, pendências e Histórico também passaram.

O teste novo de navegador usa login real local, Next, Server Actions, PostgreSQL e
Edge. Exercita correção de vários itens, assinatura pela própria corretora,
reabertura, nova correção/assinatura, preservação da assinatura anterior,
Histórico e relatório/Imprimir em desktop e mobile. Não usa somente mocks de UI.
Evidências ignoradas pelo Git em `.data/validation/buffet-corrections/`.

| Teste executado | Resultado |
| --- | --- |
| `test-buffet-corrections.cjs` | Oito grupos aprovados, cobrindo a nova política e a integridade |
| `test-buffet-structural.cjs` | Sete grupos aprovados |
| `test-buffet-pending.cjs` e `test-buffet-history.cjs` | Aprovados |
| `test-supervision-signatures.cjs` | 22 cenários aprovados nos sete módulos |
| `test-buffet-corrections-browser.cjs` | Aprovado: corrigir/assinar e reabrir/corrigir/assinar |
| `test-buffet-structural-browser.cjs` | Aprovado: conferência coletiva e assinatura |
| `test-buffet-pending-browser.cjs` | Aprovado na execução isolada com fixtures novas; ocorrência inicial descrita abaixo |
| `test-supervision-signatures-browser.cjs` | Aprovado: autorização, senha, assinatura e reabertura |
| `git diff --check` | Aprovado |

Uma primeira execução do navegador de pendências teve timeout ao aguardar a
mensagem de ação inválida. O log daquela execução também registrou conflito de
escrita/deadlock em `permissao.upsert` no banco sintético. Não foi comprovada relação
causal entre as duas ocorrências. A reprodução isolada com fixtures novas passou;
autenticação e inicialização do catálogo não foram modificadas nesta manutenção.
Essa ocorrência permanece documentada para acompanhamento em homologação.
As capturas desktop/mobile da auditoria foram inspecionadas, sem overflow.
O botão Imprimir foi exercitado; não houve nova inspeção de PDFs exportados.

## Integridade e publicação

Produção não foi acessada. Não houve alteração de usuários/permissões reais,
temperaturas, assinaturas, fechamentos ou evidências reais. Não foi executada
regularização histórica, migration, seed, reset ou db push.
Os dados/contas e assinaturas dos testes são exclusivamente sintéticos.

Legados mantêm a política de regularização; não são automaticamente convertidos
para o novo fluxo. Não se afirma que uma conta ou serviço real específico está
elegível, pois o banco do cliente não foi auditado nesta etapa.

Código preparado para homologação, sem publicação automática. A homologação
no Railway e a validação com os serviços reais permanecem para etapa autorizada.

Git final: mesma branch de estabilização, 12 arquivos rastreados modificados e
sete arquivos novos. PostgreSQL local encerrado ao concluir as validações.
