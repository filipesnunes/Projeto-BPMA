# Referências sanitárias no encerramento diário de Amostras

Implementação local no KPlatz, branch
`estabilizacao/experiencia-anterior-2026-10-28`, HEAD inicial `f355e50`.
Git inicialmente limpo; as alterações anteriores foram preservadas.

## Agrupamento e apresentação

As tabelas existentes continuam organizadas por serviço, com os mesmos produtos,
temperaturas, ações, responsáveis, assinaturas, datas e avisos de rascunho.
Foi acrescentada a data operacional formatada ao objeto interno de apresentação
de cada serviço, inclusive dos rascunhos. Não é um campo de banco.

`renderServices()` agrupa essas tabelas pela data ISO, ordena os dias e renderiza
um contêiner `.day-block` para cada data. Após **todos** os serviços do dia,
`renderDailySanitaryReferences()` acrescenta uma única tabela de alimentos quentes
e frios e uma única legenda numerada das três ações corretivas.

Os oito textos foram transcritos do pedido, incluindo a referência de carnes e
pescados crus. São informações estáticas de apresentação; nenhuma regra sanitária
de validação foi alterada. Não são novos códigos nem substituições das ações
corretivas preenchidas pelos usuários.

## Paginação

- A4 retrato, margens, fonte e tabelas operacionais existentes preservados.
- O dia seguinte inicia em nova página. As quebras existentes entre serviços
  de um mesmo dia foram mantidas.
- As referências ficam fora do `tfoot`, que é repetido pelo navegador. Assim,
  não aparecem em cada página nem em cada serviço.
- `break-inside: avoid-page` e `page-break-inside: avoid` mantêm o bloco completo.
  Se não couber no espaço restante, ele passa inteiro para a próxima página
  **da mesma data**, identificada no título “Referências sanitárias — DD/MM/AAAA”.
- Não há limite artificial de duas páginas, redução de fonte ou cálculo novo de
  paginação em JavaScript. Dias pequenos podem caber em uma página; dias muito
  extensos podem usar mais de duas.
- O bloco usa fundo branco, bordas discretas, espaçamento compacto e listas
  numeradas. `white-space: normal` é aplicado somente à tabela de referências,
  evitando que a indentação HTML crie linhas vazias nas células.
- Quando não há registros nem serviços em rascunho, não é criado um bloco diário
  fictício; a mensagem de relatório vazio foi preservada.

O teste excepcional inicialmente mostrou que pedir simultaneamente para manter o
bloco junto da tabela anterior e impedir sua divisão gerava conflito no Chrome.
Foi removida a restrição de manter junto da tabela anterior. O bloco agora permanece
inteiro sem impedir a quebra necessária antes dele.

## Testes com PDFs reais

`scripts/test-buffet-daily-references.cjs` chama a GET real com adapter sintético
somente leitura e imprime com Chrome real. Não acessa PostgreSQL nem carrega
configurações de conexão do `.env`; DATABASE_URL/DIRECT_URL do processo apontam
para localhost inválido. O hash do `.env` é conferido ao final.

| Cenário sintético | Dias | Páginas | Resultado |
|---|---:|---:|---|
| Um dia, 33 itens | 1 | 2 | Bloco completo na página 2 |
| Dois dias, 33 e 34 itens | 2 | 4 | Uma referência por data |
| Outubro completo, 31 dias com 33/34 itens | 31 | 62 | Duas páginas por dia |
| Setembro, dias 29 e 30 | 2 | 4 | Emissão histórica corrigida |
| Novembro, dias com 34 e 12 itens | 2 | 3 | Dia pequeno sem página artificial |
| Dois serviços na mesma data e outro dia pequeno | 2 | 5 | Primeiro dia: bloco só após ambos os serviços |
| Dia excepcional com textos extensos e dia seguinte | 2 | 20 | Primeiro dia: referências na página 19; próximo dia na 20 |
| Serviço em rascunho junto de registros persistidos | 2 | 3 | Avisos e conteúdo preservados; uma referência por data |
| Sem registros | 0 | 1 | Mensagem anterior, sem referências fictícias |

As contagens são da massa sintética, não de dados do hotel. Os cenários incluem
itens extras e Não servido. As tabelas e assinaturas foram comparadas ao renderizador
anterior (`f355e50`) e permaneceram iguais. O array de entrada também foi comparado
antes/depois, sem alterações.

Cada PDF foi validado por extração de texto: uma ocorrência do bloco por data,
todos os oito textos e a legenda na mesma página, todos os registros da data antes
das referências e a próxima data somente depois da página de encerramento anterior.
Não houve páginas vazias, cortes de texto nos limites físicos do A4 ou overflow
das células. O botão de impressão também foi acionado no Chrome.

Foram renderizadas e inspecionadas visualmente as duas páginas de um dia completo,
o encerramento de um dia com dois serviços e o encerramento do mês completo.

### Evidências locais

- [Dia completo, duas páginas](../.data/validation/buffet-daily-references-20261106/um-dia-33.pdf).
- [Imagem da segunda página](../.data/validation/buffet-daily-references-20261106/um-dia-33-pagina2.png).
- [Outubro completo, 31 dias](../.data/validation/buffet-daily-references-20261106/mes-completo-10.pdf).
- [Galeria visual](../.data/validation/buffet-daily-references-20261106/galeria-pdfs.png).
- HTMLs, demais PDFs e resultados por data em `results.json`, no mesmo diretório.

Esses arquivos são sintéticos e ignorados pelo Git. PDFs já exportados por usuários
não foram sobrescritos. Reemitir uma competência histórica usará a nova apresentação
após publicação autorizada.

## Arquivos e validação técnica

- Alterado: `src/app/relatorios/controle-buffet-amostras/mensal/route.ts`.
- Criado: `scripts/test-buffet-daily-references.cjs`.
- Ajustado: `scripts/test-temperature-full-actions.cjs`, somente para fixar a
  comparação histórica em `98b2b6c`, que contém a abreviação original. Usar HEAD
  deixava essa reprodução inválida depois do commit da correção de Temperatura.
  Nenhuma rota ou regra de Temperatura foi alterada nesta etapa.
- Criado: este documento.

Passaram os testes de referências diárias, os PDFs de Temperatura por extenso e
`test-monthly-reopening.cjs` nos sete módulos, incluindo as rotas mensais,
fechamento/reabertura e preservação de evidências, em adapters isolados.

Na versão final compacta, `tsc --noEmit`, lint sem erros/warnings e build completo
de produção Node 22.23.4 / Next 15.5.12 passaram. `git diff --check` passou.
Os nove cenários de PDF foram executados novamente na versão final, incluindo
a comparação de tabelas e assinaturas, os limites físicos do PDF e a inspeção
visual das páginas renderizadas. Não foi necessário instalar dependências.

Não houve acesso ou alteração de banco, migration, seed, reset, db push, mudança
do `.env`, alteração de permissões ou assinatura. Não houve commit, push ou deploy.
O Multitenant não foi acessado.

Git final: mesma branch de estabilização, dois arquivos rastreados modificados
e dois novos (teste e documentação), sem staging. Evidências locais ignoradas
pelo Git. Código apto para publicação autorizada; produção não foi homologada
ou modificada por esta manutenção.
