# Salvamento com logomarca existente — BPMA/KPlatz

## Causa e correção

O input de arquivo não preenchido pode chegar como `logoHotel = ""` após a
decodificação multipart. O parser já aceitava campo ausente e File vazio sem
nome, mas rejeitava essa string com "Selecione uma imagem válida para a logomarca."
O teste reproduziu a mensagem na Server Action real antes da correção.

`parseHotelLogo` agora retorna null também para a string vazia, antes da validação
de upload. O serviço existente omite os três campos da imagem no update quando
não há nova imagem, preservando bytes, MIME e nome original. Arquivos selecionados
com nome, mesmo sem bytes, continuam sendo validados e rejeitados quando inválidos.

O formulário já mantém a prévia existente e não exige o upload nem preenche o
input com a imagem cadastrada. A remoção e a restauração continuam nas actions
explícitas existentes. Não foi necessário alterar formulário, serviço, actions,
permissões, schema ou migrations.

## Validação

- `test-personalization-existing-logo.cjs`: multipart real e Server Actions reais,
  com Prisma e sessão isolados; GERENTE e DEV; cor primária/secundária, fonte,
  tema, dimensões, nome, tamanho de texto e mudanças simultâneas sem arquivo.
- Bytes, MIME e nome original preservados; nova leitura e identidade do relatório
  preservadas; configurações não editadas mantidas; validação de upload não invocada.
- PNG, JPEG e WebP válidos; rejeição de arquivo vazio com nome, falso, truncado,
  MIME incompatível, SVG e mais de 2 MB sem writes ou perda da configuração anterior.
- Remoção explícita, novo cadastro após remoção, restauração e negação de acesso
  sem sessão, a outros perfis e a gerente com permissão revogada passaram.
- `test-personalization-access.cjs` e `test-visual-personalization.cjs` passaram,
  incluindo formulário/prévia, permissões, ações, persistência e sete rotas mensais.
- Edge isolado: `test-visual-personalization-print.cjs` passou com 77 PDFs,
  logos embutidas, transparência, proporção, contenção e botão de impressão.
- Prisma generate (6.5.0), Prisma validate, lint, build e git diff --check passaram.
  Build registrou aviso de base Browserslist antiga; lint sem warnings/erros ESLint.

O salvamento usa a lógica real da aplicação e decodificação multipart real, mas
persistência sintética em memória. Não foi realizado salvamento autenticado em
produção. Os PDFs foram verificados pelo navegador/script, sem inspeção manual
em leitor de PDF. Artefatos ficam em `.data/validation`, ignorado pelo Git.

## Publicação e escopo

A correção ainda precisa ser publicada pelo fluxo normal do projeto.
Nenhuma migration nova é necessária. Nenhum banco foi alterado por esta manutenção.
Tenant-refactor, módulos operacionais, assinaturas e fechamentos não foram alterados.
Sem seed, reset, db push, commit ou push.

Git final: branch main, um arquivo rastreado modificado (`hotel-logo-upload.ts`)
e dois novos (teste de regressão e este documento).
