# Óleo — autorização, segregação e auditoria das assinaturas

## Diagnóstico e escopo

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`, inicialmente
limpa. Nenhum acesso ao Multitenant, banco externo ou credenciais publicadas.

A falha foi reproduzida executando o bridge do HEAD anterior em PostgreSQL
local: COLABORADOR com `modulo.oleo.assinar_historico` assinava como supervisor,
inclusive a própria verificação. O bridge individual verificava apenas essa
permissão e senha, sem exigir habilitação ou verificar executor/corretores.
O bypass administrativo de `hasPermission` fazia DEV satisfazer a autorização
automaticamente. A diária exigia responsável técnico, mas não impedia a
autoassinatura. A UI individual repetia a autorização insuficiente.

`LogAssinatura.tipo = SUPERVISOR` descreve a operação; não é perfil nem prova
de habilitação. O perfil real continua preservado nos snapshots `perfil` e
`usuarioPerfil`. Não houve troca de nomes, perfis, timestamps ou evidências.

## Caminhos auditados

1. `signRegistroSupervisorAction` → `signOilWorkflowAction` → bridge individual.
2. Formulário salvo e editor versionado → `signOilWorkflowAction`.
3. Seleção diária do Histórico/fluxos → mesmo bridge em modo diário.
4. `signModuleDayAction` → `signLegacyOilDay`, para diárias legadas.
5. `signModuleMonthlyClosureAction` → `closeOperationalMonth`, contexto history.
6. `closeMonthAction` do Óleo → fechamento no contexto legacy.
7. Gerenciamento de Períodos → `closeReopenedOperationalMonth`, contexto management.
8. Exibição no Histórico, formulários, revisão diária compartilhada e relatório
   mensal. A action compartilhada de grupos aceita somente Amostras e
   Rastreabilidade e rejeita Óleo; não constitui um caminho alternativo.

## Política aplicada e definição de habilitação

Centralizada em `canSignOilSupervisor`. Requer NUTRICIONISTA, usuário ativo,
sem troca obrigatória de senha, `usuarios.responsavel_tecnico` e a permissão
específica: `assinar_historico`, `assinar_dia` ou `assinar_fechamento_mensal`.
As três permissões do Óleo passaram a ser sensíveis no catálogo existente.
Não foram concedidas permissões nem alterados vínculos no banco real.

Perfis personalizados continuam administráveis em Usuários e Perfis: para
NUTRICIONISTA com `PerfilAcesso`, contam somente as permissões efetivamente
concedidas nesse perfil. Sem vínculo personalizado, preserva-se o catálogo
padrão de NUTRICIONISTA. O sistema não possui permissões individuais avulsas ou
lista de múltiplos perfis por usuário; o vínculo real é `perfilAcessoId`.

COLABORADOR é bloqueado mesmo recebendo todas as permissões por engano.
GERENTE e DEV também são bloqueados: permissões administrativas não demonstram
habilitação técnica. Em 31/10/2026, o usuário confirmou a política: permitir
somente NUTRICIONISTA com as permissões exigidas e bloquear os demais até existir
delegação formal. A implementação existente já corresponde a essa decisão;
a pendência de definição de acesso está encerrada. Não foi criado mecanismo
de delegação baseado em permissão genérica.

O banco não possui cadastro de registro profissional, documentos de habilitação
ou designação individual do responsável técnico. O hotel deve conferir essa
habilitação documental antes de atribuir NUTRICIONISTA e responsável técnico.
O controle implementado prova a autorização sistêmica, não certifica habilitação
profissional externa. Uma delegação para outros perfis exige definição e
implementação formal adicionais.

## Segregação e integridade

Dentro da transação de assinatura, o backend recarrega sessão, usuário e
permissões, verifica período, versão, conteúdo, completude e senha atual do
assinante. Assinatura diária mantém escopo explícito de uma única data;
assinaturas futuras são rejeitadas. O advisory lock e isolamento Serializable
existentes continuam protegendo contra assinatura concorrente.

O responsável original é identificado pela primeira versão materializada do
registro, correlacionada com seu evento de criação/salvamento e `usuarioId`.
Quem salvou correções materiais posteriores também integra os participantes.
Nenhum deles pode supervisionar essa verificação. O bloqueio usa IDs, inclusive
para administradores; nomes iguais não equivalem a identidades iguais.
Eventos apenas de reabertura/assinatura não são tratados como execução.

Legados possuem somente o nome do executor. O autor do vínculo de adoção não
é tratado como executor original. Nesses casos a segregação é inconclusiva e
novas assinaturas individuais ou diárias são bloqueadas, inclusive após adoção
ou reabertura. A interface explica a necessidade de comprovação e regularização
autorizada. Não se inventou ID, assinatura ou equivalência baseada em nome.

Novos logs incluem snapshot da política `oleo-supervisao-v1`, perfil, permissões
exigidas, IDs dos participantes e versões assinadas. Os logs anteriores não são
atualizados. A interface usa a mesma elegibilidade para oferecer apenas registros
que o assinante pode revisar. Um POST direto continua sujeito a todas as verificações.

Fechamento mensal permanece separado da revisão das verificações: exige a
permissão mensal e responsável técnico; os contextos legacy/management mantêm
também `fechar_mes`. A senha é conferida novamente dentro da transação do Óleo.
O fechamento não cria nem substitui assinaturas individuais/diárias. Reabertura
mensal mantém o controle DEV já existente, sem habilitar DEV como supervisor.
Alterações em utilitários compartilhados estão condicionadas ao módulo Óleo.

## Relatórios e interface

Preservados responsável pelo preenchimento, revisão vigente e assinaturas
históricas. O formulário mostra escopo/versão antes de pedir senha e remove
controles de assinatura dos colaboradores e de usuários sem habilitação.
Na revisão diária, unidades próprias ou sem autoria comprovável não são
oferecidas para assinatura. Legados continuam consultáveis e corrigíveis
conforme as permissões existentes.

O relatório mensal mantém as evidências registradas, sem reclassificar ou
renomear assinantes antigos. Passou a apresentar também a assinatura individual
legada, antes omitida em favor da diária, e o horário da revisão. Registros
reabertos continuam com nova assinatura pendente. O nome do executor nunca é
usado como fallback de supervisor.

## Auditoria somente leitura

Arquivos: `scripts/audit-oil-signatures.cjs` e
`scripts/lib/oil-signature-audit.cjs`. A rotina não importa sessão, catálogo ou
serviços de escrita da aplicação. Executa `SET TRANSACTION READ ONLY` dentro de
uma transação Repeatable Read, incluindo registros excluídos no banco, sem
middleware que os omita. Não executa DDL, seeds, migrations ou correções.

Analisa registros, versões, eventos, vínculos, assinaturas vigentes/históricas,
logs, diárias, fechamentos, perfis atuais e disponibilidade de auditorias de
permissão. Exporta IDs e timestamps sem nomes, senhas ou hashes de credenciais.
Permissões/perfis atuais são explicitamente marcados sem valor de prova histórica.
Uma assinatura antiga sem evidência não é declarada irregular por esse motivo.

Classificação por evidência:

- A: autorização sistêmica comprovada por snapshot coerente do novo controle,
  escopo, versão e segregação.
- B: potencial irregularidade, como perfil COLABORADOR registrado ao assinar.
- C: autoassinatura/validação de correção própria comprovada por IDs e versões.
- D: informações insuficientes para comprovar todos os requisitos.

A categoria C tem precedência sobre B. Quantidades representam evidências,
com identificadores e registros associados, não necessariamente registros
distintos. Evidências históricas continuam no relatório mesmo após reabertura.

Foi testada apenas em dados sintéticos. O snapshot local de teste apresentou
A=9, B=1, C=3, D=2; esses números **não representam o KPlatz**. A contagem real
permanece desconhecida, pois nenhum banco externo foi consultado.

Comando local, substituindo o identificador pela base sintética das fixtures:

```powershell
node scripts/audit-oil-signatures.cjs --read-only --local-database oilsecurity_IDENTIFICADOR --output .data/auditoria-oleo.json
```

Após autorização específica e conferência do destino correto, a rotina pode ser
executada por um responsável em ambiente com acesso somente leitura ao banco:

```powershell
node scripts/audit-oil-signatures.cjs --read-only --allow-configured-database-read-only --output .data/auditoria-oleo.json
```

O segundo modo usa DIRECT_URL, com fallback para DATABASE_URL do ambiente/.env,
sem alterá-los nem exibi-los. A origem do `.env` local continua desconhecida:
esse modo **não foi executado nesta manutenção**. Preferir credencial PostgreSQL
que já tenha apenas SELECT, como proteção adicional. O relatório deve permanecer
em local de acesso restrito por conter identificadores internos.

## Procedimento proposto de regularização — requer aprovação

1. Executar e revisar a auditoria no destino confirmado, mantendo seu snapshot.
2. Identificar registros e versões B/C; analisar D com evidência humana, sem
   presumir que a permissão atual existia no passado.
3. Conferir identidade original, habilitação profissional e designação do revisor.
4. Aprovar os registros exatos, justificativa e responsável pela regularização.
5. Respeitar a competência: se fechada, reabertura mensal somente pelo fluxo
   autorizado; reabrir apenas as verificações que exigem correção/revisão.
6. Em registros com autoria por ID comprovada, usar reabertura e nova validação
   por nutricionista independente. Conservar assinaturas e versões originais.
7. Para legados sem ID comprovado, definir antes um procedimento formal para
   vincular a evidência de autoria de maneira auditável. O fluxo atual bloqueia
   a nova assinatura: reabrir sozinho não resolve a falta de identidade.
   Não gravar manualmente um ID inferido por nome nem fabricar assinatura.
8. Conferir a nova versão e seus logs e somente então fechar novamente o período,
   quando aplicável. Nenhuma regularização foi executada automaticamente.

## Validações executadas

Somente PostgreSQL local em `127.0.0.1:55479`, com bases sintéticas clonadas de
schema de teste existente e URLs fixadas antes dos imports. `.env` preservado
e conferido por hash. Não foram executadas migrations.

Passaram:

- `node scripts/test-oil-signature-security.cjs`: reprodução do bridge anterior;
  COLABORADOR com concessão indevida, GERENTE/DEV, NUTRICIONISTA com/sem RT e
  permissões; assinaturas individual/diária/mensal independentes; senha; autoria
  e correções por IDs; homônimos; revogação; usuário/perfil inativos; requisições
  diretas/compartilhadas; legados sem prova; reabertura; corrida de assinaturas;
  assinaturas antigas intactas; auditoria A–D e tentativa de escrita rejeitada
  pela transação read only; relatório mensal.
- `node scripts/test-oil-signature-security-browser.cjs`: login local, edição
  pelo colaborador sem UI de assinatura; DEV sem habilitação; própria verificação
  e legado bloqueados; senha incorreta; POST direto com identificador real da
  Server Action como colaborador negado; nutricionista independente assina e
  bloqueia o registro; desktop/mobile.
- `node scripts/test-oil-corrections.cjs` e
  `node scripts/test-oil-corrections-browser.cjs`: regressão de edição, fita,
  responsável original, permissões, assinaturas, reabertura, auditoria, legado,
  concorrência e relatório. Fixtures agora concedem RT à nutricionista e esperam
  bloqueio para assinatura de legado sem prova, conforme a nova política.
- `node scripts/test-oil-strip.cjs`: regressão da fita, temperatura, omissão,
  sem utilização, correções, dados históricos e relatório. O teste de assinatura
  usa nutricionista independente, em vez do DEV que executou o registro.
- `node scripts/test-oil-strip-browser.cjs`: cinco fitas/status, sem aferição,
  sem utilização, edição de observação, recarga e larguras 1440/390/320.
- `node scripts/test-temperature-corrections.cjs`: regras dos demais módulos
  preservadas na regressão compartilhada de Temperatura.
- CLI de auditoria com `--read-only --local-database`, sem qualquer escrita.
- `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build` e
  `git diff --check`.

Evidências locais ignoradas pelo Git: `.data/validation/oil-signature-security`
(fixtures, auditoria JSON, relatório HTML e capturas), além das suítes de
correção/fita. As bases sintéticas foram preservadas.

## Arquivos e status de homologação

Criados:

- `src/lib/oil-signature-permissions.ts`
- `src/app/controle-qualidade-oleo/signature-policy.ts`
- `scripts/audit-oil-signatures.cjs`
- `scripts/lib/oil-signature-audit.cjs`
- `scripts/test-oil-signature-security.cjs`
- `scripts/test-oil-signature-security-browser.cjs`
- Este documento.

Alterados:

- Óleo: `actions.ts`, `legacy-day-signature.ts`, `saved-record-page.tsx`,
  `workflow-adapter.ts`, `workflow-view.tsx`.
- `src/app/relatorios/controle-qualidade-oleo/mensal/route.ts`
- `src/components/compatible-day-review.tsx`
- `src/lib/module-signatures.ts`, `monthly-period-permissions.ts`,
  `monthly-periods.ts`, `permissions.ts`.
- `src/app/historico-operacional/actions.ts`
- `src/app/gerenciamento-periodos/actions.ts`
- `scripts/test-oil-corrections.cjs`, `test-oil-corrections-browser.cjs`,
  `test-oil-strip.cjs`.

Homologação local aprovada nos cenários acima. Produção não auditada ou publicada;
aparelhos móveis físicos não testados. Delegação técnica de outros perfis e
regularização de legados sem autoria comprovada continuam exigindo definição
formal. Não houve alterações de dados reais, assinaturas antigas, permissões
reais, migrations, db push, seed, reset, commit, push ou deploy.

Git final da implementação de 30/10/2026: 16 arquivos rastreados modificados e sete arquivos
novos, na mesma branch de estabilização. Capturas de desktop e mobile foram
inspecionadas; não houve overflow horizontal nas verificações do navegador.

Em 31/10/2026, a confirmação da política alterou somente este documento, sobre
Git inicialmente limpo. Nenhuma regra de código ou dado precisou ser alterado;
as validações técnicas acima se referem à implementação anterior. O diff desta
atualização documental passou em `git diff --check`, sem commit ou push.
