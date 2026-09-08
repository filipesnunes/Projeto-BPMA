# Ajustes BPMA/KPlatz — 08/09/2026

Implementação local concluída em `A:\Projeto-BPMA-KPlatz`, branch `main`, repositório `Projeto-BPMA`. O workspace estava sem alterações antes do trabalho. O projeto `tenant-refactor` não foi acessado nem alterado.

## Hortifruti

A rota `/higienizacao-hortifruti/historico/relatorio-mensal` redireciona para `/relatorios/higienizacao-hortifruti/mensal`. Essa rota utiliza `src/lib/monthly-sanitary-report.ts`, cujo HTML não tinha a barra de impressão presente nos outros relatórios.

Foi acrescentada a mesma implementação `.screen-actions` do relatório mensal de óleo, com o botão `Imprimir / Salvar PDF`, `onclick="window.print()"` e `display: none` em `@media print`. Nenhuma função de cabeçalho, resumo, tabela ou rodapé foi alterada.

A rota real foi executada com um adaptador de dados simulados. Seu HTML foi aberto no Edge em modo headless com perfil separado. Foram confirmados: botão visível; clique chamando `window.print()`; botão oculto em mídia de impressão; geração de PDF. As posições e dimensões de cabeçalho, tabelas e rodapé em impressão foram comparadas automaticamente com o renderer anterior do Git e permaneceram idênticas. A captura em tela também foi inspecionada visualmente.

Artefatos locais, ignorados pelo Git, em `.data/validation`: `hortifruti.html`, `hortifruti-before.html`, `hortifruti-screen.png`, `hortifruti-print.png` e `hortifruti.pdf`. Todos usam dados de teste.

## Temperatura

A regra anterior exigia foto em Alerta/Crítico para equipamentos em operação, tanto no componente de upload quanto nas ações de criação e edição. Em edição, uma foto existente já atendia à exigência. Equipamentos em manutenção ou inativos mantêm seu tratamento anterior.

Não havia campo equivalente no schema ou nas configurações do módulo. A tabela existente `modulo_configuracao` foi reutilizada, com o novo campo booleano `exigirFotoEmAlertaCritico`. O valor padrão no banco é `true`; a ausência da linha de configuração também resulta em `true` no helper de leitura.

Em **Gerenciar Opções**, o seletor **Exigir foto nos registros de temperatura** oferece **Habilitado** e **Desabilitado**, com botão **Salvar configuração**. A ação usa a permissão existente `modulo.temperatura.gerenciar_cadastros`; nenhuma definição de permissão foi alterada.

- Habilitado: mantém a exigência em Alerta/Crítico, no formulário e no servidor.
- Desabilitado: permite salvar sem foto, mantendo o campo de anexo disponível.
- Uploads voluntários continuam pelo armazenamento existente; editar sem enviar nova foto preserva a foto já salva.
- Alterar a configuração grava somente a configuração e seu responsável pela atualização. Não reescreve registros operacionais.
- Temperatura, classificação, ação corretiva, turno, responsável, manutenção, fechamento e assinaturas mantêm suas regras.

Migration criada: `prisma/migrations/20260908120000_temperatura_foto_configuravel/migration.sql`. Ela adiciona uma coluna `BOOLEAN NOT NULL DEFAULT true`, sem exclusão ou atualização de registros operacionais. **A migration não foi aplicada ao banco da operação. Deve ser aplicada pelo fluxo de publicação antes de disponibilizar este código.** O fallback para configuração ausente pressupõe o schema migrado.

## Auditoria de filtros

O padrão encontrado construía o intervalo de datas somente em `filtroMes && filtroAno`, ou somente em `filtroAno`. Mês isolado ficava sem filtro de data. No histórico diário de limpeza, o fallback restringia a consulta ao período mensal padrão.

As 12 telas abaixo precisaram de correção:

| Módulo | Telas corrigidas |
| --- | --- |
| Higienização de Hortifruti | Principal e Histórico |
| Controle de Temperatura | Principal e Histórico |
| Controle de Qualidade do Óleo | Principal e Histórico |
| Controle de Buffet/Amostras | Histórico |
| Rastreabilidade/Recebimento | Histórico |
| Plano de Limpeza Diário | Principal e Histórico |
| Plano de Limpeza Semanal | Principal e Histórico |

O helper `src/lib/month-filter.ts` valida mês/ano opcionais sem transformar campo vazio em ano atual, zero ou `NaN`. Valores fracionários, malformados e fora dos limites dos campos são descartados.

- Sem filtros: mantém o padrão anterior de cada tela.
- Só mês: consulta os limites de datas da tabela com agregação Prisma e constrói intervalos daquele mês entre os anos abrangidos pelos registros. O banco filtra usando `OR` de intervalos sobre os campos de data indexados, antes da ordenação e de eventual paginação. Apenas os limites são trazidos para montar o filtro; não se carregam todos os registros para depois filtrar pelo mês.
- Só ano: mantém o intervalo de janeiro a dezembro do ano informado.
- Mês e ano: mantém somente o mês/ano informado.
- Os demais filtros continuam nas consultas ou nos tratamentos já existentes das telas. A precedência anterior do filtro de data específica foi preservada.

No histórico diário de limpeza, os intervalos também consideram o início das áreas configuradas e são limitados ao dia atual. As tarefas previstas são calculadas separadamente para os intervalos do mês escolhido, sem gerar tarefas de outros meses.

Também foram verificados os formulários de emissão dos sete relatórios mensais em `/relatorios` e seus endpoints. São seletores de um documento com referência mensal específica, e foram preservados. Os seletores de fechamento mensal também foram preservados. As páginas principais de Buffet e Recebimento, Etiquetas, Documentos Técnicos e Chamados não oferecem o par de filtros opcionais mês/ano dessa correção. A central de relatórios gerais usa data inicial/final.

## Validações

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run prisma:generate` | Passou |
| `npm.cmd run lint` | Passou, sem erros ou avisos ESLint |
| `npm.cmd run build` | Passou, incluindo tipos e geração de páginas |
| `git diff --check` | Passou |
| `node scripts/test-bpma-adjustments.cjs` | Passou |
| `node scripts/test-bpma-print.cjs` | Passou com Edge headless local na porta 9227 |

O Next exibiu os avisos de ferramenta sobre a futura remoção de `next lint` e a idade dos dados do Browserslist; não impediram lint/build.

O teste de regressão executa páginas e ações reais com adaptadores em memória para autenticação, Prisma e armazenamento de imagens. Não lê `.env`, não abre conexão com banco e não grava uploads operacionais. Abrange:

- 13 cenários de consulta no histórico de Hortifruti: nenhum filtro; só mês; só ano; mês/ano; combinações com responsável; limpar; mês vazio de registros; mudanças de período; ano bissexto; combinação com produto.
- Construção e execução até a consulta principal para mês isolado nas 12 telas.
- Configuração persistida no adaptador, fallback habilitado e 12 combinações de configuração/status/presença de foto na criação.
- Bloqueio na edição sem foto quando exigida, aceitação ao anexar e preservação de foto existente.
- Formulário real de temperatura e seletor real de Gerenciar refletindo ambas as configurações.
- Rota mensal real produzindo HTML para o teste de impressão.

Limite da validação: criação/edição e persistência de fotos foram verificadas com dados e armazenamento simulados, não em uma sessão conectada ao PostgreSQL da operação. O teste de impressão utilizou navegador real sobre o HTML da rota com esses dados simulados.

## Arquivos e estado final

Arquivos modificados (`M`):

```text
prisma/schema.prisma
src/app/controle-buffet-amostras/historico/page.tsx
src/app/controle-qualidade-oleo/historico/page.tsx
src/app/controle-qualidade-oleo/page.tsx
src/app/controle-temperatura-equipamentos/actions.ts
src/app/controle-temperatura-equipamentos/historico/page.tsx
src/app/controle-temperatura-equipamentos/opcoes/page.tsx
src/app/controle-temperatura-equipamentos/page.tsx
src/app/higienizacao-hortifruti/historico/page.tsx
src/app/higienizacao-hortifruti/page.tsx
src/app/plano-limpeza/diario/historico/page.tsx
src/app/plano-limpeza/diario/page.tsx
src/app/plano-limpeza/semanal/historico/page.tsx
src/app/plano-limpeza/semanal/page.tsx
src/app/rastreabilidade-recebimento/historico/page.tsx
src/lib/monthly-sanitary-report.ts
```

Arquivos novos, não adicionados ao índice (`??`):

```text
documentação/VALIDACAO-AJUSTES-KPLATZ-2026-09-08.md
prisma/migrations/20260908120000_temperatura_foto_configuravel/migration.sql
scripts/test-bpma-adjustments.cjs
scripts/test-bpma-print.cjs
src/app/controle-temperatura-equipamentos/settings.ts
src/lib/month-filter.ts
```

Sem commit, push, seed, reset, `prisma db push`, alteração manual no banco de produção ou mudança na arquitetura multi-tenant. Autenticação, usuários, definições de permissões, fechamento mensal e assinaturas não foram alterados.
