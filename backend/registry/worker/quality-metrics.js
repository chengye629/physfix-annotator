// Human decisions and the 23 AI approvals explicitly accepted by the user count.
export function buildQualityStatistics(annotations,historical,campaignTasks,reviewRows,names){
 const latest=new Map();for(const row of annotations){const key=JSON.stringify([row.annotator.id,row.annotation.record_id]),old=latest.get(key);if(!old||(row.saved_at||'')>(old.saved_at||''))latest.set(key,row);}
 const judgments=new Map(historical.map(r=>[r.record_id,{...r,origin:r.origin||'human_export'}]));
 for(const t of campaignTasks){const stored=reviewRows.find(r=>r.record_id===t.record_id);if(!stored)continue;const a=typeof stored.payload==='string'?JSON.parse(stored.payload):stored.payload;if(a.status!=='submitted')continue;
  const current=latest.get(JSON.stringify([t.original_annotator.id,t.record_id]));const stale=current&&current.version!==a.source_version;
  judgments.set(t.record_id,{record_id:t.record_id,annotator:t.original_annotator,original_verdict:t.snapshot_annotation.verdict,decision:a.decision.startsWith('pass')?'pass':'reject',cards_modified:a.decision==='pass_modified',reviewer:stored.reviewer_name||stored.reviewer,reviewed_at:stored.saved_at||a.updated_at,source_version:a.source_version,stale:!!stale,origin:'admin_review'});
 }
 const rows=names.map(name=>({name,submitted:0,submitted_passed:0,reviewed_total:0,human_reviewed_total:0,ai_accepted:0,reviewed_predicted_pass:0,selection_correct:0,selection_rejected:0,uncertain:0,final_accepted:0,pending_card_edits:0,cards_need_change:0,stale_review:0}));
 const byName=new Map(rows.map(r=>[r.name,r]));
 for(const item of latest.values()){const row=byName.get(item.annotator.name),a=item.annotation;if(row&&a.status==='submitted'){row.submitted++;if(a.verdict==='pass')row.submitted_passed++;}}
 for(const r of judgments.values()){const row=byName.get(r.annotator.name);if(!row)continue;if(r.stale){row.stale_review++;continue;}row.reviewed_total++;if(r.origin==='ai_accepted')row.ai_accepted++;else row.human_reviewed_total++;if(r.decision==='pass')row.final_accepted++;if(r.decision==='edit')row.pending_card_edits++;
  if(r.decision==='edit'||r.cards_modified)row.cards_need_change++;
  if(r.original_verdict!=='pass')continue;row.reviewed_predicted_pass++;if(['pass','edit'].includes(r.decision))row.selection_correct++;else if(r.decision==='reject')row.selection_rejected++;else row.uncertain++;
 }
 for(const r of rows){r.precision_denominator=r.selection_correct+r.selection_rejected;r.precision=r.precision_denominator?r.selection_correct/r.precision_denominator:null;}
 const sum=field=>rows.reduce((n,r)=>n+r[field],0),totals=Object.fromEntries(['submitted','submitted_passed','reviewed_total','human_reviewed_total','ai_accepted','reviewed_predicted_pass','selection_correct','selection_rejected','uncertain','final_accepted','pending_card_edits','cards_need_change','stale_review'].map(k=>[k,sum(k)]));
 totals.precision_denominator=totals.selection_correct+totals.selection_rejected;totals.precision=totals.precision_denominator?totals.selection_correct/totals.precision_denominator:null;
 const annotation_index=[...latest.values()].map(r=>({record_id:r.annotation.record_id,annotator:r.annotator,status:r.annotation.status,verdict:r.annotation.verdict,approval_type:r.annotation.approval_type,card_count:r.annotation.issues?.length||0,version:r.version,saved_at:r.saved_at}));
 const review_campaign={total:campaignTasks.length,completed:0,reviewers:[]};
 for(const name of [...new Set(campaignTasks.map(t=>t.assignee))]){const assigned=campaignTasks.filter(t=>t.assignee===name),records=reviewRows.filter(r=>assigned.some(t=>t.record_id===r.record_id)).map(r=>typeof r.payload==='string'?JSON.parse(r.payload):r.payload),completed=records.filter(a=>a.status==='submitted').length;review_campaign.completed+=completed;review_campaign.reviewers.push({name,assigned:assigned.length,completed,remaining:assigned.length-completed,pass:records.filter(a=>a.status==='submitted'&&a.decision==='pass').length,pass_modified:records.filter(a=>a.status==='submitted'&&a.decision==='pass_modified').length,reject:records.filter(a=>a.status==='submitted'&&a.decision.startsWith('reject')).length});}
 return {generated_at:new Date().toISOString(),rows,totals,annotation_index,review_campaign,definitions:{precision:'初审判通过且已有人工或已采纳 AI 复核结论的记录中，（审核通过＋仅需改卡片）÷（审核通过＋仅需改卡片＋审核拒绝）；暂不确定及过期复核不进入分母。',final_accepted:'人工明确通过及用户已采纳的 AI 通过，含管理员修改卡片后提交通过；历史仅提出改卡建议的记录单列待改卡片。',sampling:'历史抽查和本轮疑点复核的合并样本，并非统一随机抽样；比较人员时同时看复核条数和样本构成。'},judgments:[...judgments.values()]};
}
