# Temperatura — assinatura parcial e Histórico

Implementação local na branch `estabilizacao/experiencia-anterior-2026-10-28`,
partindo de `312d6c98761d4f728229f9200593bfe44804cb45`. Sem commit, push ou deploy.
Não houve migration, seed, reset, db push ou alteração de dados de produção.

## Diagnóstico real

Destino confirmado pelo Railway autenticado: StaySafe / production /
Projeto-BPMA / Postgres. O destino da conexão da aplicação corresponde ao serviço
Postgres. O deploy ativo correspondia ao mesmo commit local acima. Consultas em
transação PostgreSQL READ ONLY, sem rotinas de sessão ou sincronização do catálogo.
O `.env` foi preservado. A última leitura ocorreu em 06/11/2026 às 19:01:32 de
São Paulo; o resultado é uma fotografia desse instante.

Em 02/11/2026 havia **36 aferições, 35 com assinatura técnica vigente vinculada
à versão atual e uma pendente**. Não havia assinatura diária legada em
`AssinaturaDiariaModulo`. Não havia aferição sem fluxo nesse conjunto.

A pendente é **#4440 — Refrigerador de bancada 02, tarde**, executor original
Anderson Fiorenzano, fluxo `cmw0hvkd8003cpj0xc3l7rihl`, versão 4, estado COMPLETO.
As versões 1/2 foram registradas por Anderson e 3/4 por Camila Reinaldo.
O impedimento normal retorna:

> Quem preencheu ou corrigiu qualquer item deste registro não pode assinar sua revisão.

A consulta ao mecanismo retroativo existente retornou elegibilidade para Camila,
com ressalvas de participação em versões anteriores e revisão realizada agora,
sem atestar presença na execução histórica. Nenhuma assinatura foi executada.

As 36 linhas, com IDs, equipamento, turno, executor, fluxo, versão, estado,
assinatura, vínculo exato, horário e impedimento, estão no arquivo local ignorado
`.data/validation/temperature-day-signatures-20261106/diagnosis-table.md`.
O JSON correspondente preserva também os autores das versões e eventos de
invalidação. Não foram incluídos fotos, credenciais ou evidências reais no Git.

## Causa

O indicador antigo só apresentava assinatura quando todas as unidades atendiam
ao critério, sem representar o estado parcial. O formulário permitia selecionar
um subconjunto e confirmava as versões selecionadas, sem reconsultar o total do
dia. A interface não distinguia claramente esse sucesso da conclusão integral.

O filtro de elegibilidade descartava as unidades bloqueadas e seus motivos.
Depois de assinadas as 35 elegíveis, restava somente #4440, bloqueada por autoria:
o formulário desaparecia e o dia continuava pendente sem explicação.
Isso não é evidência de perda de persistência das 35 assinaturas.

## Correção

`day-review.ts` compartilha contagem, prova da assinatura vigente, apresentação
e elegibilidade entre Histórico, resumo mensal, formulário e resultados das
actions. Confere módulo, estado, ponteiro, vínculo da assinatura com a versão
atual e eventos de revogação/invalidação. Revisões gerenciais ou operacionais
permanecem identificadas e não satisfazem validação técnica.

Registros legados entram no total. Assinaturas individuais e diárias legadas
exigem evidência técnica e data compatível; uma diária antiga não cobre versões
reabertas. O resumo completo só existe quando todas as aferições estão validadas.
O mensal passa a informar também dias parcialmente assinados; esses dias ainda
compõem os dias pendentes. As consultas de contagem usam metadados delimitados
pelas datas, sem fotos nem snapshots JSON das versões.

O formulário diário lista todas as aferições e os motivos dos bloqueios. Envia
todas as pendentes elegíveis nas versões consultadas, sem caixas de seleção para
um subconjunto arbitrário. Informa o alcance e preserva as assinaturas anteriores.
Sem elegíveis, explica a ausência do formulário normal e oferece, quando
autorizado, o caminho retroativo existente. Não relaxa autoria, senha, permissões,
competência ou controle transacional do serviço de assinatura.

As actions normal e retroativa reconsultam o dia após persistir, informando X/Y e
pendências. Histórico, compatibilidade dos registros e relatório usam a mesma
prova da assinatura versionada, evitando exibir como vigente uma assinatura
revogada ou de outra versão. Não houve mudança de layout do relatório.

## Validação

Exclusivamente adapters isolados ou PostgreSQL sintético em 127.0.0.1:55479.

- Novo teste de integração: 11 grupos, cobrindo os 20 cenários solicitados em
  conjunto com o navegador. Estados 0/36, 1/36, 30/36, 35/36 e 36/36; todas
  individuais; coletiva; legado misto; autoria; versão incompatível; nomenclatura;
  retroativa; revogação; reabertura; formulário; permissão; senha; rollback.
- Novo teste Chrome real + Next de produção + PostgreSQL: dia 02 passa de 35/36
  para 36/36 pela revisão retroativa, volta ao Histórico e permanece assinado.
  Dias 01 e 03 recebem assinatura coletiva e permanecem 36/36 após recarga.
  Mensal: três dias assinados, zero parciais, zero pendentes. Relatório: 108 células
  com supervisor; PDF gerado e texto extraído confirmando as 108 ocorrências
  do nome e a data real das assinaturas. Senha incorreta e usuário sem permissão bloqueados.
- Comparação antes/depois confirma preservação integral dos registros
  operacionais, versões anteriores, 35 assinaturas e eventos anteriores.
- `test-supervision-signatures.cjs`: 22 grupos passaram.
- `test-retroactive-review.cjs`: 22 grupos passaram.
- `test-temperature-snapshot-integrity.cjs`: 12 grupos passaram, incluindo fotos,
  nomenclatura, restrições, competência e rollback.
- `test-monthly-reopening.cjs`: passou nos sete módulos, com adapters isolados.
- `test-temperature-full-actions.cjs`: três cenários de relatório/PDF passaram,
  incluindo relatório excepcional de 31 páginas e textos históricos integrais.
- Prisma Generate 6.5.0, TypeScript, lint e build de produção Node 22.23.4 /
  Next 15.5.12 passaram. `git diff --check` passou.

Capturas desktop 1440 e viewport mobile 390 foram inspecionadas visualmente:
pendência com motivo e link, resultado após recarga e interface sem overflow da
página. A tabela larga mantém sua rolagem interna. Viewport Chrome não homologa
Safari/iPhone. Evidências sintéticas locais estão no mesmo diretório ignorado
do diagnóstico, separadas nos arquivos `integration-results.json`,
`browser-results.json`, capturas PNG e `temperatura-novembro-validado.pdf`.

Na primeira execução, o log do navegador registrou um conflito transacional na sincronização de catálogo
do banco sintético, sem impedir login, assinatura, preservação ou os resultados
de aceite. A repetição final do navegador passou sem esse erro no log.
Não foi executada sincronização no banco real. A primeira geração de
Prisma encontrou DLL ocupada por teste concorrente; após o processo terminar,
a nova execução de Generate passou, assim como a compilação completa.

## Arquivos

Novos: `day-review.ts` no módulo Temperatura;
`src/components/historico/temperature-day-signature.tsx`;
`scripts/test-temperature-day-review.cjs`;
`scripts/test-temperature-day-review-browser.cjs`; este documento.

Alterados: Histórico (`history-data.ts`, `legacy-history.tsx`),
`workflow-actions.ts` de Temperatura, action da revisão retroativa (somente
resultado de Temperatura), rota mensal de Temperatura,
`src/components/compatible-day-review.tsx` e
`src/lib/operational-workflow/compatible-records.ts` (critérios de Temperatura).
Sem alterações de schema, migrations, outros módulos ou políticas de assinatura.

## Conclusão operacional do dia real

Esta manutenção não concluiu o dia em produção: permanece a evidência de **35/36**
na última leitura. Camila deve consultar a aferição #4440, conferir dados e
ressalvas, acessar a revisão retroativa autorizada e confirmar com sua senha e
justificativa. A rota existente é:

`/historico-operacional/revisao-retroativa?modulo=temperatura&data=2026-11-02&fluxo=cmw0hvkd8003cpj0xc3l7rihl`

A elegibilidade, a versão e a competência serão verificadas novamente no momento
da operação. Não editar ou salvar novamente a aferição apenas para obter assinatura;
não reassinar as 35 já válidas. Depois, recarregar Histórico e conferir 36/36,
responsável, data real e natureza no relatório. A revisão não altera a autoria da
execução nem comprova presença histórica. Não é necessário novo sistema de
assinaturas ou intervenção SQL. A publicação da melhoria de interface continua
dependendo de autorização; não houve commit, push ou deploy automático.
