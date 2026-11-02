# Buffet / Amostras — itens aferidos que permaneciam pendentes

## Causa comprovada

Trabalho realizado no BPMA/KPlatz atual, branch
`estabilizacao/experiencia-anterior-2026-10-28`, inicialmente limpa, HEAD
`50633ef`. Multitenant e outros módulos não foram alterados.

A reprodução executou o adapter desse commit em PostgreSQL isolado e confirmou
dois caminhos para a inconsistência:

1. Os campos ausentes do FormData eram convertidos em strings vazias. Ao receber
   `rowKey` de um item já preenchido sem seus campos, `getRegistroItemIssue`
   considerava o item em branco. O adapter atualizava somente `status=PENDENTE`,
   deixando temperaturas, ação corretiva e horário anteriores no registro.
2. Uma aferição retroativa já preenchida, reenviada sem o horário, falhava em
   `readExecutionTime`. O catch do salvamento parcial ocultava esse erro e também
   atualizava somente o status para PENDENTE. O horário anterior continuava no
   próprio banco, mas não era utilizado na validação.

Nos dois casos reproduzidos, os valores anteriores continuaram válidos e
persistidos, enquanto o status caiu indevidamente para PENDENTE. Não eram novas
pendências legítimas. O manifesto, as temperaturas sanitárias e a ordem dos itens
não explicavam esse rebaixamento.

Também foi reproduzida uma pendência legítima: novo item retroativo com
temperaturas e ação válidas, mas sem horário ou justificativa de horário
desconhecido. Nesse caso o preenchimento deve continuar pendente, com os campos
no rascunho e o motivo apresentado ao usuário. Ter temperatura não basta.

## Correção do salvamento

`row-save.ts` centraliza a preparação de linhas para o fluxo versionado e o
salvamento em lote legado. O servidor distingue campo ausente de valor vazio:

- Campos ausentes preservam os valores existentes. Uma linha sem campos
  enviados não rebaixa o registro nem modifica seu timestamp.
- O formulário identifica os campos realmente editados (`changedField`).
  Um envio vazio acidental de dados anteriormente salvos é rejeitado com erro;
  não se converte silenciosamente em pendência.
- Quando um campo obrigatório é apagado intencionalmente, o salvamento parcial
  registra a pendência coerente, por exemplo temperatura do alimento nula e
  status PENDENTE, sem manter a temperatura anterior como se ainda valesse.
  O manifesto e a versão anterior permanecem intactos.
- Temperatura malformada, opção corretiva inexistente/inativa indevida, horário
  inválido e outros erros de validação não são engolidos: a operação falha,
  informa o item e preserva os dados anteriores. No fluxo versionado, a transação
  reverte integralmente as gravações e a criação de versão.
- Para itens já preenchidos, preservam-se executor, perfil, data/hora de lançamento
  e horário original quando o horário não foi editado. Não se reaplica a exigência
  de horário novo a um registro antigo já salvo sem esse campo.
- Novas aferições retroativas exigem horário válido ou a opção de horário
  desconhecido com justificativa válida. Um item que deixa de ser Não servido
  precisa satisfazer os requisitos de execução antes de ficar preenchido.
- Ação inativa anteriormente associada ao próprio registro pode ser preservada.
  Uma ação inativa não pode ser escolhida para outro registro. Ações corretivas
  continuam obrigatórias para resultados Alerta/Crítico, inclusive rejeitando
  “Não se aplica” nessas situações.
- O rascunho armazena os motivos das pendências. Linhas novas incompletas ficam
  no rascunho, sem projeção de uma aferição válida. Extras pendentes já existentes
  mantêm dados tipados coerentes com seu estado.

As ações legadas individuais também preservam os dados do executor original e
a ação histórica quando aplicável. Não foram alteradas permissões, regras de
assinatura, bloqueios de competência, exclusão controlada ou critérios sanitários.

## Formulário, status e contagens

O formulário continua usando a action existente e o mecanismo de versão. A
submissão interativa mantém os campos no navegador em caso de erro, sem o reset
automático que descartaria o texto ainda não salvo. A busca apenas oculta linhas;
não remove campos do envio. Campos desabilitados são tratados como ausentes pelo
servidor e não apagam o conteúdo persistido.

O status exibido vem do registro persistido, sem promover um item a Não servido
apenas por uma flag no rascunho. Dados de itens preenchidos vêm da projeção
persistida; dados ainda incompletos permanecem identificados como rascunho e
podem mostrar o motivo da pendência.

`buffetProgress` conta o manifesto original e os extras não excluídos:

- PREENCHIDO e ASSINADO contam como preenchidos.
- NAO_SERVIDO conta como resolvido, quando explicitamente persistido.
- PENDENTE ou item obrigatório ainda sem projeção continua pendente.
- Completo significa que todos os itens obrigatórios foram resolvidos. Ausência
  de assinatura não torna um serviço completo em Parcial.

O Histórico utiliza esses status reais para os totais, em vez de confiar somente
nos contadores previamente gravados na versão ou na flag do fluxo. A leitura não
corrige o banco nem recalcula um item como preenchido a partir de temperaturas.
Reabertura e assinatura permanecem etapas distintas da conclusão do preenchimento.
O cartão da tela inicial segue a mesma regra: consulta somente os IDs/status do
dia pela relação do fluxo, preservando o manifesto original. A consulta legada
do dia fica restrita aos registros sem fluxo, evitando duplicar essa carga.

## Auditoria somente leitura

Preparados `pending-audit.ts` e `scripts/audit-buffet-pending.cjs`. A rotina usa
cliente Prisma sem o filtro público dos relatórios e executa sua validação em
transação Repeatable Read com `SET TRANSACTION READ ONLY`. Não chama login,
registro de permissões ou ações de salvamento. Usa a mesma validação de linhas,
mas não persiste seus resultados. A tentativa de UPDATE dentro desse modo foi
rejeitada pelo PostgreSQL no teste.

Resultados por registro ou evidência de serviço:

| Classe | Significado |
| --- | --- |
| A | Dados persistidos satisfazem a validação disponível, mas o status é PENDENTE. |
| B | Dados persistidos realmente incompletos ou inválidos, com os motivos. |
| C | Há dados somente no rascunho, sem aferição concluída correspondente. |
| D | Divergência de projeção/snapshot, legado/versionado ou indicadores do fluxo. |
| E | Evidências insuficientes, como manifesto ou histórico ausente. |

A análise considera temperaturas aplicáveis, garrafa/ambiente, ação corretiva,
horário, manifesto, versões, eventos e existência de representação concorrente.
Exporta identificadores e datas, sem nomes pessoais ou credenciais. A validação
usa o catálogo disponível na leitura: alterações antigas de catálogo/regras podem
exigir revisão humana. Classe A não autoriza uma atualização automática.

Nos dados sintéticos da reprodução: A=2, B=1, C=1, D=1 e E=1. **Esses números
não representam o KPlatz.** Nenhum banco externo foi consultado e não há contagem
real verificável nesta manutenção. As contagens representam evidências, podendo
incluir uma divergência do serviço separadamente de seus itens.

Uso local, com as fixtures produzidas pela suíte:

```powershell
$fixture = Get-Content .data/validation/buffet-pending/fixtures.json -Raw | ConvertFrom-Json
node scripts/audit-buffet-pending.cjs --read-only --local-database $fixture.database --output .data/auditoria-buffet.json
```

Após confirmar o destino e obter autorização para sua leitura, o responsável pode
executar, em ambiente com dependências de desenvolvimento instaladas:

```powershell
node scripts/audit-buffet-pending.cjs --read-only --allow-configured-database-read-only --output .data/auditoria-buffet.json
```

Esse modo usa DIRECT_URL, com fallback para DATABASE_URL do ambiente/.env, sem
alterá-los ou exibi-los. Não foi executado aqui: o destino do `.env` continua
desconhecido e tratado como produção. Recomenda-se uma credencial já limitada a
SELECT. O relatório deve permanecer em local restrito por conter IDs internos.

## Impacto e regularização proposta

A correção impede novos rebaixamentos indevidos. Não há atualização em massa,
regularização ao abrir páginas ou conversão automática de PENDENTE em PREENCHIDO.
Os casos antigos permanecem como evidência, inclusive com suas assinaturas e
versões originais. Linhas antigas sem alteração identificada não são reparadas
automaticamente ao salvar outros itens do serviço.

Procedimento sujeito à autorização:

1. Executar a auditoria somente leitura no banco confirmado e guardar o snapshot.
2. Conferir cada registro A/D, versões, campos obrigatórios, horário e catálogo
   vigentes à época. Tratar B como pendência real; C como rascunho; E como análise
   inconclusiva até reunir evidências.
3. Aprovar os IDs exatos, justificativa, valores e responsável pela regularização.
4. Respeitar competências fechadas e assinaturas: usar reabertura autorizada
   quando necessária, preservando assinaturas e versões anteriores.
5. Revalidar e salvar apenas os itens autorizados pelo fluxo operacional,
   produzindo a nova versão. Não usar UPDATE em massa ou inferir completude pela
   presença isolada de temperatura.
6. Conferir contagens, Histórico e relatório. Se houver reabertura, realizar nova
   validação autorizada e fechamento pelas regras existentes.

Não foi executada regularização de dados reais nesta tarefa.

## Testes e ambiente

O Docker continuou indisponível mesmo após a tentativa de abertura. A instalação
nativa do PostgreSQL tinha binários, mas não os arquivos de bootstrap. Foi usado
o [pacote portátil indicado pelo PostgreSQL](https://www.postgresql.org/download/windows/),
distribuído pela [EDB](https://www.enterprisedb.com/download-postgresql-binaries),
versão 17.11, extraído somente em `.data/validation`.

Foi criado um cluster próprio com listen em `127.0.0.1:55479`, autenticação
sintética e diretório `cluster-portable`. Nenhum serviço PostgreSQL existente foi
alterado. As 61 migrations **já existentes** foram aplicadas apenas à base
sintética nova para inicializar seu schema; as suítes clonaram essa base. Não foi
criada migration e nenhuma migration foi executada no banco externo. Não houve
seed, reset ou db push. O `.env` foi preservado e seu hash conferido.

Para essa execução, o adaptador ignorado pelo Git
`.data/validation/buffet-pending-postgres-20261102/run-local.cjs` substituiu somente
o comando de clonagem Docker por `createdb` local. Os testes continuaram usando
URLs literais em 127.0.0.1 e foram executados em bases distintas.

Passaram:

- `test-buffet-pending.cjs`: reprodução dos dois rebaixamentos do adapter anterior;
  quente conforme/crítico, frio conforme/alerta, ambiente, garrafa, Não servido,
  item realmente incompleto, salvamento parcial e conclusão, omissão/edição
  intencional, preservação de executor/horário, ação inválida/inativa/histórica,
  retroativo, legado/versionado, assinatura/reabertura, versões antigas intactas,
  indicadores reais, auditoria A–E sem escrita e GET do relatório mensal.
- `test-buffet-pending-browser.cjs`: login e actions reais locais; salvar sem
  alterar; busca ativa; input desabilitado; erro com formulário preservado;
  campo apagado intencionalmente com motivo da pendência; recompletar; recarregar;
  Histórico; conclusão independente de assinatura; horário retroativo; ausência
  de duplicidades e responsividade em 1440/390 pixels.
- `test-buffet-history.cjs` e `test-buffet-history-browser.cjs`: regressões de
  Histórico unificado, continuação parcial, assinatura independente, páginas
  somente leitura e bloqueios.
- `test-buffet-order.cjs` e `test-buffet-order-browser.cjs`: regressões de ordem
  global, manifesto, extras, histórico assinado, concorrência, rollback e
  arrastar com mouse/toque/teclado. A reprodução antiga dessa suíte foi fixada
  no commit `ed5c7dc`, pois HEAD já continha a correção de ordenação.
- CLI de auditoria com `--read-only --local-database`.
- Relatório HTML: item crítico, ação corretiva e botão Imprimir / Salvar PDF
  presentes; dados de origem preservados nos testes de integridade.
- `npx.cmd tsc --noEmit`, `npm.cmd run lint`, `npm.cmd run build` e
  `git diff --check`.

Evidências ignoradas pelo Git em `.data/validation/buffet-pending`: fixtures,
auditorias JSON, relatório HTML, logs e capturas. O runtime portátil e as bases
sintéticas foram preservados para reprodução; o arquivo ZIP temporário foi
removido após extração, com origem e SHA-256 registrados em `runtime-evidence.json`.
A instância PostgreSQL portátil foi encerrada ao final; os arquivos das bases
foram mantidos, sem apagar registros.

## Arquivos e limites

Criados:

- `src/app/controle-buffet-amostras/row-save.ts`
- `src/app/controle-buffet-amostras/progress.ts`
- `src/app/controle-buffet-amostras/pending-audit.ts`
- `scripts/audit-buffet-pending.cjs`
- `scripts/test-buffet-pending.cjs`
- `scripts/test-buffet-pending-browser.cjs`
- Este documento.

Alterados:

- `actions.ts`, `workflow-adapter.ts`, `workflow-actions.ts`, `workflow-payload.ts`,
  `workflow-page.tsx`, `workflow-history.ts` e `legacy-page.tsx` do Buffet / Amostras.
- `servico/[id]/service-items-form.tsx`.
- `scripts/test-buffet-order.cjs` (baseline histórico da própria suíte).

Não foram alterados schema, migrations, outros módulos, autenticação ou
permissões. Não houve modificação de banco externo, perda de dados reais,
remoção de assinaturas, reescrita histórica automática, commit, push ou deploy.
Produção e aparelhos móveis físicos não foram validados. As funcionalidades
interativas de edição dependem do JavaScript; envios divergentes sem identificação
dos campos editados são rejeitados em vez de substituir dados silenciosamente.

Git desta entrega: nove arquivos rastreados modificados e sete novos, na mesma
branch de estabilização. As contagens de casos reais permanecem pendentes da
auditoria autorizada no destino correto.
