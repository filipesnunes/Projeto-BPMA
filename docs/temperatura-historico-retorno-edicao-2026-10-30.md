# Temperatura — retorno ao dia do Histórico após edição

## Diagnóstico

Trabalho realizado exclusivamente no BPMA/KPlatz, na branch
`estabilizacao/experiencia-anterior-2026-10-28`, inicialmente limpa.

O link “Consultar / Editar” abria `/registro/[id]` sem levar o contexto da
listagem. O formulário não enviava um destino de retorno. A action redirecionava
os registros completos para `/historico?data=...`, mas o Histórico reconhece
`filtroData` para a busca e `dia` para abrir a visualização diária. Data aberta,
filtros e paginação eram perdidos. Em caso de erro, o redirecionamento para o
fluxo também remontava o formulário com os valores persistidos, descartando os
valores ainda não salvos.

A reprodução em PostgreSQL local executou a action do HEAD anterior com um
`returnTo` contendo página 2 e filtros. O destino anterior não continha nem
`dia` nem `pagina`; a correção foi validada sobre os mesmos tipos de registros.

## Correção

Os links do Histórico passam um `returnTo` na URL. Ele preserva data aberta,
filtros de data/mês/ano/equipamento/status/responsável e páginas de dias,
aferições e preenchimentos. O formulário envia esse contexto como campo oculto.
Reabertura, cancelamento, consulta de auditoria e link de retorno também o
preservam. O período implícito do Histórico é explicitado nos links para manter
mês e ano mesmo se houver uma virada de competência durante a navegação.

O destino é validado no servidor: somente o caminho exato do Histórico deste
módulo e uma lista conhecida de parâmetros são aceitos. URLs externas, outros
módulos, barras invertidas, caracteres de controle e datas inválidas são
rejeitados. Mensagens antigas e parâmetros desconhecidos são descartados.
O servidor usa a data do registro realmente salvo para abrir o dia correto.
Sem contexto válido, retorna ao Histórico com `filtroData` e `dia` desse registro.

A edição usa a mesma operação de persistência anterior, incluindo autenticação,
permissões, bloqueios, adoção explícita de legado, controle de versão, transação
e auditoria. Depois da confirmação, revalida os caminhos existentes e retorna
ao dia aberto com “Alterações salvas com sucesso.” Não anuncia sucesso antes do
commit. O botão Fechar do dia mantém a página e os filtros da listagem.

Um componente de formulário mantém os campos e arquivos no navegador quando a
action retorna erro. O erro é apresentado junto ao formulário, sem navegar ou
reinicializar os valores. Durante o envio, o formulário fica bloqueado e indica
que está salvando. As regras de assinatura e de edição não foram alteradas.

## Arquivos

Alterados:

- `src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx`
- `src/app/controle-temperatura-equipamentos/historico/history-workflows.tsx`
- `src/app/controle-temperatura-equipamentos/saved-record-page.tsx`
- `src/app/controle-temperatura-equipamentos/workflow-actions.ts`
- `scripts/test-temperature-corrections-browser.cjs`: espera erro inline no
  teste de tentativa indevida de editar um registro assinado.
- `scripts/test-temperature-history.cjs`: aguarda a impressão digital de
  integridade antes de iniciar a medição. Antes, essa consulta assíncrona podia
  terminar durante uma medição e inflar artificialmente sua contagem/tempo SQL.

Criados:

- `src/app/controle-temperatura-equipamentos/history-navigation.ts`
- `src/app/controle-temperatura-equipamentos/record-edit-form.tsx`
- `scripts/test-temperature-history-navigation.cjs`
- `scripts/test-temperature-history-navigation-browser.cjs`
- Este documento.

## Validação funcional

Todos os bancos usados foram cópias locais isoladas de um schema sintético já
existente, com URL fixa em `127.0.0.1:55479`, definida antes dos imports. Não
foram executadas migrations. O `.env` existente não foi alterado; o hash foi
conferido. Nenhum banco externo foi consultado ou modificado nesta tarefa.

Passaram:

- `node scripts/test-temperature-history-navigation.cjs`: reprodução da falha
  anterior; hoje, ontem e início do mês; legado, versionado e reaberto; página 2
  e todos os filtros; confirmação só após persistência; valores originais de
  data/hora/responsável preservados; erro de validação e revisão obsoleta;
  destinos inseguros rejeitados; registros assinados e competência fechada
  protegidos; assinaturas preservadas e ausência de registros duplicados.
- `node scripts/test-temperature-history-navigation-browser.cjs`: login real
  local, Histórico → dia → editar → salvar → mesmo dia; filtros e página 2;
  fechar e retornar à listagem correta; recarregar; valores atualizados e
  mensagem de sucesso; erro inline sem perda dos campos ou da URL; segunda
  edição no mesmo dia; hoje/ontem/início do mês; legado/versionado/reaberto;
  segunda página das aferições; assinaturas intactas; desktop e mobile.
- `node scripts/test-temperature-corrections.cjs`: regressão das 20 situações
  de correção, permissões, versões, reabertura, assinaturas, concorrência,
  rollback e fechamento mensal.
- `node scripts/test-temperature-corrections-browser.cjs`: tentativa de salvar
  registro assinado com DOM adulterado negada; nutricionista reabre sem ganhar
  permissão de editar; colaborador autorizado corrige; assinatura volta a
  bloquear; dados originais e auditoria preservados.
- `node scripts/test-temperature-history.cjs`: 150 dias e mais de 5.400
  aferições sintéticas; filtros, paginação SQL, detalhes e fotos sob demanda,
  assinaturas e integridade dos dados.
- `node scripts/test-temperature-history-browser.cjs`: regressão da busca,
  troca de páginas, abertura de dias, fotos e responsividade.
- `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build` e
  `git diff --check`.

Capturas de desktop e mobile foram inspecionadas; a visualização diária mantém
a rolagem interna da tabela e não gera overflow horizontal na página.

## Desempenho

As consultas do Histórico e seus limites não foram alterados. A paginação
permanece no PostgreSQL: 15 dias e até 100 aferições por página de detalhes,
com fotos carregadas apenas quando solicitadas.

Na comparação local final contra o HEAD, as contagens ficaram iguais:

| Percurso | Operações Prisma antes/depois | SQL antes/depois | Tempo da montagem antes/depois |
| --- | --- | --- | --- |
| Inicial | 9 / 9 | 12 / 12 | 42,4 / 51,9 ms |
| Dia aberto | 16 / 16 | 25 / 25 | 67,8 / 65,6 ms |
| Equipamento filtrado | 10 / 10 | 11 / 11 | 37,7 / 38,3 ms |
| Limpar filtros | 9 / 9 | 12 / 12 | 34,1 / 38,9 ms |

São amostras locais, sujeitas a cache e variação de execução; não demonstram
ganho de velocidade nem constituem benchmark de produção. Demonstram que a
correção não acrescentou consultas ou carga integral do histórico nesses
percursos. Evidências ignoradas pelo Git estão em
`.data/validation/temperature-history-navigation` e
`.data/validation/temperature-history/performance.json`.

## Entrega e limites

Nenhum registro real, assinatura real, permissão ou regra de fechamento foi
alterado. Somente fixtures locais receberam as edições de teste. Não houve
acesso ao Multitenant, alteração de outros módulos, migration, db push, seed,
reset, commit, push ou deploy.

O banco sintético foi preservado. Produção e aparelhos móveis físicos não foram
validados. O fluxo interativo de edição depende do JavaScript da aplicação.
Git final: seis arquivos rastreados modificados e cinco novos, preservando a
branch de estabilização.
