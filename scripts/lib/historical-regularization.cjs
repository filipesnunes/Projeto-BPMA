// Internal maintenance API. Never called by startup, migrations or web actions.
const {createHash}=require('node:crypto');
const {execution}=require('./oil-signature-audit.cjs');
const canonical=v=>v instanceof Date?JSON.stringify(v.toISOString()):Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const technical=new Set(['REVISAO_INDIVIDUAL','ASSINATURA_DIARIA']);
function scopeFromData(data,flowId){
 const flow=data.fluxoOperacional.find(f=>f.id===flowId),record=data.controleQualidadeOleoRegistro.find(r=>r.fluxoId===flowId);
 const versions=data.fluxoVersao.filter(v=>v.fluxoId===flowId).sort((a,b)=>a.versao-b.versao);
 const signature=data.fluxoAssinatura.find(s=>s.id===flow?.assinaturaVigenteId),links=data.fluxoAssinaturaVinculo.filter(l=>l.fluxoId===flowId).sort((a,b)=>a.assinaturaId.localeCompare(b.assinaturaId));
 return{flow,record,versions,signature,links};
}
function buildOilRevocationPlan(snapshot){
 const data=snapshot.data,operations=[];
 for(const flow of data.fluxoOperacional.filter(f=>f.modulo==='oleo'&&f.assinaturaVigenteId&&!f.excluidoEm)){
  const scope=scopeFromData(data,flow.id),s=scope.signature,r=scope.record;if(!r||r.excluidoEm||!s||!technical.has(s.mecanismo))continue;
  const link=scope.links.find(l=>l.assinaturaId===s.id&&l.versao===flow.versao);if(!link)continue;
  const evidence=execution(r,data.fluxoVersao,data.fluxoEvento,link.versao),self=evidence.participantIds.includes(s.usuarioId);
  if(s.usuarioPerfil!=='COLABORADOR'&&!self)continue;
  const month=new Date(r.data),generic=data.fechamentoMensalModulo.find(c=>c.moduloCodigo==='oleo'&&c.ano===month.getUTCFullYear()&&c.mes===month.getUTCMonth()+1),legacy=data.controleQualidadeOleoFechamento.find(c=>c.ano===month.getUTCFullYear()&&c.mes===month.getUTCMonth()+1);
  operations.push({tipo:'REVOGAR_ASSINATURA_OLEO',registroId:r.id,data:r.data,fluxoId:flow.id,versao:flow.versao,assinaturaId:s.id,assinanteId:s.usuarioId,assinanteNome:s.usuarioNome,perfilHistorico:s.usuarioPerfil,mecanismo:s.mecanismo,assinadoEm:s.assinadoEm,antesHash:digest(scope),escopoOriginal:scope,motivo:s.usuarioPerfil==='COLABORADOR'?'Assinatura técnica com perfil histórico COLABORADOR.':'Autoassinatura comprovada por autoria/correção identificada por ID.',autoriaOriginalComprovada:Boolean(evidence.originalId),executorOriginalId:evidence.originalId,exigeReaberturaMensal:generic?generic.status!=='REABERTO':legacy?.status==='ASSINADO',novaAssinatura: evidence.originalId?'Revisão independente com senha, versão exata e competência aberta.':'Exige comprovação formal da autoria original; não inferir identidade pelo nome nem editar dados para produzir essa prova.'});
 }
 const body={versaoPlano:1,tipo:'REVOGACAO_OLEO_VERSIONADO',capturadoEm:snapshot.capturadoEm,destinoFingerprint:snapshot.destinoFingerprint,vinculoComRailwayConfirmado:snapshot.vinculoComRailwayConfirmado,operacoes:operations.sort((a,b)=>a.registroId-b.registroId)};
 return{...body,planoHash:digest(body),somenteProposta:true,aplicado:false};
}
async function loadOilScope(tx,id){
 const flow=await tx.fluxoOperacional.findUnique({where:{id}}),record=await tx.controleQualidadeOleoRegistro.findUnique({where:{fluxoId:id}}),versions=await tx.fluxoVersao.findMany({where:{fluxoId:id},orderBy:{versao:'asc'}}),links=await tx.fluxoAssinaturaVinculo.findMany({where:{fluxoId:id},orderBy:{assinaturaId:'asc'}});
 const signature=flow?.assinaturaVigenteId?await tx.fluxoAssinatura.findUnique({where:{id:flow.assinaturaVigenteId}}):undefined;
 return{flow:flow??undefined,record:record??undefined,versions,signature:signature??undefined,links};
}
function verifyPlan(plan){const {planoHash,somenteProposta,aplicado,...body}=plan;void somenteProposta;void aplicado;if(!['REVOGACAO_OLEO_VERSIONADO','CORRECAO_ESTADO_AMOSTRAS'].includes(body.tipo)||body.versaoPlano!==1||digest(body)!==planoHash||!body.operacoes.length||new Set(body.operacoes.map(o=>o.fluxoId)).size!==body.operacoes.length)throw Error('Plano inválido ou alterado.');}
async function applyOilRevocationPlan(db,plan,options){
 verifyPlan(plan);if(plan.tipo!=='REVOGACAO_OLEO_VERSIONADO')throw Error('Tipo de plano incorreto.');
 if(!options?.authorization?.trim()||!options.reason?.trim())throw Error('Autorização específica e justificativa obrigatórias.');
 if(!options.backup?.recuperavel||!options.backup.referencia||!/^[a-f0-9]{64}$/.test(options.backup.sha256??'')||!options.backup.verificadoEm)throw Error('Backup recuperável e verificado obrigatório.');
 if(options.targetFingerprint!==plan.destinoFingerprint)throw Error('Destino diverge do plano aprovado.');
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'oleo'}),17326)`;
  const actor=await tx.usuario.findUnique({where:{id:options.actorId}});if(!actor||actor.status!=='ATIVO'||actor.perfil!=='DEV')throw Error('A regularização exige operador DEV ativo e autorização específica; não é uma assinatura técnica.');
  const prepared=[];
  for(const operation of plan.operacoes){
   const scope=await loadOilScope(tx,operation.fluxoId);if(digest(scope)!==operation.antesHash)throw Error('O escopo mudou desde o diagnóstico. Gere nova simulação e aprovação.');
   if(scope.flow?.modulo!=='oleo'||scope.flow.estado!=='FECHADO'||scope.flow.assinaturaVigenteId!==operation.assinaturaId||scope.flow.versao!==operation.versao||scope.record?.id!==operation.registroId||scope.signature?.usuarioPerfil!==operation.perfilHistorico||!technical.has(scope.signature?.mecanismo))throw Error('Assinatura ou versão fora do escopo aprovado.');
   const link=scope.links.find(l=>l.assinaturaId===operation.assinaturaId&&l.versao===operation.versao);
   if(!link)throw Error('Vínculo de assinatura ausente na versão aprovada.');
   if(scope.signature.usuarioPerfil!=='COLABORADOR'){
    const events=await tx.fluxoEvento.findMany({where:{fluxoId:operation.fluxoId}});
    if(!execution(scope.record,scope.versions,events,operation.versao).participantIds.includes(scope.signature.usuarioId))throw Error('Não há evidência suficiente de irregularidade para revogar esta assinatura.');
   }
   const date=new Date(scope.record.data),mes=date.getUTCMonth()+1,ano=date.getUTCFullYear(),generic=await tx.fechamentoMensalModulo.findUnique({where:{moduloCodigo_ano_mes:{moduloCodigo:'oleo',mes,ano}}}),legacy=await tx.controleQualidadeOleoFechamento.findUnique({where:{mes_ano:{mes,ano}}});
   if(generic?generic.status!=='REABERTO':legacy?.status==='ASSINADO')throw Error('Competência fechada. Reabra formalmente em Gerenciamento de Períodos antes da regularização.');
   prepared.push({operation,scope});
  }
  const at=new Date(),results=[];
  for(const {operation,scope}of prepared){
   const after=await tx.fluxoOperacional.update({where:{id:operation.fluxoId,versao:operation.versao,assinaturaVigenteId:operation.assinaturaId},data:{estado:'COMPLETO',assinaturaVigenteId:null}});
   const event=await tx.fluxoEvento.create({data:{fluxoId:operation.fluxoId,operacao:'REVOGACAO_ASSINATURA',estadoAnterior:scope.flow.estado,estadoNovo:'COMPLETO',versaoAnterior:operation.versao,versaoNova:operation.versao,assinaturaId:operation.assinaturaId,usuarioId:actor.id,usuarioNome:actor.nomeCompleto,usuarioPerfil:actor.perfil,criadoEm:at,justificativa:JSON.stringify({tipo:'REGULARIZACAO_SOMENTE_ASSINATURA',planoHash:plan.planoHash,autorizacao:options.authorization,autorizadoPor:options.authorizedBy??options.authorization,motivo:options.reason,diagnostico:operation.motivo,backup:options.backup,estadoAnterior:scope.flow,estadoPosterior:after,registroId:operation.registroId,assinaturaOriginal:scope.signature,integridadeOperacional:digest(scope.record),edicaoOperacionalLiberada:false})}});
   if(digest(await tx.controleQualidadeOleoRegistro.findUnique({where:{id:operation.registroId}}))!==digest(scope.record))throw Error('Falha de integridade operacional; transação revertida.');
   if(digest(await tx.fluxoVersao.findMany({where:{fluxoId:operation.fluxoId},orderBy:{versao:'asc'}}))!==digest(scope.versions))throw Error('Versões alteradas; transação revertida.');
   results.push({registroId:operation.registroId,assinaturaRevogada:operation.assinaturaId,evento:event.id,estadoAntes:scope.flow.estado,estadoDepois:after.estado,dadosOperacionaisPreservados:true});
  }
  return{planoHash:plan.planoHash,executadoEm:at,resultados:results};
 },{isolationLevel:'Serializable',timeout:120000});
}
function buffetScopeFromData(data,id){return{flow:data.fluxoOperacional.find(f=>f.id===id),records:data.controleBuffetAmostraRegistro.filter(r=>r.fluxoId===id&&!r.excluidoEm).sort((a,b)=>a.id-b.id),versions:data.fluxoVersao.filter(v=>v.fluxoId===id).sort((a,b)=>a.versao-b.versao)};}
function buildBuffetStatePlan(snapshot,audit){
 const data=snapshot.data,groups=new Map(),deferred=[];
 for(const finding of audit.resultados.filter(r=>(r.categoriaDiagnostico??r.classe)==='A')){
  const r=data.controleBuffetAmostraRegistro.find(r=>r.id===finding.registroId),flow=data.fluxoOperacional.find(f=>f.id===r?.fluxoId);
  if(!r||!flow||!finding.preenchidoEmVersaoAnterior||r.assinaturaDataHora||r.assinaturaNutricionistaDataHora||flow.assinaturaVigenteId||flow.estado==='FECHADO'||finding.divergenciaSnapshot||finding.duplicidadeLegadoVersionado){deferred.push({registroId:finding.registroId,motivo:'Exige análise individual de versões, assinaturas ou representações; sem correção automática.'});continue;}
  groups.set(flow.id,[...(groups.get(flow.id)??[]),r.id]);
 }
 const operations=[...groups].map(([id,ids])=>{const scope=buffetScopeFromData(data,id);return{tipo:'CORRIGIR_ESTADO_AMOSTRAS',fluxoId:id,versao:scope.flow.versao,chave:scope.flow.chave,registroIds:ids.sort((a,b)=>a-b),antesHash:digest(scope),escopoOriginal:scope,motivo:'Campos persistidos completos, versão anteriormente preenchida e estado PENDENTE inconsistente. Proposta restrita aos IDs conferidos.'};});
 const body={versaoPlano:1,tipo:'CORRECAO_ESTADO_AMOSTRAS',capturadoEm:snapshot.capturadoEm,destinoFingerprint:snapshot.destinoFingerprint,vinculoComRailwayConfirmado:snapshot.vinculoComRailwayConfirmado,operacoes:operations,adiados:deferred};return{...body,planoHash:digest(body),somenteProposta:true,aplicado:false};
}
async function loadBuffetScope(tx,id){return{flow:await tx.fluxoOperacional.findUnique({where:{id}}),records:await tx.controleBuffetAmostraRegistro.findMany({where:{fluxoId:id,excluidoEm:null},orderBy:{id:'asc'}}),versions:await tx.fluxoVersao.findMany({where:{fluxoId:id},orderBy:{versao:'asc'}})};}
async function applyBuffetStatePlan(db,plan,options,validators){
 verifyPlan(plan);if(plan.tipo!=='CORRECAO_ESTADO_AMOSTRAS')throw Error('Tipo de plano incorreto.');
 if(!options?.authorization?.trim()||!options.reason?.trim()||!options.backup?.recuperavel||!options.backup.referencia||!/^[a-f0-9]{64}$/.test(options.backup.sha256??'')||!options.backup.verificadoEm||options.targetFingerprint!==plan.destinoFingerprint)throw Error('Exige autorização específica, justificativa, backup recuperável e destino confirmado.');
 return db.$transaction(async tx=>{
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'amostras'}),17326)`;
  const actor=await tx.usuario.findUnique({where:{id:options.actorId}});if(!actor||actor.status!=='ATIVO'||actor.perfil!=='DEV')throw Error('Exige operador DEV ativo e autorização específica.');
  const prepared=[];
  for(const operation of plan.operacoes){const scope=await loadBuffetScope(tx,operation.fluxoId);if(digest(scope)!==operation.antesHash)throw Error('O escopo mudou desde o diagnóstico. Gere nova simulação e aprovação.');
   const date=new Date(scope.flow.dataReferencia),mes=date.getUTCMonth()+1,ano=date.getUTCFullYear(),period=await tx.fechamentoMensalModulo.findUnique({where:{moduloCodigo_ano_mes:{moduloCodigo:'amostras',mes,ano}}}),legacy=await tx.controleBuffetAmostraFechamento.findUnique({where:{mes_ano:{mes,ano}}});
   if(period?period.status!=='REABERTO':legacy?.status==='ASSINADO')throw Error('Competência fechada. Exige reabertura mensal formal.');
   if(scope.flow.modulo!=='amostras'||scope.flow.assinaturaVigenteId||!['PENDENTE','COMPLETO','REABERTO'].includes(scope.flow.estado)||scope.flow.versao!==operation.versao)throw Error('O serviço exige reabertura/análise formal antes da regularização.');
   const latest=scope.versions.at(-1);if(!latest||latest.versao!==operation.versao||!Array.isArray(latest.rascunho?.manifest))throw Error('Sem manifesto histórico comprovado.');
   for(const id of operation.registroIds){const row=scope.records.find(r=>r.id===id);if(!row||row.status!=='PENDENTE'||row.assinaturaDataHora||row.assinaturaNutricionistaDataHora||!scope.versions.some(v=>v.dados?.records?.some(r=>r.id===id&&['PREENCHIDO','ASSINADO'].includes(r.status))))throw Error('Item sem evidência suficiente ou já assinado.');await validators.validate(tx,row,latest.rascunho);}
   prepared.push({operation,scope,latest});
  }
  const results=[];
  for(const {operation,scope,latest}of prepared){
   await tx.$executeRaw`SELECT set_config('bpma.workflow_flow',${operation.fluxoId},true)`;
   for(const id of operation.registroIds){const row=scope.records.find(r=>r.id===id);await tx.controleBuffetAmostraRegistro.update({where:{id,status:'PENDENTE',updatedAt:row.updatedAt},data:{status:'PREENCHIDO',updatedAt:row.updatedAt}});}
   const afterRows=await tx.controleBuffetAmostraRegistro.findMany({where:{fluxoId:operation.fluxoId,excluidoEm:null},orderBy:{id:'asc'}});
   for(const row of afterRows){const before=scope.records.find(r=>r.id===row.id);if(digest({...row,status:before.status})!==digest(before))throw Error('Valores, autores ou timestamps alterados; transação revertida.');}
   const content=validators.content(afterRows,latest.rascunho),state=scope.flow.estado==='REABERTO'?'REABERTO':content.complete?'COMPLETO':'PENDENTE';
   const after=await tx.fluxoOperacional.update({where:{id:operation.fluxoId,versao:operation.versao},data:{versao:{increment:1},estado:state,preenchimentoCompleto:content.complete}});
   await tx.fluxoVersao.create({data:{fluxoId:after.id,versao:after.versao,dados:content.snapshot,rascunho:latest.rascunho,completo:content.complete,resolvidos:content.resolved,obrigatorios:content.required,usuarioId:actor.id,usuarioNome:actor.nomeCompleto,usuarioPerfil:actor.perfil}});
   const event=await tx.fluxoEvento.create({data:{fluxoId:after.id,operacao:'REGULARIZACAO_ESTADO',estadoAnterior:scope.flow.estado,estadoNovo:after.estado,versaoAnterior:operation.versao,versaoNova:after.versao,usuarioId:actor.id,usuarioNome:actor.nomeCompleto,usuarioPerfil:actor.perfil,justificativa:JSON.stringify({planoHash:plan.planoHash,autorizacao:options.authorization,autorizadoPor:options.authorizedBy??options.authorization,motivo:options.reason,backup:options.backup,registros:operation.registroIds,estadosAnteriores:operation.registroIds.map(id=>({id,status:'PENDENTE'})),valoresAutoresHorariosPreservados:true})}});
   results.push({fluxoId:after.id,registros:operation.registroIds,antes:scope.flow.estado,depois:after.estado,versaoAnterior:operation.versao,novaVersao:after.versao,evento:event.id,pendenciasReaisPreservadas:!content.complete});
  }
  return{planoHash:plan.planoHash,executadoEm:new Date(),resultados:results};
 },{isolationLevel:'Serializable',timeout:120000});
}
module.exports={digest,canonical,buildOilRevocationPlan,loadOilScope,applyOilRevocationPlan,verifyPlan,buildBuffetStatePlan,loadBuffetScope,applyBuffetStatePlan};
