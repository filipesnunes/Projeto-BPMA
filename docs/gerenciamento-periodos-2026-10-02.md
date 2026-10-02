# Gerenciamento de Períodos — BPMA/KPlatz atual

## Diagnóstico e ambiente

Workspace: `A:\Projeto-BPMA-KPlatz`, branch `main`, Git limpo antes desta solicitação.
Não foi acessado o tenant-refactor. As mudanças de personalização visual da
solicitação anterior já estavam no histórico do Git e foram preservadas.

Existiam dois mecanismos: `FechamentoMensalModulo`, usado pela assinatura mensal
do histórico, e tabelas específicas usadas por actions e indicadores antigos.
Algumas consultas de bloqueio verificavam somente as tabelas específicas. O
detalhe da nota, por exemplo, verificava também o fechamento genérico, enquanto
as actions de conferência verificavam apenas o específico.

A auditoria anterior documentou a falha das actions antigas: consultavam somente
o fechamento específico, embora o fechamento estivesse na tabela genérica.
O workspace recebido já continha a correção compartilhada dessa falha. Nesta
etapa não foi reproduzida uma falha autenticada do botão na produção nem obtido
um novo stack trace de Railway. Não há evidência para afirmar outra causa de
uma falha de execução naquele ambiente.

Os problemas confirmados no código desta etapa eram a ausência de área central,
a exclusão do marcador genérico na reabertura, a falta de um estado persistente
distinto de mês nunca fechado e a ausência de limite de um reaberto por módulo.
As consultas de escrita, interfaces e dashboard também divergiam na fonte de estado.

Consulta somente leitura ao Railway encontrou 31 fechamentos genéricos, nos sete
módulos, e nenhum log com operação REABERTURA_MENSAL. Nenhum mês foi reaberto ou
fechado em produção durante o desenvolvimento.

## Área e módulos contemplados

Rota compartilhada: `/gerenciamento-periodos/[modulo]`.
Botão **Gerenciar Períodos** na seção Ações do módulo e na seção de fechamento do
histórico, somente quando o usuário tem capacidade de consulta naquele módulo.

| Módulo | Rota |
| --- | --- |
| Higienização de Hortifruti | `/gerenciamento-periodos/hortifruti` |
| Controle de Temperatura dos Equipamentos | `/gerenciamento-periodos/temperatura` |
| Controle da Qualidade do Óleo | `/gerenciamento-periodos/oleo` |
| Controle de Buffet / Amostras | `/gerenciamento-periodos/amostras` |
| Rastreabilidade de Recebimento | `/gerenciamento-periodos/rastreabilidade` |
| Plano de Limpeza Diário | `/gerenciamento-periodos/limpeza_diaria` |
| Plano de Limpeza Semanal | `/gerenciamento-periodos/limpeza_semanal` |

A tabela combina fechamentos genéricos e específicos, sem repetir módulo/mês/ano.
Ordena ano/mês decrescentes e destaca o mês reaberto também em um aviso separado.
Mostra fechamento anterior, nome e horário da reabertura, estado, acesso ao
histórico com filtroMes/filtroAno e ações autorizadas.

Meses nunca fechados não entram nessa lista. O histórico os identifica como
"Período aberto normalmente"; reabertos recebem identificação própria. A data
de reabertura permanece após novo fechamento, permitindo mostrar "Fechado novamente".

Pendências são contadas em Rastreabilidade e Buffet pelas condições reais de
fechamento. Nos outros módulos a tabela informa que não são contabilizadas,
em vez de apresentar uma quantidade zero inventada.

## Estado, transações e auditoria

O fechamento genérico permanece armazenado. Na reabertura recebe status REABERTO,
horário, usuário e nome de quem reabriu. Seus dados de assinatura anterior não
são apagados. Quando existe fechamento específico, seu marcador passa a ABERTO
na mesma transação. Fechamentos antigos exclusivamente específicos continuam
compatíveis; seu nome e data reais são preservados no registro genérico.
O perfil original não disponível fica null, sem atribuir o perfil do administrador
que reabriu como se fosse o do signatário antigo.

Cada transição adquire `pg_advisory_xact_lock` específico por módulo, em transação
Serializable. Um índice único parcial impede dois registros REABERTO para o mesmo
módulo, inclusive em requisições simultâneas. Outros módulos e o mês naturalmente
aberto continuam independentes. Erros de concorrência retornam feedback de nova
tentativa; não há alteração parcial.

O novo fechamento do reaberto só é executado pelo contexto de Gerenciamento de
Períodos, escolhido pelo servidor. Os formulários antigos e a assinatura do
histórico recusam esse estado, inclusive em requisição direta. Fechamentos
normais também usam a mesma função transacional, evitando uma segunda lógica
de fechamento e uma corrida com a reabertura.

`LogAssinatura` registra REABERTURA_MENSAL, NOVO_FECHAMENTO_MENSAL e fechamentos
normais, com módulo, período, usuário e horário. Os snapshots dos fechamentos
genérico e específico anteriores são arquivados antes da alteração. Se o log
ou a atualização falhar, a transação desfaz todas as alterações. Não há DELETE
de fechamento, assinatura diária ou registro operacional nessa implementação.

## Permissões, registros e validações

As três capacidades são independentes e reutilizam permissões existentes:

- Consulta: acesso ao módulo e histórico, fechamento ou autorização de reabertura.
- Reabertura: mantém a política DEV existente, validada também pelo servidor.
- Novo fechamento: `modulo.<código>.fechar_mes`, sem conceder reabertura nem exigir
  automaticamente que o usuário também possa assinar dias como supervisor.

Não foram concedidas permissões novas a GERENTE, NUTRICIONISTA ou COLABORADOR.
Um perfil com somente consulta vê a tabela sem botões de alteração. A página
bloqueia acesso direto não autorizado; actions verificam usuário, módulo, mês,
ano, confirmação e capacidade. Fechamento mantém confirmação de senha.

O contexto normal da assinatura técnica mantém sua permissão específica de
responsável técnico/assinatura mensal. As actions antigas de fechamento mantêm
a permissão de fechar do próprio módulo; uma permissão de outro módulo não basta.

O fechamento exige registros existentes. Rastreabilidade exige todas as notas
finalizadas; Buffet exige itens assinados ou não servidos. Assinaturas diárias
faltantes continuam informativas, como na política preexistente; nenhuma é
removida ou automaticamente invalidada. As datas dos registros não são alteradas.

A conferência de nota utiliza a fonte unificada de bloqueio. Uma pendência de
mês fechado mostra "Período fechado" e "Consultar nota"; após reabrir volta a
mostrar "Conferir Nota". O detalhe permanece sujeito às permissões normais e à
proteção de notas finalizadas. A reabertura não concede edição histórica a quem
não a possui nem contorna assinaturas operacionais existentes.

## Dashboard e relatórios

`isOperationalMonthClosed` prioriza o estado genérico e usa o específico para
fechamentos antigos que ainda não têm registro genérico. Essa verificação é
compartilhada por bloqueios de escrita, Buffet, detalhe diário de Limpeza e dashboard.

Os sete relatórios e históricos consultam somente assinaturas mensais vigentes
com status FECHADO. Relatórios de meses reabertos exibem explicitamente "Reaberto"
e a referência real ao fechamento anterior; não o tratam como assinatura vigente.
Após novo fechamento usam o novo responsável e horário. A metodologia dos demais
indicadores, identidade visual, tabelas e botão de impressão foi preservada.
As transições invalidam módulo, histórico, gerenciamento, dashboard e relatórios.

## Banco e publicação

Model alterado: `FechamentoMensalModulo`. Não foi criado outro model de fechamento.
Campos novos: status (default FECHADO), reabertoEm, reabertoPorUsuarioId e reabertoPorNome.
usuarioPerfilSnapshot tornou-se opcional para representar corretamente dados legados.
Os valores antigos desse campo continuam preservados.

Migration: `20261002000200_gerenciamento_periodos`, **preparada e não aplicada**.
Acrescenta somente campos compatíveis, constraint de estado e índice único parcial.
Nenhum período é reaberto automaticamente, nenhuma linha é excluída e nenhum
registro operacional é alterado pela migration.

`npx.cmd prisma migrate status` confirmou duas migrations pendentes no banco
configurado de produção:

1. `20261002000100_personalizacao_visual`, da solicitação anterior.
2. `20261002000200_gerenciamento_periodos`, desta solicitação.

A aplicação depende de autorização e do fluxo normal de deploy. A migration
de períodos deve estar aplicada antes de publicar o código que consulta status.
Não foi executado migrate deploy, db push, seed ou reset.

## Testes executados e limites

- Sete módulos × três estruturas (genérica, específica e ambas): listagem,
  reabertura, estados, data/responsável, preservação, segundo mês bloqueado,
  novo fechamento, reabertura seguinte e relatórios.
- Requisições simultâneas em adapter serializado: apenas uma reabertura por módulo;
  módulos diferentes podem coexistir. Rollback de falha de log e atualização.
- Permissões reais do catálogo: DEV, NUTRICIONISTA, GERENTE, COLABORADOR,
  somente consulta e somente fechamento. Página/action sem sessão e acesso direto.
- Action real de conferência com nota XML sintética: mês fechado bloqueia;
  reaberto permite colaborador salvar; detalhe e lista liberados; datas originais
  e assinaturas diárias preservadas; novo fechamento volta a bloquear.
- Dashboard real: reaberto não conta como concluído e novo fechamento conta.
- Regressões de temperatura, óleo, Hortifruti, fotos, filtros, Rastreabilidade,
  data de fabricação, identidade visual e prévia passaram.
- Edge isolado: 42 PDFs (sete relatórios × fallback, quatro proporções de logo e
  estado reaberto), com contenção, proporção, imagens, transparência, ausência de
  overflow e paginação igual ao fallback. Clique real aciona a impressão.

Os testes que escrevem utilizam adapters/dados sintéticos, sem conexão com produção.
A concorrência real no PostgreSQL e a execução da migration em banco isolado não
foram testadas: o Docker local não está funcionando. Constraint e SQL foram
conferidos estaticamente contra o schema; isso não substitui sua aplicação real.

Persistência foi validada por nova leitura/carga do módulo. Logout/relogin real,
deploy/restart e interação administrativa autenticada no navegador não foram
executados. Nenhuma operação administrativa foi testada alterando meses reais.
Os PDFs foram gerados/verificados por navegador e propriedades estruturais; não
foi feita inspeção visual dos PDFs em leitor dedicado.

## Arquivos

Criados:

- `src/app/gerenciamento-periodos/[modulo]/page.tsx`.
- `src/app/gerenciamento-periodos/actions.ts`.
- `src/app/gerenciamento-periodos/period-action-form.tsx`.
- `src/lib/monthly-period-permissions.ts`.
- `src/lib/monthly-periods.ts`.
- `prisma/migrations/20261002000200_gerenciamento_periodos/migration.sql`.
- Este relatório.

Alterados:

- `prisma/schema.prisma`.
- `src/lib/monthly-reopening.ts` e `src/lib/module-signatures.ts`.
- Actions de Hortifruti, Temperatura, Óleo, Buffet, Rastreabilidade e Limpeza;
  `src/app/historico-operacional/actions.ts`.
- As sete páginas de histórico e sete rotas de relatório mensal.
- Buffet: página principal e detalhe de serviço.
- Limpeza Diária: detalhe de dia no histórico.
- Rastreabilidade: página principal e detalhe da nota.
- `src/app/dashboard/service.ts`.
- `src/components/documentos/documentos-module-header.tsx`.
- `src/components/historico/technical-signature.tsx`.
- `scripts/test-monthly-reopening.cjs`, `scripts/test-client-corrections.cjs`,
  `scripts/test-visual-personalization.cjs` e `scripts/test-visual-personalization-print.cjs`.

## Validações técnicas

- Prisma generate: passou, Client 6.5.0.
- Prisma validate: schema válido.
- Lint: passou sem warnings/erros do ESLint.
- Build: passou, incluindo compilação, lint, tipos e geração das rotas.
- Diff check: passou; avisos de normalização LF/CRLF são da configuração existente do Git.
- Git: branch main, 36 arquivos rastreados modificados e sete arquivos novos
  (agrupados em cinco entradas não rastreadas no status). Sem commit ou push.

Nenhum dado histórico foi excluído. Nenhuma assinatura foi apagada. Nenhum
seed/reset ou db push foi executado. O tenant-refactor não foi alterado.
Nenhum commit ou push foi realizado.
