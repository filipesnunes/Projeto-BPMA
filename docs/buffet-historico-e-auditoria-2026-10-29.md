# Buffet / Amostras — Histórico unificado e isolamento dos testes

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`.
Estado inicial desta retomada: Git limpo, HEAD `bda60b7`; os commits já existentes
foram preservados. Nenhum commit, push ou deploy foi realizado nesta retomada.

## Auditoria da ocorrência anterior no banco externo

Conforme a orientação do usuário, o destino do `.env` foi tratado como produção.
Não foi presumido que corresponda a homologação ou ao serviço Railway publicado.

Em 29/10/2026, às 02:02 de São Paulo, foi feita uma consulta específica aos dois
metadados da ocorrência de Temperatura. O script não importa código da aplicação
nem executa rotinas de catálogo. Sua transação executou `SET TRANSACTION READ ONLY`,
confirmou `transaction_read_only = on` e consultou somente `Permissao` e as contagens
de vínculos. Nenhuma rotina de teste ou escrita foi executada nesse destino.

Resultado observado:

| Permissão | Criação (São Paulo) | Atualização (São Paulo) | Vínculos com perfis |
| --- | --- | --- | --- |
| `modulo.temperatura.editar_registros_mes_vigente` | 28/10/2026 22:21:21 | 28/10/2026 22:21:21 | 0 |
| `modulo.temperatura.reabrir_registro` | 24/10/2026 10:48:33 | 28/10/2026 22:21:21 | 0 |

Os registros têm os nomes/descrições da implementação e `sensivel = true`.
As gravações no mesmo intervalo são compatíveis com a execução de catálogo
documentada em `temperatura-correcoes-mes-vigente-2026-10-28.md`: um metadado foi
criado e o outro atualizado. Não existe snapshot anterior ou log de auditoria do
banco disponível nesta tarefa para provar a autoria ou recuperar os valores
anteriores. A rotina envolvida escreve apenas esses metadados, sem vínculos de
perfil, registros operacionais, usuários, versões ou assinaturas. A consulta atual
confirma ausência de vínculos, não a ausência de toda e qualquer alteração passada.

Não foi feita reversão automática. Uma eventual reversão dos metadados exige os
valores anteriores e autorização específica. A identificação definitiva do ambiente
e a comparação com backup/logs permanecem a cargo do responsável pelo banco.
Não foi possível atestar todos os dados históricos sem uma referência anterior.

Script auditável: `scripts/audit-permission-incident-readonly.cjs`. A evidência
local detalhada está em `.data/validation/permission-incident/readonly-audit.json`,
ignorada pelo Git, sem credenciais ou conteúdo de DATABASE_URL.

## Causa da separação dos serviços no Buffet

O middleware `active-operational-records.ts` exclui das consultas de medições as
projeções de fluxos cujo `preenchimentoCompleto` é falso. Isso evita apresentar
rascunhos como medições válidas nos relatórios sanitários.

O Histórico antigo era construído somente com essas consultas de medições. Portanto,
serviços com rascunho/versão persistidos, mas ainda incompletos, não entravam na
lista principal por dia. O componente genérico de compatibilidade consultava os
fluxos separadamente e mostrava esses serviços na seção adicional, inclusive na
tela inicial. Estar salvo não comprovava conclusão nem assinatura.

Não foi fornecida uma cópia autorizada dos dados operacionais reais de 26, 27 e
28/10. A leitura externa desta retomada se limitou aos metadados da ocorrência.
Os totais e assinaturas reais desses serviços continuam **não verificados**;
nenhum status ou item real foi corrigido, preenchido ou inferido.

## Alteração realizada

- A tela inicial mantém somente Serviços do Dia, com filtro de data no PostgreSQL
  para os registros e os fluxos. A seção adicional foi removida somente do Buffet;
  o componente compartilhado permanece disponível para os outros módulos.
- Os estados visuais são Não iniciado, Parcial e Completo. Um fluxo completo sem
  assinatura continua Completo. A escolha Não servido resolve o item quando foi
  explicitamente salva; os demais itens ausentes permanecem pendentes.
- O Histórico consulta também os fluxos e sua versão mais recente, com manifesto,
  itens ativos, quantidades resolvidas/obrigatórias e assinatura vigente. Junta
  os serviços na mesma lista de dias, incluindo serviços sem nenhuma projeção de
  item, mas com rascunho persistido.
- O agrupamento evita duplicação de serviço/data e prefere a representação
  versionada do mesmo item, preservando itens legados distintos. Os grupos já
  representados por fluxo são calculados uma vez.
- O manifesto e as quantidades da versão são usados em vez de deduzir a conclusão
  exclusivamente pelo catálogo atual. Itens ainda ausentes aparecem como pendentes.
  Valores digitados em rascunho não são promovidos a medições sanitárias pela leitura.
- Cada serviço mostra preenchidos, não servidos, pendentes e assinatura separada:
  pendente, assinada ou revisão pendente. O botão Abrir serviço leva à página atual
  de edição/consulta com a data correta, que carrega os campos do rascunho existente.
- O usuário sem autorização de edição recebe uma mensagem de consulta disponível,
  mantendo o formulário bloqueado. Os controles de permissão, assinatura,
  concorrência e competência existentes não foram ampliados.
- Sem filtro temporal explícito, o Histórico abre no mês corrente e os campos de
  mês/ano mostram esse recorte. Outros períodos continuam acessíveis pelos filtros
  existentes. Quando os recortes principal e mensal coincidem, uma consulta de
  fluxos é reutilizada. As consultas de relatório mantêm o filtro sanitário original.

## Validações locais

Todos os testes mutáveis usaram PostgreSQL 16 no Docker local, host literal
`127.0.0.1`, porta 55479, bases sintéticas novas clonadas de uma base de teste já
existente. Não foram executadas migrations. DATABASE_URL e DIRECT_URL foram fixadas
no processo de teste antes dos imports; o cliente Prisma também foi injetado no
adapter isolado. O arquivo `.env` não foi alterado; seu hash foi comparado antes
e depois do teste. Nenhuma URL ou credencial real foi exibida.

`node scripts/test-buffet-history.cjs` passou:

- Reprodução da omissão: a consulta normal de itens não retorna o serviço parcial,
  mas a consulta da relação de fluxo preserva e recupera seu item/rascunho.
- Fixtures de 25, 26, 27, 28/10 e do dia corrente: legado, parcial, rascunho vazio,
  completo sem assinatura, Não servido e assinado.
- Agrupamento sem duplicar serviços ou itens entre projeção e fluxo.
- Snapshot antes/depois das consultas, incluindo itens, versões, eventos,
  assinaturas e permissões de perfil, permaneceu idêntico.
- Continuação dos itens ausentes sem modificar o item anterior; bloqueios de
  serviço assinado e usuário de consulta, sem concessão de novas permissões.
- GET mensal real preservado, sem alteração nas consultas do relatório.

`node scripts/test-buffet-history-browser.cjs` passou no Edge com Next de produção
local e contas sintéticas: login real, tela inicial sem seção redundante e somente
com o dia atual, cartão completo sem assinatura, Histórico unificado, abertura do
parcial, recarga de 65°C já salvos, conclusão dos itens restantes e conferência no
PostgreSQL. Os valores anteriores foram preservados; `updatedAt` muda normalmente
quando o formulário completo é salvo. Assinatura e falta de autorização bloquearam
os formulários. Capturas e ausência de overflow externo foram verificadas nas
larguras 1440, 390 e 320; a tabela mantém sua rolagem horizontal interna em mobile.

### Medição sintética antes/depois

Comparação com `HEAD` para a função original da tela inicial, no mesmo conjunto
local e após aquecimento. Inclui a resolução da seção assíncrona de compatibilidade,
com cabeçalhos/controles administrativos simulados; não mede a página completa.

| Medida | Antes | Depois |
| --- | --- | --- |
| Consultas de aplicação medidas | 6 | 4 |
| Fluxos na consulta específica do dia | 1 | 1 |
| Fluxos adicionais na seção removida | 3 | 0 |
| Tempo de leituras em duas execuções locais | 18,6 a 49,8 ms | 10,0 a 11,9 ms |

São amostras sintéticas, sujeitas a variação; a última também concorreu com o build.
Não representam uma comparação estatística nem possuem baseline de produção. Não permitem
atribuir toda a lentidão real a essa seção. Evidências em
`.data/validation/buffet-history/`: `performance.json`, `report.html`, fixtures e
capturas, todos ignorados pelo Git.

## Continuidade da etapa anterior e verificações técnicas

O build encontrou uma ramificação de Óleo já inacessível em
`src/app/historico-operacional/actions.ts`, remanescente da interrupção anterior.
Ela foi removida do cálculo genérico, pois Óleo já retorna pelo caminho próprio.
Não houve mudança no comportamento dos outros módulos.

Os testes antigos de fita foram ajustados ao formulário auditável atual
(`versao`/`originalUpdatedAt` e Salvar Alterações), e o script de navegador da
correção de Óleo, que tinha sido interrompido no meio, foi concluído.

Regressões executadas, sempre em bases sintéticas locais e sem migrations:

- `test-temperature-corrections.cjs`: passou, incluindo permissões, assinaturas,
  concorrência, rollback, competência e legado.
- `test-oil-corrections.cjs` e `test-oil-corrections-browser.cjs`: passaram.
- `test-oil-strip.cjs` e `test-oil-strip-browser.cjs`: passaram, com as cinco
  fitas/status, opção explícita sem aferição, recarga, edição e relatório.
- `npm.cmd run lint`: passou sem warnings/erros do ESLint.
- `npm.cmd run build`: passou, incluindo tipos e geração de rotas; executado com
  conexão explicitamente local. Avisos existentes de manutenção do Next/Browserslist.
- `git diff --check`: passou, com avisos habituais de normalização LF/CRLF.

## Arquivos e limites

Buffet: alterados `legacy-page.tsx`, `historico/legacy-page.tsx`, `service-history.ts`,
`status-badges.tsx` e `workflow-page.tsx`; criado `workflow-history.ts`.

Testes/auditoria: criados `scripts/test-buffet-history.cjs`,
`scripts/test-buffet-history-browser.cjs` e
`scripts/audit-permission-incident-readonly.cjs`. Alterados os três scripts de
navegador/persistência de Óleo citados acima, o ajuste de compilação da action
compartilhada e a documentação da ocorrência de Temperatura.

Não foram alterados schema, migrations, autenticação, regras sanitárias ou
concessões reais. Não houve seed, reset, db push, exclusão de registros reais,
escrita no banco externo, commit, push ou deploy nesta retomada. Nenhuma credencial
foi solicitada ou revelada. A alteração está validada localmente; a identificação
do banco real e a apuração dos valores anteriores dos metadados continuam pendentes.

Git final da retomada: dez arquivos rastreados modificados e cinco novos, na mesma
branch de estabilização. Os servidores e navegadores de teste foram encerrados;
o container foi parado preservando as bases locais sintéticas.
