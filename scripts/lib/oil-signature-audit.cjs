// No app/session imports, no permission registration, no mutation API.
const obj=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const json=value=>{try{return obj(JSON.parse(value??'{}'));}catch{return{};}};
function execution(record,versions,events,through=Infinity){
 const history=versions.filter(v=>v.fluxoId===record.fluxoId&&v.versao<=through).sort((a,b)=>a.versao-b.versao),changes=events.filter(e=>e.fluxoId===record.fluxoId&&e.versaoNova<=through);
 const material=history.filter(v=>obj(v.dados).id===record.id),authored=material.filter(v=>changes.some(e=>e.versaoNova===v.versao&&e.usuarioId===v.usuarioId&&['CRIACAO','SALVAMENTO','CORRECAO_REGISTRO'].includes(e.operacao)));
 const legacy=!record.fluxoId||changes.some(e=>e.operacao==='VINCULO_LEGADO')||history.some(v=>obj(v.rascunho).registroLegadoOriginal);
 return{originalId:!legacy&&material[0]&&authored.some(v=>v.versao===material[0].versao)?material[0].usuarioId:null,participantIds:[...new Set(authored.map(v=>v.usuarioId))]};
}
function classify(entry,authorization,segregation){
 if(entry.assinanteId&&entry.participantesIds.includes(entry.assinanteId))return{classe:'C',motivo:'Autor ou corretor identificado por ID também assinou a verificação.'};
 if(entry.perfilNaAssinatura==='COLABORADOR')return{classe:'B',motivo:'Perfil operacional registrado no momento da assinatura.'};
 const required={individual:'modulo.oleo.assinar_historico',daily:'modulo.oleo.assinar_dia',monthly:'modulo.oleo.assinar_fechamento_mensal'}[authorization.tipo];
 const scope=entry.tipo==='FECHAMENTO_MENSAL'||entry.registroIds.length>0&&entry.registroIds.every(id=>segregation.some(s=>s.registroId===id&&entry.versoes.some(v=>v.fluxoId===s.fluxoId&&v.versao===s.versao)&&s.originalId===entry.responsaveisIds[id]&&Number.isSafeInteger(s.originalId)&&!s.participantIds?.includes(entry.assinanteId)));
 const allowed=authorization.politica==='oleo-supervisao-v1'&&authorization.usuarioId===entry.assinanteId&&authorization.perfil==='NUTRICIONISTA'&&entry.perfilNaAssinatura==='NUTRICIONISTA'&&required&&authorization.permissoes?.includes(required)&&authorization.permissoes.includes('usuarios.responsavel_tecnico')&&scope;
 return allowed?{classe:'A',motivo:'Autorização sistêmica e segregação comprovadas pelo snapshot da política e escopo assinado.'}:{classe:'D',motivo:'Não há evidência histórica suficiente para comprovar todos os requisitos. Permissões atuais não comprovam permissões passadas.'};
}
async function auditOilSignatures(prisma){
 return prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const [records,flows,versions,signatures,links,events,logs,daily,closures,legacyClosures,users,profileAudits]=await Promise.all([
   tx.controleQualidadeOleoRegistro.findMany({select:{id:true,data:true,createdAt:true,updatedAt:true,excluidoEm:true,fluxoId:true,assinaturaSupervisorUsuarioId:true,assinaturaSupervisorPerfil:true,assinaturaSupervisorEm:true,assinaturaSupervisorNome:true}}),
   tx.fluxoOperacional.findMany({where:{modulo:'oleo'},select:{id:true,estado:true,versao:true,dataReferencia:true,assinaturaVigenteId:true}}),
   tx.fluxoVersao.findMany({where:{fluxo:{modulo:'oleo'}},select:{fluxoId:true,versao:true,dados:true,rascunho:true,usuarioId:true}}),
   tx.fluxoAssinatura.findMany({where:{modulo:'oleo'}}),tx.fluxoAssinaturaVinculo.findMany({where:{assinatura:{modulo:'oleo'}}}),
   tx.fluxoEvento.findMany({where:{fluxo:{modulo:'oleo'}},select:{id:true,fluxoId:true,operacao:true,usuarioId:true,versaoNova:true,assinaturaId:true,criadoEm:true,justificativa:true}}),
   tx.logAssinatura.findMany({where:{modulo:{in:['oleo','controle-qualidade-oleo','controle-oleo-fritura']}}}),tx.assinaturaDiariaModulo.findMany({where:{moduloCodigo:'oleo'}}),
   tx.fechamentoMensalModulo.findMany({where:{moduloCodigo:'oleo'}}),tx.controleQualidadeOleoFechamento.findMany({where:{status:'ASSINADO'}}),
   tx.usuario.findMany({select:{id:true,nomeCompleto:true,perfil:true,status:true,perfilAcessoId:true,perfilAcesso:{select:{ativo:true,permissoes:{where:{permitido:true},select:{permissao:{select:{codigo:true}}}}}}}}),
   tx.perfilPermissaoAuditoria.findMany({select:{id:true,perfilId:true,criadoEm:true}})
  ]);
  const results=[],usedLogs=new Set(),relevant=['usuarios.responsavel_tecnico','modulo.oleo.assinar_historico','modulo.oleo.assinar_dia','modulo.oleo.assinar_fechamento_mensal'];
  const add=(source,ids,signature,scopes=[],log=null)=>{
   const details=json(log?.observacao),evidence=ids.map(id=>{const record=records.find(r=>r.id===id);return record?execution(record,versions,events,scopes.find(s=>s.fluxoId===record.fluxoId)?.versao??0):{originalId:null,participantIds:[]};});
   const account=users.find(u=>u.id===signature.userId);
   const revocations=events.filter(e=>e.operacao==='REVOGACAO_ASSINATURA'&&e.assinaturaId===signature.id);
   const entry={fonte:source,identificador:signature.id,registroIds:ids,assinanteId:signature.userId??null,nomeNaAssinatura:signature.name??log?.nomeCompleto??null,datasOperacionais:[...new Set(ids.map(id=>records.find(r=>r.id===id)?.data?.toISOString().slice(0,10)).filter(Boolean))],registros:ids.map(id=>{const r=records.find(r=>r.id===id),f=flows.find(f=>f.id===r?.fluxoId);return{id,data:r?.data,fluxoId:r?.fluxoId,versaoAtual:f?.versao??null,estadoAtual:f?.estado??null,assinaturaVigenteId:f?.assinaturaVigenteId??null,excluidoEm:r?.excluidoEm};}),perfilNaAssinatura:signature.role??null,assinadoEm:signature.at??null,tipo:signature.kind,versoes:scopes,revogacoes:revocations,vigencia:revocations.length?'Revogada; evidência histórica preservada':signature.current??'Não comprovada',responsaveisIds:Object.fromEntries(ids.map((id,n)=>[id,evidence[n].originalId])),participantesIds:[...new Set(evidence.flatMap(e=>e.participantIds))],
    situacaoAtualSemValorDeProvaHistorica:account?{perfil:account.perfil,status:account.status,perfilAtivo:account.perfilAcesso?.ativo??null,permissoesExplicitas:account.perfilAcesso?.permissoes.map(p=>p.permissao.codigo).filter(c=>relevant.includes(c))??[],auditoriasPerfil:profileAudits.filter(a=>a.perfilId===account.perfilAcessoId).map(a=>a.id)}:null};
   const consistentLog=log&&log.usuarioId===entry.assinanteId&&log.perfil===entry.perfilNaAssinatura&&+log.assinadoEm===+entry.assinadoEm;
   results.push({...entry,...classify(entry,consistentLog?obj(details.autorizacao):{},Array.isArray(details.segregacao)?details.segregacao:[])});
  };
  for(const signature of signatures){const scope=links.filter(l=>l.assinaturaId===signature.id),log=logs.find(l=>'log:'+l.id===signature.referencia);if(log)usedLogs.add(log.id);const ids=records.filter(r=>scope.some(s=>s.fluxoId===r.fluxoId)).map(r=>r.id);add('FluxoAssinatura',ids,{id:signature.id,userId:signature.usuarioId,name:signature.usuarioNome,role:signature.usuarioPerfil,at:signature.assinadoEm,kind:signature.mecanismo,current:flows.some(f=>f.assinaturaVigenteId===signature.id)?'Vigente em ao menos um registro':'Histórica'},scope.map(s=>({fluxoId:s.fluxoId,versao:s.versao})),log);}
  for(const record of records.filter(r=>r.assinaturaSupervisorEm||r.assinaturaSupervisorUsuarioId||r.assinaturaSupervisorNome))add('ControleQualidadeOleoRegistro',[record.id],{id:record.id,userId:record.assinaturaSupervisorUsuarioId,name:record.assinaturaSupervisorNome,role:record.assinaturaSupervisorPerfil,at:record.assinaturaSupervisorEm,kind:'INDIVIDUAL_LEGADA',current:record.fluxoId?'Evidência legada; consultar fluxo':'Vigência legada registrada'});
  for(const signature of daily){const details=json(signature.observacao),scope=Array.isArray(details.escopoLegado)?details.escopoLegado:[],ids=scope.length?scope.map(s=>s.id):records.filter(r=>+r.data===+signature.dataReferencia&&r.createdAt<=signature.assinadoEm).map(r=>r.id);const log=logs.find(l=>l.tipo==='RESPONSAVEL_TECNICO'&&l.usuarioId===signature.usuarioId&&+l.assinadoEm===+signature.assinadoEm);if(log)usedLogs.add(log.id);add('AssinaturaDiariaModulo',ids,{id:signature.id,userId:signature.usuarioId,name:signature.usuarioNomeSnapshot,role:signature.usuarioPerfilSnapshot,at:signature.assinadoEm,kind:'DIARIA_LEGADA',current:'Escopo e vigência legados exigem análise'},[],log);}
  for(const closure of closures){const log=logs.find(l=>l.tipo==='FECHAMENTO_MENSAL'&&l.usuarioId===closure.usuarioId&&+l.assinadoEm===+closure.assinadoEm);if(log)usedLogs.add(log.id);add('FechamentoMensalModulo',[],{id:closure.id,userId:closure.usuarioId,name:closure.usuarioNomeSnapshot,role:closure.usuarioPerfilSnapshot,at:closure.assinadoEm,kind:'FECHAMENTO_MENSAL',current:closure.status==='FECHADO'?'Vigente':'Fechamento anterior'},[],log);}
  for(const closure of legacyClosures)add('ControleQualidadeOleoFechamento',[],{id:closure.id,at:closure.dataAssinatura,kind:'FECHAMENTO_MENSAL',current:'Evidência legada'});
  for(const log of logs.filter(l=>!usedLogs.has(l.id)&&['SUPERVISOR','RESPONSAVEL_TECNICO','REVISAO_NUTRICIONISTA','FECHAMENTO_MENSAL'].includes(l.tipo)))add('LogAssinatura',[],{id:log.id,userId:log.usuarioId,name:log.nomeCompleto,role:log.perfil,at:log.assinadoEm,kind:log.tipo,current:'Log sem vínculo comprovado'},[],null);
  return{somenteLeitura:true,politica:'oleo-supervisao-v1',observacao:'Classes A-D avaliam evidências sistêmicas; habilitação profissional documental deve ser conferida pelo hotel. Permissões atuais nunca comprovam autorização passada. Contagens representam evidências, não registros únicos.',quantidades:Object.fromEntries(['A','B','C','D'].map(c=>[c,results.filter(r=>r.classe===c).length])),registrosUnicos: new Set(results.flatMap(r=>r.registroIds)).size,resultados:results.map(entry=>({...entry,prioridadeOutubro2026:entry.datasOperacionais.some(d=>["2026-10-30","2026-10-31"].includes(d)),outrasAssinaturasParaOsMesmosRegistros:results.filter(other=>other!==entry&&entry.registroIds.some(id=>other.registroIds.includes(id))).map(other=>({fonte:other.fonte,id:other.identificador,classe:other.classe,assinante:other.nomeNaAssinatura,vigencia:other.vigencia}))}))};
 },{isolationLevel:'RepeatableRead',timeout:120000});
}
module.exports={auditOilSignatures,execution,classify};
