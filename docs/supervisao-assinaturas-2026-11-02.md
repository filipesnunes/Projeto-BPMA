# Buffet e auditoria das assinaturas de supervisão — 02/11/2026

## Escopo e ambiente

BPMA/KPlatz atual, branch `estabilizacao/experiencia-anterior-2026-10-28`.
O ponto inicial desta manutenção foi `38fba1a`, com Git limpo. Nenhum acesso ao
Multitenant/tenant-refactor ou banco externo foi realizado. O `.env` foi
preservado, inclusive por comparação SHA-256 nos testes.

As escritas de validação ocorreram somente em bancos novos
`supervisionsignatures_*`, `buffetpending_*`, `buffethistory_*` e `buffetorder_*`,
no PostgreSQL portátil do workspace, restrito a `127.0.0.1:55479`. Foram clonados
do template sintético existente. Não houve aplicação de migrations, seed,
reset ou `db push`, nem alteração de schema/dependências.

Durante a execução, o HEAD mudou externamente para `d828cb5`, incorporando parte
das alterações desta manutenção. O agente não executou commit, push ou deploy e
não desfez esse commit. As alterações posteriores permanecem no working tree.

## Diagnóstico confirmado

No Buffet, `SERVICO`, `REVISAO` e `DIARIA` eram três bridges para o mesmo
`signWorkflow`: fechavam a mesma unidade operacional, vinculavam a assinatura à
mesma versão e retiravam o serviço da edição comum. Mudavam a permissão e o tipo
do `LogAssinatura`, mas somente `SERVICO` verificava o executor dos itens. Essa
verificação ainda desconsiderava itens classificados como Não servido e autores
de correções. As alternativas não representavam três etapas sanitárias distintas.

As actions antigas também permitiam assinar itens, assinar todos os itens e
revisar o serviço sem o contrato de versão do serviço. O formulário versionado
apresentava simultaneamente as três opções, além de assinaturas individuais.

Temperatura e Recebimento verificavam permissões, senha e versão, porém não
segregavam os autores de execução/correção do revisor. As permissões genéricas
também herdavam o acesso administrativo de DEV sem provar habilitação técnica.

Na Limpeza Semanal, o supervisor podia assumir os itens sem executor e assinar
imediatamente a supervisão das mesmas atividades. A autorização aceitava
qualquer entrada de uma lista que incluía responsável técnico, assinatura diária
ou edição histórica, em vez de exigir a permissão de supervisão. Esses são
problemas confirmados no código; não são afirmações sobre usuários reais.

Na Limpeza Diária já existia bloqueio de autoassinatura, inclusive em lote.
Entretanto, a autorização por permissão genérica não distinguia o papel de
supervisor operacional; registros sem ID de executor eram comparados pelo nome;
e atualização/log não eram atômicos. O lote não vinculava a operação ao conteúdo
que havia sido consultado. Esses pontos foram corrigidos preservando as duas
etapas de execução e supervisão.

## Matriz por módulo

As classificações descrevem o problema anterior: A correto; B interface;
C autorização; D escopo, estado ou consistência. Todos os tipos mensais seguem
separados das assinaturas operacionais; ver a ressalva específica abaixo.

| Módulo | Mecanismos e escopos | Responsáveis e permissões para novas assinaturas operacionais | Duplicidades/riscos confirmados | Correção e resultado | Testes |
| --- | --- | --- | --- | --- | --- |
| Hortifruti | Procedimento com responsável; revisão técnica diária; fechamento mensal separado | Executor mantém permissões operacionais. Revisão: NUTRICIONISTA, `usuarios.responsavel_tecnico`, `modulo.hortifruti.assinar_dia` | C: herança administrativa não comprova habilitação. D: revisão diária sem conferência do conteúdo apresentado, período ou transação do log | Perfil/permissão atuais e sessão conferidos em transação; senha própria; data não futura; competência aberta; escopo por hash dos registros; log e assinatura atômicos. Formulário operacional intacto | Perfis negados, senha, escopo desatualizado, assinatura autorizada, duplicação e relatório |
| Temperatura | Verificação individual; seleção diária de verificações/versões; assinaturas antigas; reabertura; mensal separado | NUTRICIONISTA + RT + `modulo.temperatura.assinar_historico` (individual) ou `assinar_dia` (seleção diária) | C: ausência de segregação; privilégio administrativo confundido com qualificação. Individual e diária são escopos legítimos diferentes, sem necessidade de remover o individual | Autoria original e salvamentos da cadeia de versões verificados por IDs/eventos; executor/corretor não revisa; assinados não entram em nova seleção. Legados sem prova de autoria não recebem nova assinatura pelo atalho antigo | Revisão individual/diária, perfis, autoassinatura, escopo, duplicação, identidade do revisor, relatório |
| Óleo | Individual, seleção diária e legado de supervisor; mensal separado | Política anterior: NUTRICIONISTA + RT + permissão específica individual/diária/mensal | A: a correção anterior já impede herança administrativa, colaborador e autoassinatura; legado sem autoria comprovada já é bloqueado | Sem alteração funcional nas actions, bridge ou política do Óleo | Bridge real: perfis indevidos, senha incorreta, assinatura autorizada, autoassinatura e relatório |
| Buffet/Amostras | Agora somente `SERVICO` para novas validações; uma assinatura por serviço/versão. Mecanismos e assinaturas individuais antigos continuam históricos. Mensal separado | NUTRICIONISTA + RT + `modulo.amostras.assinar_servico`; executor e autores de salvamentos/correções da cadeia não podem revisar | B/C/D: três alternativas fechavam a mesma versão com regras diferentes; atalhos antigos e assinaturas individuais redundantes | Uma interface e um bridge canônico; validação dos campos reais e ações corretivas; NS conta como resolvido, mas não dispensa segregação. Aliases e actions individuais/revisões alternativas bloqueados no servidor. Não marca itens como ASSINADO | Serviço parcial/completo, crítico com ação, NS, perfis e permissões, senha, aliases diretos, múltiplos autores, versão, duplicação, concorrência, reabertura, assinaturas antigas, regressões de salvamento/histórico/ordem, relatório e navegador |
| Rastreabilidade/Recebimento | Revisão de uma nota com seus itens/versão; seleção diária de notas/versões; mensal separado | NUTRICIONISTA + RT + `modulo.rastreabilidade.assinar_dia` | C: ausência de segregação. B: texto compartilhado não identificava claramente nota versus seleção diária | Autoria e permissão conferidas no backend e nos controles de seleção; formulário de uma nota diz exatamente qual conteúdo valida; lote mantém notas independentes. Dados fiscais/itens não são modificados pela assinatura | Notas distintas, lote/itens preservados, executor/corretor, perfis, nota única versus conjunto, outro recebimento não afetado, relatório e navegador |
| Limpeza Diária | Assinatura de execução; supervisão individual ou lote de atividades aguardando supervisor; revisão técnica diária distinta; mensal separado | Execução mantém autorização operacional existente. Supervisor operacional: GERENTE ou NUTRICIONISTA + `modulo.limpeza_diaria.assinar_historico`; lote exige também `assinar_todos`. Revisão técnica diária: NUTRICIONISTA + RT + `assinar_dia` | C/D: permissão genérica não qualifica supervisor; nomes não provam identidade; concorrência/estado e log não atômicos | IDs de executor obrigatórios para nova supervisão; sem autoassinatura; sessão/perfil/permissões/senha atuais; timestamp individual ou hash do lote; transação serializável com lock do módulo e competência aberta. Lote não assume execução | Execução real por colaborador, supervisão por gerente independente, senha, versão antiga, lote, autoassinatura, concorrência, preservação do executor, relatório |
| Limpeza Semanal | Execução por item ou lote de pendentes; supervisão por área/semana; revisão técnica diária distinta; mensal separado | Execução mantém permissões anteriores. Supervisão operacional: GERENTE ou NUTRICIONISTA + `modulo.limpeza_semanal.assinar_dia`. Revisão técnica diária exige NUTRICIONISTA + RT + `assinar_dia` | C/D: autorização por edição/RT isolados; assunção de pendentes pelo próprio supervisor | Retirada a assunção no caminho de supervisão. Exige execução prévia por outro ID comprovado; hash da área/semana; senha, sessão, competência de cada atividade e estado atuais; log/transação atômicos. Ciclo semanal e execução separados preservados | Pendentes não assumidos, executor igual ao supervisor rejeitado, perfil indevido, revisão por outro usuário, duplicação, executor preservado e relatório |

## Política e interfaces

`signature-authorization.ts` distingue revisão técnica de supervisão operacional.
A habilitação técnica é conservadora: não existe no schema uma delegação
profissional formal para outro perfil. Um PerfilAcesso personalizado continua
podendo conceder/revogar a permissão específica de um usuário com perfil base
compatível. A mera inclusão de RT/permissões em COLABORADOR, GERENTE ou DEV não
o transforma em nutricionista. Não foram criados perfis, enums ou permissões.

`refreshWorkflowActor` recarrega a sessão, status, perfil ativo, troca obrigatória
de senha e permissões no momento da transação. Os bridges verificam a senha do
próprio usuário e as evidências de autoria; valores de ator/perfil enviados pelo
cliente não são aceitos como autorização.

O núcleo operacional continua controlando competência, versão e snapshots
persistidos, duplicação, fechamento e reabertura. A constraint preexistente
`fluxo_assinatura_vigente` já impede estado aberto/completo com assinatura
vigente; a tentativa sintética foi rejeitada pelo PostgreSQL. Não foi necessária
alteração no núcleo ou na estrutura do banco para esse ponto.

O Buffet apresenta um único bloco “Validação do Serviço”, com nome/data,
resolvidos, não servidos, alertas, responsáveis e situação. Há somente
“Assinatura do responsável pelo serviço”, confirmação de senha e “Assinar
serviço” para o revisor elegível. Parcial informa pendências; usuário inelegível
não recebe senha/botão. Assinado informa nome, horário e versão, preserva a
reabertura autorizada e permite consultar os vínculos históricos.

No Recebimento, “Assinar recebimento” abrange uma nota/versão; o seletor diário
abrange somente as notas/versões escolhidas. A seleção não inclui notas do
próprio executor/corretor. Na Temperatura continuam disponíveis a revisão de
uma verificação e a seleção diária, sem validar novamente verificações fechadas.

## Históricos e limitações deliberadas

- Nenhuma assinatura real foi consultada, convertida, apagada ou invalidada.
  Não é possível concluir que assinaturas reais foram indevidas apenas a partir
  das falhas encontradas no código. Uma eventual regularização de dados reais
  depende de auditoria somente leitura autorizada e de decisão do hotel.
- `FluxoAssinatura`, vínculos, versões, eventos e logs anteriores permanecem
  consultáveis. Foram testados históricos dos mecanismos SERVICO, REVISAO e
  DIARIA, inclusive criados pelos bridges anteriores do commit `38fba1a`.
- A reabertura usa o procedimento existente: conserva a assinatura anterior e
  as versões, retira apenas sua vigência sobre a versão atual e exige nova
  assinatura. Não transforma assinatura global em assinaturas individuais.
- Registros antigos sem autoria original comprovável continuam acessíveis;
  novas assinaturas técnicas nesses registros são bloqueadas com explicação.
  Não foram vinculados automaticamente a novos fluxos ou “regularizados” por
  comparação de nomes. As actions legadas do Buffet não podem contornar esse
  bloqueio nem criar assinaturas individuais novas.
- Hortifruti mantém responsável textual, sem ID de executor. Isso impede
  comprovar segregação individual por identidade estável nesse modelo. A revisão
  técnica diária registra o escopo efetivamente consultado; não foi inventado
  vínculo profissional/identidade a partir do nome nem alterado o procedimento.
- Os modelos diários legados não têm a cadeia de versões dos quatro módulos
  versionados. Novas revisões registram hash e IDs/timestamps no log. Esse
  registro de escopo não converte assinaturas antigas nem implementa um novo
  ciclo de invalidação/reassinatura diária depois de edições posteriores.
- **Fechamento mensal preservado conforme a restrição do pedido do Buffet.**
  Não foram alterados fechamento, reabertura mensal, indicadores, exigências de
  pendência, assinatura ou relatórios mensais. A auditoria identificou que
  `canSignModuleMonthlyClosure` ainda aceita a herança administrativa de DEV nos
  módulos diferentes de Óleo, embora nomeie a responsabilidade como técnica.
  O usuário confirmou expressamente a preservação da autorização mensal atual e
  o registro desse risco na auditoria. Essa regra mensal preexistente não recebe
  aqui homologação de habilitação técnica. Óleo já possui a restrição técnica
  específica. Nenhuma mudança de autorização mensal está pendente nesta etapa.

## Validações

1. `scripts/test-supervision-signatures.cjs`: 22 cenários integrados com banco
   local sintético, atravessando os sete módulos. Inclui conferência das
   permissões revogadas, sessão inválida/inatividade, senha incorreta,
   autoassinatura, múltiplos participantes, versão antiga, duplicação e corrida,
   serviço fechado, reabertura, preservação de evidências e competência fechada.
2. Sete GETs reais de relatórios mensais com fixtures sintéticas: HTTP 200,
   impressão presente e fingerprints de assinaturas/logs/versões preservados.
   Não houve alteração nos arquivos dos relatórios.
3. Regressões existentes do Buffet: pendências/salvamento, histórico e ordenação
   passaram em três bancos locais novos. Os revisores das fixtures agora são
   nutricionistas independentes; os testes deixaram de depender de autoassinatura
   ou de REVISAO como atalho.
4. `scripts/test-supervision-signatures-browser.cjs`: Next de produção local e
   Edge real. Login, assinatura única, senha incorreta/correta, itens intactos,
   estado assinado, reabertura e segunda assinatura, parcial, serviço próprio,
   colaborador sem controles, histórico, escopo de uma nota e impressão passaram.
   Capturas inspecionadas em 1440px e 390px, sem overflow horizontal.
5. Prisma Client 6.5.0 gerado; lint sem erros/warnings de ESLint; TypeScript e build
   passaram. Avisos preexistentes do Next sobre `next lint` e Browserslist não
   foram tratados nesta manutenção. `git diff --check` passou.

Os testes usam o servidor local e dados sintéticos. Não representam homologação
no Railway nem inspeção das assinaturas reais do hotel. Não houve deploy.

## Arquivos principais

- Buffet: `actions.ts`, `workflow-adapter.ts`, `workflow-page.tsx`,
  `signature-history.tsx`, `service-history-list.tsx` e a apresentação legada.
- Compartilhados: `group-workflow-panel.tsx`, `group-workflow-list.tsx`,
  `compatible-day-review.tsx`, `historico/technical-signature.tsx`,
  `historico-operacional/actions.ts`, `module-signatures.ts`,
  `signature-authorization.ts`, `legacy-review-scope.ts`,
  `operational-workflow/group-signatures.ts` e `review-eligibility.ts`.
- Temperatura: bridge, `workflow-view.tsx` e `saved-record-page.tsx`.
- Recebimento: `workflow-page.tsx`, além do bridge compartilhado.
- Limpeza: `actions.ts`, `signature-policy.ts`, `supervisor-signature-form.tsx`,
  `weekly-permissions.ts`, formulários diário/semanal e históricos envolvidos.
- Testes novos de supervisão e ajustes nas três fixtures de regressão do Buffet.

O núcleo `operational-workflow/service.ts` foi auditado e permaneceu inalterado.
Sem modificação funcional da política do Óleo, do formulário operacional de
Hortifruti, dos procedimentos sanitários, do schema ou do banco externo.
