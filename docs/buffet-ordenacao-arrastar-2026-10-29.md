# Buffet / Amostras — ordenação e arrastar e soltar

## Diagnóstico e escopo

Implementado na branch `estabilizacao/experiencia-anterior-2026-10-28`, a partir
do HEAD `ed5c7dc`, inicialmente sem alterações locais. Não houve acesso ao
tenant-refactor nem alteração de outros módulos.

As consultas dos serviços versionados não definiam `orderBy` na relação de
itens. O manifesto persistia essa sequência implícita do PostgreSQL e o
formulário a apresentava diretamente. Alterar a ordem do cadastro não corrigia
a apresentação desses manifestos. As consultas legadas já ordenavam por ordem
e nome, mas não tinham o ID como desempate final.

A reprodução executou a página e o adapter do HEAD anterior com dados
sintéticos cuja ordem de inserção divergia do cadastro. O comportamento anterior
reproduziu a sequência incorreta; a mesma montagem passou com a correção.

O modelo continua global: `ordem` pertence ao item, e os vínculos com serviços
não possuem ordem própria. Não foi necessária migration, alteração de schema,
dependência adicional ou mudança de permissões.

## Correção e interface

As consultas usam ordem numérica crescente, nome e ID. Novos manifestos nascem
nessa sequência. Para manifestos ainda editáveis, a apresentação consulta a
ordem atual sem substituir o conjunto de itens ou os objetos do manifesto.
Itens sem correspondência no catálogo mantêm suas posições relativas. Extras
continuam na sequência existente. A alteração não recalcula status sanitários.

Manifestos assinados ou bloqueados conservam sua sequência persistida. Nenhuma
versão anterior é reescrita para ordenar a interface. Os registros legados
continuam usando seu formulário e seus dados existentes; esse formato não
possui snapshot histórico da ordenação do catálogo.

O gerenciamento separa ativos e inativos. A alça de seis pontos permite mover
ativos com mouse, toque ou teclado. Espaço/Enter inicia e confirma; setas,
Home/End movem; Escape cancela. Há destaque do item, indicação do destino,
feedback acessível e manutenção do foco. A tabela mantém rolagem horizontal
interna em telas pequenas. Não há botão adicional de salvar.

Ao soltar, uma única chamada envia todos os IDs ativos na nova sequência.
O servidor renumera de 1 a N em um UPDATE em lote dentro de uma transação
Serializable. A interface só anuncia sucesso depois da confirmação; falhas
restauram a última sequência confirmada e atualizam a página. Controles ficam
bloqueados durante a movimentação e o salvamento para evitar sobreposição.

A busca foi preservada. Enquanto houver filtro, a reordenação fica desabilitada
com orientação explícita, evitando renumerar uma lista incompleta.

Inativar compacta a sequência ativa; reativar acrescenta o item ao final.
Cadastros e vínculos são preservados. Novos manifestos não incluem inativos;
manifestos existentes continuam contendo os itens que já lhes pertenciam.
Criar e editar manualmente continuam disponíveis e participam do mesmo controle
de concorrência. A leitura da página não normaliza nem escreve no catálogo:
lacunas anteriores são normalizadas na próxima alteração autorizada.

## Segurança e concorrência

A página e a Server Action exigem a permissão existente
`modulo.amostras.gerenciar_cadastros`. A transação recarrega sessão, usuário e
permissões, além da autenticação inicial. IDs inválidos, duplicados, inativos,
desconhecidos ou conjuntos incompletos são rejeitados.

Todas as alterações dos itens compartilham um advisory lock transacional e
uma revisão SHA-256 do catálogo. Uma tela desatualizada recebe erro em vez de
sobrescrever alterações silenciosamente. Não são enviadas requisições por item.

## Arquivos

Criados:

- `src/app/controle-buffet-amostras/item-ordering.ts`
- `src/app/controle-buffet-amostras/catalog-order.ts`
- `src/app/controle-buffet-amostras/opcoes/item-order-actions.ts`
- `scripts/test-buffet-order.cjs`
- `scripts/test-buffet-order-browser.cjs`
- Este documento.

Alterados no módulo:

- `actions.ts`
- `catalog.ts`
- `opcoes/page.tsx`
- `opcoes/items-management-table.tsx`
- `servico/[id]/legacy-page.tsx`
- `workflow-adapter.ts`
- `workflow-page.tsx`

Também foi ajustada a asserção de consultas de
`scripts/test-buffet-history.cjs`: aceita quantidade igual ou menor que o HEAD,
pois o HEAD já incorpora a otimização do Histórico. Antes, exigia uma nova
redução a cada execução. O código do Histórico não foi alterado nesta entrega.

## Validação

Todos os testes de integração e navegador usaram exclusivamente PostgreSQL
local isolado, com dados sintéticos e URLs explícitas antes de importar a
aplicação. O arquivo `.env` foi preservado e sua integridade conferida por hash.
Não houve leitura ou escrita no banco externo nesta tarefa.

Passaram:

- `node scripts/test-buffet-order.cjs`: reprodução da causa; último para primeiro,
  primeiro para último, posições intermediárias, movimentos consecutivos,
  renumeração, persistência, IDs inválidos, revisão obsoleta, concorrência com
  apenas um vencedor, falta de permissão e sessão expirada.
- Rollback real no PostgreSQL local com trigger de falha temporária: catálogo
  integralmente preservado, incluindo timestamps. Ativação, inativação, criação
  e edição com preservação dos vínculos também passaram.
- Comparação de registros operacionais, versões, eventos e assinaturas antes e
  depois das alterações de ordem; manifesto assinado e respostas parciais
  preservados. Novo salvamento do parcial mantém ID, temperatura e data/hora;
  sua versão anterior permanece intacta.
- Ordenação de formulários legados e versionados, preservação das posições de
  itens desconhecidos e GET real do relatório mensal com dados e botão de
  impressão.
- `node scripts/test-buffet-order-browser.cjs`: login real local, mouse, toque
  emulado, teclado, persistência após recarga, uma POST por movimento, busca,
  cancelamento sem POST, falha de rede com restauração, ativação/inativação e
  bloqueio de usuário sem permissão.
- Capturas e verificação de ausência de overflow da página em 1440, 390 e
  320 pixels. Inspeção visual das capturas de desktop e mobile realizada.
- `node scripts/test-buffet-history.cjs` e
  `node scripts/test-buffet-history-browser.cjs`: regressão do Histórico.
- `npm.cmd run lint`.
- `npx.cmd tsc --noEmit`.
- `npm.cmd run build`, apontando explicitamente para o banco local sintético.
- `git diff --check`.

Evidências locais ignoradas pelo Git estão em `.data/validation/buffet-order`,
incluindo fixtures, relatório HTML e capturas. O banco sintético foi preservado.

## Limites e publicação

O toque foi validado por emulação no navegador; não foi realizado teste em
aparelho físico/iOS. Não foi validado o ambiente publicado. Conflitos simultâneos
exigem recarregar e repetir a alteração, conforme mensagem da interface.

Não houve exclusão de dados reais, mudança de assinaturas ou reescrita de
históricos. Não houve migration, db push, seed, reset, commit, push ou deploy.
Git final esperado nesta entrega: oito arquivos rastreados modificados e seis
arquivos novos, na mesma branch de estabilização.
