# Buffet / Amostras — horário coletivo retroativo

Implementação no KPlatz, na branch `estabilizacao/experiencia-anterior-2026-10-28`.
As alterações de segregação e auditoria presentes no início do trabalho foram
preservadas. Não houve commit, push ou deploy por esta manutenção.

## Comportamento

Em uma data anterior ao dia atual da aplicação, o início do formulário apresenta
“Horário de execução dos itens”, com horário manual e dois modos:

- Aplicar somente aos itens sem horário, selecionado por padrão.
- Substituir os horários existentes dos itens editáveis, com confirmação explícita
  e quantidade de itens antes de aplicar. Cancelar preserva todos os valores.

O clique valida HH:mm e considera todo o serviço, inclusive extras e itens fora
da busca. São excluídos Não servido, assinados, bloqueados e itens sem aferição
informada. Uma aferição numérica requer TC do alimento válida; ambiente não exige
temperatura numérica. Outras pendências não são resolvidas pelo horário.

Por padrão, horários existentes e indicações de Horário não informado são
preservados. Não há aplicação coletiva de horário desconhecido: essa opção e sua
justificativa permanecem individuais. No modo de substituição, uma hora real
confirmada pode substituir a indicação de desconhecido, preservada na evidência
anterior do fluxo versionado.

Aplicar atualiza os horários individuais e o resumo de pendências sem salvar.
A edição individual posterior prevalece; não há reaplicação automática.
Somente “Salvar Itens do Serviço” envia os dados pela transação existente.
Para hoje, não aparece o controle coletivo e a captura automática foi preservada.
As datas usam as funções existentes e o fuso America/Sao_Paulo.

## Estado, salvamento e auditoria

Os horários são controlados pelo estado React do formulário. Aplicação coletiva
e edição individual atualizam esse estado e registram os campos efetivamente
alterados em `changedFields`. O FormData recebe os valores finais, inclusive a
limpeza explícita de horário desconhecido/justificativa quando aplicável.
`rowIntentVersion`, versão esperada, manifesto, transação e bloqueios de período
continuam sendo conferidos no servidor.

Uma referência sincronizada ao estado permite revalidar imediatamente sem ler
horários antigos do DOM. A aplicação coletiva não modifica campos diretamente
no DOM. Temperaturas, ações, observações e responsáveis não são alterados por ela.
O formulário recebe chave de serviço/data/versão para isolar a edição e a
confirmação ao navegar entre serviços e datas.

O pedido atual autoriza substituição explícita de horários editáveis. Por isso,
o bloqueio absoluto adicionado na etapa anterior foi removido. No fluxo versionado,
o horário anterior permanece no snapshot imutável e no evento CORRECAO_REGISTRO
com antes/depois, corretor e versão. Horários não alterados continuam preservados.
Nenhuma regularização ou conversão de legado é feita ao aplicar o horário;
formulários legados mantêm seu fluxo existente de salvamento e autorização.

Serviço assinado exige reabertura autorizada antes da edição. A assinatura antiga
é preservada e a nova versão exige nova assinatura, pelas regras já implementadas.

## Arquivos desta etapa

- Novos: `src/app/controle-buffet-amostras/collective-time.ts` e
  `src/app/controle-buffet-amostras/servico/[id]/collective-time-fields.tsx`.
- Integração: `servico/[id]/service-items-form.tsx`, `workflow-page.tsx`,
  `servico/[id]/legacy-page.tsx` e `row-save.ts`, todos em Buffet/Amostras.
- Componentes compartilhados: `src/components/forms/execution-time-fields.tsx`
  e `unreported-time-fields.tsx` ganharam suporte opcional a valores controlados.
  Somente Buffet usa a nova API; os outros consumidores mantêm o comportamento padrão.
- Testes novos: `scripts/test-buffet-collective-time.cjs` e
  `scripts/test-buffet-collective-time-browser.cjs`.
- Atualizado `scripts/test-buffet-corrections.cjs`: a nova política permite edição
  explícita de hora e exige preservação do antes/depois, em vez de rejeição absoluta.
- Atualizado `scripts/test-buffet-pending-browser.cjs`: a navegação aguarda um novo
  documento e o teste de erro usa temperatura inválida digitável pelo usuário.
  Opções corretivas forjadas/inativas continuam cobertas no backend.
- Este relatório e referência à evolução da política no relatório de segregação.

## Validação e limites

Os testes usam PostgreSQL local em 127.0.0.1:55479 e dados sintéticos, com Node
22.23.4, Next.js 15.5.12 e Prisma Client 6.5.0. Nenhum teste utiliza a conexão
externa do `.env`, cujo conteúdo permanece inalterado.

O cenário principal contém 32 itens do manifesto e um extra, com dois executores
originais. Vinte itens têm aferição sem horário; os outros incluem horários
existentes, horário desconhecido justificado, Não servido e uma pendência de TC.
A aplicação padrão preenche exatamente os vinte horários e mantém a pendência de
temperatura. Essa temperatura é corrigida explicitamente no teste antes de salvar;
a aplicação coletiva não a preenche.

Cobertura: horário vazio/inválido, seleção de elegíveis, campos bloqueados/assinados,
extra, busca, cancelamento/confirmação, ajuste individual, ausência de salvamento
automático, falha sem gravação parcial, salvamento único, refresh, autoria original,
reabertura, nova assinatura, evidências anteriores e captura automática de hoje.

| Validação executada | Resultado |
| --- | --- |
| Prisma Generate | Passou, Client 6.5.0 |
| TypeScript e lint | Passaram; build final também validou tipos/lint |
| Build completo | Passou no Next.js 15.5.12 / Node 22.23.4 |
| `test-buffet-collective-time.cjs` | Quatro grupos aprovados, cobrindo os vinte casos solicitados |
| `test-buffet-corrections.cjs` | Passou, incluindo edição explícita de hora com antes/depois |
| `test-buffet-structural.cjs` | Passou |
| `test-buffet-pending.cjs` e `test-buffet-history.cjs` | Passaram |
| `test-supervision-signatures.cjs` | 22 cenários aprovados nos sete módulos |
| `test-buffet-collective-time-browser.cjs` | Passou em desktop/mobile, incluindo o cenário de hoje após a mudança de dia |
| Navegador: correções, estrutural, pendências e supervisão | Todos passaram |
| `git diff --check` | Passou |

O navegador antigo de pendências voltou a apresentar timeout no cenário que
inseria uma opção corretiva artificial diretamente no DOM. A execução instrumentada
passou, sem comprovar defeito funcional do módulo. Para evitar depender dessa
manipulação artificial e da sincronização da navegação, o teste agora usa entrada
inválida real de temperatura e aguarda o novo documento. A suíte de integração
continua rejeitando ação corretiva inventada/inativa e confirmando rollback.

Capturas do controle e da confirmação foram inspecionadas em desktop/mobile,
sem overflow. Os testes também conferem os registros e eventos no PostgreSQL
após salvar, reabrir e assinar, além de preservar os valores não alterados.

Evidências locais ignoradas pelo Git em `.data/validation/buffet-collective-time/`.
Não houve acesso a produção, migration, seed, reset, db push ou regularização histórica.
A homologação no Railway e a publicação permanecem para uma etapa autorizada.
