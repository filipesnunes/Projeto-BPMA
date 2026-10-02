# Personalização visual — BPMA/KPlatz atual

## Estado e definição de acesso pendente

Workspace auditado: `A:\Projeto-BPMA-KPlatz`, branch `main`, Git inicialmente limpo.
O projeto tenant-refactor não foi acessado ou modificado.

A consulta somente leitura ao banco encontrou os perfis DEV, Gerente,
Nutricionista e Colaborador. Existem quatro usuários ligados ao perfil Gerente.
Não existe Gerente Geral no enum legado nem nos registros de `PerfilAcesso`.

Conforme a seção 11.4 do pedido, a implementação de acesso está interrompida até
uma definição inequívoca. Foi apresentada a opção de reutilizar `PerfilAcesso`,
criando o código exclusivo GERENTE_GERAL e uma permissão somente de personalização,
com atribuição posterior pela Gestão de Usuários. Não foi concedido acesso
aos gerentes existentes ou a DEV. Essa escolha permanece aguardando resposta.

O formulário da Personalização está preparado, mas ainda não existe uma página
administrativa ativa, item de menu ou Server Action de alteração exposta.
Os serviços internos são server-only e não constituem endpoints públicos.
Os testes de acesso de Gerente Geral e das Server Actions ainda não podem ser
concluídos sem essa definição.

## Auditoria dos relatórios e configurações

- Seis rotas mensais geram documentos HTML e CSS próprios: Temperatura,
  Buffet/Amostras, Óleo, Rastreabilidade, Limpeza Diária e Limpeza Semanal.
- Hortifruti usa `src/lib/monthly-sanitary-report.ts`.
- Chamados e relatórios consolidados usam `ReportResult` na página de Relatórios;
  seu layout diferente foi preservado, com identidade somente no bloco de marca.
- A marca vem de `APP_NAME`. A identidade do login/menu permanece a original.
- O nome da unidade era obtido de STAYSAFE_UNIT_NAME/BPMA_UNIT_NAME, com fallback
  "Unidade não informada". Esse fallback foi centralizado e preservado.
- `ModuloConfiguracao` contém textos dos módulos e regras de foto. Não possui
  identidade visual global; reutilizá-lo misturaria configurações de naturezas diferentes.
- O upload genérico foi reutilizado, com duas propriedades opcionais para prévia
  integrada e apresentação da imagem sem bordas/efeitos.

## Persistência e upload preparados

Foi criado o model `PersonalizacaoVisual`, com um único registro de ID 1:
nome da unidade, bytes da logo, MIME, nome original, usuário e horário da atualização.
A imagem fica no PostgreSQL, com limite de 2 MB. Substituição atualiza o mesmo
registro, sem arquivos órfãos ou dependência de diretórios temporários no Railway.

A migration `20261002000100_personalizacao_visual` está preparada e **não foi
aplicada em produção**. Ela cria apenas a nova tabela, FK opcional para usuário,
restrições de singleton e tamanho da imagem. Nenhum registro antigo é atualizado.

PNG, JPEG e WebP estáticos são conferidos com sharp 0.34.5, já instalado pelo
Next.js e agora declarado como dependência direta. A validação decodifica os pixels,
confere o formato real/MIME, tamanho, dimensões e integridade. SVG, arquivos falsos,
truncados, animações identificadas e imagens acima do limite são rejeitados.
Os bytes originais são preservados, inclusive transparência. Não há corte,
compressão com perda ou mudança de proporção.

O serviço valida todos os dados antes de uma única operação Prisma upsert.
Falhas de validação preservam os valores anteriores. Remoção afeta só a imagem;
restauração limpa os campos visuais e volta aos fallbacks.

## Integração de cabeçalhos

`report-identity.ts` centraliza HTML escapado, logo embutida como data URL,
CSS de alinhamento e impressão após decodificação das imagens.
Não há URLs expirantes ou dependência de sessão para carregar a imagem impressa.

A logo ocupa a área da marca, centralizada e proporcional, com object-fit contain.
A altura respeita a marca original para preservar a paginação de tabelas preenchidas.
O nome é limitado visualmente a duas linhas no cabeçalho; o valor completo fica
preservado no banco e no atributo title. Títulos, mês/ano, tabelas, filtros,
assinaturas e fechamentos não foram alterados.

A leitura opcional de configuração usa fallback somente quando a nova tabela
ainda não existe (P2021 dessa tabela), para que o primeiro deploy não interrompa
os relatórios existentes. Outros erros de banco não são ocultados.

Relatórios adaptados individualmente:

1. Plano de Limpeza Semanal.
2. Plano de Limpeza Diário.
3. Temperatura dos Equipamentos.
4. Buffet/Amostras.
5. Higienização de Hortifruti.
6. Qualidade do Óleo.
7. Rastreabilidade de Recebimento.
8. Chamados de Manutenção, pelo cabeçalho da página de Relatórios.
9. Relatórios consolidados, pelo mesmo bloco da página de Relatórios.

## Testes executados

- Serviço real com adapter isolado: persistência e nova carga, troca, remoção,
  restauração, PNG/JPEG/WebP, transparência, formatos horizontal/quadrado/vertical,
  falhas sem alteração da configuração e escaping HTML.
- Sete GETs mensais reais com dados e assinaturas sintéticos, comparando consultas
  operacionais e integridade das tabelas antes/depois da personalização.
- Página de Relatórios: props e renderização de identidade em Chamados e consolidado.
- Formulário preparado: prévia acompanha imagem e nome; upload reutilizado sem efeitos.
- Navegador Edge isolado: 35 PDFs (sete relatórios x fallback e quatro logos), com
  proporção, centralização, contenção, ausência de overflow, paginação igual ao
  fallback e presença de imagens/máscaras de transparência nos arquivos PDF.
- Clique real no botão Imprimir / Salvar PDF invocou a impressão após decodificação.
- Foram inspecionadas capturas do HTML em modo impressão; não foi realizada
  inspeção visual dos arquivos PDF por um leitor de PDF.
- Regressões de fotos, filtros, temperaturas, Hortifruti, óleo, Rastreabilidade e
  reabertura passaram em adapters isolados, sem writes no banco de produção.

Não foram executados login real/relogin, deploy/restart de produção ou testes de
acesso administrativo, pois a migration e a definição de Gerente Geral estão pendentes.

## Arquivos

Criados: migration; `src/app/personalizacao/personalization-form.tsx`;
`src/components/report-identity-mark.tsx`; `src/lib/report-identity.ts`;
`src/lib/visual-personalization.ts`; `src/lib/hotel-logo-upload.ts`;
`scripts/test-visual-personalization.cjs`; `scripts/test-visual-personalization-print.cjs`;
este documento.

Alterados: `prisma/schema.prisma`; package.json/package-lock.json;
`src/components/forms/image-upload-field.tsx`; `src/lib/monthly-sanitary-report.ts`;
as sete rotas mensais acima; `src/app/relatorios/page.tsx`;
`src/app/relatorios/components/report-actions.tsx`; `scripts/test-bpma-adjustments.cjs`.

## Evoluções possíveis

Depois de concluir o acesso, podem ser acrescentados rodapé institucional,
endereço/contato, logo específica para impressão e cores institucionais.
Nenhum campo para essas evoluções foi criado nesta etapa.

## Validações técnicas finais

- `npm.cmd run prisma:generate`: passou, Prisma Client 6.5.0 gerado.
- `npx.cmd prisma validate`: schema válido.
- `npm.cmd run lint`: passou sem warnings ou erros do ESLint.
- `npm.cmd run build`: passou, incluindo compilação, tipos e geração das rotas.
- `git diff --check`: passou; Git informa apenas a normalização LF/CRLF configurada.
- Git final: branch `main`, 15 arquivos rastreados modificados e nove entradas
  novas (incluindo diretórios da migration e do formulário). Sem commit ou push.

A integridade da migration foi conferida contra o model: tipos, nulabilidade,
default do ID, timestamps, chave primária e relação para Usuario correspondem
ao schema. As constraints adicionais limitam a configuração a um registro e a
imagem a 2 MB. A execução no PostgreSQL de produção permanece pendente.

Nenhuma regra operacional, autenticação, sessão, assinatura ou fechamento foi
modificado. Não foi utilizado db push, seed, reset, commit ou push.
