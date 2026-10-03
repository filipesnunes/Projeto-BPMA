# Personalização avançada — implementação parcial por anexo incompleto

O anexo recebido termina na seção 7.3, após “Cores institucionais adaptadas”.
Foi solicitada a continuação, especialmente para definir a personalização dos
relatórios. Essa parte permanece pendente de requisitos; não foram inventadas
opções de fonte, margens, cores de tabelas ou outros ajustes de impressão.

## Parte recebida implementada

No módulo existente, GERENTE e DEV continuam com as mesmas regras de acesso.
Logo, nome da unidade, controles de dimensões, upload, remoção, restauração e
cabeçalhos existentes foram preservados. Não foram alterados perfis ou permissões.

Foram acrescentados:

- Cores primária, secundária e de destaque com seletor, campo hexadecimal,
  restauração individual e seis paletas institucionais.
- Aplicação por tokens existentes a botões principais/secundários e navegação.
  Texto claro/escuro calculado conforme a cor de fundo. Os tokens de perigo,
  ações e classes de sucesso/alerta operacional não são substituídos.
- Fontes Inter, Roboto e Open Sans empacotadas localmente com pesos 400, 600 e
  700, além de Arial e fonte do dispositivo. Não há Google Fonts ou download de
  fontes no build. Fontes são servidas pelo próprio aplicativo.
- Escala controlada de textos: compacto (14), padrão (16), ampliado (18 px).
- Tema institucional claro, escuro ou automático, reutilizando a classe dark e
  o mecanismo bpma-theme. Preferência individual light/dark tem prioridade;
  “Usar tema da unidade” remove essa preferência. Automático acompanha mudanças
  do dispositivo. As duas instâncias do menu sincronizam a escolha.
- Prévia do aplicativo que acompanha cores, fonte, escala e tema antes de salvar,
  com exemplos fixos de alerta/conformidade. Indicação de alterações não salvas.
- A restauração geral agora inclui aparência. Remover a logo mantém os ajustes.

Relatórios HTML mensais mantêm seus próprios CSS/fontes. Chamados/consolidado
receberam um escopo de tipografia para que as configurações do aplicativo não
alterem a fonte ou escala dos documentos. A personalização adicional de
relatórios ainda depende da continuação do pedido.

## Persistência

Reutilizado PersonalizacaoVisual. Migration nova:
`20261002000400_personalizacao_aparencia`, adicionando três cores opcionais e
fonteAplicativo, tamanhoTexto e temaPadrao com defaults e constraints.
Sem alteração de logos, dimensões, usuários, registros, assinaturas ou datas.

As cores aceitam somente #RRGGBB, e fontes/escalas/temas vêm de listas fechadas.
Valores inválidos enviados ao servidor são rejeitados antes do upsert, preservando
a configuração anterior. CSS enviado pelo cliente não é persistido.

Na leitura durante rollout, P2022 dos campos novos usa os campos anteriores.
Dimensões da logo já existentes são preservadas; se ainda faltarem, usa defaults.
Erros de outras colunas continuam propagando. Os writes exigem a migration.

Migrate status: 55 migrations, apenas a nova migration pendente no banco local
configurado. Não foi presumido vínculo com produção. Não houve aplicação de
migration, seed, reset, db push, commit ou push nesta etapa.

## Validações

Prisma generate, Prisma validate, lint, build e diff check passaram.
Testes de logo/dimensões/relatórios, permissões e reabertura mensal passaram em
adapters isolados, sem writes em banco real. Novos testes verificaram persistência
da aparência, rejeição atômica de CSS/cores/opções inválidas, remoção e restauração.

O componente real de tema passou em 18 combinações de precedência, mudanças do
dispositivo, restauração institucional, escolha individual e limpeza de listeners.
Em Edge isolado, 45 combinações de temas/fontes/escalas usaram CSS/fontes do build,
em desktop e mobile. Não houve overflow; cores de exemplos semânticos e tipografia
do documento permaneceram constantes. Foram inspecionadas capturas claras/escuras
com Inter ampliado em largura de 360 px. Esses testes são fixtures isoladas,
não login/relogin ou validação em produção. A prévia interativa completa do módulo
ainda não foi validada em uma sessão autenticada real.

Os PDFs anteriores não foram gerados novamente nesta atualização; os sete GETs
mensais e seus dados foram verificados pelos testes existentes. Validar os novos
ajustes de impressão após receber os requisitos restantes.

## Arquivos

- package.json e package-lock.json (fontes locais)
- prisma/schema.prisma
- prisma/migrations/20261002000400_personalizacao_aparencia/migration.sql
- src/lib/appearance-settings.ts
- src/lib/visual-personalization.ts
- src/app/globals.css
- src/app/layout.tsx
- src/app/personalizacao/actions.ts
- src/app/personalizacao/page.tsx
- src/app/personalizacao/personalization-form.tsx
- src/app/relatorios/page.tsx
- src/components/layout/sidebar.tsx
- src/components/layout/theme-toggle-button.tsx
- scripts/test-visual-personalization.cjs
- scripts/test-appearance-theme.cjs
- scripts/test-appearance-visual.cjs
- este documento
