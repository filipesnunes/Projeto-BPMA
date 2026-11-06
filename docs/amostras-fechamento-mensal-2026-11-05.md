# Amostras: indicadores e fechamento mensal de outubro

Projeto KPlatz, branch `estabilizacao/experiencia-anterior-2026-10-28`, HEAD inicial
`dc8d702`. Git inicialmente limpo: as alterações anteriores já estavam nesse
commit e foram preservadas. Sem Multitenant, alteração do `.env`, migrations,
seed, reset, db push, commit, push ou deploy nesta etapa.

## Diagnóstico confirmado

Railway conferido por sessão autenticada: **StaySafe / production / Projeto-BPMA /
Postgres**. A conexão da aplicação foi comparada à do serviço Postgres autorizado,
sem imprimir URLs, senhas ou tokens. O deploy ativo consultado corresponde a
`dc8d702377af2c9b3fbd16c8388e7e9887a696a6`.

A única consulta ao PostgreSQL real usou `SET TRANSACTION READ ONLY`, com
`SHOW transaction_read_only = on` confirmado dentro da transação. Captura em
05/11/2026 às 21:32, horário de São Paulo. Nenhuma rotina de sessão, catálogo,
assinatura ou fechamento da aplicação foi executada no banco real.

| Outubro de 2026 | Resultado |
|---|---:|
| Serviços/dias com registros | 30 |
| Itens ativos | 994 |
| PREENCHIDO | 812 |
| NAO_SERVIDO | 182 |
| PENDENTE | 0 |
| Itens legados sem fluxo | 795 |
| Dias legados com assinatura diária técnica | 24 |
| Serviços versionados com assinatura técnica vigente | 6 |
| Itens excluídos ou duplicados encontrados | 0 |

Os seis serviços versionados são de 26 a 31/10. Os dias 26, 27, 28 e 29 têm
revisão técnica retroativa; 30 e 31 têm assinatura SERVICO. Todos possuem vínculo
da assinatura à versão atual e conteúdo persistido igual ao snapshot assinado.
Não foram encontradas revisões gerenciais vigentes, serviços reabertos ou
assinaturas obsoletas que justificassem esse bloqueio. Os 24 dias legados possuem
assinatura diária de NUTRICIONISTA/responsável técnico posterior aos lançamentos.
Não há registros em 18/10; os 30 dias correspondem aos serviços efetivamente
existentes, sem criação de um dia adicional.

O fechamento genérico e o específico de outubro estavam ausentes na consulta.

### Por que bloqueava

`monthlyPeriodCounts()` exigia ASSINADO em cada item legado, exceto NAO_SERVIDO,
sem considerar a assinatura diária que já os abrangia. Isso rejeitava **654 itens
legados PREENCHIDO legitimamente assinados**. A ação antiga `closeMonthAction()`
possuía outro filtro, também sem escopo de assinatura, que rejeitaria **todos os
812 PREENCHIDO**, incluindo 158 itens versionados.

O Histórico, por sua vez, contava datas com assinatura diária ou resumo dos
serviços fechados. Nesse mês, o total de 30 dias assinados era sustentado pelas
evidências, mas não era a regra consultada pelo fechamento. Em outros cenários,
essa contagem também podia apresentar revisão gerencial ou assinatura de versão
anterior como ausência de pendência técnica.

### IDs responsáveis pela seleção antiga

As listas exatas estão nas evidências locais ignoradas pelo Git:

- [IDs por data, em intervalos exatos](../.data/validation/buffet-monthly-20261105/ids-bloqueio-outubro.md).
- [IDs individuais e resultado dos 30 serviços](../.data/validation/buffet-monthly-20261105/snapshot-assessment.json).
- `diagnosis-summary.json` contém `blockedByOldMonthlyIds` (654) e
  `blockedByOldActionIds` (812), no mesmo diretório.

Na tabela de IDs, as linhas “Legado: Sim” são precisamente a seleção do backend
mensal antigo. A ação alternativa antiga abrangia também as seis linhas
versionadas. Não foi escolhida uma amostra de IDs para criar exceções no código.
Os snapshots reais permanecem locais, fora dos arquivos versionáveis.

## Correção

`monthly-eligibility.ts` contém a avaliação compartilhada, sem escritas. O Histórico
usa essa função sobre os dados já carregados; `monthlyPeriodCounts()` e
`validateMonthlyClosing()` usam a mesma avaliação com consultas no período.
Não há consulta individual por item. O fechamento reavalia dentro da transação
serializável existente, sob o bloqueio do módulo, com usuário, permissão e senha
conferidos novamente.

A avaliação distingue preenchimento e Não servido da validação técnica. Para um
serviço versionado, exige conclusão efetiva dos itens, assinatura técnica vigente,
vínculo à versão atual, ausência de invalidação dessa assinatura e igualdade com
o conteúdo salvo. Uma assinatura diária antiga não substitui a assinatura de um
serviço versionado reaberto ou alterado. Revisão gerencial continua identificada,
mas não satisfaz a exigência técnica.

Legados podem ser abrangidos pela assinatura diária técnica vigente ou por sua
assinatura técnica individual histórica, com evidência de nome/perfil/data e
posterioridade ao lançamento. ASSINADO sozinho não fabrica essa evidência.
Não se exige converter PREENCHIDO para ASSINADO quando a cobertura é válida.
Itens Não servido são resolução operacional, sem inventar aferições.

As contagens de dias completos, parciais, assinados e pendentes refletem todos os
serviços de cada data. Legados duplicados de itens já representados pela versão
são desconsiderados na leitura; exclusões controladas também não participam.
Serviços sem identificação válida ficam explicitamente pendentes, sem desaparecer
da autorização mensal. Não foram excluídos ou migrados registros para obter isso.

Quando existem pendências, o Histórico lista data, serviço, item quando aplicável,
motivo, ação necessária e link “Conferir serviço”. A mensagem do fechamento usa
essas mesmas pendências. O aviso de que a assinatura mensal poderia ignorá-las
foi corrigido especificamente para Amostras, sem mudar a política de outros módulos.

## Validação

- `test-buffet-monthly-eligibility.cjs`: 12 grupos em PostgreSQL sintético local,
  cobrindo os 20 cenários solicitados, agrupados por finalidade. O cenário principal
  tem 30 serviços, 994 itens, 812 PREENCHIDO, 182 Não servido, 24 assinaturas diárias
  e seis assinaturas versionadas, incluindo técnicas retroativas.
- Resultado principal: 30 dias completos, 30 assinados, zero parciais e zero
  pendentes; `validateMonthlyClosing()` retorna `{records:994,pending:0}`.
- A função real de fechamento gravou FECHADO, o responsável e o snapshot no banco
  sintético. Repetição de fechamento, senha inválida e usuário sem permissão foram
  recusados. Reabertura auditável posterior foi verificada no mesmo banco de teste.
- Pendência sanitária real, falta de assinatura, revisão gerencial, revogação,
  vínculo obsoleto, reabertura, divergência de conteúdo, duplicidade e exclusão
  foram exercitados. Uma falha PostgreSQL provocada no INSERT do fechamento
  demonstrou rollback, inclusive do log que já havia sido criado na transação.
- Itens, temperaturas, responsáveis, versões e assinaturas de execução/supervisão
  foram comparados antes/depois e permaneceram iguais.
- `test-supervision-signatures.cjs`: 22 grupos aprovados nos sete módulos.
- `test-retroactive-review.cjs`: 22 grupos aprovados nos sete módulos.
- `test-monthly-reopening.cjs`: aprovado nos sete módulos em adapter isolado;
  fixture de Amostras atualizado para fornecer evidência técnica realista.
- `test-buffet-history.cjs`: aprovado em PostgreSQL local pelo wrapper portátil.
- `test-retroactive-review-browser.cjs`: aprovado no Chrome, com fluxos de revisão,
  Histórico, erros, permissões e PDFs dos sete módulos.

Os testes criam bancos novos exclusivamente em `127.0.0.1:55479`. Os cenários de
corrupção simulada e rollback afetam somente esses bancos. Os bloqueios reais de
imutabilidade e unicidade foram mantidos; não foram relaxados no produto. Uma
cópia sintética separada, ainda aberta, é usada pelo teste de navegador mensal.

`test-buffet-monthly-browser.cjs` passou no build final, com Chrome real e banco
sintético separado: perfil com Histórico permitido e fechamento negado, senha
incorreta, 30 dias completos/assinados, serviço pendente com indicador 29/1 e link
direto, recusa do fechamento pendente, fechamento autorizado, recarga mantendo
Assinado e relatório após persistência. Conferiu novamente os indicadores e a
igualdade de aferições, versões e assinaturas anteriores. O cabeçalho do PDF
apresenta “Assinado digitalmente”; os 30 serviços têm o responsável e a data real
do fechamento nos rodapés. As 90 páginas desta massa sintética tiveram texto
extraído, sem páginas vazias. Páginas 1 e 3 foram renderizadas para inspeção visual.
Foram inspecionadas capturas desktop 1440 e viewport mobile 390, sem overflow.
Viewport mobile do Chrome não equivale a Safari/iPhone real.

Prisma Generate 6.5.0, TypeScript, lint sem warnings/erros e build completo de
produção Node 22.23.4 / Next 15.5.12 aprovados no código final. A conferência de
`git diff --check` passou. Sem alterações de schema ou migrations.

## Arquivos

Criados: `src/app/controle-buffet-amostras/monthly-eligibility.ts`,
`scripts/test-buffet-monthly-eligibility.cjs`, `scripts/test-buffet-monthly-browser.cjs`
e este documento.

Alterados: `src/lib/monthly-periods.ts`,
`src/lib/operational-workflow/compatible-records.ts`,
`src/app/controle-buffet-amostras/actions.ts`,
`src/app/controle-buffet-amostras/historico/legacy-page.tsx`,
`src/app/controle-buffet-amostras/workflow-history.ts`,
`src/components/historico/technical-signature.tsx` e
`scripts/test-monthly-reopening.cjs`.

## Situação de outubro e próximo passo

A aplicação da nova regra à cópia real obtida em READ ONLY encontrou os 30 serviços
com cobertura técnica válida e nenhuma pendência que exigisse regularização de
itens ou nova assinatura de Camila naquele instante. O banco real não foi fechado.
O estado poderá mudar depois dessa consulta; o backend sempre confere novamente.

Após publicação autorizada, a responsável poderá abrir Histórico → outubro/2026,
conferir os indicadores, informar a senha e selecionar “Assinar Fechamento Mensal”.
Se surgir pendência posterior, a lista apontará o serviço e a providência necessária.
Esta entrega não executa esse procedimento em produção.

Código apto para publicação autorizada. Git final: mesma branch de estabilização,
sete arquivos rastreados modificados e quatro novos, sem staging. Evidências reais,
PDFs, capturas e bancos de teste permanecem ignorados e fora desses arquivos.
