# Temperatura de Equipamentos e nomes de supervisão nos relatórios — 05/11/2026

Branch: `estabilizacao/experiencia-anterior-2026-10-28`, base `9ca14f5`.
Git inicialmente limpo. Não houve commit, push, deploy, migration, seed, reset,
db push, assinatura real, alteração de permissões ou escrita de dados reais.
O `.env` foi preservado. O Multitenant não foi acessado.

## A. Temperatura de Equipamentos

### Diagnóstico real e causa

O Railway foi conferido antes da consulta: StaySafe / production / Projeto-BPMA /
Postgres, deployment `77568eba-3a7a-4294-baf1-87618ab3d78f`, commit ativo
`9ca14f51fda559b0ba766949f223f09fa5896353`. A conexão da aplicação foi comparada
com o serviço Postgres autorizado, sem exibir credenciais ou DATABASE_URL.

Foram consultadas **108 aferições**, em transação PostgreSQL **READ ONLY**:
36 por dia, sendo 18 de manhã e 18 à tarde, entre 01 e 03/11/2026. A comparação
abrangeu o snapshot salvo, `temperatureSnapshot()` do registro atual e o conteúdo
do validador, incluindo o rascunho vigente. Nenhuma imagem foi impressa em base64.

Uma tentativa inicial com consultas repetidas por aferição expirou sem writes.
A consulta concluída carregou os registros em lote na mesma transação somente
leitura e executou a função real do validador sobre os dados carregados, evitando
as consultas redundantes. A transação conferiu `transaction_read_only=on`.

**Quatro aferições têm divergência real no campo `equipamento`:**

| Registro real | Data | Turno | Estado | Versão | Nome no snapshot | Nome no registro atual |
| --- | --- | --- | --- | --- | --- | --- |
| 4422 | 01/11/2026 | Manhã | COMPLETO | 1 | Freezer de bancada 02 | Refrigerador de bancada 02 |
| 4415 | 02/11/2026 | Manhã | COMPLETO | 2 | Freezer de bancada 02 | Refrigerador de bancada 02 |
| 4440 | 02/11/2026 | Tarde | COMPLETO | 2 | Freezer de bancada 02 | Refrigerador de bancada 02 |
| 4463 | 03/11/2026 | Manhã | COMPLETO | 2 | Freezer de bancada 02 | Refrigerador de bancada 02 |

Nas outras **104 aferições**, o snapshot atual coincide com a versão consultada.
Não foram encontrados deltas em temperatura, turno, categoria, horário, estado
operacional, foto ou outros campos nesses quatro casos: o único delta foi o nome.
O rascunho devolvido pelo validador é o próprio rascunho da versão vigente e não
apresentou divergência. Isso não é uma diferença de ordenação de JSON, precisão
numérica ou campo técnico novo.

O fluxo que permite e reproduz exatamente essa inconsistência é
`updateCatalogOptionAction`, em `actions.ts`: ao renomear uma opção, ele executava
`controleTemperaturaEquipamento.updateMany`, trocando `equipamento` em todos os
registros com o nome antigo, sem criar versões ou eventos correspondentes no
núcleo operacional. Havia a mesma propagação para nomes de ações corretivas.

A aferição mudava depois do salvamento e seu `FluxoVersao.dados` permanecia com
o nome original. Por isso `signWorkflow` rejeitava corretamente o conteúdo atual.
Não foi atribuída autoria individual à alteração de cadastro: o fluxo anterior
não gerava o evento de correção por aferição que permitiria essa atribuição.

### Correção de código

- A edição do cadastro não propaga mais nomes para aferições históricas.
- A renomeação de equipamento ou ação corretiva já referenciada por aferições é
  bloqueada, incluindo referências em registros excluídos. A orientação é inativar
  a opção e cadastrar uma nova para os próximos registros. Opções sem aferições
  ainda podem ser renomeadas. Outras edições com o mesmo nome continuam possíveis.
- A verificação ocorre na transação com o mesmo bloqueio do módulo utilizado
  pelo núcleo, evitando corrida com o salvamento de novas aferições.
- O validador de Temperatura agora identifica aferição, equipamento, turno, data
  e campos divergentes. Não expõe os valores das fotos ou dados sensíveis.
- A comparação integral do núcleo não foi enfraquecida: nenhum campo foi excluído
  do snapshot para liberar os quatro registros. Não houve normalização que
  transformasse diferenças operacionais em igualdade.

Exemplo de erro agora: `Aferição #4422 — Refrigerador de bancada 02, manhã,
2026-11-01: conteúdo divergente da versão salva (equipamento). A assinatura não
foi gravada. Solicite conferência e reconciliação auditável...`.

Arquivos:

- `src/app/controle-temperatura-equipamentos/actions.ts`.
- `src/app/controle-temperatura-equipamentos/workflow-adapter.ts`.
- Novo `src/app/controle-temperatura-equipamentos/snapshot-integrity.ts`.

### Testes dos dias 01, 02 e 03/11

Os oito grupos de integração PostgreSQL e o navegador Chrome real comprovaram:

- Manhã e tarde nas três datas; assinatura individual, diária e retroativa
  autorizada efetivamente persistidas nos casos consistentes, sem novo salvamento.
- Reprodução sintética dos quatro nomes alterados fora de versão, com os demais
  dados idênticos ao snapshot.
- Assinatura coletiva com uma aferição divergente identifica o registro e não
  deixa assinatura parcial nas demais aferições selecionadas.
- Alerta, INATIVO, MANUTENCAO e equipamento de catálogo posteriormente inativo.
- Foto sintética preservada integralmente após assinatura.
- Temperatura alterada após salvamento continua bloqueada; senha incorreta,
  versão obsoleta e falta de permissão não permitem assinatura.
- A renomeação de opção utilizada é recusada sem mudar cadastro, aferições,
  versões ou assinaturas; opção não utilizada pode mudar. Referência excluída
  também protege o nome de uma ação corretiva histórica.

### Pendência de dados reais e procedimento preparado

**Os registros reais 4422, 4415, 4440 e 4463 não foram reconciliados.**
O deploy da prevenção e da mensagem detalhada não torna esses conteúdos iguais.
Eles continuam protegidos até reconciliação especificamente autorizada. Não se
recomenda salvar novamente uma aferição sem analisar o histórico.

Procedimento para uma etapa futura, sem execução nesta manutenção:

1. Confirmar a identidade atual do ambiente e reexecutar a comparação READ ONLY
   para os quatro registros. O estado pode mudar depois deste diagnóstico.
2. O responsável precisa confirmar se os dois nomes representam o mesmo
   equipamento físico e qual denominação deve prevalecer. Não inferir isso apenas
   pela semelhança do nome ou pelo cadastro atual.
3. Obter autorização específica para reconciliar esses quatro registros e essa
   decisão de nomenclatura, além de backup recuperável e evidências anteriores.
4. Preparar uma transação com escopo fechado nos quatro IDs, versões e hashes
   conferidos imediatamente antes da execução; abortar se houver novo delta,
   assinatura vigente inesperada, mudança de competência ou alteração de versão.
5. Se o nome atual for confirmado, uma reconciliação deve preservar as versões
   antigas e criar nova versão e evento explícito de reconciliação do cadastro,
   com responsável, horário real, justificativa e diferença anterior/nova. Deve
   registrar que o operador da reconciliação não é o executor da aferição.
6. Se o nome antigo for o correto, a restauração também exige decisão e auditoria
   específicas; não restaurar silenciosamente dados para satisfazer o comparador.
7. Não usar um salvamento genérico que recalcule status ou ações corretivas com
   regras atuais. A reconciliação não pode mudar temperatura, foto, horário,
   responsável original, categoria ou outras evidências operacionais.
8. Não fabricar assinatura. Depois da reconciliação, o usuário autorizado revisa
   e assina a nova versão pelo fluxo normal ou retroativo aplicável.
9. Conferir dados, versões, eventos, Histórico e relatório antes/depois. Erro em
   qualquer item deve desfazer toda a transação. Preservar o snapshot anterior
   para reversão auditável, sem apagar eventos ou versões.

Não foi criado nem executado um script de escrita em produção. Outras datas
fora de 01–03/11 não foram auditadas por esta consulta; não se presume que esses
sejam os únicos efeitos históricos da antiga propagação em todo o banco.

## B. Relatório de Buffet / Amostras

Criado `reportSupervisorName()` especificamente para os dois relatórios que
exigem nome sem data. `reportSignatureLabel()` e os demais relatórios mantêm sua
formatação anterior.

Na célula de supervisão técnica:

- Antes: `Camila Reinaldo — 05/11/2026 10:40 — Assinatura retroativa`.
- Depois, convencional ou retroativa: `Camila Reinaldo`.

Revisão exclusivamente gerencial mantém sua classificação e a indicação de que
não substitui validação técnica. Registros pendentes continuam sem nome fictício.
Nenhuma assinatura, versão, data, justificativa ou ressalva foi alterada.

Arquivos: `src/lib/review-presentation.ts` e
`src/app/relatorios/controle-buffet-amostras/mensal/route.ts`.

Testes do formatador, HTML no navegador e PDF confirmaram o nome técnico isolado,
ausência de data/hora/mecanismo nessa célula e distinção gerencial. A auditoria
e a data real continuam preservadas no PostgreSQL sintético.

## C. Relatório de Limpeza Diária

O mapa `supervisorByDate` utiliza o mesmo formatador específico.

- Antes: `Camila Reinaldo — 05/11/2026 10:40`.
- Depois da supervisão técnica: `Camila Reinaldo`.

Datas operacionais, turnos, assinaturas e nomes dos executores, emissão e data
de fechamento não foram removidos. A data real da supervisão permanece no banco
e na auditoria. Atividades/dias sem supervisão válida permanecem sem nome; a
revisão gerencial mantém a distinção existente.

Arquivos: `src/lib/review-presentation.ts` e
`src/app/relatorios/plano-limpeza-diario/mensal/route.ts`.

As fixtures incluem vários dias e executores, assinatura convencional e revisão
retroativa posterior à execução. O navegador inspecionou as células de supervisão;
os PDFs renderizados foram inspecionados visualmente.

## D. Validação final, evidências e publicação

- Prisma Generate 6.5.0: passou.
- TypeScript: passou.
- Lint: passou sem warnings/erros do ESLint.
- Build de produção: passou, Next.js 15.5.12 / Node.js 22.23.4.
- `test-temperature-snapshot-integrity.cjs`: oito grupos passaram.
- `test-temperature-snapshot-browser.cjs`: passou no Chrome com Next de produção,
  Server Actions e PostgreSQL sintético; desktop 1440 e viewport mobile 390.
- `test-retroactive-review.cjs`: 22 grupos passaram.
- `test-supervision-signatures.cjs`: 22 grupos dos sete módulos passaram.
- `test-monthly-reopening.cjs`: passou nos sete módulos, incluindo relatórios,
  autorização, fechamento/reabertura, isolamento e rollback.
- `test-buffet-history.cjs`: passou no PostgreSQL local portátil.
- `test-retroactive-review-browser.cjs`: passou, com asserções específicas das
  células de nome sem data nos dois relatórios e regressão do Óleo.
- Oito PDFs cobrindo sete módulos foram gerados, analisados e renderizados.
  Amostras e Limpeza Diária foram inspecionados visualmente; os demais mantêm
  responsável/data/hora e sua natureza conforme a formatação anterior.
- `git diff --check`: passou.

Evidências locais ignoradas:

- `.data/validation/temperature-signatures-20261105/identidade.json`.
- `diagnostico-readonly.json`: 108 registros e os deltas seguros, sem imagens.
- `results.json`, `browser-results.json`, `collective-error.png` e capturas dos
  dias 01/02/03 na mesma pasta.
- `.data/validation/retroactive-review/pdf-results.json`, PDFs e imagens
  renderizadas da rodada de relatórios.

Foram criados os dois scripts de teste de Temperatura e atualizado o teste de
navegador dos relatórios; os demais arquivos alterados estão listados acima.
Nenhuma evidência de produção ou validação local foi incluída no Git.

O código está apto para homologação da prevenção, diagnóstico e apresentação.
**Não declarar os quatro registros reais regularizados apenas pelo deploy.**
A pendência é a reconciliação de dados autorizada descrita na parte A. Safari
em iPhone real não foi validado; mobile foi testado por viewport do Chrome.
