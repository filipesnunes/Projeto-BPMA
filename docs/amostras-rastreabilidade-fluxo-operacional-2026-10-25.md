# Etapa 4 — Amostras e Rastreabilidade

Implementação no BPMA/KPlatz atual, em `A:\Projeto-BPMA-KPlatz`, branch `main`.
Os dois módulos foram integrados de ponta a ponta e validados localmente com
dados sintéticos. Produção e tenant-refactor não foram acessados ou alterados.

## A. Núcleo compartilhado

Reutilizados o serviço transacional, política de datas/permissões, quatro estados,
versões imutáveis, rascunhos, eventos, assinaturas e vínculos de escopo das etapas
anteriores. A única extensão no contrato/serviço é um hook opcional de autorização
de salvamento para as operações específicas de assinatura auxiliar e exclusão.
Sem hook, o comportamento anterior de Temperatura e Óleo permanece igual.

Componentes compartilhados novos apresentam estado, confirmação de reabertura,
justificativa, validações, histórico e filas dos dois módulos. As regras sanitárias
originais foram extraídas para os payloads e reutilizadas tanto pelas actions
legadas quanto pelos adaptadores; não existem duas implementações concorrentes
dessas validações. As consultas de ações corretivas aceitam o client da transação.

As suítes de Temperatura e Óleo passaram em PostgreSQL isolado. Não foram
modificados os arquivos dos módulos de Temperatura, Óleo, Hortifruti, Limpeza
Diária ou Limpeza Semanal, nem seus relatórios. As alterações compartilhadas foram
cobertas também pelos testes de reabertura mensal e controles dos sete módulos.

## B. Controle de Amostras

O adaptador usa serviço + data como identidade. O manifesto dos itens previstos
fica na versão, incluindo alterações explícitas de itens extras e exclusões.

- Salvamento progressivo mantém os campos incompletos no rascunho e permite sair
  e retornar. Item vazio não vira Não servido. A classificação é explícita.
- PENDENTE passa a COMPLETO quando todos os itens estão preenchidos ou
  explicitamente Não servido. Invalidar um campo antes da assinatura retorna a
  PENDENTE. Mudança de dia não altera o estado.
- Assinatura de item continua sendo auxiliar, com suas permissões e restrição
  de executor. Não fecha automaticamente o serviço.
- Assinatura de supervisor do serviço, revisão e validação diária mantêm os
  mecanismos existentes, senha e permissões correspondentes. A validação formal
  vincula serviço e versão e passa a FECHADO. A diária registra o conjunto exato
  selecionado; não abrange serviços posteriores ou incompletos.
- FECHADO bloqueia campos, Não servido, inclusões, exclusões e actions alternativas.
- Reabertura exige autenticação, permissão de reabrir e de editar a data,
  competência aberta, confirmação e motivo. Cancelar mantém o fechamento.
  REABERTO permanece assim durante as edições e exige nova assinatura, mesmo
  quando nenhum conteúdo foi alterado. Versões e assinaturas antigas permanecem.
- A fila principal contém pendentes de hoje e todos os reabertos. Serviços
  legitimamente previstos hoje aparecem sem criar registros fictícios no banco.
  A seleção de serviço/data permite iniciar registros retroativos autorizados.
- Histórico concentra unidades iniciadas, datas e estados. Os registros legados
  têm acesso próprio, preservando seu modelo anterior sem adesão automática.
- Relatório mantém layout e dados sanitários; usa assinatura vigente da versão
  ou identifica reabertura. Rascunhos não são apresentados como medições válidas.
- Exclusão é lógica, exige motivo, papel/permissão, preserva conteúdo na auditoria
  e gera nova versão. Não permite contornar fechamento nem remover outra unidade.
- Fechamento mensal bloqueia reabertos e preserva as verificações anteriores de
  pendências e assinaturas, distinguindo a validação formal da assinatura auxiliar.

O caso de 33 itens foi validado: 10 preenchidos; depois 20 + 5 Não servido; por
fim 28 + 5 Não servido, passando de PENDENTE para COMPLETO sem assinatura implícita.

## C. Rastreabilidade e Recebimento

O adaptador mantém uma unidade por nota/recebimento com seus próprios itens.

- Importação XML reutiliza o parser e permissões anteriores. Preserva fornecedor,
  documento, chave, série, produtos, códigos fiscais, quantidades e unidades.
  Guarda também o XML original da nova importação, com download autenticado.
  Identidade fiscal duplicada é rejeitada na transação.
- Criação manual/importação usa identidade estável da requisição para impedir
  duplicação por reenvio. Notas distintas do mesmo dia continuam independentes.
- IMPORTADA, EM_CONFERENCIA e FINALIZADA continuam sendo estados da nota.
  PENDENTE, COMPLETO, FECHADO e REABERTO são estados operacionais separados.
- Salvar parcialmente preserva lote, campos técnicos, horários e isenções.
  Sem data de fabricação e Sem validade são independentes. Validações originais
  de temperatura, SIF, inspeção, conformidade e ação corretiva foram mantidas.
- Finalizar Conferência continua explícito e exige os itens válidos. A progressão
  conta os itens e essa finalização já existente. FINALIZADA permite COMPLETO;
  não significa assinatura ou FECHADO.
- A validação formal utiliza a assinatura diária existente, com senha, responsável
  e vínculo às notas/versões selecionadas. Não foi criada assinatura individual.
- Reabertura e nova assinatura usam a mesma política do núcleo. Editar uma nota
  não altera outra; reabrir uma nota de assinatura agrupada não invalida as demais.
- Fila, Histórico e relatórios seguem as mesmas regras de visibilidade operacional,
  assinatura vigente e exclusão lógica. Criar nota/importar XML continua acessível.
- Exclusão de nota ou item é lógica, com motivo, permissão, auditoria, bloqueios
  de fechamento e versionamento. Dados fiscais originais não são substituídos
  por valores enviados por um formulário adulterado.
- Fechamento mensal considera reabertos e mantém a exigência de conferência
  finalizada e as demais verificações existentes.

## D. Banco de dados

Migration nova, aditiva:
`20261025000100_amostras_recebimento_fluxo_operacional`.

Modificados os models `ControleBuffetAmostraRegistro` (fluxoId opcional),
`RastreabilidadeRecebimentoNota` (fluxoId opcional único e xmlOriginal opcional)
e relações inversas de `FluxoOperacional`. Não foram criados models ou enums
operacionais duplicados. Incluídos FKs, índices e triggers de proteção de gravação.

Ordem de dependências:

1. `20261024000100_nucleo_fluxo_operacional`.
2. `20261024000200_temperatura_fluxo_operacional`.
3. `20261024000300_oleo_fluxo_operacional`.
4. `20261025000100_amostras_recebimento_fluxo_operacional`.

A migration não atualiza registros antigos: os novos vínculos permanecem nulos.
Não converte histórico em versões, não fabrica assinaturas, não altera perfis,
responsáveis, fechamentos ou datas. FKs usam RESTRICT para exclusão de fluxos.
O teste de compatibilidade compara conteúdo e assinaturas legadas antes/depois
e verifica integridade referencial e ausência de concessões de permissão.

Prisma Migrate foi executado exclusivamente em PostgreSQL 16 isolado com banco
novo de testes. O status desse banco ficou atualizado. A migration também passou
no ensaio de dados legados em PGlite. Nenhuma migration foi aplicada em produção.
Na publicação controlada, aplicar as migrations pendentes pelo comando existente
`npm run prisma:migrate:deploy`, antes de servir o código novo.

## E. Segurança

Reutilizadas permissões de acesso, preenchimento, edição histórica, assinatura,
reabertura, exclusão e assinatura diária. A sessão/perfil é recarregada dentro da
transação. Não foram concedidas permissões ou criados perfis.

Reabrir um mês não concede edição retroativa. Essa regra também foi corrigida no
caminho legado de conferência de notas. Um reaberto antigo pode ser visualizado
sem que isso autorize sua edição. Competência fechada impede alterações.

Transações Serializable, locks por módulo compartilhados com fechamento mensal e
versão esperada protegem saves, assinatura e reabertura. Os triggers exigem o
contexto transacional do adaptador para dados gerenciados e bloqueiam alterações
em FECHADO, troca de nota de um item e alteração da identidade do serviço.

Assinatura valida conteúdo canônico da versão atual e escopo explícito; rejeita
versão incompleta ou desatualizada. Falha na auditoria reverte toda a operação.
A assinatura legada de dia misto não valida implicitamente unidades novas.
Não foi presumido isolamento multitenant: permanece a instalação atual.

## F. Testes e resultados

Aprovados:

- `npm.cmd run prisma:generate` (Prisma Client 6.5.0).
- `npx.cmd prisma validate`.
- `node scripts/test-operational-workflow.cjs`.
- `node scripts/test-group-workflows.cjs`: PostgreSQL real, dois adaptadores,
  33 itens, rascunhos, assinaturas auxiliares/formais/agrupadas, escopo exato,
  XML, não conformidades, isenções, itens extras, exclusões e auditoria.
- Concorrência real: save/save, save/assinatura, reabrir/reabrir e fechamento
  mensal/reabrir nos dois módulos; rollback de falha na auditoria.
- `node scripts/test-group-workflows-migration.cjs`: preservação histórica,
  assinaturas e FKs, sem conversão automática.
- Suítes PostgreSQL `test-temperature-workflow.cjs` e `test-oil-workflow.cjs`.
- `test-monthly-reopening.cjs` e `test-operational-record-controls.cjs`:
  datas, controles de exclusão, regressão dos sete módulos e relatórios.
- `node scripts/test-group-workflows-browser.cjs`: Next em produção local e
  Edge real, login, salvar/sair/retornar, Não servido explícito, assinatura,
  confirmação/cancelamento de reabertura, edição e nova assinatura, XML real,
  finalização separada, download idêntico ao original, filas e Históricos.
- 18 capturas responsivas em 1440, 390 e 320 px. Assert de ausência de overflow
  da página; tabela original de recebimento mantém rolagem interna. Inspeção
  visual das capturas de edição de Amostras e conferência desktop/mobile.
- `npm.cmd run lint`: sem warnings/erros ESLint.
- `npm.cmd run build`: compilação, tipos e geração das rotas aprovados.
- `git diff --check`: aprovado; apenas avisos de normalização LF/CRLF do Git.

Falhas encontradas e corrigidas durante o desenvolvimento:

- BOM UTF-8 no SQL inicial: removido e reaplicação isolada aprovada.
- Trigger compartilhado acessando campos de outra tabela: verificações separadas
  por tabela, com testes reais de atualização e tentativa de reparenting.
- Overflow provocado por labels sr-only absolutas: contexto relativo no container
  da tabela; cabeçalho comporta chave NF-e de 44 dígitos no mobile.
- Narrowing de data após redirect: retorno explícito, tipos/build aprovados.
- Bypass de edição retroativa nos caminhos legados: validação central por data
  e teste de permissão explícita, inclusive após reabertura de competência.
- Fixtures/asserts anteriores adaptados à seleção de registros legados e ao novo
  fluxo; falhas auxiliares do harness de navegador corrigidas, execução final passou.

Não foram feitos testes em dados reais, deploy, login de cliente ou PDF impresso
em produção. Relatórios foram exercitados pelas suítes locais, sem novo ensaio
manual de todos os PDFs oficiais. Avisos de ferramenta (next lint depreciado e
base Browserslist antiga) não impediram lint/build.

## G. Arquivos criados e alterados

A lista exata de arquivos desta etapa está ao final deste documento, gerada a
partir do Git, incluindo as páginas legadas preservadas. As páginas originais
foram mantidas como componentes legacy-page e rotas /legado; as novas páginas
principais/de detalhe usam os adaptadores. A extração das validações para payloads
explica a redução de linhas nas actions, sem retirar as regras sanitárias.

## H. Pendências e limitações

Implementação e validações locais dos dois módulos concluídas. A publicação
permanece pendente de revisão e do procedimento autorizado do responsável.
Produção não foi validada nem modificada. A migration precisa acompanhar o deploy.

Registros anteriores sem fluxo continuam explicitamente legados. Não foi feita
migração automática de assinaturas/conteúdo para o núcleo. XML original só pode
ser baixado quando foi armazenado pelas novas importações; não se fabrica XML
para notas antigas. Isso preserva a rastreabilidade sem inventar dados.

Sem commit, push, deploy, exclusão de dados reais, seed, reset ou db push. Não
foram acessados tenant-refactor ou projetos paralelos. Artefatos sintéticos e
capturas estão em `.data/validation/group-workflows`, ignorados pelo Git.

Git final: branch `main`, 26 arquivos rastreados modificados e 29 novos arquivos,
incluindo este relatório. Nenhuma alteração nos diretórios dos cinco módulos
protegidos. O container PostgreSQL usado nos testes foi parado ao terminar;
os bancos sintéticos não foram apagados. A conferência final de diff passou.

## Invent?rio Git

Alterados (26):

- `prisma/schema.prisma`
- `scripts/test-monthly-reopening.cjs`
- `scripts/test-operational-record-controls.cjs`
- `src/app/controle-buffet-amostras/actions.ts`
- `src/app/controle-buffet-amostras/catalog.ts`
- `src/app/controle-buffet-amostras/historico/page.tsx`
- `src/app/controle-buffet-amostras/page.tsx`
- `src/app/controle-buffet-amostras/servico/[id]/page.tsx`
- `src/app/controle-buffet-amostras/servico/[id]/service-items-form.tsx`
- `src/app/historico-operacional/actions.ts`
- `src/app/rastreabilidade-recebimento/actions.ts`
- `src/app/rastreabilidade-recebimento/historico/page.tsx`
- `src/app/rastreabilidade-recebimento/nota/[id]/note-items-form.tsx`
- `src/app/rastreabilidade-recebimento/nota/[id]/page.tsx`
- `src/app/rastreabilidade-recebimento/nota/nova/manual-note-form.tsx`
- `src/app/rastreabilidade-recebimento/nota/nova/page.tsx`
- `src/app/rastreabilidade-recebimento/note-permissions.ts`
- `src/app/rastreabilidade-recebimento/page.tsx`
- `src/app/rastreabilidade-recebimento/xml-import-form.tsx`
- `src/app/relatorios/controle-buffet-amostras/mensal/route.ts`
- `src/app/relatorios/rastreabilidade-recebimento/mensal/route.ts`
- `src/lib/active-operational-records.ts`
- `src/lib/monthly-periods.ts`
- `src/lib/operational-workflow/contracts.ts`
- `src/lib/operational-workflow/service.ts`
- `src/lib/permissions.ts`

Criados (29):

- `docs/amostras-rastreabilidade-fluxo-operacional-2026-10-25.md`
- `prisma/migrations/20261025000100_amostras_recebimento_fluxo_operacional/migration.sql`
- `scripts/test-group-workflows-browser.cjs`
- `scripts/test-group-workflows-migration.cjs`
- `scripts/test-group-workflows.cjs`
- `src/app/controle-buffet-amostras/historico/legacy-page.tsx`
- `src/app/controle-buffet-amostras/historico/legado/page.tsx`
- `src/app/controle-buffet-amostras/legacy-page.tsx`
- `src/app/controle-buffet-amostras/legado/page.tsx`
- `src/app/controle-buffet-amostras/servico/[id]/legacy-page.tsx`
- `src/app/controle-buffet-amostras/workflow-actions.ts`
- `src/app/controle-buffet-amostras/workflow-adapter.ts`
- `src/app/controle-buffet-amostras/workflow-page.tsx`
- `src/app/controle-buffet-amostras/workflow-payload.ts`
- `src/app/historico-operacional/group-workflow-actions.ts`
- `src/app/rastreabilidade-recebimento/historico/legacy-page.tsx`
- `src/app/rastreabilidade-recebimento/historico/legado/page.tsx`
- `src/app/rastreabilidade-recebimento/legacy-page.tsx`
- `src/app/rastreabilidade-recebimento/legado/page.tsx`
- `src/app/rastreabilidade-recebimento/nota/[id]/legacy-page.tsx`
- `src/app/rastreabilidade-recebimento/nota/[id]/xml/route.ts`
- `src/app/rastreabilidade-recebimento/workflow-actions.ts`
- `src/app/rastreabilidade-recebimento/workflow-adapter.ts`
- `src/app/rastreabilidade-recebimento/workflow-page.tsx`
- `src/app/rastreabilidade-recebimento/workflow-payload.ts`
- `src/components/group-workflow-list.tsx`
- `src/components/group-workflow-panel.tsx`
- `src/lib/operational-workflow/group-deletion.ts`
- `src/lib/operational-workflow/group-signatures.ts`
