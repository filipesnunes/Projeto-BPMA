# Recuperação da experiência anterior — BPMA/KPlatz

## A. Versão recuperada

Referência funcional/visual: `ceded2ca4796119951d35fad30212079993ed6bd`.
Estado encontrado: branch `main`, commit `1bbe4a22b43097b1b36b75d898baab20b9cdbe2b`,
sem alterações locais. Antes de editar foi criada a branch exclusiva
`estabilizacao/experiencia-anterior-2026-10-28`. A main preserva o estado anterior.

As oito rotas principais/de Histórico dos quatro módulos voltaram a utilizar os
componentes das interfaces anteriores. A comparação com ceded2c mostrou que os
componentes legacy preservavam quase integralmente esses layouts, com diferenças
concentradas em rotas, filtros de fluxoId e proteção de acesso.

- Temperatura: formulário conhecido, equipamentos, turnos, seleção de data,
  ações corretivas, evidências, lista de registros e Histórico mensal.
- Óleo: formulário conhecido, verificações múltiplas da mesma data, fita,
  temperatura, sem utilização, filtros e Histórico mensal.
- Buffet: organização anterior dos serviços, formulário de itens já existente,
  salvamento, Não servido explícito, Histórico e revisão do supervisor.
- Recebimento: tela anterior de notas e busca de itens, importação XML,
  conferência, lotes/validades, finalização e Histórico mensal.

As telas principais deixam de ser filas organizadas pelos quatro estados.
Mensagens simples identificam preenchimento em andamento, assinatura e revisão
pendente. Não foi feito rollback indiscriminado de commits.

## B. Compatibilidade

Retirar somente o filtro fluxoId=null seria insuficiente. O middleware atual
exclui corretamente projeções incompletas das consultas de medições válidas.
Esse filtro sanitário foi preservado, inclusive nos relatórios e no dashboard.

As listas antigas agora incluem registros elegíveis de ambos os formatos. Um
componente complementar lê o núcleo versionado para disponibilizar rascunhos,
unidades sem projeção e revisões pendentes, inclusive antigas. No Histórico,
apresenta também os vínculos e assinaturas das unidades recentes. Trata-se de
um resumo da unidade, separado da tabela de medições; não são criados registros
duplicados no banco. Nenhum preenchimento incompleto vira medição concluída.
O cartão de Buffet usa a quantidade prevista na versão e identifica um serviço
iniciado como parcial, mesmo quando sua projeção sanitária ainda está incompleta.

Os formulários originais de criação de Temperatura e Óleo fazem o salvamento único
pelos adaptadores transacionais existentes. A identidade de requisição do Óleo
preserva a independência de verificações e impede duplicação por reenvio.
Formulários legados continuam atendendo os dados legados. Links de edição/exclusão
de registros versionados encaminham ao editor protegido quando necessário.

Os editores protegidos recentes foram mantidos para preservar rascunhos e
vínculos de assinatura. Seu salvamento usa um único botão e a apresentação foi
simplificada. Eles são uma exceção compatível ao layout antigo, não uma conversão
dos dados. Buffet e Recebimento reutilizam seus formulários técnicos existentes.

As assinaturas exibidas para medições recentes vêm da assinatura vigente da
unidade, sem depender das colunas legadas. Revisões pendentes deixam de apresentar
a assinatura anterior como vigente. A assinatura do dia seleciona explicitamente
as unidades e versões; o resumo diário considera legado e versões atuais. Não
é criada uma linha fictícia de assinatura diária para exibir esse resumo.

Quando coexistem formatos no mesmo dia, a revisão legada mantém seu escopo e sua
assinatura original. Uma assinatura antiga do dia não valida alterações recentes.
Uma revisão antiga de serviço sem versão encaminha ao formulário seguro antes
de permitir assinatura, em vez de assinar silenciosamente o conteúdo mais novo.

## C. Dados preservados

Não foram alterados schema, migrations, relações, núcleo de estados ou triggers.
FluxoOperacional, FluxoVersao, FluxoAssinatura, FluxoAssinaturaVinculo e FluxoEvento
permanecem intactos. Nenhuma conversão em massa foi implementada.

Assinaturas vigentes continuam bloqueando edição. Reabertura segue exigindo
permissões, confirmação, justificativa e competência aberta; a nova assinatura
continua obrigatória. Datas retroativas, horários reais, manutenção/inatividade,
Não servido, exclusões auditadas e arquivos/XMLs conservam as regras atuais.

As adaptações são de leitura, navegação e encaminhamento às operações existentes.
Não há migração de banco necessária para esta manutenção. A estrutura atual, com
as migrations das etapas anteriores, é uma dependência que deve ser confirmada
antes da publicação. Não se deve remover ou reverter essas migrations.

Não foram modificados arquivos de Hortifruti, Limpeza Diária/Semanal, seus
relatórios, autenticação, usuários ou permissões. Tenant-refactor não foi acessado.

## D. Alterações

As rotas principais e de Histórico passam a exportar os componentes recuperados.
Esses componentes receberam consultas compatíveis, projeção de assinatura vigente,
controle explícito de acesso e links protegidos. As actions de criação usam um
adaptador para os formulários originais; não duplicam validações sanitárias.

Arquivos novos centrais:

- `src/app/historico-operacional/compatible-create.ts`.
- `src/lib/operational-workflow/compatible-records.ts`.
- `src/components/compatible-workflow-records.tsx`.
- `src/components/compatible-day-review.tsx`.
- `scripts/test-compatible-experience.cjs`.
- `scripts/test-compatible-experience-browser.cjs`.

O inventário Git completo consta ao final deste documento.

## E. Testes

Ambiente: PostgreSQL 16 local isolado, com todas as migrations atuais, dados
sintéticos, Next em build de produção local e navegador Edge. Nenhuma conexão
ao banco de produção foi realizada. Prisma generate/validate usam o schema;
migrate deploy/status foram exercitados exclusivamente nos bancos isolados.

Aprovados:

- `npm.cmd run prisma:generate`, Prisma Client 6.5.0.
- `npx.cmd prisma validate`.
- `test-operational-workflow.cjs`: contrato, versões, permissões e atomicidade.
- `test-temperature-workflow.cjs` e `test-oil-workflow.cjs`: PostgreSQL real,
  datas/horários, múltiplas verificações, manutenção/inatividade, evidências,
  assinatura/reabertura, concorrência, exclusão e relatório.
- `test-group-workflows.cjs`: Buffet e Recebimento, 33 itens, rascunhos, XML,
  assinaturas por versão, escopo agrupado, concorrência e fechamento mensal.
- Status das migrations no PostgreSQL isolado atualizado.
- `test-compatible-experience.cjs`: criação pelos formulários originais, leitura
  de ambos os formatos, rascunhos sem projeção, assinatura vigente versus histórica,
  perfis distintos, encaminhamento de edição e oito páginas recuperadas.
- Comparação integral de conteúdo de 12 tabelas operacionais antes/depois das
  consultas das páginas: sem alteração de versões, assinaturas, registros, campos
  de foto, XMLs e fechamentos. Isso comprova o ensaio sintético, não os dados reais.
- Resumo de assinatura diária versionada sem criação de assinatura legada.
- `test-monthly-reopening.cjs`: reabertura/fechamento dos sete módulos e permissões.
- `test-operational-record-controls.cjs`: exclusão controlada, datas, permissões,
  auditoria e sete relatórios mensais, incluindo os três módulos preservados.
- `npm.cmd run lint`: sem erros ou warnings ESLint.
- `npm.cmd run build`: compilação, tipos e rotas aprovados.

O teste específico de navegador passou nas quatro telas principais e quatro
Históricos, navegação, criação pelo formulário original de Óleo, recuperação e
salvamento do rascunho de Temperatura, bloqueio de assinatura, cancelamento de
reabertura e assinatura diária pela tela recuperada. Também passou na importação
XML pelo modal antigo, recuperação de lote, finalização da conferência, download
idêntico do XML original e salvamento parcial/Não servido explícito/assinatura de
Buffet. Foram geradas 30 capturas em 1440, 390 e 320 pixels, sem overflow da página.
As tabelas técnicas mantêm rolagem interna. Foram inspecionadas visualmente telas
principais de Temperatura/Óleo/Buffet, Histórico de Recebimento, conferência e
serviço assinado, em desktop/mobile. Artefatos em
`.data/validation/compatible-experience`, fora do Git.

Falhas de validação corrigidas durante o trabalho: tipos de data após redirect,
nome de função de formatação, declarações let/const e encoding de textos escritos
pelo shell. Um assert de navegador confundia a propriedade disabled do input com
o bloqueio herdado do fieldset; a verificação foi corrigida para :disabled.
O ensaio de controles operacionais foi repetido após o build porque a execução
durante a geração de CSS não encontrou o diretório temporariamente recriado.
Um teste ampliado consultou o rascunho antes do término do salvamento; o banco
confirmou que ele estava preservado. O navegador passou a aguardar a nova versão
antes de consultar novamente, e a execução completa passou.
Nenhuma dessas falhas exigiu mudança no banco ou relaxamento de proteções.

Avisos de ferramenta: next lint depreciado e base Browserslist antiga. Não foram
atualizadas dependências durante uma manutenção de estabilização.

## F. Riscos e limitações

Não foi disponibilizada nem utilizada cópia consistente e autorizada do banco
atual. Portanto não foi comprovada a integridade de todos os dados reais, nem
o volume/performance dessa instalação. Os testes usam dados sintéticos.

Não foram confirmados commit publicado, schema efetivo, storage de arquivos ou
backup de produção. Não houve deploy, comparação com produção nem ensaio manual
de todos os PDFs da auditoria. Os relatórios foram testados localmente.

A comparação com ceded2c foi feita pelo código dos componentes e inspeção das
telas recuperadas. Não foi publicado um segundo ambiente com esse commit antigo
para comparação visual automatizada pixel a pixel.

Os controles internos de versão/reabertura permanecem necessários para os dados
recentes. A simplificação não autoriza editar uma assinatura válida nem elimina
a necessidade de regularizar revisões pendentes.

## G. Publicação

Pré-requisitos, sem execução automática:

1. Confirmar o commit efetivamente publicado no serviço Projeto-BPMA/Railway.
2. Conferir o schema e as migrations já aplicadas no banco correto, por acesso
   autorizado. Esta adaptação não adiciona migrations.
3. Garantir backup recuperável atual do banco e dos arquivos/evidências.
4. Ensaiar a branch sobre cópia consistente e autorizada do banco atual, isolada
   de produção e com seus arquivos disponíveis.
5. Comparar contagens, conteúdo, hashes dos anexos/XMLs/fotos, vínculos de notas,
   versões, assinaturas, exclusões e fechamentos antes/depois. Conferir registros
   posteriores a 24/10 nos quatro módulos, inclusive rascunhos e revisões.
6. Validar com colaboradores e responsáveis as telas, edição por perfil,
   assinatura, relatórios, PDF e fechamento mensal nessa cópia.
7. Publicar somente após revisão/aprovação, registrando versão e verificações.
8. Manter disponível o artefato/commit atualmente publicado para recuperação
   do código caso necessário. Preservar banco e arquivos atuais; não restaurar
   backup antigo nem reverter migrations como parte de rollback funcional.

Sem commit, push, deploy, seed, reset, db push, exclusão de dados reais, DROP ou
TRUNCATE. A branch de estabilização contém somente alterações revisáveis.

## H. Parecer final

**APTO PARA HOMOLOGAÇÃO**. Validações locais técnicas, funcionais e de navegador
aprovadas. A conferência final de `git diff --check` passou.
Não classificado como apto para publicação controlada: o ensaio sobre cópia do
banco atual e os pré-requisitos de produção permanecem pendentes.

O PostgreSQL isolado de testes foi parado após as validações, sem apagar os bancos
sintéticos. Os processos locais de navegador e servidor dos testes foram encerrados.

## Inventário final

Branch: `estabilizacao/experiencia-anterior-2026-10-28`. 26 arquivos rastreados modificados e 7 arquivos novos. Sem commit ou push.

Alterados:

- `src/app/controle-buffet-amostras/actions.ts`
- `src/app/controle-buffet-amostras/historico/legacy-page.tsx`
- `src/app/controle-buffet-amostras/historico/page.tsx`
- `src/app/controle-buffet-amostras/legacy-page.tsx`
- `src/app/controle-buffet-amostras/page.tsx`
- `src/app/controle-buffet-amostras/workflow-page.tsx`
- `src/app/controle-qualidade-oleo/actions.ts`
- `src/app/controle-qualidade-oleo/historico/legacy-history.tsx`
- `src/app/controle-qualidade-oleo/historico/page.tsx`
- `src/app/controle-qualidade-oleo/legacy-records.tsx`
- `src/app/controle-qualidade-oleo/page.tsx`
- `src/app/controle-qualidade-oleo/workflow-view.tsx`
- `src/app/controle-temperatura-equipamentos/actions.ts`
- `src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx`
- `src/app/controle-temperatura-equipamentos/historico/page.tsx`
- `src/app/controle-temperatura-equipamentos/legacy-records.tsx`
- `src/app/controle-temperatura-equipamentos/page.tsx`
- `src/app/controle-temperatura-equipamentos/workflow-view.tsx`
- `src/app/historico-operacional/actions.ts`
- `src/app/rastreabilidade-recebimento/actions.ts`
- `src/app/rastreabilidade-recebimento/historico/legacy-page.tsx`
- `src/app/rastreabilidade-recebimento/historico/page.tsx`
- `src/app/rastreabilidade-recebimento/legacy-page.tsx`
- `src/app/rastreabilidade-recebimento/page.tsx`
- `src/app/rastreabilidade-recebimento/workflow-page.tsx`
- `src/components/group-workflow-panel.tsx`

Criados:

- `docs/recuperacao-experiencia-2026-10-28.md`
- `scripts/test-compatible-experience-browser.cjs`
- `scripts/test-compatible-experience.cjs`
- `src/app/historico-operacional/compatible-create.ts`
- `src/components/compatible-day-review.tsx`
- `src/components/compatible-workflow-records.tsx`
- `src/lib/operational-workflow/compatible-records.ts`
