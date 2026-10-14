# Temperatura: data de referência e pendências por turno

## Diagnóstico

O filtro de equipamentos já era compartilhado por manhã e tarde e considerava
os turnos ainda não preenchidos. O problema reproduzido estava no contexto do
formulário: o redirect de criação não guardava o turno escolhido, e a página
usava novamente o turno do relógio. Com o relógio à tarde, uma aferição salva
manualmente pela manhã era seguida por um formulário padrão da tarde, onde o
equipamento corretamente continuava disponível.

A criação também ignorava qualquer data enviada e utilizava obrigatoriamente
`getTodaySystemDate()`. A interface apresentava a data como texto, sem calendário.
Ambos os comportamentos foram reproduzidos com as fontes anteriores e adapters
isolados, antes da validação da correção.

## Implementação

- A criação aceita `data` no mesmo padrão nativo `input type="date"`, `bpma-input`
  e validação `parseAppDateInput` de Hortifruti. Hortifruti não foi modificado.
- Chamadas antigas sem o campo continuam utilizando hoje. Campos explicitamente
  vazios, datas inexistentes e formatos inválidos são recusados no servidor.
- `dataRegistro` e `turnoRegistro` guardam o contexto escolhido no retorno e nos
  links de Novo Registro; são separados dos filtros da listagem.
- A página utiliza a data escolhida nas consultas de duplicidade e de aferições
  anteriores. O filtro compartilhado por turno foi reutilizado sem duplicação.
- Ao mudar a data, o router recarrega os dados do formulário. O fieldset fica
  desabilitado durante essa transição; o formulário é remontado para a nova data,
  evitando aproveitar uma temperatura ou foto de outra aferição.
- Mesmo quando todos os equipamentos da data estão preenchidos, o calendário
  continua disponível para selecionar outra data. O salvamento fica desabilitado.
- A edição mantém sua data original, somente leitura. Não foi acrescentada edição
  retroativa de observações ou justificativas.

O banco já contém `data` como PostgreSQL DATE e `createdAt` com default now().
Somente `data` recebe a referência escolhida. `createdAt`, responsável e metadados
de foto continuam seguindo o fluxo existente. Não houve schema/migration nova.
Os bloqueios de meses fechados, a proteção existente contra duplicidade e as
regras de temperatura/foto foram preservados.

## Validação

- Manhã salva na data histórica; remoção das pendências da manhã; manutenção da
  disponibilidade à tarde; remoção após ambos os turnos; disponibilidade em outro dia.
- Retorno e Novo Registro preservam data/turno escolhidos, sem filtro de histórico implícito.
- Default hoje; alteração de data mantém o turno selecionado; calendário disponível
  em data totalmente preenchida; duplicidade e datas inválidas sem novos registros.
- Mês histórico fechado bloqueia criação; relatório mensal usa o dia de referência;
  horário de criação real e responsável preservados; registros anteriores intactos.
- Regressões de Hortifruti, tarde, fotos, filtros de histórico, regras de temperatura,
  persistência entre turnos e fechamento/reabertura passaram.
- `test-client-corrections.cjs`, `test-bpma-adjustments.cjs` e
  `test-monthly-reopening.cjs` passaram com adapters isolados, sem banco real.
- Lint passou sem warnings/erros ESLint; build passou com compilação, tipos e rotas;
  git diff --check passou. Build registrou somente o aviso de base Browserslist antiga.

Não foram realizados login nem inserções autenticadas em produção. A navegação do
calendário foi testada pela função real do componente com router isolado; o fluxo
completo de RSC no navegador autenticado permanece para conferência após publicação.

Arquivos: `page.tsx`, `actions.ts` e novo `reference-date-fields.tsx` do módulo;
dois scripts de regressão e este documento. Apenas o BPMA/KPlatz atual foi alterado.
Sem seed, reset, db push, exclusão de dados reais, commit ou push.
