# Óleo — preservação da aferição da fita

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`.
Alterações restritas ao módulo Óleo, seus testes e este documento.

## Diagnóstico e reprodução antes da correção

O problema reproduzido envolve perda da seleção e aceitação silenciosa de um
campo ausente, e não uma falha de leitura do PostgreSQL:

1. Em `oil-register-fields.tsx`, clicar em **Sem Utilização no Período** executava
   `setFitaSelecionada("")` e limpava a temperatura. Voltar para **Com Utilização**
   não restaurava os campos. No Edge real, selecionar 3,5%, alternar esses dois
   botões e inspecionar `new FormData(form).get('fitaOleo')` retornou `null`.
2. Radios sem seleção ou desabilitados não participam do FormData. O botão antigo
   **Sem aferição da fita** também apenas limpava a seleção: não enviava uma
   confirmação distinta da omissão acidental.
3. `getRegistroPayload` aceitava o campo ausente e retornava `fitaOleo: null` e
   `status: null`. O adapter versionado gravava esse payload mesmo sobre uma fita
   anteriormente preenchida. A edição legada usava a mesma função.
4. Em PostgreSQL exclusivamente local e sintético, foi salva a fita 3,5%
   (`ATENCAO`); um segundo salvamento sem o campo `fitaOleo` apagou os dois valores.
   As versões permitem comparar o rascunho/snapshot anteriores e posteriores.
5. A listagem, o Histórico e o relatório leem os valores persistidos;
   `getStatusLabel(null)` apresenta **Sem aferição da fita**, conforme o código
   existente. Não foi necessário modificar essas consultas ou a função de status.

A seleção direta normal de 3,5% chegou corretamente ao FormData no navegador.
Não foi demonstrado que um rerender simples ou clique rápido, isoladamente,
apagasse essa seleção. A alternância de utilização foi uma reprodução concreta.
Essas evidências explicam caminhos possíveis do defeito; não provam a sequência
executada pelo cliente em 21/10 ou 24/10.

## Correção

- A alternância temporária de utilização preserva fita e temperatura no estado
  do formulário. Ao salvar **Sem utilização**, o servidor continua gravando
  temperatura/fita nulas e status `SEM_UTILIZACAO`, conforme a regra existente.
- **Sem aferição da fita** é agora um radio explícito no mesmo grupo. O valor
  técnico `__SEM_AFERICAO__` existe somente no formulário/rascunho; não é gravado
  como porcentagem na tabela operacional. O banco continua usando fita/status
  nulos para essa situação, sem alteração de schema.
- Um novo registro com utilização e temperatura precisa selecionar uma fita ou
  confirmar a ausência de aferição. Não é exigida fita diariamente. A previsão
  de três dias, a temperatura mínima de 120°C para fita e o alerta acima de
  180°C foram preservados.
- O servidor rejeita escolhas vazias, inválidas ou campos `fitaOleo` duplicados.
  Um rascunho ainda incompleto pode continuar sem escolha; isso não é convertido
  silenciosamente em uma aferição completa.
- A omissão do campo em uma edição preserva a fita já persistida. Quando ainda
  só existe rascunho, preserva sua escolha anterior. Para remover uma fita,
  deve ser enviada a opção explícita sem aferição, ou a condição sem utilização.
- A edição sem mudança de fita conserva também o status/orientação existentes,
  inclusive quando a opção histórica foi inativada. Uma opção inativa continua
  proibida em novos registros.
- Registros antigos com fita nula permanecem nulos. Apresentá-los sem aferição
  não comprova que essa tenha sido a intenção original do usuário.
- As instâncias dos formulários são identificadas pelo registro e, no editor
  versionado, pela chave/versão. Ao mudar de registro/versão, o estado é iniciado
  com os respectivos valores salvos; rerenders comuns não reiniciam a seleção.

## Validações

Usado PostgreSQL 16 no Docker local, porta `127.0.0.1:55479`, com cópias de uma
base exclusivamente sintética já existente. Os testes novos fixam DATABASE_URL
e DIRECT_URL locais antes de carregar módulos e injetam o mesmo Prisma Client.
Não foi consultado o destino externo do `.env`. Nenhuma migration foi executada.

`node scripts/test-oil-strip.cjs`: passou. Conferiu no PostgreSQL as cinco fitas
e seus status, temperatura 173,3°C, opção explícita sem aferição, sem utilização,
rejeição de ausência/vazio/duplicidade, fita inválida e temperatura insuficiente,
recuperação de rascunho, mudança de fita, edição parcial, criação e edição legada
(incluindo a Server Action real), opção histórica inativa, bloqueio de registro
versionado assinado e preservação de suas assinaturas. Salvamentos concorrentes
com a mesma versão e repetição da mesma chave não duplicaram registros.
As versões históricas não foram reescritas.

`node scripts/test-oil-strip-browser.cjs`: passou no Edge headless com o Next de
produção local. Conferiu login real, FormData antes do envio, as cinco fitas e
seus status realmente gravados, troca antes do envio, seleção e submit imediato,
rerender provocado por outro campo, alternância de utilização, recarga,
edição apenas da observação, ausência de seleção sem confirmação, sem utilização
e opção sem aferição. Conferiu a célula da fita na listagem e no dia aberto do
Histórico. O GET mensal real também passou, com as cinco fitas e botão Imprimir.

Capturas inspecionadas em desktop e mobile; ausência de overflow testada nas
larguras 1440, 390 e 320. Evidências locais ignoradas pelo Git em
`.data/validation/oil-strip/`: base/conta sintéticas, relatório HTML e capturas.

- `npm.cmd run lint`: passou, sem warnings ou erros do ESLint.
- `npm.cmd run build`: passou, incluindo tipos e geração das rotas, com conexão
  explicitamente local. Avisos de manutenção do Next lint/Browserslist existentes.
- `git diff --check`: passou; avisos de normalização LF/CRLF do Git.

O teste antigo `test-oil-workflow.cjs` teve seus exemplos sem fita atualizados
para a confirmação explícita e recebeu URLs locais antes dos imports. Sua suíte
completa não foi executada nesta manutenção porque aplica migrations; os testes
novos acima reutilizaram o schema local sem executá-las.

## Registros de 21/10 e 24/10

Não foi fornecida uma cópia autorizada desses dados reais. Não foram consultados
IDs, rascunhos, versões, eventos ou assinaturas reais desses dias. Não é possível
recuperar ou atribuir a porcentagem originalmente selecionada com a evidência
disponível. Nenhuma atualização retroativa ou preenchimento presumido foi feito.

Procedimento individual preparado, não executado:

1. Obter uma cópia autorizada e recuperável; consultar em somente leitura o ID,
   data, fita/status, utilização, responsáveis, snapshots, rascunhos, eventos,
   assinaturas e eventual sequência de edições do registro específico.
2. Registrar o valor anterior e a evidência exata de um valor diferente. Sem
   comprovação, manter a ausência como dado desconhecido, sem inferir porcentagem.
3. Obter autorização individual, responsável pela correção e justificativa.
   Preservar uma evidência íntegra do conteúdo anterior e de todas as assinaturas.
4. Para registros versionados, utilizar a reabertura autorizada já existente,
   quando permitida pela competência, mantendo as versões e assinaturas antigas;
   conferir nova versão/evento e exigir nova assinatura conforme o fluxo vigente.
5. Para legado sem auditoria individual suficiente, não executar uma edição
   direta nem SQL avulso: aprovar primeiro um procedimento que registre antes,
   depois, autor e motivo e preserve as assinaturas. Este ajuste não acrescenta
   nem executa um mecanismo de correção retroativa.
6. Conferir somente o registro autorizado, seu Histórico e relatório. Não reabrir
   ou modificar automaticamente outras datas/competências.

## Arquivos e publicação

Alterados: `actions.ts`, `legacy-records.tsx`, `oil-register-fields.tsx`,
`record-payload.ts`, `workflow-adapter.ts`, `workflow-view.tsx` no módulo Óleo;
`scripts/test-oil-workflow.cjs`.

Criados: `strip-choice.ts` no módulo Óleo; `scripts/test-oil-strip.cjs`;
`scripts/test-oil-strip-browser.cjs`; este documento.

Nenhuma mudança de schema, migration, atualização de dados reais, alteração de
assinaturas reais, seed, reset, db push, commit, push ou deploy nesta manutenção.
Produção não foi validada; a correção de código está pronta para revisão/publicação
pelo fluxo normal. Git final: sete arquivos rastreados modificados e quatro novos,
na mesma branch de estabilização.
