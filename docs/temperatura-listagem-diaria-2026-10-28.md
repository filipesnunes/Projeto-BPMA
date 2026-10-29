# Temperatura dos Equipamentos — listagem inicial diária

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`.
Estado inicial limpo, commit `ad951ed`. Sem commit, push ou deploy nesta correção.

## Causa e correção

A consulta principal de `legacy-records.tsx` começava com `where = {}`.
Sem filtro selecionado, carregava todo o histórico, inclusive registros futuros
que eventualmente já estivessem armazenados. Além disso, a lista complementar
buscava rascunhos/reabertos de outras datas.

A consulta agora sempre contém `data: getAppDate(now)`. O helper existente
considera `APP_TIME_ZONE = America/Sao_Paulo` e produz a data operacional para a
coluna PostgreSQL date. Não há filtro por createdAt nem por turno: manhã e tarde
aparecem, inclusive quando o lançamento tem outro dia UTC.

Os filtros existentes podem restringir os registros de hoje, mas nunca ampliar a
consulta para outras datas. Um filtro de data/mês/ano incompatível resulta em lista
vazia; a consulta histórica continua disponível no Histórico. Foi retirada da
tela inicial a agregação de limites de datas históricas do filtro de mês isolado.

O componente complementar aceita uma data operacional opcional. Somente a chamada
da tela inicial de Temperatura informa essa data, capturada junto da consulta
principal. Ela vira `dataReferencia` no where Prisma, antes de carregar os fluxos.
Isso exclui também reabertos antigos e futuros diretamente no banco.

Sem essa propriedade, o componente mantém as consultas anteriores. Com history=true,
a propriedade não se aplica. Foram comparados os filtros e IDs retornados antes e
depois para o Histórico de Temperatura e os outros três módulos consumidores.

O layout foi preservado. Apenas a frase que dizia que a listagem começava sem
filtro foi corrigida para orientar a consulta de outras datas pelo Histórico.

## Arquivos

Alterados:

- `src/app/controle-temperatura-equipamentos/legacy-records.tsx`.
- `src/components/compatible-workflow-records.tsx` — parâmetro opcional, utilizado
  somente pela tela inicial de Temperatura; demais chamadas mantêm o comportamento.

Criados:

- `scripts/test-temperature-daily.cjs`.
- `scripts/test-temperature-daily-browser.cjs`.
- Este documento.

Nenhuma alteração em consultas/arquivos do Histórico, relatórios, actions de
salvamento/assinatura, reabertura, fechamento mensal, schema ou migrations.
Nenhum módulo paralelo ou Multitenant foi acessado/modificado.

## Testes

Usado PostgreSQL local isolado, com estrutura de teste já existente. Não foram
executadas migrations, seed/reset ou db push. O setup do teste inseriu somente
fixtures sintéticas nesse banco local: 3.000 registros históricos, registros
atuais legados/versionados dos dois turnos, lançamento no dia UTC seguinte,
registro futuro lançado antes, rascunho atual e reaberto de ontem.

Passaram:

- Filtro de hoje no where Prisma/PostgreSQL, inclusive com perfis DEV, GERENTE,
  NUTRICIONISTA e COLABORADOR.
- Registros atuais nos dois turnos; data operacional independente do lançamento.
- Exclusão de ontem, mês anterior e futuro na listagem principal.
- Rascunho atual acessível e reaberto antigo ausente da lista complementar.
- Registros legados e versionados retornados uma única vez por ID.
- Filtros de datas/períodos anteriores ou futuros não ampliam o dia atual.
- Histórico continua consultando os registros anteriores, inclusive o reaberto.
- Arquivo do Histórico com hash idêntico ao anterior à alteração.
- Consultas e IDs dos demais consumidores do componente compartilhado inalterados.
- Limite de dia no fuso da aplicação: 02:59 UTC ainda é o dia anterior em São Paulo;
  03:00 UTC já é o dia seguinte.
- Comparação de conteúdo operacional antes/depois das leituras: sem writes.
- Salvamento/edição atual legado e versionado preservado, sem duplicar registros;
  tentativa de alterar unidade assinada bloqueada e assinatura preservada.
- Navegador Edge com Next em build de produção local: listagem diária, acesso e
  retorno do Histórico, formatos antigo/novo e rascunhos. Capturas em 1440, 390 e
  320 pixels sem overflow da página; captura mobile inspecionada visualmente.
- `npm.cmd run lint`: sem erros ou warnings ESLint.
- `npm.cmd run build`: compilação, tipos e geração das rotas aprovados.
- `git diff --check`: aprovado.

O assert inicial de perfis selecionava uma consulta de assinatura por ID, em vez
da consulta da lista complementar. Foi ajustado para identificar a consulta por
dataReferencia e o teste completo passou; não foi necessária alteração funcional
para resolver essa falha do teste.

Para repetir, os testes dependem da estrutura PostgreSQL isolada já disponível e
do arquivo local que identifica esse banco sintético. `--setup` prepara apenas os
dados de teste; não aplica migrations. A medição HTTP `--before` precisa de um build
anterior à correção. Não apontar esses scripts para dados reais.

## Desempenho observado

Mesma base sintética local, sete amostras após dois aquecimentos. O build anterior
foi exercitado antes de substituí-lo pelo build corrigido. Os valores abaixo são
medianas locais, sem ensaio de carga ou controle estatístico de produção.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Registros retornados pela consulta principal | 3.009 | 7 |
| Execução PostgreSQL, SQL equivalente com EXPLAIN ANALYZE | 3,108 ms | 0,091 ms |
| Preparação da página e lista complementar no Node | 466,35 ms | 27,26 ms |
| Operações Prisma nessa preparação, sem layout/autenticação | 11 | 9 |
| TTFB HTTP local autenticado | 1.718,8 ms | 61,7 ms |
| Recebimento completo do HTML HTTP local autenticado | 2.442,7 ms | 71,1 ms |
| Tamanho do HTML recebido | 8.933.525 bytes | 50.357 bytes |

A preparação Node não representa toda a página Next: exclui layout, transporte
de autenticação e navegador. A medição HTTP inclui a resposta HTML completa do
build local, mas não mede pintura/hidratação nem a experiência do hotel em produção.
O teste de SQL usa uma consulta equivalente com os filtros de exclusão e elegibilidade
de versões; não mede latência de rede do Prisma.

Havia custo comprovado de carregar e renderizar o histórico neste ensaio. A redução
também evitou verificações de fechamento de competências dos registros antigos;
as verificações necessárias para hoje e para operações explícitas foram mantidas.
Catálogos, regras, configuração de foto e demais consultas necessárias ao layout
recuperado não foram otimizados fora do escopo. Não se conclui que esse problema
explique toda a lentidão da instalação real.

Métricas e capturas: `.data/validation/temperature-daily`, ignorado pelo Git.

## Limites e encerramento

Produção não foi acessada ou alterada. Não foram executadas migrations, exclusões
de dados reais, reset, seed ou db push. Nenhum registro foi convertido ou migrado.
Os dados sintéticos permaneceram no banco de testes, e o container foi parado após
as validações. Os processos de navegador/servidor utilizados foram encerrados.

Git final: mesma branch de estabilização, dois arquivos rastreados modificados e
três novos arquivos. Sem commit, push ou deploy automático.
