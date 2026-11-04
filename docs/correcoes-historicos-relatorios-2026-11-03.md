# Assinaturas, registros históricos e relatórios — 03/11/2026

## Escopo e segurança

BPMA/KPlatz, branch `estabilizacao/experiencia-anterior-2026-10-28`, HEAD inicial
`111815d`, Git inicialmente limpo. Multitenant não foi acessado ou alterado.

O destino externo configurado foi tratado como produção e acessado **somente para
leitura**, em transações `READ ONLY`/Repeatable Read, sem inicializar sessão ou
cadastro de permissões. A ligação desse destino ao serviço Railway publicado
continua sem confirmação. Não foram exibidas credenciais ou URLs de conexão.

A captura consistente dos domínios Óleo/Amostras ocorreu em
`2026-11-03T22:25:57.891Z` (19:25:57 em São Paulo). Ela não copia senhas, tokens ou
sessões. **Não é um backup completo de produção.** A possibilidade de recuperar
integralmente o banco de produção ainda precisa ser comprovada antes de qualquer
regularização real.

As simulações ocorreram exclusivamente em novas bases PostgreSQL locais na porta
55479. Foram importadas as evidências capturadas, com conferência de hashes de 16
tabelas. Contas, sessões e aferições adicionais dos testes são sintéticas. As
migrations existentes foram aplicadas somente às bases locais vazias. Nenhuma
migration nova, mudança de schema ou execução de migration externa foi necessária.

## A. Óleo

### Causa e situação da proteção

O bridge antigo exigia permissão individual e senha, sem exigir cumulativamente
NUTRICIONISTA/responsável técnico nem impedir autoassinatura. O bypass administrativo
de permissões também era insuficiente como prova de habilitação. A diária antiga
não garantia segregação. A reprodução histórica está documentada em
`oleo-seguranca-assinaturas-2026-10-30.md`.

A proteção já existente na branch passou novamente nos testes de revisão
individual, diária, Histórico e actions compartilhadas: usuário/sessão ativos,
NUTRICIONISTA, `usuarios.responsavel_tecnico`, permissão do mecanismo, senha,
autoria independente, competência aberta, conteúdo e versão elegíveis. COLABORADOR,
GERENTE e DEV não recebem habilitação técnica por privilégio administrativo.
Chamadas diretas às actions não dispensam as verificações. Não foi possível
atestar que o código atualmente publicado é idêntico à branch local.

A autorização mensal dos outros módulos foi preservada, conforme decisão anterior
do usuário. O risco de privilégios administrativos no fechamento mensal desses
outros módulos permanece registrado em `supervisao-assinaturas-2026-11-02.md`.
Nenhum fechamento existente foi alterado nesta manutenção.

### Evidências históricas

A auditoria percorreu registros, assinaturas diárias, fluxos, versões, vínculos,
eventos e logs. O perfil considerado para a conclusão é o **snapshot histórico da
assinatura**, não o perfil atual. As contagens da auditoria representam evidências,
que podem apontar para o mesmo registro: A=0, B=5, C=3, D=232; 120 registros únicos
no escopo. B comprova COLABORADOR; C comprova autoassinatura; D significa falta de
prova suficiente da política histórica, **não invalidação comprovada**.

Foram comprovadas oito assinaturas vigentes de Anderson Fiorenzano, usuário 11,
perfil histórico COLABORADOR, mecanismo `REVISAO_INDIVIDUAL`. A proposta restringe-se
a elas. A lista exata aparece no anexo de IDs abaixo.

A assinatura de Camila Reinaldo, NUTRICIONISTA, no registro **127 de 29/10/2026**,
ID `cmvv1i13z01cnqg0x1qis3tbi`, ficou fora do plano e permaneceu idêntica na cópia.
A ausência de um snapshot antigo completo da política não foi tratada como prova
de irregularidade dessa assinatura ou das outras evidências inconclusivas.

### Procedimento preparado, sem execução real

`regularize-historical-records.cjs` gera propostas offline e possui modos explícitos
de simulação/aplicação. Não é importado por páginas, actions, startup, migrations ou
rotinas recorrentes. A API interna usa transação Serializable e o lock operacional
do módulo. Antes de qualquer alteração, confere todos os escopos, hashes, versões,
assinaturas vigentes, vínculos e competência. Uma divergência aborta a operação.

Na revogação, apenas o apontador de assinatura vigente é limpo e o fluxo passa de
FECHADO para COMPLETO, mantendo sua versão. O evento `REVOGACAO_ASSINATURA` guarda
assinatura original, escopo, motivo, operador, autorizador, referência da aprovação,
data real, backup, estado anterior/posterior e hash operacional. Assinatura antiga,
vínculos e versões são mantidos. Não há substituição retroativa de assinante.

A página identifica a evidência como revogada e o registro como pendente de
assinatura válida. O relatório deixa de apresentá-la como vigente. Um bloqueio
adicional na página e no adapter impede que a revogação libere edição operacional.
A nutricionista pode revisar e assinar com sua própria senha, identidade e data
reais, respeitando os controles existentes.

Na captura, outubro estava sem fechamento mensal de Óleo. Isso permite revisar
datas anteriores pelos controles existentes; não houve reabertura automática.
Se a competência estiver fechada quando o procedimento for autorizado, a rotina
recusa a operação até a reabertura formal em Gerenciamento de Períodos.

**Pendência adicional:** os registros 121 e 122 foram adotados de legados e não
possuem prova suficiente do ID do executor original. Sua assinatura irregular pode
ser revogada, mas uma nova revisão permanece bloqueada até comprovação formal da
autoria. Não se inferiu identidade pelo nome nem se fabricou evento de execução.

### Simulação e integridade

As oito revogações foram simuladas. Foram preservados os 123 registros operacionais
de Óleo, as nove assinaturas originais e as 56 versões originais dos domínios
capturados. Os registros 128 e 129 receberam novas assinaturas de uma nutricionista
**sintética local**, na data real do teste. A assinatura real de Camila permaneceu
vigente e inalterada. Não houve assinatura nova no banco externo.

Testes adicionais recusaram ausência de backup/aprovação, plano adulterado,
escopo desatualizado, competência fechada e edição durante a revogação. A mesma
simulação foi repetida em uma segunda cópia consistente após os ajustes finais.

## B. Buffet / Amostras

### Correção anterior e causa histórica

Os testes reproduzem o código anterior rebaixando um item preenchido para PENDENTE
quando campos ausentes eram convertidos em vazios ou a validação retroativa de
horário falhava dentro do salvamento parcial. Os valores permaneciam persistidos,
mas o status era rebaixado. A correção anterior em `row-save.ts` e nos adapters
continua funcionando na branch: campos omitidos preservam dados; erros de validação
revertem a operação; apagamento intencional cria pendência coerente. Não foi
necessário reescrever essa lógica nesta etapa. Ela não saneia históricos antigos
automaticamente. Referência: `buffet-pendencias-salvamento-2026-11-02.md`.

A auditoria usa as regras sanitárias reais, incluindo horário retroativo,
ação corretiva para Alerta/Crítico, classificação, Não servido, manifesto e extras.
Temperaturas informadas isoladamente não comprovam conclusão. Status sanitário e
estado de preenchimento permanecem independentes.

### Resultado da leitura e proposta

Foram encontrados **92 itens completos com status incorreto em quatro serviços**,
todos Café da Manhã, serviço 11, de 26 a 29/10. Cada candidato possui campos
persistidos válidos e evidência de versão anterior preenchida. Não há assinatura
vigente nesses quatro serviços. Há ainda dez ocorrências de itens com dados apenas
no rascunho, distribuídas em cinco serviços, incluindo 31/10. Elas não entram na
regularização. As categorias solicitadas são A=92, B=0, C=10, D=0, E=0, contando
achados, não todos os itens do banco.

O contrato antigo `classe` da auditoria foi preservado; `categoriaDiagnostico`
explicita o mapeamento solicitado: A completo/status incorreto; B incompleto;
C apenas rascunho; D validação inválida; E inconsistência/ausência de evidência.
Os casos sintéticos de todas as categorias passaram.

| Data / Café da Manhã | Base / extras | Preenchidos antes → simulação | Não servido | Status corrigidos | Pendências reais após simulação |
|---|---:|---:|---:|---:|---:|
| 26/10 | 33 / 0 | 5 → 21 | 8 | 16 | 4 |
| 27/10 | 33 / 0 | 0 → 26 | 6 | 26 | 1 |
| 28/10 | 33 / 0 | 0 → 26 | 6 | 26 | 1 |
| 29/10 | 33 / 0 | 0 → 24 | 7 | 24 | 2 |
| 30/10 | 33 / 0 | 27 → 27 | 6 | 0 | 0 |
| 31/10 | 33 / 1 | 24 → 24 | 8 | 0 | 2 |

Os quatro serviços corrigidos **continuam parciais**: corrigir estados inconsistentes
não preenche os itens ausentes. Em 31/10 o total esperado é 34, incluindo um extra.
Os dez rascunhos permanecem pendentes. O serviço de 24/10 mantém 28 preenchidos,
cinco Não servido e zero pendências; preenchimento completo e assinatura são etapas
independentes. Nos legados sem manifesto, a quantidade usa o catálogo atual e é
explicitamente identificada como não comprobatória da configuração histórica.

A proposta atualiza somente o status dos 92 IDs revisados, conserva `updatedAt`
operacional original, cria uma nova versão e evento auditável por serviço e
recalcula seus indicadores pelo manifesto histórico. Valores, temperaturas,
autorias, horários, ações, versões anteriores e assinaturas não são reescritos.
Na cópia foram conferidos os **5.306 registros de Amostras** contra a captura;
somente esses 92 status diferiram. Não houve promoção em massa de PENDENTE.

### Causa da omissão no relatório e correção

O middleware de consultas operacionais exclui fluxos incompletos das consultas
diretas a registros. O relatório mensal herdava esse filtro e ainda excluía
Não servido. A rota agora consulta legados sem fluxo e os itens ativos pela relação
do fluxo do mês, mesclando por ID físico. O middleware compartilhado não foi
enfraquecido. Catálogos inativados não eliminam evidências históricas.

Itens persistidos parciais e Não servido aparecem com sua situação real. Serviços
que possuem apenas rascunho recebem uma indicação explícita, sem transformar campos
digitados em aferições. Dados de rascunhos continuam no Histórico. Não se apresenta
um serviço parcial como concluído nem se cria assinatura fictícia.

## C. Listagem técnica nos relatórios

Foi removida apenas a anexação de `renderExecutionReportNotes()` no final das
cinco rotas mensais que a utilizavam: Óleo, Buffet/Amostras, Rastreabilidade,
Limpeza Diária e Limpeza Semanal. A busca em todo `src` não encontrou outras
chamadas; a função utilitária permanece sem chamada de apresentação nos relatórios.

Hortifruti, Temperatura, Relatórios gerais e exportações foram conferidos; nenhum
bloco sanitário legítimo foi removido. As sete rotas mensais foram executadas e
mantiveram Imprimir / Salvar PDF sem a seção “Horários de execução e rastreabilidade”.
As consultas não modificaram registros, versões, assinaturas ou logs, comprovado
por hashes antes/depois. Campos oficiais de data/horário, responsáveis, assinatura
e fechamento foram preservados. Não foram alteradas consultas do Histórico.

## D. Equipamentos: paginação física

### Causa e alteração

As quebras existentes separavam equipamentos, mas não limitavam a altura interna.
A altura mínima de 196 mm, somada ao cabeçalho, tabelas, rodapé e textos corretivos
repetidos em linhas, produzia transbordamento. Na reprodução do HEAD inicial,
quatro equipamentos em outubro geraram **oito páginas físicas**.

O CSS de impressão mantém A4 paisagem, margens de 7 mm, cabeçalho proporcional,
espaçamentos compactos e quebra explícita antes de cada próximo equipamento.
A altura mínima foi retirada. Ações longas repetidas recebem referências AC1/AC2
nas células e texto integral na legenda do próprio equipamento, mantendo o vínculo
dia/turno. Não há `overflow:hidden`, corte de texto ou redução automática de escala.
Temperaturas, responsáveis, observações, manutenção/inativação, justificativas,
ações corretivas e assinatura permanecem no documento.

Observações/justificativas usam tabela com cabeçalho repetido que identifica o
equipamento em eventual continuação. O `beforeprint` identifica conteúdo que
ultrapassa a área útil e apresenta aviso explícito, sem suprimir os dados.

### Impressão real e inspeção

Foram gerados PDFs reais por Edge/Chromium e renderizadas suas páginas em PNG por
Windows.Data.Pdf. Foram inspecionadas visualmente as 12 páginas dos casos normais
e as duas páginas do equipamento excepcional, inclusive seu cabeçalho repetido.

| Cenário | Equipamentos | Páginas físicas | Resultado |
|---|---:|---:|---|
| Antes, 31 dias | 4 | 8 | Transbordamento reproduzido |
| Depois, 28 dias | 4 | 4 | Um equipamento por página |
| Depois, 30 dias | 4 | 4 | Um equipamento por página |
| Depois, 31 dias | 4 | 4 | Um equipamento por página |
| Excepcional, observação de cerca de 10 mil caracteres | 4 | 5 | Primeiro equipamento com continuação identificada; outros três em páginas próprias |

Os casos normais incluem manhã/tarde, alertas, manutenção, inativo, observação,
justificativa de horário e quadro de ações/assinatura. Altura máxima normal de
189,4 mm para área útil de 196 mm. Não houve página em branco, mistura de
equipamentos, corte ou sobreposição observada. A observação excepcional contém
400 evidências numeradas; a última, 399, permanece visível na continuação.

**Limitação explícita:** conteúdo arbitrariamente extenso não cabe fisicamente em
uma página sem perda. Esse caso não cumpre uma página por equipamento; a solução
preserva texto integral em continuação identificada e começa o próximo equipamento
em nova página. Fontes/logos institucionais e volumes excepcionais diferentes
devem passar pela homologação de impressão; não houve teste na impressora do hotel.

## Procedimento futuro de produção e recuperação

1. Conferir o destino efetivamente vinculado ao serviço Railway e atualizar a
   captura somente leitura. Não usar a conexão local como prova desse vínculo.
2. Gerar os planos e apresentar IDs, motivo, escopo e hash para autorização
   específica. Se o escopo mudou, os planos deste diagnóstico ficam obsoletos.
3. Obter backup **completo do mesmo destino**, recente, com restauração testada.
   Registrar arquivo, SHA-256, identificação, captura e verificação. A cópia de
   domínios deste teste não atende a essa condição.
4. Repetir a simulação do plano aprovado em cópia isolada e verificar integridade.
   Competências fechadas exigem reabertura formal previamente autorizada.
5. Somente após essa autorização, um operador DEV ativo executa o modo manual
   `apply`, com referência da aprovação, autorizador, justificativa, fingerprint
   confirmado, backup e resultado de simulação do mesmo hash. O CLI exige flags
   explícitas, backup com destino correspondente e idade máxima de 24 horas. Nada
   disso está integrado ao deploy. **Esse modo não foi executado nesta etapa.**
6. Conferir apontadores/status, eventos, dados originais, versões e assinaturas
   válidas antes de disponibilizar as novas revisões às nutricionistas.
7. As nutricionistas revisam os dados e usam sua própria senha. Não liberar edição
   operacional para tratar somente assinatura. Os legados 121/122 continuam com
   a dependência de comprovação formal de autoria.

Qualquer erro durante a aplicação reverte toda a transação. Após uma aplicação
confirmada, uma recuperação exige nova autorização e conferência do estado atual:
usar os estados anteriores e hashes do evento para uma compensação restrita aos
IDs, com novo evento e sem apagar a intervenção. Não ressuscitar automaticamente
assinatura comprovadamente indevida, não sobrescrever revisão legítima posterior
e não restaurar um backup antigo sobre novos lançamentos do hotel. Para falha de
infraestrutura, restaurar primeiro em destino isolado, conferir e definir a
recuperação supervisionada. Não foi criado rollback automático de dados históricos.

## Validações e artefatos

- TypeScript (`npx.cmd tsc --noEmit`): passou.
- Lint (`npm.cmd run lint`): passou sem erros/warnings ESLint.
- Build de produção (`npm.cmd run build`): passou, compilação, tipos e rotas.
- Prisma Client (`npm.cmd run prisma:generate`): passou, 6.5.0; sem mudança de schema.
- `test-supervision-signatures.cjs`: 22 cenários, sete módulos, PostgreSQL local.
- `test-buffet-pending.cjs`, `test-buffet-history.cjs`, `test-buffet-order.cjs`:
  passaram em bases sintéticas isoladas; `.env` preservado.
- `test-historical-maintenance.cjs`: passou em duas cópias consistentes locais.
- `test-historical-report-corrections.cjs`: sete GETs reais, integridade e fixtures
  de impressão passaram.
- `test-equipment-report-pagination.cjs`: PDFs de 28/30/31 dias e excepcional
  passaram; inspeção dos PDFs renderizados concluída.
- `git diff --check`: passou com a normalização LF/CRLF configurada; os 22
  arquivos alterados/novos também foram conferidos sem espaços finais.
- Git final: mesma branch de estabilização, 12 arquivos rastreados modificados e
  dez arquivos novos; sem commit ou push. Nenhum arquivo anterior do usuário
  foi descartado.

O build apenas informa avisos de manutenção do Next lint e da base Browserslist;
não foi realizada atualização de dependências fora deste escopo.

Artefatos sensíveis ficam fora do Git em `.data/validation/regularizacao-20261103/`:
captura consistente, auditorias, planos completos com estados anteriores e hashes,
simulações, conferências de integridade, HTMLs, PDFs e suas imagens renderizadas.
O CSV de IDs propostos permite revisão individual. São evidências locais, não
comprovação de execução ou restauração de produção.

## Arquivos desta manutenção

Alterados: os dois CLIs de auditoria e `scripts/lib/oil-signature-audit.cjs`;
`controle-buffet-amostras/pending-audit.ts`; página salva e adapter de Óleo;
as seis rotas mensais de Óleo, Buffet, Temperatura, Rastreabilidade e Limpeza
Diária/Semanal.

Criados: `controle-qualidade-oleo/signature-revocation.ts`;
`scripts/capture-historical-diagnostics.cjs`,
`scripts/lib/historical-regularization.cjs`,
`scripts/regularize-historical-records.cjs`,
`scripts/simulate-historical-regularization.cjs`,
`scripts/test-historical-maintenance.cjs`,
`scripts/test-historical-report-corrections.cjs`,
`scripts/test-equipment-report-pagination.cjs`,
`scripts/render-validation-pdfs.ps1` e este documento.

## Situação final por ajuste

| Ajuste | Diagnóstico | Correção e testes | Situação | Risco restante / intervenção em produção |
|---|---|---|---|---|
| Óleo | Oito assinaturas técnicas com COLABORADOR; três também próprias | Revogação auditável e bloqueio de edição; oito simulações, duas novas revisões locais e testes de permissões | Código pronto para homologação; dados reais não regularizados | Exige aprovação específica, destino e backup; 121/122 exigem autoria formal para nova revisão |
| Amostras | 92 status inconsistentes em quatro serviços; dez rascunhos em cinco | Plano por ID, nova versão/evento, relatório inclui parciais; integridade de 5.306 registros e regressões | Código pronto; 92 correções reais pendentes de autorização | Dez rascunhos continuam incompletos; não podem ser promovidos automaticamente |
| Listagem técnica | Cinco rotas anexavam bloco redundante | Anexação retirada; sete GETs e hashes preservados | Pronto para homologação/publicação manual | Nenhuma intervenção de dados; validar apresentação no hotel |
| Equipamentos | Altura interna ultrapassava A4; quatro geravam oito páginas | Impressão compacta e legenda; 28/30/31 dias com quatro páginas | Pronto nos casos normais testados | Texto excepcional usa continuação identificada; impressora/configuração real ainda não validadas |

Não houve exclusão de registros/assinaturas, reset, seed, db push, alteração do
`.env`, commit, push ou deploy por esta manutenção. A regularização dos dados reais
permanece pendente de autorização; publicação de código não executa esses planos.

## Anexo — IDs exatos propostos

As tabelas seguintes identificam exclusivamente propostas; nenhuma foi aplicada
no banco externo. Datas operacionais não são datas das assinaturas.


Hash do plano de Óleo: `6102d110f8ef378d507dade9298db380a149017cab6d660f78acfbd45f6ad7a1`.

| Registro de Óleo | Data operacional | Assinatura a revogar | Fluxo / versão | Executor original comprovado |
|---|---|---|---|---|
| 121 | 2026-10-23 | `cmvtnppfh003nlb0xnbqjanmh` | `oil-legacy-121` / 1 | Não comprovado; nova revisão bloqueada |
| 122 | 2026-10-24 | `cmvtnp8l7003glb0x5bc0wwdo` | `oil-legacy-122` / 1 | Não comprovado; nova revisão bloqueada |
| 123 | 2026-10-26 | `cmvtno7f90034lb0x2c7bagk8` | `cmvp33jm4003dno0xvg494g9d` / 2 | 11 |
| 124 | 2026-10-27 | `cmvtnna5v002vlb0xm6f4jj57` | `cmvqh347i00bhno0xbv9s6slw` / 1 | 11 |
| 125 | 2026-10-28 | `cmvtnmq75002qlb0xzihi9qxq` | `cmvs4bybe00hrno0x1iulj8pb` / 1 | 15 |
| 126 | 2026-10-25 | `cmvtnoysg0039lb0xwn65uqxy` | `cmvp32gp9003ano0xs64amiwj` / 2 | 15 |
| 128 | 2026-10-30 | `cmvwikzbd01m5qg0xgtabwdb9` | `cmvv3efvo01ghqg0xqj8ai56x` / 1 | 15 |
| 129 | 2026-10-31 | `cmvwil8dn01maqg0xwfqnqm85` | `cmvwikjof01m0qg0x1pbhx0pm` / 1 | 11 |

Todas têm usuário assinante 11 e perfil histórico COLABORADOR. Datas/horários reais das assinaturas e estados completos estão no plano JSON.

Hash do plano de Amostras: `b22e36006ab613e8b29cc4c066db2b30a4d8f285a33f61b242541e749c8f0898`.

| Serviço / data | Fluxo / versão original | IDs dos itens propostos |
|---|---|---|
| 11:2026-10-26 | `cmvp5mpjo005qno0xf02mumqr` / 15 | 5914, 5915, 5918, 5919, 5920, 5922, 5923, 5925, 5926, 5927, 5928, 5930, 5931, 5932, 5937, 5939 |
| 11:2026-10-27 | `cmvqjot4t00bmno0xkghaips3` / 3 | 5941, 5943, 5944, 5945, 5947, 5948, 5949, 5950, 5951, 5952, 5953, 5955, 5956, 5958, 5959, 5960, 5961, 5962, 5963, 5964, 5965, 5968, 5969, 5970, 5971, 5972 |
| 11:2026-10-28 | `cmvs1is5400f2no0x9zb4n2pt` / 5 | 5974, 5975, 5976, 5978, 5979, 5980, 5981, 5982, 5983, 5984, 5986, 5987, 5989, 5990, 5991, 5992, 5993, 5994, 5995, 5996, 5997, 6000, 6001, 6002, 6003, 6004 |
| 11:2026-10-29 | `cmvtiugqy0000lb0xqx1pijkz` / 3 | 6005, 6006, 6007, 6008, 6009, 6012, 6013, 6014, 6015, 6018, 6019, 6020, 6021, 6022, 6023, 6024, 6025, 6026, 6028, 6029, 6030, 6031, 6032, 6035 |
