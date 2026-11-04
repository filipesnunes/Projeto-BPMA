# Histórico de Temperatura — consultas e carregamento sob demanda

Projeto KPlatz atual, branch `estabilizacao/experiencia-anterior-2026-10-28`.
Git inicialmente limpo, HEAD `02e21c8`. Não foi acessado o tenant-refactor.

## Causa identificada na branch de estabilização

A rota `historico/page.tsx` exporta `legacy-history.tsx`. Para usuários com acesso
completo, a condição inicial era um `where` sem período. O componente carregava:

1. Todos os registros históricos, com todos os campos, incluindo base64 e observações.
2. Novamente os registros completos do mês para calcular indicadores em memória.
3. Assinaturas/escopos em consultas separadas para as duas coleções.
4. Todos os fluxos no componente compartilhado de compatibilidade, com relações
   completas, inclusive fotos, sem paginação no banco.

Selecionar `dia` abria o modal, mas não restringia a primeira consulta histórica.
O custo estava principalmente na materialização e transferência de dados que
a listagem não utilizava. Não foi encontrada necessidade de mudar infraestrutura
ou criar índices para obter a melhora observada localmente.

## Comportamento e consultas novas

- Sem filtros, consulta somente o mês/ano correntes, calculados pelas funções de
  data existentes. Limpar retorna ao mesmo recorte.
- Data específica tem precedência sobre mês/ano conflitantes.
- Mês isolado usa o ano corrente. Ano isolado abrange somente janeiro a dezembro
  desse ano, com paginação. Não há busca automática do mesmo mês em todos os anos.
- Os filtros de equipamento, status e responsável continuam no `where` do banco.
  O filtro de status continua restrito a equipamento em operação.
- As restrições existentes para usuários limitados ao mês vigente permanecem como
  uma interseção adicional no banco; selecionar outro mês não amplia o acesso.
- A listagem traz resumos de **15 dias por página**, em ordem decrescente, usando
  `groupBy`, `skip` e `take` no PostgreSQL. Exibe totais de dias e registros, sem
  carregar todas as aferições para paginá-las em memória.
- Para filtros que precisam de contagem distinta de dias, são consultados apenas
  data/contagem agrupadas, dentro de no máximo um ano. São metadados de totalização,
  não as milhares de linhas completas.
- O resumo mensal usa uma consulta parametrizada com `GROUPING SETS`: contagens
  de registros, dias, equipamentos distintos, alertas, inativos/manutenção e ações
  corretivas. Ela não seleciona fotos, observações ou versões. O tratamento de
  texto vazio nas ações corretivas equivale ao `String.trim()` anterior, inclusive
  tabulações, quebras de linha e espaços Unicode de registros legados.
- A consulta SQL mensal reproduz explicitamente o filtro global de exclusão e de
  projeções completas: não contabiliza registros excluídos, fluxos excluídos nem
  projeções de preenchimentos incompletos. Datas são parâmetros ISO convertidos
  para `date`, evitando dependência do fuso da sessão PostgreSQL.
- As assinaturas são resumidas em lote para as datas relevantes, com campos mínimos
  e agrupamento por dia para a existência de legado. Mantém a semântica anterior:
  uma unidade reaberta/incompleta impede usar assinatura diária antiga como vigente;
  dias somente versionados usam evidências atuais reais. Não é fabricada assinatura.
- Os indicadores continuam sendo os totais da competência indicada, sem aplicar
  os filtros adicionais de equipamento/status/responsável, como anteriormente.
  Uma data explícita determina a competência de referência dos indicadores.

## Abrir um dia, fotos e compatibilidade

O botão Abrir faz uma consulta específica da data, mantendo filtros e autorização.
Os detalhes têm paginação de **100 aferições**, também no banco, e preservam turnos,
temperaturas, alertas, ação corretiva, responsável, horário original e observações.
Os alertas para revisão diária consideram o dia inteiro, mesmo em outra página de
detalhes, sem mudar o escopo das assinaturas.

A consulta de detalhes não seleciona base64. Uma consulta leve de IDs identifica
quais linhas possuem evidência. Somente `fotoId`, acompanhado do dia permitido,
busca os bytes da imagem. IDs de outra data não carregam uma foto fora do recorte.
URL e fallback base64 continuam funcionando com o componente EvidencePhoto.

Os links de abertura, foto, edição e paginação não antecipam detalhes por prefetch.
Consultar / Editar continua levando ao formulário existente e às suas proteções.

A lista de preenchimentos versionados foi substituída, somente no Histórico de
Temperatura, por uma consulta leve de **20 fluxos por página**. Não seleciona fotos,
rascunhos, snapshots ou histórico de versões. Legados e projeções continuam sendo
contabilizados uma vez pela consulta operacional; a seção de fluxos mantém seus
links de consulta/continuação, sem acrescentar aferições às contagens dos dias.

O componente compartilhado `CompatibleDayReview` ganhou apenas uma opção de
projeção reduzida para Temperatura. Ela evita que o painel de assinatura recarregue
fotos ao abrir o dia. O valor padrão e o comportamento dos demais módulos foram
preservados; permissões, ações e regras de assinatura não foram alteradas.

## Medições antes/depois

Base PostgreSQL 16 exclusivamente local e sintética, clonada de uma base de testes
existente. Foram acrescentadas 5.400 aferições em 150 dias, com observações extensas
e PNGs válidos, 120 linhas para estresse de paginação e casos de assinatura,
reabertura, exclusão e projeção incompleta. A base já possuía outras fixtures.

Comparação entre o código de HEAD e o novo código, no mesmo cliente/base. A medição
inclui as funções servidoras e componentes assíncronos de compatibilidade/revisão;
autenticação e painel administrativo mensal foram simulados. Consultas PostgreSQL
reais foram contadas pelos eventos de query do Prisma, separadamente das operações
de aplicação. Não é medição de produção nem um ensaio estatístico. A última execução
também concorreu com o build; os tempos variam com cache e carga local.

| Ação | Tempo antes | Tempo depois | SQL antes | SQL depois |
| --- | ---: | ---: | ---: | ---: |
| Abertura inicial | 1.243 ms | 37 ms | 23 | 12 |
| Abrir um dia | 1.128 ms | 64 ms | 30 | 25 |
| Filtrar equipamento | 388 ms | 37 ms | 20 | 11 |
| Limpar / mês vigente | 1.083 ms | 36 ms | 22 | 12 |

Na abertura inicial, as operações anteriores retornaram **11.089 materializações
de registros completos**, contando consultas repetidas e relações; não são 11.089
registros únicos. O novo código retorna **zero aferições completas nessa etapa**:
apenas resumos, totais e referências paginadas. Ao abrir o dia de teste, retornou
35 detalhes. O número de linhas depende da data; dias maiores continuam paginados.

O tráfego de base64 observado nas operações iniciais caiu de **19.959.216 bytes
(aproximadamente 20 MB, contando repetições)** para zero. Abrir o dia também não
buscou base64. A consulta dos bytes ocorreu apenas ao abrir a foto.

Não há N+1 de aplicação por dia/equipamento na listagem: assinaturas e resumos são
consultados em lote. As contagens mensais continuam fazendo trabalho no banco,
mas não transferem os campos pesados para o servidor ou navegador.

O navegador também mediu navegação HTTP real após a alteração, com login e painel
reais; os tempos estão em `browser-times.json`. Não existe baseline HTTP equivalente
do build antigo. Não se deve tratar a medição da função servidora como latência
completa do navegador ou prometer o mesmo resultado no Railway.

## Validações executadas

`node scripts/test-temperature-history.cjs` passou:

- Mês corrente inicial, setembro, data exclusiva, precedência de data, equipamento,
  status e responsável; mês isolado, ano isolado e período vazio.
- Restrição ao mês vigente para usuários sem histórico completo.
- Paginação dos dias de um ano sem repetição/omissão, com limites nas consultas.
- Dia com mais de 100 aferições: união das páginas contém exatamente os IDs esperados.
- Indicadores comparados às consultas anteriores, incluindo ações com somente
  espaços comuns/Unicode e alertas somente de equipamentos em operação.
- Assinaturas equivalentes à função anterior, assinatura legada de setembro,
  dia somente versionado assinado e assinatura diária antiga bloqueada por reabertura.
- Detalhes da data escolhida, ausência de base64 na listagem/detalhes, imagem válida
  sob demanda e rejeição de foto de outra data.
- Fingerprint dos dados operacionais igual antes/depois das consultas.
- Comparação do hash do `.env` antes/depois: arquivo inalterado.

`node scripts/test-temperature-history-browser.cjs` passou no Edge headless com
Next de produção local: login real, mês atual, setembro/data/equipamento, Limpar,
paginação sem dias repetidos, Abrir, Consultar / Editar, foto carregada e decodificada
somente após o clique, paginação de aferições e layout sem overflow externo em
1440/390/320 pixels. As tabelas mantêm a rolagem horizontal interna existente.

`node scripts/test-temperature-corrections.cjs` passou nos 20 cenários existentes
de edição/reabertura, permissões personalizadas, revogação, legado/versionado,
assinaturas, concorrência, rollback, competência e relatório mensal. Nenhum arquivo
ou consulta de relatório foi modificado nesta manutenção.

- `npm.cmd run lint`: passou, sem warnings/erros do ESLint.
- `npx.cmd tsc --noEmit`: passou.
- `npm.cmd run build`: passou, incluindo tipos e geração das rotas, com URLs locais.
- `git diff --check`: passou, com os avisos habituais de normalização LF/CRLF.

As evidências locais estão em `.data/validation/temperature-history/` (ignorado pelo
Git): fixtures, `performance.json`, `browser-times.json` e capturas.

## Arquivos

Alterados:

- `src/app/controle-temperatura-equipamentos/historico/legacy-history.tsx`.
- `src/components/compatible-day-review.tsx` (projeção opcional, somente Temperatura).

Criados:

- `src/app/controle-temperatura-equipamentos/historico/history-data.ts`.
- `src/app/controle-temperatura-equipamentos/historico/history-workflows.tsx`.
- `scripts/test-temperature-history.cjs`.
- `scripts/test-temperature-history-browser.cjs`.
- Este documento.

## Limites e situação final

O banco do `.env` foi tratado como produção e **não foi acessado nesta manutenção**.
Todos os testes mutáveis usaram URLs literais de PostgreSQL local, fixadas no
processo antes dos imports, além da injeção explícita do cliente de teste. O arquivo
`.env` não foi editado. Não foram exibidas credenciais nem conteúdo de DATABASE_URL.

Não foram alterados permissões, regras sanitárias, assinaturas, fechamento mensal,
schema, índices ou migrations. Não houve seed, reset, db push, exclusão de dados
reais, commit, push ou deploy. A otimização está validada localmente; o desempenho
de produção e os dados reais não foram auditados nesta tarefa.

O predicado de visibilidade da agregação SQL deve acompanhar futuras alterações do
middleware operacional; o teste de equivalência com Prisma cobre essa dependência.
Períodos anuais ainda exigem agregação de um ano de metadados, mas as aferições,
fotos e versões não são materializadas integralmente por isso.

Git final: mesma branch, dois arquivos rastreados modificados e cinco novos.
Servidores/navegadores de teste encerrados; container local parado com as bases
sintéticas preservadas.
