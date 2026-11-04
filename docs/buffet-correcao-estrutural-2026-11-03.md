# Buffet / Amostras — conferência coletiva e assinatura do serviço

Atualização de política: a nutricionista autorizada pode corrigir registros de
outros executores e assinar o serviço, mantendo a auditoria. A restrição a
corretores descrita abaixo corresponde à etapa original e foi substituída pelo
[ajuste de segregação](buffet-segregacao-correcoes-2026-11-03.md). Execução própria
e autoria inconclusiva continuam bloqueadas.

Trabalho na branch `estabilizacao/experiencia-anterior-2026-10-28`, inicialmente limpa.
Não houve acesso ao banco externo, alteração do `.env`, migration, regularização histórica,
seed, reset, commit, push ou deploy. Multitenant não foi acessado.

## Causas confirmadas

1. O formulário versionado retornava antes de executar a conferência dos itens. A
   Server Action recebia apenas o primeiro `BuffetRowError`, apresentado por `invalidRowKey`.
2. A ação corretiva usava somente `defaultValue`; mudanças de temperatura não atualizavam
   a seleção nem registravam a alteração programática em `changedField`.
3. Contagens de status, estado do fluxo, snapshot da versão e elegibilidade técnica
   eram verificações distintas. Um serviço aparentemente completo podia continuar
   sem formulário de assinatura, sem uma explicação suficiente.
4. O Histórico escolhia “Revisar e assinar” pelas contagens/estado, sem consultar
   a autorização e a segregação usadas na tela de destino.

## Correção

- `row-validation.ts`: regras puras compartilhadas de temperaturas, ação corretiva,
  horário retroativo, justificativa, ambiente, garrafa térmica e Não servido. A indicação
  Não servido continua explícita; nenhum item pendente é convertido automaticamente.
- `row-save.ts`, `workflow-adapter.ts`, `workflow-actions.ts` e `actions.ts`:
  erro tipado com todas as linhas/campos; preparação das linhas antes das gravações;
  salvamento público dos itens exige conferência completa. O manifesto e os extras
  entram na validação mesmo quando omitidos do formulário versionado. Falha impede
  a confirmação da transação. Operações públicas desconhecidas são rejeitadas.
  Dados não alterados, executor original e horário anterior permanecem preservados.
- `workflow-payload.ts`: a verificação dos campos sanitários utiliza o validador comum.
- `servico/[id]/service-items-form.tsx`: resumo inicial de todas as pendências, links
  para os cartões, alertas individuais e atualização ao corrigir os campos. A busca
  não esconde cartões com erros. A falha mantém os valores digitados. Foi removida
  a confirmação antiga que podia classificar pendências como Não servido.
- A seleção automática usa a opção cadastrada “Não se aplica”, apenas quando cabível.
  Temperatura em alerta/crítico invalida essa escolha; ações manuais/históricas válidas
  são preservadas. A alteração automática participa de `changedField`/`rowIntentVersion`.
- `service-review.ts`, `workflow-page.tsx` e `historico/legacy-page.tsx`: mesma decisão
  de disponibilidade nas duas telas. Conferem dados, versão/snapshot, estado, competência,
  assinatura vigente e elegibilidade. Inconsistências não são reparadas em consultas.
- `group-workflow-panel.tsx`: no ramo de Amostras, explica o impedimento e distingue
  pendências dos campos do status salvo. A participação do próprio usuário é identificada.
- `group-signatures.ts`: o ramo de Amostras revalida os campos reais com as mesmas
  regras dentro da transação de assinatura; senha, autorização, versão e segregação
  continuam sendo verificadas no servidor.

Legados continuam usando o caminho legado, sem vinculação ou regularização automática.
A conferência coletiva também é usada no salvamento desse formulário. Assinaturas
antigas não são apagadas, reatribuídas ou convertidas em novas assinaturas.

## Testes e evidências

Node **22.23.4**, Next.js **15.5.12**, Prisma Client **6.5.0**. PostgreSQL local
na interface `127.0.0.1`, porta `55479`, bancos sintéticos clonados do template local.
Nenhum teste utilizou dados reais ou o destino externo configurado no `.env`.

| Validação | Resultado |
| --- | --- |
| Prisma Generate | Passou |
| `npx.cmd tsc --noEmit` | Passou |
| `npm.cmd run lint` | Passou, sem erros/warnings ESLint |
| `npm.cmd run build` | Passou, compilação, tipos e rotas |
| `git diff --check` | Passou |
| `test-buffet-structural.cjs` | Sete grupos de regressão aprovados |
| `test-buffet-pending.cjs` | Passou, incluindo legados, omissões, ações inativas e integridade |
| `test-buffet-history.cjs` | Passou, incluindo consulta sem escritas e ação coerente com o perfil |
| `test-supervision-signatures.cjs` | 22 cenários aprovados, sete módulos |
| `test-buffet-structural-browser.cjs` | Passou: Histórico, 33 itens/5 pendências, uma gravação, refresh, assinatura independente e relatório |
| `test-buffet-pending-browser.cjs` | Passou: omissões, busca, valores preservados, erro sem gravação parcial, ação corretiva e horário |
| `test-supervision-signatures-browser.cjs` | Passou: senha, assinatura, reabertura, nova versão e bloqueios de parcial/autor/colaborador |

Os testes estruturais cobrem temperaturas quentes/frias conformes e críticas, frio
em alerta a 10,9 °C, ação manual, ação histórica inativa, ambiente, garrafa e Não servido;
horário do dia, retroativo válido/inválido, ausência e justificativa; 33 itens com cinco
pendências incluindo extra; falha sem gravação parcial; correção única; campos automáticos;
dados não editados; estado/versão divergentes; autoria inconclusiva; permissões;
competência; senha; versão obsoleta; duplicação; assinatura e reabertura com evidência preservada.
Os testes de supervisão também cobrem nutricionista executor/corretor, colaborador,
gerente e DEV, revogação de permissão, sessão inválida e concorrência.

Scripts novos: `scripts/test-buffet-structural.cjs` e
`scripts/test-buffet-structural-browser.cjs`. Os testes existentes de Histórico e
de navegador de pendências foram atualizados para exigir bloqueio da assinatura
para DEV e rejeição de salvamento incompleto, respectivamente.
O teste de navegador da supervisão passou a exigir a mensagem explícita
“Serviço com pendências — confira os itens” no serviço parcial.

Evidências locais em `.data/validation/buffet-structural/`: `results.json`,
`browser-results.json`, `report.html`, capturas de conferência e assinatura em
1440 e 390 pixels. As fixtures contêm somente usuários/dados sintéticos.

## Limites e publicação

Os testes de interface usam Next real, login real local, Server Actions, PostgreSQL
e Edge, com cenários desktop/mobile. Não se limitam a mocks de interface.
Não houve homologação no Railway nem auditoria dos serviços reais do cliente nesta etapa.
Portanto, não se afirma que uma conta real específica deixou de participar do
preenchimento: se participou, o bloqueio de autoassinatura permanece legítimo.

Temperaturas, horários, responsáveis, versões e assinaturas foram comparados nos
testes sintéticos. Os dados reais permaneceram intocados. Não foram criadas permissões
automáticas no código da aplicação nem alterada a autorização dos fechamentos mensais.

Código preparado para homologação e posterior publicação autorizada. O build pode
emitir aviso de manutenção da base Browserslist e de depreciação de `next lint`;
esses avisos não impediram as validações.

Git final: mesma branch de estabilização, 13 arquivos rastreados modificados e
cinco arquivos novos (dois módulos de validação, dois testes e este relatório).
Capturas desktop/mobile foram inspecionadas; o botão Imprimir foi exercitado,
sem uma nova inspeção de PDFs exportados. PostgreSQL local encerrado após os testes.
