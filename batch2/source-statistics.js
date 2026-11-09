import {videoMetadata} from './video-metadata.js?v=29-identities';
export function groupAuditBySource(data,tasks){
 const metadata=new Map(tasks.map(t=>[t.record_id,videoMetadata(t)]));
 const aggregate=dimension=>{
  const groups=new Map();
  const get=m=>{const key=dimension==='dataset'?m.source:JSON.stringify([m.source,m.model]);if(!groups.has(key))groups.set(key,{source:m.source,source_label:m.source_label,model:dimension==='model'?m.model:null,dataset_videos:0,reviewed_total:0,ai_accepted:0,final_accepted:0,pending_card_edits:0,review_rejected:0,uncertain:0,stale_review:0,selection_correct:0,selection_rejected:0});return groups.get(key);};
  for(const m of metadata.values())get(m).dataset_videos++;
  // The latest human judgment per original video ID wins, as in the overall totals.
  const judgments=new Map((data.judgments||[]).map(r=>[r.record_id,r]));
  for(const r of judgments.values()){
   const m=metadata.get(r.record_id)||{source:'unknown',source_label:'来源未提供',model:'模型未提供'},g=get(m);
   if(r.stale){g.stale_review++;continue;}g.reviewed_total++;if(r.origin==='ai_accepted')g.ai_accepted++;
   if(r.decision==='pass')g.final_accepted++;else if(r.decision==='edit')g.pending_card_edits++;else if(r.decision==='reject')g.review_rejected++;else g.uncertain++;
   if(r.original_verdict==='pass'){if(['pass','edit'].includes(r.decision))g.selection_correct++;else if(r.decision==='reject')g.selection_rejected++;}
  }
  return [...groups.values()].map(g=>{const n=g.final_accepted+g.review_rejected,p=g.selection_correct+g.selection_rejected;return {...g,acceptance_denominator:n,acceptance_rate:n?g.final_accepted/n:null,precision_denominator:p,precision:p?g.selection_correct/p:null};}).sort((a,b)=>a.source.localeCompare(b.source)||(a.model||'').localeCompare(b.model||''));
 };
 return {by_dataset:aggregate('dataset'),by_model:aggregate('model')};
}
