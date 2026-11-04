# Ajustes finais — etiquetas, relatórios e acesso à revisão do Óleo

Branch preservada: `estabilizacao/experiencia-anterior-2026-10-28`.
Base local desta etapa: `47717d3`.
Não houve consulta nem escrita no banco real. Os testes utilizaram exclusivamente
PostgreSQL sintético em 127.0.0.1:55479. `.env`, schema, migrations, permissões,
reabertura e mecanismos de persistência das assinaturas foram preservados.
Sem commit, push ou deploy executados nesta etapa.

## Etiquetas e distinção das revisões

Assinaturas técnicas convencionais e retroativas vigentes agora usam a etiqueta
verde **Assinado pelo Supervisor**, seguida do nome, perfil e data/hora real.
O detalhe **Assinatura retroativa** aparece discretamente, sem utilizar o mecanismo
extenso como etiqueta principal. O valor original de `mecanismo` continua no banco.

Revisões gerenciais/operacionais continuam com etiqueta própria e indicação de
que não substituem validação técnica quando exigida. Registros sem assinatura
vigente ou com somente evidência revogada continuam pendentes. A consulta individual
do Óleo e o detalhe do serviço de Amostras utilizam o mesmo componente de status.

Arquivos envolvidos:

- `src/lib/review-presentation.ts`.
- `src/components/historico/technical-signature.tsx`.
- `src/app/controle-buffet-amostras/service-history.ts`.
- `src/app/controle-buffet-amostras/workflow-history.ts`.
- `src/app/controle-buffet-amostras/historico/legacy-page.tsx`.
- `src/app/controle-qualidade-oleo/saved-record-page.tsx`.
- `src/app/controle-qualidade-oleo/workflow-view.tsx`.

Não se altera perfil, versão, instante da assinatura, autoria, mecanismo, ressalvas
ou eventos para mudar a etiqueta.

## Relatórios

As sete rotas mensais deixaram de chamar `appendRetroactiveReviews`:

1. `src/app/relatorios/controle-buffet-amostras/mensal/route.ts`.
2. `src/app/relatorios/controle-qualidade-oleo/mensal/route.ts`.
3. `src/app/relatorios/controle-temperatura-equipamentos/mensal/route.ts`.
4. `src/app/relatorios/higienizacao-hortifruti/mensal/route.ts`.
5. `src/app/relatorios/plano-limpeza-diario/mensal/route.ts`.
6. `src/app/relatorios/plano-limpeza-semanal/mensal/route.ts`.
7. `src/app/relatorios/rastreabilidade-recebimento/mensal/route.ts`.

O helper sem consumidores `src/lib/retroactive-report.ts` foi removido. Nenhuma
dessas rotas acrescenta o título, seção ou listagem de justificativas ao final.
Nome, natureza gerencial quando aplicável, data e horário reais da assinatura
vigente ficam na célula de supervisão correspondente. A assinatura técnica
retroativa é identificada sucintamente, sem uma listagem de ressalvas.

Na Limpeza Semanal, o JSON de auditoria da revisão também deixou de ser impresso
como observação do supervisor. Observações operacionais normais continuam
impressas. Nada foi removido da coluna no banco.

O relatório continua com registros, valores sanitários, responsáveis originais,
datas, status, cabeçalhos, fechamento e evidências previstas no layout original.
As consultas internas e administrativas de revisão continuam exibindo a auditoria.

## Causa reproduzida no Óleo

A falha foi reproduzida com Next de produção, autenticação real e dados sintéticos:

1. O mesmo registro era elegível em `retroactiveReviewScope`, com acesso ao módulo,
   permissão retroativa efetiva e competência reaberta.
2. O Histórico oferecia por registro **Revisar e assinar**, **Editar** ou
   **Consultar registro**, levando à consulta que oferecia o caminho convencional.
3. A assinatura convencional consultava `oilRecordSignatureEligibility`, que
   recusava a autoria inconclusiva e evidência de vínculo legado.
4. Faltava a ação direta para a modalidade retroativa no registro histórico.
5. Nos registros sem fluxo, a seção explicativa também era omitida pelo teste
   `unit?.preenchimentoCompleto`, embora o registro legado existisse.

Portanto, o bloqueio reproduzido ocorre **antes do formulário retroativo correto**.
Não foi necessário remover os bloqueios da assinatura convencional nem alterar
o serviço transacional retroativo. Não se presume que as permissões ou o estado
da competência em produção permaneçam iguais ao diagnóstico anterior: esse banco
não foi acessado nesta etapa.

## Correção do acesso

Criado `src/app/controle-qualidade-oleo/retroactive-access.tsx`, reutilizando a
elegibilidade do serviço existente. O Histórico e a consulta individual usam esse
mesmo acesso. A consulta por chave já encaminha registros salvos à consulta
individual, portanto também recebe a correção.

- Elegível: **Assinar retroativamente**, direcionando ao formulário existente com
  `modulo=oleo`, data e `fluxo=<id>` ou `legado=<id>` corretos.
- Competência fechada: informa a necessidade de reabertura autorizada.
- Permissão ausente: identifica `modulo.oleo.assinar_retroativo` e acesso ao módulo.
- Conteúdo incompleto/divergente: mostra a razão retornada pela validação real.
- Assinatura técnica já vigente: preserva a assinatura e não oferece duplicação.
- Revisão não técnica vigente: mantém a distinção e a possibilidade já existente
  de complemento técnico autorizado.

Arquivos adicionais envolvidos:

- `src/app/controle-qualidade-oleo/historico/legacy-history.tsx`.
- `src/app/controle-qualidade-oleo/saved-record-page.tsx`.
- `src/components/compatible-day-review.tsx`.

A confirmação continua exigindo justificativa, senha e reconhecimento explícito.
O servidor continua revalidando usuário, permissões, competência, versão e token;
a gravação mantém a mesma transação, auditoria e atualização dos indicadores.

## Casos prioritários e preservação

| Equivalente sintético | Data | Antes | Depois da ação no Histórico |
| --- | --- | --- | --- |
| 117 | 11/10 | Sem fluxo; autoria inconclusiva; convencional indisponível | Adoção e revisão técnica persistidas |
| 118 | 12/10 | Sem fluxo; autoria inconclusiva; convencional indisponível | Adoção e revisão técnica persistidas |
| 121 | 23/10 | Versionado; vínculo legado e revogação anteriores | Nova assinatura vigente; eventos antigos intactos |
| 122 | 24/10 | Versionado; vínculo legado e revogação anteriores | Nova assinatura vigente; eventos antigos intactos |
| 127, controle | 25/10 | Assinatura técnica válida | Snapshot integral permaneceu idêntico |

Nos quatro casos, o navegador verificou a persistência, FECHADO no fluxo, etiqueta
de assinatura no Histórico e ausência de nova ação duplicada. Comparou todos os
campos operacionais antes/depois; na adoção, somente vínculo e timestamp de
atualização podem mudar. Temperatura, fita, responsável, observação, horário e
data operacional permaneceram iguais. Os eventos anteriores foram comparados
integralmente. Os IDs reais de produção não foram utilizados em writes.

Os testes de integração confirmaram que revisões técnicas válidas resolvem a
pendência técnica aplicável; revisões gerenciais permanecem distintas. Houve
também uma falha sintética de auditoria durante adoção do Óleo: o rollback
preservou o registro original sem fluxo e não deixou assinatura, versão ou vínculo
parcial. A falha P0001 intencional no log desse teste comprova a reversão.

## Validações e evidências

- Prisma Generate 6.5.0: passou.
- TypeScript: passou.
- Lint: passou sem warnings/erros do ESLint.
- Build: passou com Next.js 15.5.12 / Node.js 22.23.4.
- `test-retroactive-review.cjs`: 22 grupos, incluindo elegibilidade do acesso do
  Óleo, senha errada, justificativa/confirmação ausentes, token inválido, permissão,
  competência fechada e rollback específico da adoção.
- `test-supervision-signatures.cjs`: 22 grupos dos sete módulos passaram.
- `test-monthly-reopening.cjs`: sete módulos, autorização, estado, rollback e
  relatórios passaram.
- `test-buffet-history.cjs`: passou no PostgreSQL local portátil.
- `test-retroactive-review-browser.cjs`: fluxo real pelo Histórico, Amostras,
  Limpeza, quatro registros de Óleo, assinatura técnica e gerencial, mensagens e
  persistência. Viewports 1440 e 390; o primeiro caso de Óleo usa viewport mobile.
- Oito PDFs cobrem os sete módulos e incluem assinatura convencional, técnica
  retroativa, gerencial, pendências e múltiplas revisões históricas.
- Extração de texto de cada página confirma ausência do apêndice e de páginas
  vazias; responsável e data/hora real foram conferidos nas células de assinatura.
- PDFs renderizados em imagens para inspeção visual da paginação, tabelas e
  assinaturas dos sete módulos. A galeria e a ampliação de Óleo foram inspecionadas;
  a inspeção visual é amostral, não abrange cada página dos PDFs extensos.
- `git diff --check`: passou.

Evidências locais ignoradas, sem inclusão no Git:
`.data/validation/retroactive-review/`:

- `oil-reproduction-before.json` e `oil-before.png`.
- `results.json`, `oil-browser-results.json` e `browser-results.json`.
- `pdf-results.json`, oito PDFs e `pdf-visual-gallery.png`.
- Capturas `amostras-supervisor.png` e `oil-<equivalente>-signed.png`.

O renderizador/leitor PDF foi instalado somente no diretório local de validação;
`package.json` e `package-lock.json` do aplicativo não foram alterados.

## Publicação

O bloqueio de acesso do Óleo foi reproduzido e corrigido localmente. A atualização
está apta para homologação e deploy controlado, mediante autorização. Após publicar,
o usuário ainda precisa ter a permissão retroativa efetiva e a competência deve
estar aberta/reaberta; os bloqueios corretos são informados na interface.

Safari em iPhone real não foi validado. Nenhuma conclusão sobre novos estados do
banco publicado foi presumida. Não houve exclusão de dados, remoção de logs,
regularização real, reabertura real, concessão real, migration, seed, reset, db push,
commit, push ou deploy.
