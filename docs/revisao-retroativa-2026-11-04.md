# Revisões retroativas e reabertura mensal — KPlatz

Conferência posterior de indicadores, permissões efetivas e PDFs:
[resultado antes do deploy](conferencia-pre-deploy-revisoes-2026-11-04.md).
Esse documento registra as correções adicionais e os resultados atuais.

Implementação local na branch `estabilizacao/experiencia-anterior-2026-10-28`.
Sem commit, push, deploy, migration ou alterações em produção. O Multitenant não
foi acessado. O `.env` foi preservado; testes com persistência usam exclusivamente
PostgreSQL sintético em 127.0.0.1:55479.

## Diagnóstico real, somente leitura

Railway confirmado: StaySafe / production / Projeto-BPMA / Postgres. O deploy
ativo consultado era `3d1f78fbde8624eaf2c05ae4953f418854ade8c1`. A consulta foi
executada em transação PostgreSQL READ ONLY, sem usar rotinas de sessão ou catálogo
da aplicação. Evidências com dados reais permanecem em diretório local ignorado,
fora do Git: `.data/validation/retroactive-review/`.

- Óleo, outubro: 31 registros, **quatro pendentes no instante consultado**, em
  contraste com os cinco informados anteriormente. Pendentes: 117 (11/10), 118
  (12/10), 121 (23/10), 122 (24/10). 117/118 não possuem vínculo versionado.
  121/122 preservam revogações anteriores e autoria original inconclusiva.
  O 127 continua com Camila como supervisora vigente. Nenhuma revogação foi refeita.
- Óleo já estava REABERTO em 04/11 às 10:08:32, horário de São Paulo; fechamento
  anterior às 10:01:12. Essa reabertura não foi executada nesta manutenção.
- Limpeza Diária: 44 atividades em 30/10 e 44 em 31/10, todas em
  AGUARDANDO_SUPERVISOR. A assinatura diária exigia CONCLUIDO, criando dependência
  circular: precisava de supervisão anterior para receber a supervisão do dia.
  As execuções existentes não foram alteradas.
- Amostras 26/10: 33 itens, oito Não servido. Banana cozida tem primeiro autor 15,
  versões intermediárias com autores 17 e 10 e versão atual novamente com 15.
  A regra normal considera qualquer divergência histórica de autoria, mesmo após
  retorno ao autor inicial. Há também itens cuja primeira versão preenchida foi
  feita pela própria revisora. Isso explica bloqueios da assinatura normal.
- Amostras 27/10: 33 itens/seis Não servido; Banana passou de autor 11 para 10.
  28/10: 33/seis, autor 15 para 10. 29/10: 33/sete, autor 15 para 10.
  Não servido é declaração de não execução, não uma aferição realizada.
- Amostras 31/10: 34 itens/oito Não servido. Não foi reproduzida a divergência de
  autoria encontrada nos outros dias. Preenchimento, horários e snapshots estavam
  completos; não há evidência para atribuir a esse dia a mesma causa dos demais.
  Não foi realizada assinatura real nem teste autenticado da interface de produção.
- Fechamentos genéricos de outubro: Hortifruti, Temperatura, Rastreabilidade e
  Limpeza Semanal fechados; Óleo reaberto. Limpeza Diária e Amostras não tinham
  fechamento genérico nem legado: competências abertas no instante consultado.

## Implementação

As sete permissões `modulo.<codigo>.assinar_retroativo` foram adicionadas ao
catálogo sensível, sem concessão automática a Gerente/Nutricionista/Colaborador.
O cadastro das definições ocorre pela Gestão de Usuários; os vínculos continuam
editáveis e auditados pelo mecanismo existente. DEV mantém a política existente.

Nova consulta em `/historico-operacional/revisao-retroativa`, acessível pelo
Histórico. Exibe dados, ressalvas e natureza antes da confirmação. Exige permissão
do módulo, senha, justificativa, confirmação explícita, competência aberta e
escopo/versionamento atual. Revalida usuário e permissões dentro da transação.
Revisões técnicas, gerenciais e operacionais têm identificação distinta; uma
revisão gerencial não concede habilitação técnica nem altera a autoria original.

Ressalvas de autoria, participação anterior e vínculo legado ficam auditadas na
modalidade retroativa. As regras da assinatura normal permanecem separadas.
Dados incompletos e execuções sem assinatura do executor não são inventados.
Assinaturas vigentes não são duplicadas. Eventos e assinaturas revogadas ficam
preservados. O horário registrado é o momento real da revisão, não a data histórica.

Óleo e Temperatura sem versionamento reutilizam a adoção legada existente, com
cópia integral do original e vínculo criado na data atual, atomicamente com a
revisão. Isso não executou adoção dos registros reais 117/118. Amostras e
Rastreabilidade usam unidades já versionadas; não foi acrescentado mecanismo de
conversão para registros desses dois módulos sem unidade operacional.

Reabertura mensal usa a permissão efetiva `reabrir_mes`, sem veto por nome de
perfil, e exige senha/justificativa. Preserva fechamento anterior e assinaturas;
o bloqueio transacional impede dois meses reabertos no mesmo módulo. Reabrir não
concede fechamento nem assina registros. O fechamento do Óleo com pendências,
já permitido pela política anterior, agora exige confirmação e justificativa,
exibe datas pendentes e registra a exceção em auditoria.

Limpeza Diária aceita execuções assinadas em AGUARDANDO_SUPERVISOR para a revisão
normal do dia. A Server Action retorna estado visível dentro do modal. Senha
incorreta permite nova tentativa. Revisões retroativas persistidas são mostradas
na consulta e em seção própria dos sete relatórios mensais.

## Validação

- Prisma Generate 6.5.0, TypeScript, lint e build de produção com Node 22/Next
  15.5.12: passaram na validação final. `git diff --check` também passou.
- `test-retroactive-review.cjs`: 15 grupos com PostgreSQL real isolado. Abrange
  os sete módulos, permissão concedida/revogada, autorização dentro da transação,
  senha/justificativa/confirmação, escopo desatualizado, separação das naturezas,
  ressalvas, legado Óleo/Temperatura, preservação operacional, fechamento com
  pendências, concorrência e rollback após falha real de auditoria.
- `test-monthly-reopening.cjs`: passou nos sete módulos, formatos genérico/legado,
  relatórios, fechamento/reabertura, rollback, isolamento entre módulos e ações
  reais de Rastreabilidade usando adapter em memória. Atualizado para senha e
  justificativa obrigatórias.
- `test-supervision-signatures.cjs`: 22 grupos passaram.
- `test-buffet-history.cjs`: passou com PostgreSQL local pelo wrapper portátil.
- `test-retroactive-review-browser.cjs`: passou no Chrome real com Next de produção,
  autenticação, Server Actions e persistência local. Verificou assinatura técnica
  de Amostras, gerencial de Limpeza, senha incorreta e nova tentativa no modal,
  bloqueio sem permissão, recarga, ausência de duplicação, relatório e impressão.
- Capturas desktop 1440 e viewport 390, erro visível no modal; inspeção visual
  realizada. Viewport mobile do Chrome **não equivale a Safari no iPhone**.
- Safari/iPhone real permanece pendente. Não declarar os 54 cenários integralmente
  homologados nem o ambiente publicado corrigido por estes testes locais.

Na primeira execução do teste mensal antigo, uma importação relativa do Prisma
escapou do adapter e tentou uma consulta SELECT ao endereço externo. A conexão
falhou, sem leitura ou escrita concluída. O teste agora intercepta essa importação
e fixa DATABASE_URL/DIRECT_URL em destino localhost inválido como defesa adicional.
A execução seguinte passou inteiramente em memória. Nenhuma credencial foi gravada
nesta documentação. O erro P0001 no teste novo é uma falha sintética intencional
para comprovar rollback, não falha pendente da aplicação.

## Procedimento após publicação autorizada

1. Em Gestão de Usuários → Perfis e Permissões, conceder a permissão sensível de
   assinatura retroativa somente aos perfis e módulos autorizados. Não há concessão
   automática aos usuários reais nesta entrega.
2. Habilitar separadamente reabertura mensal e acesso ao módulo, quando necessários.
3. Conferir o estado atual da competência. Reabrir apenas a que estiver fechada,
   com senha e justificativa; não repetir a reabertura de Óleo sem consultar o estado.
4. No Histórico, consultar assinaturas retroativas, selecionar data/unidade ou
   atividades, conferir dados e ressalvas, informar justificativa e senha e confirmar.
   Para 121/122, a autoria inconclusiva permanece explicitamente ressalvada; a revisão
   não regulariza nem comprova artificialmente a autoria da execução.
5. Conferir o resultado persistido, Histórico e relatório, inclusive a natureza e
   data real da revisão. O registro 127 já assinado não deve ser selecionado.
6. Fechar novamente a competência somente com autorização de fechamento. No Óleo,
   pendências remanescentes exigem reconhecimento explícito e justificativa auditada.

Nenhuma dessas operações foi realizada automaticamente em produção.

Git final: 30 arquivos rastreados modificados e 13 arquivos novos, incluindo
esta documentação. Sem alterações de schema/migrations; evidências locais e
snapshots reais não estão entre os arquivos novos versionáveis.
