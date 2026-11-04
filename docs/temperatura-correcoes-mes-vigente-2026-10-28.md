# Temperatura — correções do mês vigente e reabertura

Branch mantida: `estabilizacao/experiencia-anterior-2026-10-28`. As alterações
anteriores da listagem diária foram preservadas. HEAD observado: `feef7bb`.
Não executei commit, push ou deploy.

**Situação:** implementação validada localmente para homologação. Publicação não
liberada: existe uma ocorrência de isolamento de teste, descrita abaixo, cujo
destino externo não foi identificado como produção ou homologação.

## Regras implementadas

A permissão `modulo.temperatura.editar_registros_mes_vigente` permite corrigir
registros existentes, inclusive de dias anteriores do mês/ano atual, usando a
data operacional em America/Sao_Paulo. Não autoriza criar registros retroativos,
editar datas futuras, ignorar fechamento mensal ou editar um registro assinado.

As permissões anteriores de edição do dia e de edição histórica foram preservadas.
A nova permissão, isoladamente, não dá acesso a outros meses. Usuários com uma
autorização histórica mais ampla continuam sujeitos à autorização que já possuíam;
o privilégio administrativo de DEV não foi removido.

A reabertura individual de Temperatura exige a permissão específica existente,
competência vigente, data não futura, mês aberto, confirmação e justificativa.
Reabrir não concede permissão de editar ou de assinar. A nutricionista pode
liberar a correção mesmo que seu perfil não tenha permissão de edição; o colaborador
autorizado corrige e alguém com permissão de assinatura valida novamente.

A tela inicial continua limitada a hoje, inclusive na lista complementar. O
Histórico ganhou links individuais de consulta/correção. Para quem tem somente
a nova permissão ou a de reabertura, as consultas são limitadas ao mês vigente,
até hoje, diretamente no Prisma. Quem já tinha consulta histórica ampla mantém
esse acesso. Não foram reintroduzidos controles dos quatro estados nas telas.

## Permissões e configuração

| Código | Tratamento |
| --- | --- |
| `modulo.temperatura.editar_registros_mes_vigente` | Nova, sensível; nome/descrição solicitados no catálogo |
| `modulo.temperatura.reabrir_registro` | Reutilizada, sensível; exibida como Reabrir registros assinados |
| `modulo.temperatura.assinar_historico` | Preservada; independente da edição e reabertura |

Os padrões legados sem PerfilAcesso vinculado incluem edição mensal para
COLABORADOR/NUTRICIONISTA/GERENTE e reabertura para NUTRICIONISTA; DEV mantém acesso
total. O padrão anterior de reabertura de GERENTE não foi ampliado por herança:
essa autorização pode ser concedida explicitamente na Gestão de Perfis.

**Perfis já vinculados não recebem concessões automáticas.** Seus vínculos
continuam sendo a autoridade. O cadastro cria/atualiza apenas os metadados do
catálogo quando um usuário autorizado abre a Gestão de Usuários. A concessão e a
revogação são feitas por Usuários e Perfis → Permissões, com as restrições de
permissões sensíveis e a auditoria já existentes. Perfis personalizados funcionam
sem depender do nome do perfil.

Na configuração final do cliente, conceder a edição mensal ao perfil de
colaboradores autorizado e reabertura/assinatura aos responsáveis designados.
Não foi executada atribuição em banco real.

## Legados, versões e assinaturas

Não foi necessária migration. Foram reutilizadas as cinco tabelas do núcleo,
transações, locks, versões imutáveis e vínculos de assinatura existentes.

Um legado é vinculado individualmente ao núcleo apenas durante uma correção,
assinatura ou reabertura explícita. A leitura não converte registros. A operação
confere updatedAt, registro ativo e o vínculo ainda ausente; cliques repetidos ou
formulários antigos não sobrescrevem uma operação posterior.

A versão inicial preserva integralmente o registro legado original, inclusive
campos de assinatura, fotos e timestamps, em `rascunho.registroLegadoOriginal`.
Os campos antigos de assinatura não são apagados. Assinaturas sem usuário ID
registrado são preservadas exatamente como estavam: não é inventado um signatário
ou uma assinatura FluxoAssinatura para preencher campos obrigatórios do núcleo.

Na reabertura legada, a evidência original é selada e a unidade é reaberta na mesma
transação. O núcleo recebe somente uma indicação interna de que a assinatura
legada original foi preservada e conferida. Esse caminho não é um parâmetro
público do formulário nem altera as regras de outros módulos. As constraints de
fechamento do PostgreSQL permanecem intactas. A assinatura seguinte é real, com
senha, usuário e vínculo à versão validada.

Nos registros já versionados, a reabertura apenas retira a vigência atual,
preservando FluxoAssinatura, vínculos, versões e eventos. Após reabrir, a assinatura
antiga aparece como evidência histórica; relatórios e consultas usam a vigência
do núcleo. Sem nova assinatura, a correção continua aguardando validação.

## Rastreabilidade e concorrência

O responsável, data, createdAt e horário originais da aferição são preservados.
O autor da correção é registrado separadamente. Horários legados ausentes não
são inventados nem substituídos pela hora da correção. As fotos existentes são
preservadas, inclusive em correções da situação do equipamento.

As versões guardam os conteúdos anteriores e novos. O evento
`CORRECAO_REGISTRO` identifica campos modificados, valores anteriores/novos, usuário,
horário e evento de reabertura associado. Também inclui valores calculados,
como status sanitário e ação corretiva. Imagens são identificadas por hash no
resumo; os bytes permanecem nas versões. A página individual permite consultar
essas evidências e a assinatura original.

As permissões são recarregadas do usuário/perfil/sessão dentro da transação.
Salvamento, assinatura e reabertura usam Serializable, versão esperada e o mesmo
lock por módulo do fechamento mensal. A vinculação do legado ocorre dentro desse
lock. O controle de duplicidade também reconhece legados já vinculados.
Falha na auditoria reverte dados, vínculo e versão juntos.

## Validações

Banco local isolado clonado de uma estrutura sintética já existente. Não foram
aplicadas migrations nem executados seed/reset/db push.

Passaram os 20 cenários solicitados, cobrindo:

- Hoje, ontem, início do mês, mês anterior, futuro e virada do mês.
- Permissão de edição sem criação retroativa ou assinatura implícita.
- Assinado bloqueado; motivo obrigatório; reabertura autorizada; nova assinatura.
- Nutricionista com reabertura sem edição; colaborador com edição sem assinatura.
- Legados e versionados, inclusive assinatura legada sem usuário ID.
- Preservação de responsável, horário, foto, observação, assinatura e conteúdo anterior.
- Revogação/restauração pela action real da Gestão de Perfis, sem restaurar
  automaticamente concessões revogadas ao cadastrar o catálogo novamente.
- Mês fechado, perfis personalizados e rejeição de registros duplicados.
- Corridas reais no PostgreSQL: salvar/assinar e duas reaberturas.
- Falha injetada na auditoria com rollback integral.
- Histórico e GET real do relatório mensal, com responsável e horário originais.

Navegador Edge com build de produção local: login separado por perfil, tentativa
forjada de habilitar o formulário assinado rejeitada pelo servidor, cancelamento,
justificativa, reabertura, edição de ontem, assinatura seguinte, mês anterior
negado, tela real de permissões e capturas em 1440/390/320 pixels. Sem overflow;
captura mobile da auditoria inspecionada visualmente.

Também passaram:

- `node scripts/test-operational-workflow.cjs`.
- `node scripts/test-temperature-daily.cjs`: listagem diária, dois formatos e
  turnos, Histórico acessível, fuso e bloqueios; a antiga comparação de hash do
  Histórico foi substituída pela verificação funcional porque este pedido altera
  legitimamente seus controles de correção.
- `node scripts/test-monthly-reopening.cjs`: regressão dos sete módulos.
- `npm.cmd run lint`: sem erros/warnings ESLint.
- Build Next: compilação, tipos e rotas aprovados, com URLs explicitamente locais
  no processo de build.
- `git diff --check`.

Artefatos sintéticos em `.data/validation/temperature-corrections`, fora do Git.
Não foi feito ensaio sobre cópia autorizada dos dados reais do cliente.

## Ocorrência de isolamento do teste — pendência obrigatória

Houve uma falha minha no teste inicial de cadastro do catálogo. O módulo novo
usava um import relativo de Prisma, que escapou da interceptação do cliente
isolado. A rotina de catálogo foi executada contra o destino externo configurado
no .env. A verificação local confirmou que esse destino não era localhost nem a
porta/base dos testes; não foram exibidas credenciais.

Essa rotina se limita a criar/atualizar metadados na tabela Permissao para:

- `modulo.temperatura.editar_registros_mes_vigente`.
- `modulo.temperatura.reabrir_registro`.

Ela não concede vínculos PerfilPermissao nem altera usuários, registros
operacionais, assinaturas ou versões. Porém, sem confirmar o ambiente e comparar
seus valores anteriores, **não posso afirmar que não houve alteração em produção**.
O usuário informou não saber confirmar se o destino era produção ou homologação.

O import foi corrigido para o cliente interceptado e os testes agora também
forçam DATABASE_URL e DIRECT_URL locais antes de carregar qualquer módulo.
As execuções seguintes e o build usaram explicitamente bases locais isoladas.
Não houve nova consulta ao destino externo para investigar ou reverter valores.

Separadamente, uma proposta inicial de concessão automática persistente da nova
permissão foi recusada pela revisão automática antes da execução. A solução final
registra somente o catálogo e mantém a atribuição sob controle dos perfis.

Antes de publicar, um responsável pelo ambiente deve identificar o destino do
.env, verificar os dois itens de catálogo e seus valores anteriores em backup/logs,
e decidir a correção de metadados se necessária. Não foi realizada reversão
automática sem essa identificação.

## Situação de homologação e limites

**APTO PARA HOMOLOGAÇÃO LOCAL da funcionalidade**, com testes aprovados.
**Publicação não liberada** enquanto a ocorrência externa e a compatibilidade
com a base real não forem auditadas. Não foram feitos commit, push ou deploy.

Nenhuma migration criada/removida/revertida. Nenhum seed, reset ou exclusão de
dados reais foi executado. Não foi utilizado prisma db push. Registros legados
com catálogo/parâmetros inválidos continuam sujeitos às validações sanitárias;
isso deve ser conferido na cópia autorizada, sem contornar essas regras.

Os módulos de Hortifruti, Limpeza, Buffet, Óleo e Recebimento não tiveram arquivos
operacionais alterados. O núcleo só ganhou preparação transacional interna e as
regras adicionais de Temperatura; os caminhos padrão foram cobertos por regressão.

## Inventário final de arquivos

13 arquivos rastreados modificados e 9 novos arquivos.

Alterados:

- `scripts/test-operational-workflow.cjs`
- `scripts/test-temperature-daily.cjs`
- `src/app/controle-temperatura-equipamentos/actions.ts`
- `src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx`
- `src/app/controle-temperatura-equipamentos/legacy-records.tsx`
- `src/app/controle-temperatura-equipamentos/workflow-actions.ts`
- `src/app/controle-temperatura-equipamentos/workflow-adapter.ts`
- `src/app/controle-temperatura-equipamentos/workflow-view.tsx`
- `src/app/usuarios/page.tsx`
- `src/components/compatible-workflow-records.tsx`
- `src/lib/operational-workflow/policy.ts`
- `src/lib/operational-workflow/service.ts`
- `src/lib/permissions.ts`

Criados:

- `docs/temperatura-correcoes-mes-vigente-2026-10-28.md`
- `scripts/test-temperature-corrections-browser.cjs`
- `scripts/test-temperature-corrections.cjs`
- `src/app/controle-temperatura-equipamentos/correction-audit.ts`
- `src/app/controle-temperatura-equipamentos/correction-policy.ts`
- `src/app/controle-temperatura-equipamentos/legacy-workflow.ts`
- `src/app/controle-temperatura-equipamentos/registro/[id]/page.tsx`
- `src/app/controle-temperatura-equipamentos/saved-record-page.tsx`
- `src/lib/register-temperature-correction-permission.ts`

Os processos de navegador/servidor de teste foram encerrados. O container local foi parado sem apagar os bancos sintéticos. Nenhuma reversão foi feita no destino externo não identificado.

## Auditoria posterior autorizada — 29/10/2026

Por orientação do usuário, o banco do `.env` passou a ser tratado como produção.
Uma consulta em transação PostgreSQL READ ONLY, sem imports da aplicação,
encontrou os dois metadados: a permissão de edição do mês foi criada em 28/10 às
22:21:21 de São Paulo e a de reabertura, criada em 24/10, foi atualizada no mesmo
intervalo de 28/10. Ambos estão com zero vínculos de perfil. As gravações são
compatíveis com a ocorrência acima; sem snapshot/log anterior, não é possível
provar a autoria nem recuperar os valores anteriores. Nenhuma reversão ou nova
escrita foi executada. Os testes posteriores usaram apenas bancos sintéticos
locais, sem modificar o arquivo `.env`. Evidências e limites detalhados em
`buffet-historico-e-auditoria-2026-10-29.md`.
