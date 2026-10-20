# Exclusão de dias anteriores em competências abertas

Correção no BPMA/KPlatz atual, branch main. Git limpo no início.
Tenant-refactor não acessado. Sem alteração de banco, schema ou migration.

## Causa confirmada

Óleo e Temperatura calculavam a variável `bloqueado` combinando competência fechada
com data diferente de hoje. Essa variável era usada tanto para Editar quanto para
apresentar Excluir. Assim, a interface escondia a exclusão de dias anteriores,
apesar de o serviço do servidor já permitir a operação em competência aberta.

Na Rastreabilidade, os controles antigos também vinculavam exclusão à permissão
de edição do dia, modo somente leitura, assinatura diária e nota importada ainda
não conferida. Esses controles divergiam do serviço central de exclusão e do
painel comum, que já seguem perfil, permissão e competência real.

## Correção

- Óleo e Temperatura: exclusão consulta somente permissão e competência fechada;
  a condição de edição conserva o bloqueio de datas anteriores.
- Hortifruti: já utilizava competência; removido ramo inacessível de botão
  desabilitado, preservando a mesma regra.
- Nos três módulos, abrir `deleteId` manualmente com perfil não autorizado não
  apresenta o formulário de confirmação.
- Confirmação do Óleo identifica módulo, ID, data, temperatura, fita e responsável,
  permitindo distinguir aferições diferentes na mesma data.
- Rastreabilidade, listagem e detalhe: controles de exclusão passam a usar
  `canDeleteOperationalRecord` e `isOperationalMonthClosed`. A assinatura diária,
  a finalização e o modo de edição não substituem o estado mensal para excluir.
  O acesso de edição/conferência continua com suas regras anteriores.

O backend foi auditado e preservado: usuário obtido da sessão, perfis reais
DEV/GERENTE/NUTRICIONISTA, permissão e acesso ao módulo, leitura pelo ID, competência
derivada do registro e conferida dentro da transação. Mantidos isolamento/lock de
fechamento, motivo obrigatório, exclusão lógica, snapshot, auditoria e revalidação
de listagem, histórico, relatórios, dashboard e indicadores. Mês fechado bloqueia DEV.
Competência anterior aberta e competência oficialmente reaberta continuam elegíveis.

Não houve mudança de permissões, edição retroativa, unicidade ou parâmetros sanitários.
Nenhuma aferição real foi selecionada/excluída e não houve exclusão automática.

## Módulos verificados

Corrigidos Óleo, Temperatura e os controles antigos da Rastreabilidade.
Hortifruti teve a condição existente preservada e simplificada. Buffet/Amostras,
Limpeza Diária/Semanal, Chamados e StayLabel já usam o painel/serviço central por
competência, sem restrição de igualdade com hoje. StayLabel mantém o acesso DEV
preexistente; nenhum perfil recebeu acesso adicional.

## Validação

Teste ampliado em `scripts/test-operational-record-controls.cjs`, com páginas,
actions e middleware reais sobre adapter isolado:

- Hoje, dias anteriores, início do mês e mês anterior ainda aberto.
- DEV, GERENTE e NUTRICIONISTA individualmente nas três listagens.
- Editar continua desabilitado nas datas anteriores de Óleo/Temperatura.
- Confirmação do registro anterior por ID e motivo obrigatório.
- Bloqueio por fechamento genérico e legado, incluindo DEV.
- Ausência de formulário e botão para COLABORADOR, mesmo com códigos forjados.
- Três aferições distintas do mesmo dia: retirada individual de uma; demais
  registros comparados integralmente e preservados.
- Criação retroativa seguida de exclusão enquanto a competência está aberta.
- Atualização da página retornada, retirada do relatório e preservação em auditoria.
- Rastreabilidade anterior, manual/importada ou finalizada: exclusão elegível em
  mês aberto, inclusive com assinatura diária; conferência finalizada segue readonly.
- Suíte existente: dez destinos, outros perfis, sessão ausente, motivo vazio,
  repetição, rollback de auditoria, originais preservados e sete relatórios mensais.

Passaram também `test-client-corrections.cjs`, `test-monthly-reopening.cjs` e
`test-recebimento-sem-fabricacao.cjs`, além de lint, build e git diff --check.
Testes funcionais usam dados sintéticos; não equivalem a teste autenticado no Railway.

## Arquivos alterados e entrega

- src/app/controle-qualidade-oleo/page.tsx
- src/app/controle-temperatura-equipamentos/page.tsx
- src/app/higienizacao-hortifruti/page.tsx
- src/app/rastreabilidade-recebimento/page.tsx
- src/app/rastreabilidade-recebimento/nota/[id]/page.tsx
- scripts/test-operational-record-controls.cjs
- docs/exclusao-dias-anteriores-2026-10-20.md (novo)

Sem migration nova, alterações no banco, seed, reset, db push, commit ou push.
Publicação e verificação autenticada no ambiente publicado não foram executadas.
