# Óleo — revogação ainda não executada no banco real

> Atualização posterior: a revogação dos oito registros foi **executada em produção
> em 03/11/2026 às 20:50:59 (São Paulo)**, após autorização expressa, confirmação
> autenticada do ambiente e backup completo com restauração testada. Consulte
> [o relatório da execução](execucao-revogacao-oleo-2026-11-03.md). O conteúdo abaixo
> registra a situação histórica anterior à autorização e à execução.

## Estado desta verificação

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`, HEAD
`36fe5b6bd30dd3c311d506875e381e1397c7d49a`, Git inicialmente limpo.
O trabalho anterior foi revisado em `correcoes-historicos-relatorios-2026-11-03.md`.
Não foi reimplementada a proteção nem a rotina de revogação. Nesta etapa foram
acrescentados apenas este documento e um teste de integração das interfaces.

**A regularização real não está concluída.** Nenhuma escrita externa foi realizada.
As oito assinaturas continuam vigentes na nova leitura do destino configurado.
Essa leitura não comprova, por si só, o vínculo desse destino com o banco do
serviço publicado. O usuário confirmou os nomes esperados: projeto StaySafe,
ambiente production, aplicação Projeto-BPMA e banco Postgres.

## 1. Código publicado e execução de dados são etapas distintas

O usuário confirmou que o deployment está ACTIVE, com build/deploy bem-sucedidos,
mensagem `feat: add scripts for historical regularization and validation` e logs
de `prisma migrate deploy` seguido de `next start`, com 61 migrations e nenhuma
pendente. Não relatou execução de regularização.

Também foi consultado, somente leitura, o status do commit no GitHub. A integração
Railway informou `success`, contexto `StaySafe - Projeto-BPMA`, domínio
`projeto-bpma-production.up.railway.app`, em 03/11/2026 às 23:16:20 UTC:

- [Status do commit publicado](https://api.github.com/repos/filipesnunes/Projeto-BPMA/commits/36fe5b6bd30dd3c311d506875e381e1397c7d49a/status).
- [Commit](https://github.com/filipesnunes/Projeto-BPMA/commit/36fe5b6bd30dd3c311d506875e381e1397c7d49a).
- [Deployment identificado pela integração](https://railway.com/project/276feaac-2d59-4471-bfbe-f2b8ca882b0b/service/b5df91cf-a0e6-4c17-8f84-8adff3f10bd6?id=74a8c1f8-21ed-42a1-b70d-63c10bd73317&environmentId=2f988bd0-96fc-429b-9d96-25c98b9bacff).

O HEAD da branch remota também corresponde a esse SHA. O Railway CLI local
retornou `Unauthorized`; não houve acesso autenticado ao contêiner em execução,
às referências do banco ou aos backups. A evidência de publicação é o status da
integração, corroborado pela confirmação de ACTIVE do usuário; ela não substitui
a identificação do PostgreSQL efetivamente associado ao serviço.

O arquivo `src/lib/oil-signature-permissions.ts` **nesse commit** exige
`user.perfil === "NUTRICIONISTA"`, usuário ativo, ausência de troca obrigatória de
senha, `usuarios.responsavel_tecnico` e a permissão do mecanismo. O commit de
proteção `6b1294b` é ancestral de `36fe5b6`. A política transacional também
recarrega sessão/permissões e exige senha, autoria independente, competência
aberta, conteúdo e versão elegíveis. COLABORADOR, GERENTE e DEV não obtêm
habilitação técnica por privilégio administrativo.

O código de proteção está, portanto, incluído no commit identificado da publicação.
Isso **não revoga assinaturas históricas automaticamente**.

## 2. Rotina disponível e escopo

O commit contém:

- `scripts/regularize-historical-records.cjs`: CLI manual; modo padrão `plan`,
  sem conexão; `simulate` restrito a base local; `apply` sujeito às salvaguardas.
- `scripts/lib/historical-regularization.cjs`: API interna de plano, validação,
  revogação transacional e auditoria.
- `scripts/audit-oil-signatures.cjs`: auditoria explicitamente somente leitura.
- `scripts/simulate-historical-regularization.cjs`: cópia de domínios para
  nova base PostgreSQL local isolada.

`railway.json` configura somente `npm run prisma:migrate:deploy` no pre-deploy.
Não há chamada ao CLI de regularização em startup, migrations, actions ou deploy.
`Post-deploy: Not started` não comprova falha dessa rotina: ela não está configurada
como etapa de publicação e não deve ser adicionada ali. `migrate deploy` não limpa
assinaturas históricas. Nenhuma nova migration é necessária para essa revogação.

## 3. Revalidação somente leitura

A auditoria e uma nova captura consistente foram executadas em transações
`READ ONLY`/Repeatable Read. A captura ocorreu em
`2026-11-03T23:24:34.067Z` (20:24:34 em São Paulo). Foram encontradas 61 migrations,
sem entrada incompleta. As assinaturas são os mesmos oito IDs e versões do plano
anterior; os hashes de todos os oito escopos permaneceram idênticos.

Todas são `FluxoAssinatura`, mecanismo `REVISAO_INDIVIDUAL`, usuário 11,
Anderson Fiorenzano, perfil **histórico** COLABORADOR. Cada registro continua com
fluxo FECHADO e apontador para sua assinatura. Esse estado é a origem do “Assinado
pelo Supervisor”, e não um cache visual isolado.

Não foram encontrados apontadores individuais legados ou assinaturas diárias
legadas concorrentes para os oito alvos. O resumo diário apresentado no Histórico
é calculado sobre as assinaturas versionadas efetivamente vigentes. O registro 127
usa uma assinatura versionada diária válida de Camila e está excluído do plano.

Em 26/10 existem também dois fluxos de rascunho pendentes, sem aferição projetada.
Eles já tornam o resumo **do dia** pendente, apesar da assinatura vigente do
registro 123. Não integram o plano, não foram removidos nem artificialmente
concluídos. Indicadores de dias não equivalem a contagens de registros assinados.

Outubro de 2026 não possui fechamento genérico nem legado de Óleo nessa captura.
Se isso mudar antes da intervenção, a rotina recusa a operação e exige reabertura
formal da competência. Não reabre meses nem concede edição operacional.

O registro **127**, data 29/10, continua FECHADO e apontando para
`cmvv1i13z01cnqg0x1qis3tbi`, de Camila Reinaldo, NUTRICIONISTA. Seu fluxo,
registro, assinatura e versões foram preservados integralmente nos testes.

## 4. O que muda na revogação

Em uma única transação Serializable, com lock operacional do módulo:

1. Conferir operador DEV ativo, autorização específica, destino/backup, plano,
   todos os hashes/versões/vínculos e competência antes de modificar qualquer alvo.
2. Limpar exclusivamente `assinaturaVigenteId` dos oito fluxos e passar FECHADO
   para COMPLETO, sem mudar a versão operacional ou `preenchimentoCompleto`.
3. Criar `FluxoEvento` de `REVOGACAO_ASSINATURA` com assinatura original, motivo,
   operador, autorizador, referência da aprovação, instante real, escopo, hash,
   backup e estados anterior/posterior.
4. Conferir que registros operacionais e versões anteriores continuam idênticos.

Não se excluem assinaturas ou vínculos. Não se modificam temperaturas, fita,
status sanitário, autores, horários, datas operacionais, logs ou assinaturas
legítimas. Não se substitui Anderson pela nutricionista. O modo manual não faz
alteração em lote de outras competências ou registros fora dos IDs aprovados.

Após a transação, o Histórico e o relatório deixam de considerar essas assinaturas
vigentes. O detalhe apresenta pendência de assinatura válida, identifica a
assinatura antiga como revogada e expõe a justificativa. Os dados permanecem
bloqueados para edição durante a manutenção de assinatura.

Os registros **123, 124, 125, 126, 128 e 129** podem receber revisão independente
por NUTRICIONISTA elegível, após a revogação autorizada e com competência aberta,
usando sua própria senha, identidade e data reais.

Os registros **121 e 122** são aptos à retirada da assinatura comprovadamente
indevida, mas **não estão liberados para nova assinatura**: falta comprovação do
ID do executor original no legado. Permanecem consultáveis. Essa dependência não
foi resolvida nem contornada; não se deve criar um evento ou inferir autoria pelo
nome apenas para liberar a validação.

## 5. Simulação atual e recuperação

A captura atual foi importada por mecanismo existente em nova base PostgreSQL
local isolada. Hashes de 16 tabelas foram comparados antes de simular alterações.
Isso é uma cópia consistente dos domínios, **não backup completo de produção**.

`scripts/test-oil-revocation-views.cjs` executou as oito revogações somente nessa
cópia. Renderizou os Server Components reais do Histórico e dos detalhes e chamou
o GET real do relatório mensal, antes/depois. Confirmou:

- As oito referências vigentes foram retiradas, com oito eventos auditáveis.
- Datas, temperaturas, fita, status sanitário, autorias e versões originais
  permaneceram idênticos; registros e fluxos fora do plano não mudaram.
- O registro 127 e a assinatura de Camila ficaram integralmente idênticos.
- Histórico, indicadores e relatório usam o estado do banco; assinaturas antigas
  seguem consultáveis como revogadas, sem o selo verde de vigência nos dias-alvo.
- Uma nutricionista **sintética local** assinou os seis registros elegíveis com
  senha e data atuais. Os 121/122 foram recusados por autoria inconclusiva.
- COLABORADOR foi recusado pelo bridge e por chamada direta à Server Action,
  inclusive com tentativa de atribuir permissões técnicas na visão de teste.
- Senha incorreta e tentativa de edição operacional foram recusadas.
- Foi injetada falha na segunda gravação de auditoria: a primeira revogação
  também foi revertida, sem deixar qualquer alteração ou evento parcial.
- `.env` permaneceu idêntico. Não foi utilizada credencial real nos testes locais.

A reversão transacional está comprovada. Recuperação após commit exige plano
supervisionado e backup completo recuperável: não se deve reativar automaticamente
assinatura indevida, sobrescrever revisão válida posterior ou restaurar todo um
backup antigo sobre novos lançamentos. O estado anterior preservado nos eventos
permite preparar compensação por ID com auditoria, após revisão/autorização.
**Restauração de backup completo de produção ainda não foi comprovada.**

## 6. O que falta para a intervenção real

| Requisito | Situação |
|---|---|
| Commit de proteção identificado na publicação | Confirmado pelo status Railway no GitHub e ACTIVE informado pelo usuário |
| Rotina presente no mesmo commit, sem execução automática | Confirmado |
| Oito assinaturas e escopos exatos | Revalidados somente leitura; anexo abaixo |
| Preservação do 127 e dados operacionais | Confirmada em cópia local e no teste de integridade |
| Outubro aberto | Confirmado apenas no instante da captura do destino configurado |
| Simulação da revogação e nova revisão | Passou na cópia local; aprovação formal para a intervenção real ainda necessária |
| Banco Postgres vinculado ao Projeto-BPMA/StaySafe/production | **Não confirmado de forma independente**; não presumir equivalência com `.env` |
| Backup completo, atual, do mesmo banco, com restauração testada | **Ausente de comprovação**, conforme informado pelo usuário |
| Autorização específica da intervenção, seus oito IDs e plano | **Pendente para a execução real** |
| Autoria original de 121 e 122 | **Inconclusiva**; bloqueia nova revisão desses dois registros |

Um operador com acesso ao Railway deve conferir a referência da conexão da
aplicação ao serviço **Postgres do mesmo projeto/ambiente**, sem enviar seu valor
no chat. O backup deve identificar esse mesmo destino, captura, SHA-256 e evidência
de restauração em isolamento. Só então se atualiza a leitura, confere-se se o plano
continua válido, repete-se/aprova-se a simulação e registra-se a autorização exata.

Se houver mudança de dados, fechamento ou assinatura, o plano atual não deve ser
aplicado: o hash de escopo impede a gravação e exige nova análise. Os flags e
manifestos exigidos pelo CLI permanecem obrigatórios. Não há comando de produção
pronto para executar nesta etapa porque os requisitos de identidade e recuperação
ainda não foram satisfeitos.

Não é necessário publicar novamente o código já presente apenas para executar
a manutenção manual. Publicação de código e regularização de dados devem continuar
separadas. Até a execução autorizada e a conferência posterior no banco correto,
as assinaturas indevidas reais continuarão vigentes.

## Artefatos e Git

Evidências locais em `.data/validation/revalidacao-oleo-20261103/`, fora do Git:
auditoria atual, captura consistente, plano atualizado, metadados da cópia e
`teste-interfaces/resultado.json`, além dos HTMLs antes/revogação/nova revisão.
O novo script passou na integração e na verificação de sintaxe; `git diff --check`
e a conferência de espaços dos arquivos novos passaram. Não houve alteração de
código de produção, schema ou migrations nesta etapa; não foi necessário repetir
o build já validado no trabalho anterior. Git final: dois arquivos novos,
mesma branch, sem commit ou push.

Não houve escrita externa, exclusão de registros/assinaturas, seed, reset,
db push, migration externa, deploy, commit ou push. O banco portátil de teste
foi encerrado ao finalizar as verificações.

## Anexo: assinaturas exatas e plano atual


Hash do plano: `de295a10c6a77c8ef6a24c769af1200d5bd0883934723c6a11e873909b2a013a`.

| Registro | Data operacional | Assinatura vigente indevida | Fluxo / versão | Nova assinatura após revogação |
|---|---|---|---|---|
| 121 | 2026-10-23 | `cmvtnppfh003nlb0xnbqjanmh` | `oil-legacy-121` / 1 | Bloqueada: autoria original inconclusiva |
| 122 | 2026-10-24 | `cmvtnp8l7003glb0x5bc0wwdo` | `oil-legacy-122` / 1 | Bloqueada: autoria original inconclusiva |
| 123 | 2026-10-26 | `cmvtno7f90034lb0x2c7bagk8` | `cmvp33jm4003dno0xvg494g9d` / 2 | Nutricionista independente e autorizada, com senha e competência aberta |
| 124 | 2026-10-27 | `cmvtnna5v002vlb0xm6f4jj57` | `cmvqh347i00bhno0xbv9s6slw` / 1 | Nutricionista independente e autorizada, com senha e competência aberta |
| 125 | 2026-10-28 | `cmvtnmq75002qlb0xzihi9qxq` | `cmvs4bybe00hrno0x1iulj8pb` / 1 | Nutricionista independente e autorizada, com senha e competência aberta |
| 126 | 2026-10-25 | `cmvtnoysg0039lb0xwn65uqxy` | `cmvp32gp9003ano0xs64amiwj` / 2 | Nutricionista independente e autorizada, com senha e competência aberta |
| 128 | 2026-10-30 | `cmvwikzbd01m5qg0xgtabwdb9` | `cmvv3efvo01ghqg0xqj8ai56x` / 1 | Nutricionista independente e autorizada, com senha e competência aberta |
| 129 | 2026-10-31 | `cmvwil8dn01maqg0xwfqnqm85` | `cmvwikjof01m0qg0x1pbhx0pm` / 1 | Nutricionista independente e autorizada, com senha e competência aberta |

Indicadores da simulação (dias, não quantidade de assinaturas): 28 assinados / três pendentes antes; 21 / dez após revogar oito registros; 26 / cinco após seis novas revisões sintéticas. O dia 26/10 já tinha dois rascunhos pendentes e permanece pendente no resumo diário. Medições e indicadores sanitários permaneceram idênticos. Nenhum desses resultados constitui execução em produção.
