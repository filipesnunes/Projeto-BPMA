# Diagnóstico P2022 — Fechamento mensal

## Conclusão e limite do diagnóstico

O log de produção fornecido indica que o código publicado consulta
`fechamento_mensal_modulo.status`, mas essa coluna não existe no banco utilizado
pelo serviço. Trata-se de divergência entre o código/schema e o schema físico.
Não é necessário retirar a funcionalidade nem criar outra migration.

No banco configurado no ambiente local, o diagnóstico somente leitura confirmou
a mesma divergência e encontrou a migration correspondente pendente. **Ainda
não foi comprovado que esse banco é o banco usado pelo serviço publicado.**
O destino deve ser confrontado com o projeto, ambiente e serviço PostgreSQL do
Railway antes de qualquer aplicação. Não foram exibidas credenciais ou DATABASE_URL.

Workspace: BPMA/KPlatz atual, `A:\Projeto-BPMA-KPlatz`, branch main.
Git estava limpo e HEAD era `bc5293d`, também a referência local origin/main.
A migration está rastreada no Git e foi incluída nesse commit. Não foi obtida
evidência do SHA do deploy ou do conteúdo da imagem publicada no Railway;
portanto, sua presença no artefato publicado permanece a confirmar.

## Schema e migration existentes

Migration correta: `20261002000200_gerenciamento_periodos`.

`FechamentoMensalModulo.status` é String, representada por TEXT no PostgreSQL,
com default FECHADO. A constraint SQL limita os valores a FECHADO e REABERTO.
Não foi criado nem deve ser criado um enum novo.

A migration existente:

- Adiciona status TEXT NOT NULL DEFAULT 'FECHADO'.
- Adiciona reabertoEm, reabertoPorUsuarioId e reabertoPorNome, todos opcionais.
- Permite null em usuarioPerfilSnapshot, para representar signatários legados
  cujo perfil não é conhecido, preservando os valores existentes.
- Adiciona validação dos estados e índice único parcial de um REABERTO por módulo.

Não contém DELETE, reset, atualização de assinaturas ou reabertura de períodos.
Os fechamentos antigos recebem FECHADO; os campos de reabertura começam null.
Responsáveis, datas, assinaturas e indicadores antigos permanecem armazenados.

## Evidências no banco local configurado

`npx.cmd prisma migrate status` encontrou 53 migrations no repositório, com duas
pendentes nesse banco:

1. `20261002000100_personalizacao_visual`.
2. `20261002000200_gerenciamento_periodos`.

`information_schema.columns` confirmou a ausência das quatro colunas novas:
status, reabertoEm, reabertoPorUsuarioId e reabertoPorNome. usuarioPerfilSnapshot
ainda é NOT NULL. A tabela personalizacao_visual também não existe.

O histórico `_prisma_migrations` confirma que a migration de períodos não foi
aplicada. A migration mais recente registrada como aplicada é
`20260924000100_recebimento_sem_data_fabricacao`.

Há 31 registros em fechamento_mensal_modulo. Foi salvo um fingerprint dos valores
existentes em `.data/validation/monthly-periods-p2022-diagnostic.json`, para
comparação posterior. Esse fingerprint **não constitui um backup recuperável**.

## Aplicação pendente e confirmação necessária

Não foi executada nenhuma operação mutável no banco. Não foi criada migration
duplicada e nenhum arquivo de código/schema/migration foi alterado nesta etapa.

Antes de aplicar, faltam:

1. Identificar o projeto, ambiente e serviço PostgreSQL usados pelo app publicado.
2. Comprovar backup recuperável desse banco, com identificação e data.
3. Obter confirmação explícita para aplicação, conforme a seção 3 do pedido.

O comando disponível é `npm.cmd run prisma:migrate:deploy`. **Ele aplica todas as
migrations pendentes**, incluindo a de personalização identificada acima;
esse alcance precisa constar na confirmação. Não é um comando que seleciona
apenas uma migration pelo nome.

Após confirmação, executar no destino verificado, consultar novamente o status,
conferir colunas/default/constraints, estados FECHADO e preservação dos valores
anteriores, e validar dashboard e Gerenciamento com sessão autorizada.
Reabertura e novo fechamento devem ser testados com dados sintéticos isolados.

O script start do repositório executa somente next start. Existe um script
separado de migrate deploy, mas não há configuração versionada de Railway que
comprove sua execução durante publicação. A configuração real do pipeline no
painel Railway não foi acessada. O fluxo de publicação deve aplicar migrations
aprovadas antes de disponibilizar código dependente das novas colunas.

## Validações executadas

- `npm.cmd run prisma:generate`: passou, Prisma Client 6.5.0.
- `npm.cmd run lint`: passou sem warnings ou erros do ESLint.
- `npm.cmd run build`: passou, incluindo tipos e geração das rotas.
- `git diff --check`: passou antes da documentação; conferência final na entrega.
- `scripts/test-monthly-reopening.cjs`: passou nos sete módulos, incluindo
  reabertura, segundo mês bloqueado, novo fechamento, preservação de auditoria e
  assinaturas, conferência real de nota sintética, dashboard e relatórios.

Os testes funcionais utilizam adapters isolados; não comprovam correção do schema
de produção. A consulta pública ao app retornou o login. Não foi validado o
dashboard autenticado nem a página administrativa publicada após correção,
pois a migration ainda não foi aplicada e as confirmações estão pendentes.

## Estado final

Único arquivo criado nesta etapa: este relatório de diagnóstico.
Branch main; nenhum arquivo de implementação alterado.
Nenhum dado excluído ou modificado. Sem seed/reset, db push, commit ou push.
O tenant-refactor não foi acessado ou alterado.

## Nova verificação — digest 877757007

Na nova solicitação, HEAD é `59b64af` e o Git estava limpo. Ambas as migrations
continuam rastreadas. Novo migrate status e consultas somente leitura confirmaram
as mesmas duas pendências, ausência dos quatro campos de períodos, ausência da
tabela personalizacao_visual e 31 fechamentos armazenados no banco local configurado.
Sua correspondência com o serviço publicado ainda não foi comprovada.

Não há CLI Railway disponível, configuração Railway versionada ou acesso aos
logs/configurações do serviço por ferramentas conectadas nesta sessão. Assim,
**não é possível afirmar que o digest 877757007 é o P2022 anterior**. É necessário
consultar os Runtime Logs do deploy ativo do serviço **Projeto-BPMA**, buscando
877757007 e a exceção/stack anterior ao digest, incluindo código Prisma, coluna,
rota e horário. Os Deploy Logs também devem mostrar se o pre-deploy foi executado,
se concluiu migrate deploy ou falhou antes de publicar a aplicação.

A verificação HTTP sem sessão retornou login com formulário e sem a mensagem de
erro para `/`, `/login` e `/gerenciamento-periodos/rastreabilidade`. Isso comprova
somente a disponibilidade pública do login, não o dashboard autenticado ou a
restauração do aplicativo. Não foi realizado login com uma conta real.

Há uma limitação independente: `/personalizacao` não possui page.tsx ou Server
Actions expostas no código atual; só existe personalization-form.tsx preparado.
A identificação do Gerente Geral continua pendente conforme o relatório de
personalização. A migration cria armazenamento, mas não cria essa página. Não
foi implementada funcionalidade nova para contornar essa pendência.

Configuração a conferir no Railway, preservando valores que já estejam corretos:

- Build Command: `npm run prisma:generate && npm run build`.
- Pre-deploy Command: `npm run prisma:migrate:deploy`.
- Start Command: `npm run start`.

Esses são os comandos necessários; os valores reais do painel não foram
consultados nem alterados. O pre-deploy usa o banco vinculado ao serviço, cuja
identidade deve ser verificada antes da primeira execução autorizada.

Prisma generate, lint, build, diff check e testes isolados de períodos foram
executados novamente e passaram. Não existe comprovação de correção em produção.
A operação mutável permanece interrompida por falta de confirmação do destino,
backup recuperável e autorização de aplicação, exigidos na seção 5 do novo pedido.
Somente este documento foi atualizado; nenhum código, schema ou migration mudou.
