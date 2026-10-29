"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { toggleItemStatusAction } from "../actions";
import { saveBuffetItemOrderAction } from "./item-order-actions";
import { normalizeSearchText } from "../utils";

export type BuffetManagementItemRow={id:number;nome:string;classificacaoLabel:string;equipamentoLabel:string;servicosLabel:string;ordem:number;ativo:boolean;editHref:string};
export function BuffetItemsManagementTable({items,pagePath,revision}:{items:BuffetManagementItemRow[];pagePath:string;revision:string}) {
  const router=useRouter();
  const [rows,setRows]=useState(items),[itemSearch,setItemSearch]=useState("");
  const [moving,setMoving]=useState<number|null>(null),[target,setTarget]=useState<number|null>(null),[saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState(""),[failed,setFailed]=useState(false);
  const confirmed=useRef(items),current=useRef(items),catalogRevision=useRef(revision),drag=useRef<number|null>(null),busy=useRef(false);
  const normalizedSearch=normalizeSearchText(itemSearch),disabled=saving||Boolean(normalizedSearch);
  useEffect(()=>{if(busy.current||drag.current!==null)return;confirmed.current=items;current.current=items;catalogRevision.current=revision;setRows(items);},[items,revision]);
  const update=(next:BuffetManagementItemRow[])=>{current.current=next;setRows(next);};
  const cancel=()=>{drag.current=null;setMoving(null);setTarget(null);update(confirmed.current);setFeedback("Movimentação cancelada.");setFailed(false);};
  const begin=(id:number)=>{if(busy.current||normalizedSearch||drag.current!==null)return false;drag.current=id;setMoving(id);setTarget(id);setFailed(false);setFeedback("Movendo item. Use as setas para escolher a posição, Enter para confirmar ou Esc para cancelar.");return true;};
  const move=(over:number)=>{
    const id=drag.current;if(id===null||id===over)return;
    const active=current.current.filter(item=>item.ativo),from=active.findIndex(item=>item.id===id),to=active.findIndex(item=>item.id===over);if(from<0||to<0)return;
    const [item]=active.splice(from,1);active.splice(to,0,item);
    update([...active.map((row,index)=>({...row,ordem:index+1})),...current.current.filter(row=>!row.ativo)]);setTarget(over);setFeedback(`${item.nome}: posição ${to+1} de ${active.length}. Solte ou confirme com Enter.`);
  };
  const finish=async()=>{
    if(drag.current===null||busy.current)return;drag.current=null;setMoving(null);setTarget(null);
    const ids=current.current.filter(item=>item.ativo).map(item=>item.id),oldIds=confirmed.current.filter(item=>item.ativo).map(item=>item.id);
    if(ids.every((id,index)=>id===oldIds[index])){update(confirmed.current);setFeedback("Sequência mantida.");return;}
    busy.current=true;setSaving(true);setFailed(false);setFeedback("Salvando nova ordem…");
    let serverMessage:string|undefined;
    try {
      const result=await saveBuffetItemOrderAction({ids,revision:catalogRevision.current});if(!result.ok){serverMessage=result.message;throw Error(result.message);}
      const byId=new Map(current.current.map(item=>[item.id,item]));const saved=result.positions.flatMap(position=>{const row=byId.get(position.id);return row?[{...row,...position}]:[];});
      confirmed.current=saved;catalogRevision.current=result.revision;update(saved);setFeedback("Ordem salva.");
    }catch{update(confirmed.current);setFailed(true);setFeedback(serverMessage??"Não foi possível confirmar a nova ordem. Confira a lista atualizada e tente novamente.");}
    finally{busy.current=false;setSaving(false);router.refresh();}
  };
  const pointerDown=(event:PointerEvent<HTMLButtonElement>,id:number)=>{if(event.button!==0||!begin(id))return;event.preventDefault();event.currentTarget.focus();event.currentTarget.setPointerCapture(event.pointerId);};
  const pointerMove=(event:PointerEvent<HTMLButtonElement>)=>{
    if(drag.current===null||busy.current)return;
    const row=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-buffet-active="true"]');if(row)move(Number(row.dataset.buffetItemId));
    if(event.clientY<70)window.scrollBy(0,-14);else if(event.clientY>window.innerHeight-70)window.scrollBy(0,14);
  };
  const keyboard=(event:KeyboardEvent<HTMLButtonElement>,id:number)=>{
    if(event.key==="Escape"&&drag.current!==null){event.preventDefault();cancel();return;}
    if(event.key===" "||event.key==="Enter"){event.preventDefault();if(drag.current===id)void finish();else begin(id);return;}
    if(drag.current!==id||!["ArrowUp","ArrowDown","Home","End"].includes(event.key))return;
    event.preventDefault();const active=current.current.filter(item=>item.ativo),index=active.findIndex(item=>item.id===id),destination=event.key==="Home"?0:event.key==="End"?active.length-1:index+(event.key==="ArrowUp"?-1:1);
    if(active[destination])move(active[destination].id);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>(`[data-order-handle="${id}"]`)?.focus());
  };
  const visible=(active:boolean)=>rows.filter(item=>item.ativo===active&&(!normalizedSearch||normalizeSearchText(item.nome).includes(normalizedSearch)));
  const renderRow=(item:BuffetManagementItemRow)=><tr key={item.id} data-buffet-item-id={item.id} data-buffet-active={String(item.ativo)} className={`transition-colors duration-150 ${moving===item.id?"bg-sky-100 ring-2 ring-inset ring-sky-500 dark:bg-sky-950":target===item.id?"border-t-2 border-sky-500":""}`}>
    <td className="px-3 py-2">{item.ativo?<button type="button" data-order-handle={item.id} aria-label={`Mover ${item.nome}`} aria-describedby="buffet-order-help" aria-pressed={moving===item.id} disabled={disabled||rows.filter(row=>row.ativo).length<2} className="rounded-md border border-slate-300 p-2 text-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-700" style={{touchAction:"none",cursor:disabled?"not-allowed":moving===item.id?"grabbing":"grab"}} onPointerDown={event=>pointerDown(event,item.id)} onPointerMove={pointerMove} onPointerUp={()=>void finish()} onPointerCancel={cancel} onKeyDown={event=>keyboard(event,item.id)}>
      <svg width="18" height="22" viewBox="0 0 18 22" aria-hidden="true" fill="currentColor">{[5,11,17].flatMap(y=>[5,13].map(x=><circle key={`${x}-${y}`} cx={x} cy={y} r="1.7"/>))}</svg>
    </button>:<span aria-hidden="true">—</span>}</td>
    <td className="px-3 py-2">{item.nome}</td><td className="px-3 py-2">{item.classificacaoLabel}</td><td className="px-3 py-2">{item.equipamentoLabel}</td><td className="max-w-72 whitespace-normal break-words px-3 py-2">{item.servicosLabel}</td><td className="px-3 py-2">{item.ativo?item.ordem:"—"}</td><td className="px-3 py-2">{item.ativo?"Ativo":"Inativo"}</td>
    <td className="px-3 py-2"><div className="btn-group"><Link href={item.editHref} className="btn-action" aria-disabled={saving||moving!==null} onClick={event=>{if(saving||moving!==null)event.preventDefault();}}>Editar</Link>
      <form action={toggleItemStatusAction}><input type="hidden" name="returnTo" value={pagePath}/><input type="hidden" name="catalogRevision" value={catalogRevision.current}/><input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="ativo" value={item.ativo?"false":"true"}/><button type="submit" className={item.ativo?"btn-danger":"btn-secondary"} disabled={saving||moving!==null}>{item.ativo?"Inativar":"Ativar"}</button></form>
    </div></td>
  </tr>;
  return <div className="mt-4" aria-busy={saving}>
    <label className="block text-sm text-slate-700 dark:text-slate-200">Buscar item pelo nome<input type="search" value={itemSearch} disabled={saving||moving!==null} onChange={event=>setItemSearch(event.target.value)} placeholder="Digite para filtrar os itens..." className="bpma-input"/></label>
    <p id="buffet-order-help" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{normalizedSearch?"Limpe a busca para reordenar a lista completa de itens ativos.":"Arraste pelo ícone para reorganizar. Pelo teclado, pressione Espaço, use as setas e confirme com Enter. A ordem é global e será salva automaticamente."}</p>
    <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-sm ${failed?"text-red-700 dark:text-red-300":"text-slate-600 dark:text-slate-300"}`}>{feedback}</p>
    <div className="mt-3 overflow-x-auto"><table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-slate-700"><thead className="bg-slate-50 text-left text-slate-700 dark:bg-slate-800"><tr>{["Mover","Item","Classificação","Tipo de equipamento","Serviços","Ordem","Status","Ações"].map(label=><th key={label} className="px-3 py-2">{label}</th>)}</tr></thead>
      {[true,false].map(active=><tbody key={String(active)} className="divide-y divide-slate-100 dark:divide-slate-800"><tr><th colSpan={8} className="bg-slate-50 px-3 py-2 text-left dark:bg-slate-800">{active?"Itens ativos":"Itens inativos"} ({visible(active).length})</th></tr>{visible(active).map(renderRow)}{!visible(active).length&&<tr><td colSpan={8} className="px-3 py-3 text-slate-500">{normalizedSearch?"Nenhum item encontrado.":active?"Nenhum item ativo.":"Nenhum item inativo."}</td></tr>}</tbody>)}
    </table></div>
  </div>;
}
