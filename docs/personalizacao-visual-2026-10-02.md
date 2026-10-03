# Personalização visual — BPMA/KPlatz atual

Atualização posterior: o dimensionamento da logo agora é configurável e o
cabeçalho pode crescer conforme a altura escolhida. A migration nova permanece
pendente, sem aplicação nesta tarefa. Consulte
[Dimensionamento da logomarca](dimensionamento-logo-2026-10-02.md) para limites,
arquivos e validações atuais; os registros abaixo descrevem a implantação inicial.

## Acesso definido e interface ativada

Workspace auditado: `A:\Projeto-BPMA-KPlatz`, branch `main`, Git inicialmente limpo.
O projeto tenant-refactor não foi acessado ou modificado.

A consulta somente leitura ao banco encontrou os perfis DEV, Gerente,
Nutricionista e Colaborador. Existem quatro usuários ligados ao perfil Gerente.
Não existe Gerente Geral no enum legado nem nos registros de `PerfilAcesso`.

O ajuste de escopo resolveu a definição: reutilizar GERENTE e manter o acesso
total de DEV. Não foi criado GERENTE_GERAL, novo perfil ou enum.
NUTRICIONISTA e COLABORADOR não podem acessar, mesmo se receberem manualmente
o código da permissão.

A permissão `modulo.personalizacao.acessar` está no catálogo e nos padrões de
GERENTE/DEV. Para usuários com PerfilAcesso vinculado, a primeira sessão válida
registra essa entrada e os vínculos aos perfis GERENTE/DEV existentes, em uma
transação nas tabelas já existentes. A sessão é recarregada para refletir o
acesso imediatamente; os demais gerentes recebem o mesmo vínculo de perfil.
Perfis inativos continuam sem acesso. Não há writes em sessões anônimas/inválidas.

A existência da entrada no catálogo impede repetir a concessão em logins
posteriores: remover a permissão na Gestão de Usuários não é desfeito pela
aplicação. A edição e a auditoria existentes foram preservadas, sem alteração
das outras permissões. O fallback de sessão para banco legado foi preservado.

`/personalizacao` agora contém a página administrativa e usa o formulário já
implementado. O menu segue o mesmo controle de permissão, inclusive em dispositivos
móveis. Middleware, página e todas as Server Actions verificam o acesso no
servidor. Salvar, remover logo e restaurar padrões revalidam o layout para atualizar
os relatórios. Upload, prévia e serviços internos server-only foram reutilizados.

Não foi necessária alteração estrutural: a migration de Personalização existente
foi preservada, sem nova migration ou execução no banco real nesta manutenção.
O registro da nova permissão será realizado pela aplicação quando publicada,
após uma sessão válida; não foi executado seed.

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

A migration `20261002000100_personalizacao_visual` foi reutilizada. O migrate
status desta etapa informou as 53 migrations aplicadas no banco configurado
localmente; não houve aplicação por esta manutenção, nem confirmação do vínculo
desse banco com o serviço publicado. Ela cria apenas a nova tabela, FK opcional para usuário,
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

Não foram executados login real/relogin ou deploy/restart de produção.
Os controles administrativos agora foram testados em adapters isolados, incluindo
quatro gerentes vinculados, DEV, negação de NUTRICIONISTA/COLABORADOR, sessão ausente,
perfil com permissão revogada, página e chamadas diretas às três Server Actions.
A action real da Gestão de Usuários foi testada removendo e restaurando essa
permissão, preservando outro vínculo e gerando a auditoria existente.

## Arquivos

Criados: migration; `src/app/personalizacao/personalization-form.tsx`;
`src/components/report-identity-mark.tsx`; `src/lib/report-identity.ts`;
`src/lib/visual-personalization.ts`; `src/lib/hotel-logo-upload.ts`;
`scripts/test-visual-personalization.cjs`; `scripts/test-visual-personalization-print.cjs`;
este documento.

Ativação de acesso: criados `src/app/personalizacao/page.tsx`,
`src/app/personalizacao/actions.ts`, `src/lib/personalization-permission.ts` e
`scripts/test-personalization-access.cjs`; alterados `src/lib/permissions.ts`,
`src/lib/modules.ts` e `src/lib/auth-session.ts`.

Alterados: `prisma/schema.prisma`; package.json/package-lock.json;
`src/components/forms/image-upload-field.tsx`; `src/lib/monthly-sanitary-report.ts`;
as sete rotas mensais acima; `src/app/relatorios/page.tsx`;
`src/app/relatorios/components/report-actions.tsx`; `scripts/test-bpma-adjustments.cjs`.

## Evoluções possíveis

Em etapas futuras, podem ser acrescentados rodapé institucional,
endereço/contato, logo específica para impressão e cores institucionais.
Nenhum campo para essas evoluções foi criado nesta etapa.

## Validações técnicas finais

- `npm.cmd run prisma:generate`: passou, Prisma Client 6.5.0 gerado.
- `npx.cmd prisma validate`: schema válido.
- `npm.cmd run lint`: passou sem warnings ou erros do ESLint.
- `npm.cmd run build`: passou, incluindo compilação, tipos e geração das rotas.
- `git diff --check`: passou; Git informa apenas a normalização LF/CRLF configurada.
- Git da implementação inicial: branch `main`, 15 arquivos rastreados modificados
  e nove entradas novas, sem commit ou push naquela etapa. Na ativação atual:
  quatro arquivos rastreados modificados e quatro novos, sem commit ou push.

A integridade da migration foi conferida contra o model: tipos, nulabilidade,
default do ID, timestamps, chave primária e relação para Usuario correspondem
ao schema. As constraints adicionais limitam a configuração a um registro e a
imagem a 2 MB. O banco publicado não foi auditado diretamente nesta ativação.

Na ativação de acesso, lint e build passaram, assim como os testes de acesso,
upload/relatórios e reabertura mensal. A conferência final de diff também passou.
Prisma Client foi gerado novamente e migrate status não encontrou pendências
no banco configurado. Os testes funcionais usaram apenas adapters isolados.
As únicas mudanças na sessão são o registro inicial da permissão e a recarga
dos vínculos nesse momento. Regras operacionais, assinaturas e fechamentos não
foram alterados. Não foi utilizado db push, seed, reset, commit ou push nesta etapa.
