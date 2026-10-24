# Padronização operacional — implementação parcial

## Estado da entrega

O núcleo compartilhado foi preparado e testado. **A solicitação completa ainda
não está implementada.** Não há módulo piloto ativado nem expansão aos sete
módulos. Não publicar este trabalho como conclusão da padronização operacional.

Nenhuma action existente chama o novo serviço. Os formulários, filas, históricos,
assinaturas e relatórios mantêm o funcionamento anterior. Não existe endpoint
público novo. O núcleo é server-only e depende de adaptadores internos.

## Núcleo preparado

- `src/lib/operational-workflow/policy.ts`: quatro estados, transição após salvar,
  edição por data/permissão, reabertura com justificativa e predicado da fila.
- `contracts.ts`: contrato dos adaptadores e consistência de progresso. Não é uma
  implementação das validações sanitárias dos módulos.
- `service.ts`: salvamento, versão imutável, reabertura, invalidação da vigência,
  assinatura individual/agrupada com vínculo explícito às versões e eventos.
- Cada operação usa transação serializável e a trava de módulo 17326 já usada
  pelo fechamento mensal e exclusão. Autenticação deve ser resolvida pelo
  integrador dentro da transação; assinatura deve validar permissão, senha e
  separação de funções no mecanismo original, usando o mesmo transaction client.
- Assinar exige conteúdo completo e compatível com a versão salva. Conteúdo
  alterado fora do núcleo é rejeitado. Nenhum registro futuro integra uma
  assinatura agrupada anterior automaticamente.
- Reabertura incrementa a versão, remove apenas o ponteiro vigente e mantém
  versões, assinaturas e vínculos antigos. Continua REABERTO após salvar,
  independentemente de completude. Nova assinatura é necessária.
- O helper `assertNoReopenedWorkflow` identifica pendências para fechamento
  mensal, mas ainda **não foi conectado** ao fechamento existente.

## Banco e permissões

Migration preparada: `20261024000100_nucleo_fluxo_operacional`.

Cinco tabelas novas: `fluxo_operacional`, `fluxo_versao`, `fluxo_assinatura`,
`fluxo_assinatura_vinculo`, `fluxo_evento`.

Snapshots e rascunhos são JSON separados: o armazenamento compartilhado não
altera os campos obrigatórios dos models operacionais. O adaptador definitivo
ainda deverá selecionar/validar os campos persistidos, inclusive anexos, impedir
duplicidade e não contabilizar rascunhos como execução.

Constraints limitam módulos, estados, versão positiva, progresso e assinatura
vigente. Triggers tornam versões/assinaturas/vínculos/eventos append-only e
exigem vínculo da assinatura à versão completa para FECHADO. Essas constraints
e triggers complementares não são representáveis integralmente pelo schema Prisma.

Sete permissões `modulo.<codigo>.reabrir_registro` foram adicionadas ao catálogo.
A migration insere somente definições ausentes; não cria PerfilPermissao,
não concede acesso a GERENTE/NUTRICIONISTA/COLABORADOR e não altera concessões
existentes. O privilégio global de DEV permanece o da arquitetura atual.

Nenhum registro operacional é convertido, atualizado ou assinado pela migration.
Não foi executada no banco configurado ou em produção. O teste aplica SQL em
PGlite isolado, sem ler DATABASE_URL.

## Compatibilidade e integração ainda necessária

O núcleo rejeita adoção silenciosa de um registro identificado pelo adaptador
como legado. Isso não é uma estratégia completa de migração histórica: deverá
ser implementada a apresentação legada e o ingresso explícito no versionamento,
sem inventar versões ou assinaturas anteriores.

| Módulo | Unidade prevista | Integração pendente |
| --- | --- | --- |
| Temperatura (piloto) | equipamento + data + turno | Rascunhos, validações atuais, persistência definitiva, revisão/assinatura diária, proteção de todas as actions, telas e relatório |
| Amostras | serviço + data | Cadastro previsto preservado, rascunho por item, “Não servido” explícito, assinatura do serviço incluindo todos os itens, compatibilidade com revisão e assinatura diária |
| Hortifruti | procedimento | Rascunho, assinatura diária com conjunto de versões explícito, edição autorizada e relatório |
| Óleo | verificação por ID | Rascunho, revisão individual/diária, múltiplos registros no dia, edição e relatório |
| Limpeza diária | atividade + data + turno | Salvamento sem assinatura redundante, executor separado do supervisor, assinatura individual/em lote e relatório |
| Limpeza semanal | atividade programada/execução | Programação, data real, assinatura de executor/supervisor e política retroativa específica |
| Recebimento | nota e seus itens | Rascunhos, FINALIZADA separada de validação formal, XML intacto e assinatura diária por conjunto |

Pontos estruturais que a integração precisa resolver:

1. `AssinaturaDiariaModulo` tem unicidade por módulo/data e não guarda membros
   versionados. Uma nova assinatura de reabertos na mesma data não pode apenas
   sobrescrever a assinatura antiga nem abranger registros independentes.
2. Revisões individuais de Temperatura/Óleo não bloqueiam hoje todas as actions
   de edição. Ativar apenas um botão de reabertura deixaria caminhos de contorno.
3. O helper de edição por data é restrito ao dia, enquanto outros módulos aceitam
   retroatividade com permissões normais. A política compartilhada ainda precisa
   substituir essas decisões em todas as entradas, sem ampliar permissões.
4. Limpeza semanal usa `editar_historico` também com significado de supervisão.
   Essa equivalência não deve ser transportada automaticamente para edição de dados.
5. Assinaturas e gravações operacionais legadas por vezes registram auditoria
   fora da transação principal. Os bridges devem reestruturar isso atomicamente.
6. O sistema atual é de instalação única e não possui hotelId/unidadeId nos
   registros. Nenhum isolamento multitenant foi criado ou alegado neste núcleo.
7. Exclusão controlada deverá consultar o novo estado na mesma transação,
   antes de permitir qualquer exclusão de unidades gerenciadas pelo fluxo.

Esses pontos não foram resolvidos por equivalências automáticas. O trabalho
restante exige implementação e testes; não se trata apenas de aplicar a migration.

## Testes realizados

- `test-operational-workflow.cjs`: serviço real com adapter transacional em
  memória. Estados, recuperação do conteúdo parcial, retorno COMPLETO→PENDENTE,
  retroatividade, permissões sem concessões, versão desatualizada, assinatura de
  conjunto, reaberturas sucessivas, invalidação seletiva, incompletude,
  alteração externa, rollback, salvamentos concorrentes, assinatura versus
  salvamento, dupla reabertura e helper de bloqueio mensal.
- `test-operational-workflow-migration.cjs`: migrations anteriores + nova
  migration em PostgreSQL isolado/PGlite, integridade dos registros e assinaturas
  antigos, ausência de vínculos de perfil, identidade única, estados, versões,
  progresso, FK de assinatura e rollback.
- `test-operational-migration.cjs`: passou. Ajustado para testar a migration de
  exclusão pelo nome, sem assumir que ela sempre será a última do repositório.
- `test-monthly-reopening.cjs`: regressões nos sete módulos passaram.
- `test-operational-record-controls.cjs`: exclusão, permissões, retroatividade,
  relatórios e auditoria existentes passaram.
- Prisma Client gerado; schema validado; TypeScript sem erros.
- `npm.cmd run lint`, `npm.cmd run build` e `git diff --check`: passaram.

Não foi testada concorrência por duas conexões PostgreSQL reais. O adapter
serializado em memória e o PGlite validam partes diferentes do contrato; não
substituem esse teste. Não foram validados fluxos novos no navegador porque
as interfaces ainda não foram implementadas.

Sem seed, reset, db push, migration em produção, commit ou push.

## Continuidade — etapa 2

A integração piloto de Temperatura foi implementada posteriormente. Consulte [o relatório da etapa 2](temperatura-fluxo-operacional-2026-10-24.md) para o estado atual, migrations, legados e validações. As limitações de integração acima descrevem a entrega original do núcleo.
