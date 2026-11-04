# Conferência final de revisões retroativas — 04/11/2026

Branch: `estabilizacao/experiencia-anterior-2026-10-28`.
Durante esta etapa, a base local passou a ser o commit
`7e84633` (`feat: implement retroactive review functionality`), criado fora das
ações desta manutenção. Esse commit e todas as alterações locais foram preservados.
Não houve commit, push, deploy ou acesso ao banco real nesta conferência.

## Resultado funcional

Uma revisão retroativa não fica somente no log. Nos módulos versionados, ela
gera assinatura vinculada à versão, atualiza `assinaturaVigenteId` e coloca a
unidade em FECHADO. Na Limpeza, atualiza a supervisão das atividades selecionadas;
em Hortifruti, a revisão vigente do dia. Os logs continuam sendo a trilha da
operação, com justificativa, natureza, escopo, data real e ressalvas.

| Módulo | Efeito nos indicadores e no Histórico | Revisão gerencial |
| --- | --- | --- |
| Óleo | Revisão vigente reconhecida; a revisão técnica da nutricionista elimina a pendência técnica da data | Aparece como gerencial; mantém a pendência técnica, explicitada no Histórico/fechamento |
| Limpeza Diária | O dia é reconhecido como revisado quando todas as atividades persistidas estão supervisionadas; revisão parcial mantém o dia pendente | Dia revisado, com natureza gerencial e indicador separado de ausência de validação técnica |
| Limpeza Semanal | Supervisão por atividade/área e resumo dos dias atualizados; assinatura diária fictícia não é criada | Natureza gerencial explícita e contagem separada |
| Buffet / Amostras | Serviço validado na versão atual; o dia deixa de estar pendente quando todos os serviços/unidades aplicáveis estão revisados | Revisão gerencial identificada, sem atribuir qualificação profissional |
| Temperatura | Registros e resumo diário usam as assinaturas vigentes; natureza preservada também na consulta paginada | Revisão gerencial e ausência de validação técnica identificadas |
| Rastreabilidade | Nota/versão revisada e resumo diário atualizado conforme as unidades aplicáveis | Não transforma revisão gerencial em assinatura profissional |
| Hortifruti | Revisão do dia reconhecida; natureza e `responsavelTecnico` coerentes | `responsavelTecnico=false`; Histórico explicita a distinção |

Pendência operacional de preenchimento/execução não é eliminada pela revisão.
Um dia com outras atividades ou serviços pendentes continua com essas pendências.
Uma revisão gerencial não substitui automaticamente uma exigência técnica.

Quando já houver revisão gerencial retroativa e ainda for necessária validação
técnica, a nutricionista autorizada pode complementar a revisão pela mesma
consulta. A assinatura/revisão anterior permanece em log e, no fluxo versionado,
em seu vínculo histórico; a nova revisão técnica torna-se a vigente. Não se altera
a execução, não se restaura assinatura revogada e não se repete uma assinatura
técnica já vigente. Senha, competência, conteúdo/versão e permissão são
revalidados dentro da transação.

## Divergências corrigidas nesta conferência

1. Limpeza assinava as atividades retroativamente, mas o resumo diário contava
   somente a tabela antiga de assinaturas do dia. Agora o resumo utiliza também
   as supervisões vigentes de todas as atividades persistidas. Não cria uma
   assinatura diária artificial e não considera uma revisão parcial como completa.
2. A natureza retroativa estava apenas no log; o mecanismo versionado era genérico.
   Agora o próprio mecanismo identifica a revisão técnica, gerencial ou operacional,
   calculada a partir do usuário recarregado no servidor. Histórico, serviços e
   células dos relatórios mostram essa natureza.
3. O fechamento do Óleo contava qualquer revisão vigente como suficiente.
   Agora revisões retroativas não técnicas permanecem na lista de datas com
   revisão técnica pendente; o fechamento exibe e audita essa distinção.
4. A revisão gerencial poderia impedir uma complementação técnica posterior.
   Agora a substituição da vigência é permitida exclusivamente para complementar
   uma revisão retroativa não técnica com uma revisão técnica autorizada. A regra
   normal dos demais bridges de assinatura não foi ampliada.
5. A reabertura ainda herdava o bypass geral de DEV. Agora exige a permissão
   efetiva `reabrir_mes`, inclusive para DEV com perfil vinculado. DEV sem vínculo
   explícito não obtém essa autorização pelo fallback de permissões padrão.
6. O editor de DEV marcava e bloqueava todas as permissões. A reabertura mensal
   agora é editável por módulo; as demais permissões administrativas mantêm a
   política anterior. Concessão/revogação usa a auditoria existente.

## Permissões após publicação

As permissões de assinatura retroativa e reabertura constam dos grupos do editor.
As definições dos dois conjuntos são sincronizadas de forma idempotente ao abrir
a Gestão de Usuários com autorização de edição de permissões e ao salvar essa
edição, dentro da transação existente. Esse registro atualiza somente o catálogo;
não cria vínculos, não concede permissões a perfis nem assina registros.

Nutricionista e Gerente podem receber ambas por módulo. O nome do perfil não
concede reabertura por si só. A natureza profissional continua exigindo o perfil
NUTRICIONISTA e a habilitação/permissão de responsável técnico existentes.

Depois da publicação autorizada, é necessário acessar Gestão de Usuários e
conceder aos perfis desejados acesso ao módulo, assinatura retroativa e, quando
necessário, reabertura mensal. Conferir o estado da competência antes de reabrir.
Não houve concessão a Camila ou a qualquer usuário real nesta etapa.

## Casos sintéticos e testes

Todos os writes foram feitos em bancos novos `retroreview_*` ou bancos isolados
dos testes existentes, em 127.0.0.1:55479. O `.env` permaneceu intacto.

- **Óleo 117/118/121/122 equivalentes:** datas 11, 12, 23 e 24/10, com competência
  reaberta. Dois registros sem versionamento e dois com eventos de vínculo legado
  e revogação. Em cada data: pendência técnica antes; revisão gerencial vigente
  mantendo a pendência técnica; revisão técnica posterior resolvendo-a. Aferições,
  responsáveis e datas preservados. Assinaturas e revogações anteriores preservadas.
- **Limpeza:** execuções em AGUARDANDO_SUPERVISOR, lote retroativo em 30/10 e
  assinatura normal em 31/10. Um dia sintético com duas atividades demonstrou
  que uma única revisão não conclui o dia; a segunda conclui o resumo. O complemento
  técnico muda a natureza vigente sem apagar as revisões gerenciais anteriores.
- **Buffet:** serviços completos em 26, 27, 28, 29 e 31/10, com 33 itens e oito
  Não servido em cada fixture, incluindo Banana cozida e evidência legada de autoria
  limitada. Revisões persistiram sem mudar itens ou versões; os cinco resumos
  diários reconhecem as evidências vigentes. Esses volumes sintéticos são
  representativos, não uma cópia dos volumes diferentes do diagnóstico real.
- **Demais módulos:** revisão gerencial de Rastreabilidade/Limpeza Semanal;
  revisão gerencial e complemento técnico em Hortifruti/Temperatura; preservação
  de autores, execuções e auditoria.

Validações aprovadas:

- Prisma Generate 6.5.0.
- TypeScript `tsc --noEmit`.
- Lint sem erros/warnings do ESLint.
- Build de produção, Next.js 15.5.12 e Node.js 22.23.4.
- `test-retroactive-review.cjs`: 20 grupos de integração no PostgreSQL local.
- `test-supervision-signatures.cjs`: 22 grupos, sete módulos.
- `test-monthly-reopening.cjs`: sete módulos, permissão, senha, justificativa,
  fechamento, relatórios, concorrência e rollback.
- `test-buffet-history.cjs`: Histórico, legados, itens Não servido, consultas,
  autorização, preservação e relatório em PostgreSQL local.
- `test-retroactive-review-browser.cjs`: Chrome real, Next de produção, login,
  navegação a partir do Histórico, seleção, assinatura, mensagem, retorno ao
  Histórico, revisão gerencial, senha inválida e nova tentativa no modal, ausência
  de permissão, competência fechada, persistência e impressão.
- Oito PDFs gerados pelo Chrome cobrem os sete módulos, incluindo duas naturezas
  em Amostras. Extração de texto confirmou responsável, natureza e data/hora real
  contra os logs do PostgreSQL sintético. Não foi realizada inspeção de todas as
  páginas em um leitor visual de PDF.
- Inspeção de capturas desktop/mobile do Chrome e do erro dentro do modal.
- `git diff --check`: aprovado.

Evidências locais ignoradas: `.data/validation/retroactive-review/`, incluindo
`results.json`, `priority-before-after.json`, `browser-results.json`,
`pdf-results.json`, PDFs e capturas. O leitor de PDF de teste foi instalado somente
nesse diretório ignorado, sem alteração das dependências do aplicativo.

## Situação para deploy

Os testes locais não identificaram bloqueio funcional restante para a revisão
dos casos prioritários pela nutricionista autorizada. O código está apto para
deploy controlado com as condições operacionais acima: permissões concedidas pelo
administrador e competência aberta/reaberta quando necessário. A autoria limitada
de 121/122 continua sendo ressalva, sem bloquear permanentemente a modalidade
retroativa autorizada nem inventar autoria.

Safari/iPhone real segue sem validação; a emulação mobile do Chrome não comprova
essa compatibilidade. A etapa não homologou produção nem assinou registros reais.
Não houve migration, seed, reset, db push, alteração de permissões reais, commit,
push ou deploy executados pelo agente.
