# Equipamentos: assinatura após renomeação e sete relatórios

Implementação local na branch `estabilizacao/experiencia-anterior-2026-10-28`,
partindo do commit `a376269`, com Git inicialmente limpo. Não houve acesso ao
PostgreSQL externo nesta etapa. Testes com persistência usam bancos sintéticos
novos em `127.0.0.1:55479`; o `.env` foi preservado.

## Causa e correção

A antiga renomeação do catálogo propagou o nome aos registros operacionais sem
criar versões correspondentes. O snapshot mantinha “Freezer de bancada 02”,
enquanto a aferição passou a indicar “Refrigerador de bancada 02”. A comparação
estrita impedia assinar. O bloqueio preventivo de renomeações de opções já usadas,
implementado anteriormente, foi preservado.

A reconciliação agora integra a transação da própria assinatura. Não exige novo
salvamento da aferição, SQL, script de manutenção ou tela administrativa adicional.
Antes de escrever, verifica todo o lote, usuário atual, permissões, senha,
competência, versões e diferenças de conteúdo. Somente uma diferença exclusiva
no campo `equipamento` admite esse tratamento. Temperatura, horário, turno,
responsável, status, fotografia e todos os demais campos continuam comparados.

A referência de cadastro é comprovada pela chave persistida da unidade, opção do
tipo equipamento, nome atual, categoria, data, turno e identificação do registro
no snapshot. Quando essa prova não existe, o formulário de assinatura apresenta
os nomes anterior e atual e uma única confirmação explícita de identidade física,
inclusive para dois turnos. A confirmação fica vinculada aos registros e versões
consultados; uma mudança posterior invalida a confirmação anterior.

Cria-se uma nova `FluxoVersao` e um evento `RECONCILIACAO_NOMENCLATURA`, com nomes,
referência, tipo de comprovação e usuário. A versão original e seus autores ficam
intactos. O evento declara que não reatribui a execução histórica. Nenhuma aferição
operacional é atualizada para efetuar a reconciliação. A assinatura aponta para a
nova versão. Uma falha desfaz reconciliação, eventos e assinatura de todo o lote.

O mesmo tratamento atende assinatura individual, diária e revisão retroativa.
Não concede novas permissões, não elimina segregação de autoria e não transforma
revisão gerencial em revisão técnica. Divergências operacionais reais continuam
bloqueadas, com mensagem orientando a conferência da aferição.

## Relatórios

| Relatório | Supervisão técnica convencional ou retroativa |
|---|---|
| Limpeza Diária | Nome |
| Limpeza Semanal | Nome |
| Temperatura | Nome — DD/MM/AAAA |
| Óleo | Nome — DD/MM/AAAA |
| Buffet / Amostras | Nome — DD/MM/AAAA |
| Hortifruti | Nome — DD/MM/AAAA |
| Rastreabilidade | Nome — DD/MM/AAAA |

`reportSupervisorName` e `reportSignatureLabel` centralizam a apresentação. A data
é a da assinatura real no fuso da aplicação, inclusive perto da meia-noite UTC.
As células não incluem hora, mecanismo, “com ressalvas” ou descrição de assinatura
retroativa. Revisões gerenciais e operacionais continuam explicitamente
classificadas, com indicação de que não substituem revisão técnica. Pendências
continuam indicadas; nenhuma assinatura é inventada.

Foram revisados os caminhos versionados, individuais legados e diários. Limpeza
Diária, Hortifruti e Rastreabilidade já usavam o formatador apropriado e recebem a
regra compartilhada sem alteração direta de suas rotas. Datas e horários completos
continuam no banco e na auditoria. Emissão, fechamento e horários operacionais
não foram reformulados.

Em Amostras, serviços completos deixam de gerar a frase “Itens persistidos
resolvidos. A assinatura do serviço é uma etapa independente.” O parágrafo já
era condicional e não é renderizado vazio. O alerta de preenchimento parcial
permanece para serviços realmente incompletos.

## Validação sintética

- `test-temperature-snapshot-integrity.cjs`: 12 grupos, incluindo equivalentes
  dos quatro casos de 01/11 manhã, 02/11 manhã/tarde e 03/11 manhã, comprovação
  automática, confirmação manual, senha/permissão, versão e confirmação obsoletas,
  divergência real, preservação de fotos e autores e rollback completo após falha
  real de auditoria provocada exclusivamente no banco de teste.
- `test-retroactive-review.cjs`: 22 grupos, sete módulos, permissões, indicadores,
  legados, ressalvas, natureza gerencial/técnica, complemento técnico, autoria,
  competência fechada/reaberta e preservação do equivalente ao registro 127.
- `test-supervision-signatures.cjs`: 22 grupos aprovados, mantendo restrições de
  colaborador, senha, autoassinatura, escopo e autorização transacional.
- `test-monthly-reopening.cjs`: aprovado nos sete módulos em adapter isolado.
- `test-buffet-history.cjs`: aprovado com PostgreSQL local pelo wrapper portátil.
- Navegador Chrome com Next de produção: assinaturas diárias em 01, 02 e 03/11,
  assinatura individual e retroativa, confirmação única para dois turnos, senha
  incorreta, ausência de confirmação, recarga, Histórico e relatório assinado.
  Comparação posterior de todas as aferições e versões anteriores, não somente
  das assinaturas criadas.
- Navegador dos sete relatórios: PDFs reais, extração de texto, conferência das
  células e renderização para inspeção visual. Versões técnica e gerencial de
  Amostras são verificadas separadamente. Emissão e fechamento conservam horários
  próprios; a regra sem hora se restringe à supervisão.
- Desktop 1440 e viewport mobile 390. Chrome emulado não equivale a Safari/iPhone.

Validação final: Prisma Generate 6.5.0, `tsc --noEmit`, lint sem erros/warnings,
build completo Node 22.23.4 / Next 15.5.12 e `git diff --check` aprovados.
Ambos os testes de navegador passaram novamente no build final. Oito PDFs,
cobrindo os sete relatórios, tiveram conteúdo de todas as páginas extraído
(nenhuma página vazia), células de supervisão verificadas e páginas de evidência
renderizadas e inspecionadas visualmente. Nenhuma célula de supervisão contém hora;
as duas limpezas também não contêm data. A confirmação mobile foi inspecionada
novamente com a caixa de seleção preservando sua dimensão.

Evidências sintéticas, PDFs e capturas ficam em diretórios ignorados pelo Git:
`.data/validation/temperature-signatures-20261105/` e
`.data/validation/retroactive-review/`.

Na primeira execução do navegador de Temperatura, o fluxo de assinatura terminou,
mas uma asserção de preservação usou incorretamente `FluxoVersao.id`. O teste foi
corrigido para a chave composta `fluxoId_versao` e repetido em fixtures novos.
Uma asserção adicional de colunas também exigiu corrigir o escaping da expressão
regular no próprio teste. Esses ajustes não relaxam as verificações da aplicação.

## Arquivos desta etapa

- Núcleo: `src/lib/operational-workflow/service.ts`,
  `src/lib/retroactive-review.ts` e `src/lib/review-presentation.ts`.
- Temperatura: `snapshot-integrity.ts`, `workflow-adapter.ts`,
  `workflow-actions.ts`, `workflow-view.tsx`, `saved-record-page.tsx` e os novos
  `nomenclature.ts` e `name-confirmation.tsx`, em
  `src/app/controle-temperatura-equipamentos/`.
- Interface compartilhada: `src/components/compatible-day-review.tsx` e o novo
  `src/components/temperature-name-confirmation.tsx`.
- Revisão retroativa: `page.tsx`, `form.tsx` e `actions.ts` em
  `src/app/historico-operacional/revisao-retroativa/`.
- Rotas mensais: Temperatura, Óleo, Buffet/Amostras e Limpeza Semanal.
- Testes: `scripts/test-temperature-snapshot-integrity.cjs`,
  `scripts/test-temperature-snapshot-browser.cjs` e
  `scripts/test-retroactive-review-browser.cjs`.
- Este documento.

## Uso pela equipe depois da publicação autorizada

1. A supervisora autorizada abre Temperatura → Histórico e escolhe o dia.
2. Seleciona as aferições que deseja assinar. Quando a identidade estiver
   comprovada, a mudança de nome é tratada automaticamente ao confirmar a senha.
3. Caso apareçam os dois nomes, confere se representam o mesmo equipamento
   físico e marca a confirmação única. Se não puder comprovar, não confirma.
4. Informa sua senha e usa o botão existente “Assinar dia”. O resultado é mostrado
   na tela; Histórico e relatório passam a reconhecer as versões assinadas.
5. Se houver uma divergência operacional verdadeira, versão alterada, falta de
   permissão ou competência fechada, a operação é recusada sem assinatura parcial.

Os registros reais #4422, #4415, #4440 e #4463 não foram reconciliados nem assinados
nesta manutenção. Ainda dependem da publicação autorizada e da assinatura efetiva
por usuário habilitado, com competência acessível e confirmação quando exigida.
O estado atual desses registros em produção não foi consultado nesta etapa.

Não houve mudança de schema, migration, seed, reset, db push, regularização real,
concessão de permissões, commit, push ou deploy. O Multitenant não foi acessado.

Git final nesta etapa: mesma branch de estabilização, 19 arquivos rastreados
modificados e quatro arquivos novos (incluindo esta documentação), sem staging.
PDFs, capturas, runtimes e bancos sintéticos permanecem ignorados pelo Git.
