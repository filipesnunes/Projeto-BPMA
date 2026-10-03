# Dimensionamento da logomarca — BPMA/KPlatz

Implementado somente em `A:\Projeto-BPMA-KPlatz`, branch main, com Git inicialmente
limpo. Nenhum outro projeto foi acessado.

## Comportamento

A Personalização Visual ganhou dois controles deslizantes: largura de 40 a 240 px
e altura máxima de 24 a 120 px. O padrão é 120 × 56 px; valores ausentes, vazios,
fracionários, não numéricos ou fora da faixa recebem o padrão correspondente.
Esses valores definem a caixa da imagem: a largura também respeita a célula do
cabeçalho, e a imagem usa contain com alinhamento central, preservando proporção
e transparência. A caixa só é exibida quando há logo.

A prévia acompanha os controles imediatamente. Salvar persiste os dois valores
usando a action existente; remover a logo preserva o tamanho e o nome da unidade;
restaurar os padrões também restaura o dimensionamento. A action de remoção e as
permissões existentes não foram modificadas.

O render compartilhado HTML atende aos sete relatórios mensais. O componente
React compartilhado atende à prévia, Chamados de Manutenção e consolidado na
página de Relatórios. Não foram duplicados cabeçalhos nem modificadas consultas
operacionais, autenticação, perfis, assinaturas ou fechamentos.

## Migration e compatibilidade

Nova migration: `20261002000300_personalizacao_dimensoes_logo`.
Adiciona logoLargura e logoAlturaMaxima como INTEGER NOT NULL, defaults 120 e 56,
com constraints das faixas permitidas. Preserva bytes da logo, nome da unidade,
responsável e timestamps existentes. Não recria tabelas ou modifica dados
operacionais. A migration original de PersonalizacaoVisual não foi alterada.

Durante a publicação, a leitura trata especificamente P2022 dos dois campos novos
consultando somente os campos antigos e usando defaults. Mantém o fallback de
tabela ainda ausente e propaga outros erros de banco. A persistência dos novos
campos exige a migration aplicada.

Migrate status encontrou 54 migrations, com somente esta nova migration pendente
no banco configurado localmente. Não foi presumido que esse banco corresponde
ao serviço publicado. A migration não foi aplicada nesta tarefa. Publicação e
aplicação no banco correto permanecem pendentes pelo fluxo Prisma Migrate autorizado.
Não houve seed, reset, db push, commit ou push.

## Validação

- Prisma generate: passou, Client 6.5.0.
- Prisma validate: schema válido.
- Lint: passou sem warnings ou erros do ESLint.
- Build: compilação, tipos e geração de rotas passaram.
- Diff check: passou; Git avisa apenas da conversão LF/CRLF.
- Serviço e sete GETs reais em adapters isolados: tamanhos mínimo/máximo,
  defaults, valores inválidos, nova leitura após persistência, remoção,
  restauração, nome, PNG/JPEG/WebP, transparência e integridade dos registros.
- Prévia: mudanças dos controles verificadas em hooks isolados e imagem do
  componente real renderizada em navegador Edge isolado.
- Acesso: testes existentes de GERENTE, DEV, outros perfis, sessão, revogação e
  chamadas diretas às Server Actions passaram.
- Reabertura mensal: testes existentes dos sete módulos passaram.
- Edge: 77 PDFs (sete relatórios × onze cenários) com imagem embutida,
  máscara de transparência nos cenários transparentes, contain, alinhamento,
  contenção na célula, ausência de overflow e clique real no botão de impressão.
- Foram inspecionadas visualmente capturas da prévia e dos cabeçalhos com logo
  vertical e tamanho máximo. Os PDFs foram gerados e verificados estruturalmente;
  não foram inspecionados em um leitor de PDF. Não houve login ou teste em produção.

O aumento do cabeçalho pode aumentar a paginação. Na amostra de Temperatura com
dois equipamentos, o padrão e o mínimo geraram duas páginas, enquanto a altura
de 120 px e os cenários JPEG/WebP de 80 px geraram quatro páginas. Não houve
sobreposição ou perda de dados; a interface explica esse efeito. Não se promete
paginação idêntica ao cabeçalho anterior de 16 px.

## Arquivos

- prisma/schema.prisma
- prisma/migrations/20261002000300_personalizacao_dimensoes_logo/migration.sql
- src/lib/logo-dimensions.ts
- src/lib/visual-personalization.ts
- src/lib/report-identity.ts
- src/lib/monthly-sanitary-report.ts
- src/components/report-identity-mark.tsx
- src/app/personalizacao/page.tsx
- src/app/personalizacao/personalization-form.tsx
- src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts
- src/app/relatorios/controle-buffet-amostras/mensal/route.ts
- src/app/relatorios/controle-qualidade-oleo/mensal/route.ts
- src/app/relatorios/higienizacao-hortifruti/mensal/route.ts
- src/app/relatorios/rastreabilidade-recebimento/mensal/route.ts
- src/app/relatorios/plano-limpeza-diario/mensal/route.ts
- src/app/relatorios/plano-limpeza-semanal/mensal/route.ts
- scripts/test-visual-personalization.cjs
- scripts/test-visual-personalization-print.cjs
- docs/personalizacao-visual-2026-10-02.md
- docs/dimensionamento-logo-2026-10-02.md
