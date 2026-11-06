# Ações corretivas por extenso nos relatórios

KPlatz, branch `estabilizacao/experiencia-anterior-2026-10-28`, HEAD inicial
`98b2b6c`. Git inicialmente limpo; alterações anteriores preservadas.

## Causa e correção

A rota mensal de Temperatura contava descrições repetidas. Textos com mais de
36 caracteres e mais de uma ocorrência eram substituídos por AC1, AC2 etc., com
numeração própria de cada equipamento/relatório. O texto completo aparecia apenas
na legenda “Ações corretivas referenciadas no quadro”.

Foram removidos a geração de códigos, a substituição do conteúdo das células,
o tipo `actionLegend`, sua renderização e seu estilo. Cada célula continua usando
o texto original escapado para HTML, sem criar abreviação ou versão aproximada.
Para equipamento em manutenção, a descrição armazenada passa a ter precedência
sobre o fallback “Em manutenção”; antes, esse ramo ocultava a descrição existente.
O fallback permanece quando não há descrição gravada.

A tabela de orientações sanitárias “Ação corretiva para equipamentos de
refrigeração e congelamento”, incluindo faixas de temperatura e orientações de
equipamentos a quente, foi preservada integralmente.

As células mantêm quebra de linha, altura variável e a fonte existente. Não houve
redução da fonte. Relatórios que cabem continuam com um equipamento por página
A4 paisagem. Para conteúdo que excede a página, o cabeçalho repetido da tabela
agora identifica equipamento, competência e “quadro com continuação”. Essa linha
aparece somente na impressão dos quadros cujo conteúdo excede o espaço disponível,
aproveitando a detecção de overflow já existente.

## Auditoria das outras emissões

Foram inspecionadas as sete rotas mensais, os formatadores compartilhados, a página
de relatórios/serviço consolidado e a exportação alternativa. Não foi encontrado
outro gerador equivalente de ACn ou legenda dinâmica de abreviações operacionais.
Não foi necessário alterar os relatórios de Óleo, Buffet/Amostras, Hortifruti,
Rastreabilidade, Limpeza Diária e Limpeza Semanal.

A rota antiga de relatório mensal de Hortifruti redireciona para a emissão mensal
atual e conserva mês/ano. A exportação editável permanece desativada (HTTP 410),
orientando a emissão de PDF pela interface. Não foi modificada.

As emissões analisadas geram HTML dinamicamente e o navegador cria o PDF. Não
existe nessas rotas persistência automática de arquivos PDF mensais no servidor.
Ao reemitir setembro, outubro, novembro ou outra competência, o mesmo renderizador
usa a apresentação corrigida, sem atualizar registros ou versões históricas.
PDFs anteriormente baixados/salvos pelo usuário permanecem como estavam; devem ser
reemitidos pela interface se desejada a nova apresentação, preservando os originais.
Arquivos de validação local não são arquivos oficiais armazenados pela aplicação.

Se um valor armazenado for literalmente AC1, não há correspondência permanente
confiável nesse mecanismo: o significado de AC1 variava conforme o conjunto de
textos do equipamento e da emissão. Não foi criado dicionário arbitrário para
expandir dados históricos desconhecidos. O teste sintético desse caso preserva
AC1 literalmente. Não foi consultado o banco real para alegar que tais registros
existem ou que exigem regularização.

## Testes e evidências

`scripts/test-temperature-full-actions.cjs` usa a GET real com adapter sintético
somente leitura e Chrome real para impressão. As variáveis de conexão ficam em
localhost inválido; qualquer acesso de banco não previsto é recusado pelo adapter.
Nenhum PostgreSQL real ou local foi necessário. O hash do `.env` foi conferido.

O teste reproduz a abreviação com o renderizador de HEAD anterior à correção e
compara o comportamento novo. Abrange ações curtas, longas, repetidas e únicas;
textos diferentes, caracteres especiais/escaping; INATIVO, MANUTENCAO, conforme,
alerta e crítico; dois turnos, múltiplos equipamentos e meses de 30/31 dias.

| Emissão sintética | Páginas | Resultado |
|---|---:|---|
| Setembro/2026, conteúdo curto | 1 | Um equipamento, textos integrais |
| Outubro/2026, conteúdo curto | 1 | Um equipamento, 31 dias |
| Novembro/2026, conteúdo curto | 1 | Um equipamento, 30 dias |
| Outubro/2026, ações variadas e dois equipamentos | 3 | Primeiro quadro continua; segundo começa em página própria |
| Outubro/2026, texto excepcional repetido nos 31 dias | 31 | Conteúdo integral, continuação identificada em todas as páginas |
| Setembro/2026, valor literal AC1 | 1 | Dado original preservado, sem legenda automática |

Essas contagens descrevem a massa sintética, não um relatório real do hotel.
Os textos completos foram comparados nas células HTML e extraídos dos PDFs.
Temperaturas, horários, responsáveis e supervisores foram conferidos. As páginas
foram verificadas como A4 paisagem, sem páginas vazias, sem conteúdo de texto fora
dos limites físicos do PDF e sem overflow interno das células. Todas as páginas
identificam o equipamento; o botão de impressão invocou `window.print()`.

Evidências locais ignoradas pelo Git:

- [Galeria das páginas renderizadas](../.data/validation/temperature-full-actions-20261106/galeria-pdfs.png).
- [Continuação de outubro](../.data/validation/temperature-full-actions-20261106/outubro-varios-equipamentos-pagina2.png).
- [PDF de outubro com dois equipamentos](../.data/validation/temperature-full-actions-20261106/outubro-varios-equipamentos.pdf).
- `results.json`, HTMLs e demais PDFs no mesmo diretório.

Foram inspecionadas visualmente as páginas renderizadas: quadro de uma página,
primeira página e continuação do quadro longo, equipamento seguinte e caso
excepcional. Os textos não se sobrepõem; a tabela sanitária e as assinaturas
permanecem legíveis na dimensão original do PDF.

`test-monthly-reopening.cjs` passou nos sete módulos, incluindo rotas mensais,
fechamento/reabertura, autorizações e preservação de evidências, em adapter isolado.

Prisma Generate 6.5.0, `tsc --noEmit`, lint sem warnings/erros e build completo
Node 22.23.4 / Next 15.5.12 passaram. `git diff --check` passou. A geração e o build
receberam DATABASE_URL/DIRECT_URL de localhost inválido, preservando o `.env` e
impedindo uso do banco externo. Não foi necessário instalar dependências.

## Arquivos e publicação

- Alterado: `src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts`.
- Criados: `scripts/test-temperature-full-actions.cjs` e este documento.

Não houve acesso ao banco real, alteração de dados/cadastros/assinaturas, migration,
seed, reset, db push, mudança de `.env`, commit, push ou deploy. O Multitenant não
foi acessado. A publicação ainda depende de autorização.

Git final: mesma branch de estabilização, um arquivo rastreado modificado e dois
novos (teste e documentação), sem staging. PDFs, HTMLs e capturas estão ignorados
pelo Git. A correção está apta para publicação autorizada.
