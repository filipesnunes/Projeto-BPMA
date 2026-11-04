# Óleo — revogação EXECUTADA EM PRODUÇÃO

## Resultado

As oito assinaturas indevidas foram revogadas no PostgreSQL real do KPlatz em
**03/11/2026 às 20:50:59, America/Sao_Paulo**
(`2026-11-03T23:50:59.056Z`). A transação terminou com sucesso e foi seguida de
nova captura e verificações somente leitura no banco real.

O registro 127 e sua assinatura de Camila permaneceram integralmente inalterados.
Nenhuma nova assinatura de nutricionista foi criada em produção.

## Identidade e autorização

O responsável autorizou expressamente, nesta conversa, a revogação dos registros
121, 122, 123, 124, 125, 126, 128 e 129, sem nova confirmação para o mesmo escopo.
O login interativo do Railway foi concluído pelo navegador. A API autenticada
confirmou:

| Recurso | Identificação confirmada |
|---|---|
| Projeto | StaySafe — `276feaac-2d59-4471-bfbe-f2b8ca882b0b` |
| Ambiente | production — `2f988bd0-96fc-429b-9d96-25c98b9bacff` |
| Aplicação | Projeto-BPMA — `b5df91cf-a0e6-4c17-8f84-8adff3f10bd6` |
| Banco | Postgres — `96442718-5099-4881-91ee-be65dbc91506` |
| Deployment ativo | `74a8c1f8-21ed-42a1-b70d-63c10bd73317`, SUCCESS, instância RUNNING |
| Commit em execução | `36fe5b6bd30dd3c311d506875e381e1397c7d49a` |
| Branch | `estabilizacao/experiencia-anterior-2026-10-28` |

As conexões de DATABASE_URL e, quando presente, DIRECT_URL da aplicação foram
comparadas **em memória** com as conexões do serviço Postgres desse mesmo ambiente.
Também foram correlacionados os endpoints privado/público do mesmo banco. Valores,
senhas e tokens não foram registrados na entrega ou nos arquivos de diagnóstico.
O `.env` existente não foi alterado.

O operador técnico da manutenção foi a conta DEV de ID 1, `Dev`, conforme exigido
pelo CLI existente. A justificativa distingue a execução técnica pelo Codex, via
Railway autenticado, da autorização do responsável pelo sistema. Esse evento de
manutenção não é uma assinatura técnica de supervisão e não habilita DEV a assinar.

## Backup completo e teste de recuperação

Foi criado um backup lógico completo do banco `railway`, PostgreSQL 17.11, por
`pg_dump --format=custom`, usando apenas leitura. Ele contém 147.011.310 bytes,
aproximadamente 147 MB, e preserva o schema e os dados do banco completo.

- Arquivo: `.data/validation/execucao-oleo-20261103/postgres-production-1793749564547.dump`.
- Captura iniciada: 03/11/2026 às 20:46:04 em São Paulo.
- SHA-256: `a23b2cd6c9ab7a5262bc7a34d474478e7a3645ab54106a077a060aa86e630cbd`.
- Manifesto: `.data/validation/execucao-oleo-20261103/backup-manifest.json`.

O arquivo foi restaurado com `pg_restore --exit-on-error` em uma **nova base local
vazia**, vinculada exclusivamente a `127.0.0.1:55479`. As 60 tabelas foram
restauradas sem erro; os oito escopos e o fluxo/assinatura de Camila foram
conferidos contra a captura anterior. A verificação foi concluída às 20:48:32.
Não houve execução de Prisma Migrate, reset, db push ou seed. Foram desconsiderados
owner/ACL apenas na restauração local para permitir portabilidade; o arquivo
original de backup permanece preservado.

A cópia completa restaurada recebeu a simulação dos oito alvos. O teste confirmou
a preservação dos registros, das versões e do 127; os indicadores e documentos;
os bloqueios de colaborador, senha e autoria; e o rollback integral quando uma
falha foi injetada na segunda gravação. Seis novas revisões foram testadas por uma
nutricionista sintética **somente nessa base local**.

O backup está fora do Git, em diretório de validação, e não é asset público da
aplicação. Deve ser conservado junto ao manifesto e às evidências da intervenção.

## Procedimento efetivamente utilizado

Foi utilizado `scripts/regularize-historical-records.cjs`, modo `apply`, com a API
existente de `scripts/lib/historical-regularization.cjs`. Não foi criada outra
implementação de revogação. Os auxiliares locais apenas conferiram a identidade,
prepararam/restauraram o backup, chamaram o CLI e verificaram o resultado.

Parâmetros reais utilizados: `--mode apply`, `--plan`,
`--allow-configured-database-write`, `--approval`, `--approved-by`,
`--confirm-target`, `--simulation`, `--backup-manifest`, `--operator-id 1`,
`--reason` e `--output`. Conexões foram fornecidas ao processo em memória,
sem expor seu conteúdo ou alterar a configuração existente do projeto.

Plano autorizado:
`4b666248d5ed39dc6cac653d978532e4ff1af8d62e19a11b1ceb1be73e6ed33b`.
Antes da chamada foram revalidados os oito hashes, a identidade e o 127. O próprio
CLI também verificou aprovação, simulação do mesmo plano, arquivo/SHA do backup,
restauração testada, idade do backup e fingerprint de destino. A transação
Serializable aplicou o lock operacional e conferiu novamente as versões,
assinaturas e competência antes de qualquer alteração.

Outubro de 2026 estava aberto. Não houve reabertura ou alteração de fechamento
mensal. Não houve migration, deploy ou escrita em outro módulo.

## Alteração persistida e rastreabilidade

Cada fluxo passou de FECHADO, com assinatura vigente, para COMPLETO, com
`assinaturaVigenteId = null`. COMPLETO refere-se ao preenchimento dos dados;
a situação da supervisão agora é **pendente de assinatura válida**.

Foram criados exatamente oito eventos `REVOGACAO_ASSINATURA`. Eles preservam
assinatura original, motivo, operador, autorizador, referência da aprovação,
horário real, backup, hash operacional e estados anterior/posterior. A versão
operacional permaneceu a mesma e a edição dos dados continua bloqueada durante
a manutenção da assinatura.

As assinaturas antigas e seus vínculos não foram excluídos. Não houve troca de
nome de Anderson por outro usuário, alteração de data da assinatura original ou
fabricação de assinatura retroativa.

## Verificação posterior no banco real

Uma nova captura consistente foi feita em READ ONLY após o commit. A comparação
confirmou:

- Os oito apontadores vigentes estão nulos e seus fluxos estão COMPLETO.
- Foram acrescentados exatamente os oito eventos de revogação previstos.
- Os 123 registros operacionais de Óleo permaneceram integralmente idênticos,
  incluindo temperaturas, fita, observações, responsáveis, datas e timestamps.
- As nove assinaturas originais, nove vínculos e 56 versões originais capturadas
  permanecem idênticos.
- O registro 127, seu fluxo e a assinatura de Camila permanecem idênticos e vigentes.
- Os fluxos fora do plano, os 275 logs originais, as 257 assinaturas diárias e os
  fechamentos capturados permanecem idênticos.
- Os 5.306 registros de Amostras e demais tabelas capturadas permaneceram idênticos.
- O histórico das 61 migrations permaneceu inalterado.

Os Server Components e o GET do relatório do mesmo código publicado também foram
executados localmente com consultas ao **banco real**, dentro de transação READ
ONLY, sem criar sessão de aplicação. Confirmaram pendência no Histórico e relatório,
e evidência antiga identificada como revogada nos detalhes dos oito registros.
A assinatura de Camila no 127 continua apresentada como vigente.

Essa conferência é do código e dos dados reais; não houve login HTTP nem inspeção
visual de uma sessão do cliente no navegador. Uma tela que já estivesse aberta
deve ser atualizada para carregar a situação nova.

## Nova revisão da nutricionista

Com os perfis/permissões reais, a elegibilidade de Camila, usuária 10, foi conferida
somente leitura e permite revisar os registros **123, 124, 125, 126, 128 e 129**.
A nutricionista deve abrir, revisar e confirmar sua própria senha; a nova assinatura
terá identidade e horário reais. Nenhuma dessas assinaturas foi feita pelo agente
em produção.

Os registros **121 e 122** tiveram a assinatura indevida revogada e permanecem
consultáveis e pendentes. A nova revisão continua bloqueada por falta de comprovação
da autoria original dos legados. Essa restrição não foi removida ou contornada.

O bloqueio de COLABORADOR permanece no commit publicado. A regra também foi
conferida contra o perfil real e os testes locais recusaram chamadas diretas.

## Recuperação e prevenção de reaplicação

O rollback transacional foi testado antes da produção. A execução real terminou
com sucesso; não houve recuperação ou reativação de assinatura indevida.
O backup completo restaurado e os estados anteriores ficam disponíveis para uma
eventual recuperação supervisionada. Não restaurar automaticamente todo um backup
antigo sobre lançamentos novos nem sobrescrever uma revisão legítima posterior.

**Não reaplicar o plano:** os escopos mudaram e o estado anterior já não corresponde
à base. O resultado persistido e os eventos devem ser consultados. Uma nova
intervenção fora deste escopo exige análise própria.

## Evidências e arquivos

Diretório local: `.data/validation/execucao-oleo-20261103/`.

- `identidade-confirmada.json`: identidade autenticada.
- `backup-manifest.json` e arquivo `.dump`: backup completo e restauração.
- `estado-anterior-confirmado.json`: evidências anteriores.
- `plano-oleo-autorizado.json`: oito IDs/assinaturas/versões exatos.
- `autorizacao-e-preflight.json`: autorização e verificações prévias.
- `simulacao-sobre-backup-completo/resultado.json`: integração local.
- `resultado-producao.json`: resultado do CLI real e IDs dos oito eventos.
- `estado-posterior-consistente.json`: captura posterior somente leitura.
- `verificacao-banco-producao.json`: comparação de integridade.
- `verificacao-interfaces-producao.json`: Histórico/relatório/elegibilidade reais.
- HTMLs de Histórico, relatório e detalhes: evidências obtidas por leituras reais.

O código de produção não foi modificado. A branch de estabilização foi preservada.
O PostgreSQL portátil local foi encerrado após as verificações. Não houve commit,
push, deploy, migration, seed, reset, db push ou exclusão de registros/assinaturas.

## Oito resultados persistidos


| Registro | Data operacional preservada | Antes | Depois confirmado | Evento de revogação |
|---|---|---|---|---|
| 121 | 2026-10-23 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccpl00001t8u83mxub8d9` |
| 122 | 2026-10-24 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccqio0003t8u8dkqldli6` |
| 123 | 2026-10-26 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccr500005t8u8bienh0ot` |
| 124 | 2026-10-27 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccrre0007t8u85an09qs9` |
| 125 | 2026-10-28 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccsds0009t8u8ebp1d5db` |
| 126 | 2026-10-25 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1cct05000bt8u8wb3qs3s6` |
| 128 | 2026-10-30 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1cctmk000dt8u84g9j7m7h` |
| 129 | 2026-10-31 | FECHADO / assinatura de Anderson vigente | COMPLETO / sem assinatura vigente; pendente de supervisão | `cmw1ccu8v000ft8u8xcar1xpd` |

**127: preservado integralmente, FECHADO, assinatura vigente de Camila Reinaldo.**
