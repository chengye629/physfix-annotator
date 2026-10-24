import {mergeExports} from './core.js?v=7-playback';
import {screenPlaybackExports} from './screening.js?v=7-playback';

export function annotationStage(annotation){
  if(annotation?.status==='submitted')return annotation.verdict;
  return annotation&&((annotation.revision||0)>0||annotation.legacy?.status==='submitted')?'draft':'new';
}
export function matchesTaskStatus(annotation,filter){
  const stage=annotationStage(annotation);
  if(filter==='all')return true;
  if(filter==='pending')return annotation?.status!=='submitted';
  if(filter==='submitted')return annotation?.status==='submitted';
  return stage===filter;
}
export function groupTasks(tasks,group){return tasks.filter((task,index)=>group==='all'||Math.floor(index/50)===Number(group));}
export function resolveStartTask(tasks,state,params){
  const explicit=params.get('group');
  let group=explicit&&/^[1-6]$/.test(explicit)?String(Number(explicit)-1):String(state.group??'all');
  if(!['all','0','1','2','3','4','5'].includes(group))group='all';
  const sample=params.get('sample');
  let index=tasks.findIndex(t=>sample?t.record_id.split('::').at(-1)===sample:t.record_id===state.current_id);
  if(index>=0&&group!=='all'&&Math.floor(index/50)!==Number(group)){
    if(sample)group='all';else index=-1;
  }
  if(index<0){const selected=groupTasks(tasks,group);index=tasks.indexOf(selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0]);}
  return {group,index:Math.max(0,index)};
}
export function groupLink(base,group){
  const url=new URL(base);url.hash='';url.search='';
  if(group==='all')url.searchParams.delete('group');else url.searchParams.set('group',String(Number(group)+1));
  return url.href;
}
export function buildReviewSummary(exports,taskIds,minimumReviews=2){
  const minimum=Math.max(1,Number(minimumReviews)||1),ids=[...new Set(taskIds)],known=new Set(ids);
  const screened=screenPlaybackExports(exports);
  const received=mergeExports(screened.exports,minimum).filter(row=>known.has(row.record_id));
  const byId=new Map(received.map(row=>[row.record_id,row]));
  const samples=ids.map(record_id=>byId.get(record_id)||{record_id,reviewer_count:0,status:'unreviewed',eligible:false,votes:[]});
  const people=new Map();
  for(const data of exports)if(!people.has(data.annotator.id))people.set(data.annotator.id,{id:data.annotator.id,name:data.annotator.name,submitted:0,pass:0,reject_no_clear_issue:0,reject_poor_quality:0,latest:0});
  for(const sample of received)for(const vote of sample.votes){
    const person=people.get(vote.annotator.id);if(!person)continue;
    person.submitted+=1;person[vote.annotation.verdict]+=1;
    const updated=Date.parse(vote.annotation.updated_at)||0;if(updated>=person.latest){person.name=vote.annotator.name;person.latest=updated;}
  }
  const coverage={total:ids.length,covered:received.length,met_minimum:samples.filter(r=>r.reviewer_count>=minimum).length,needs_more:samples.filter(r=>r.reviewer_count<minimum).length,conflicts:samples.filter(r=>r.status==='conflict').length,eligible:samples.filter(r=>r.eligible).length};
  const followup=samples.filter(r=>r.reviewer_count<minimum||r.status==='conflict').map(r=>({record_id:r.record_id,reviewer_count:r.reviewer_count,additional_reviews:Math.max(0,minimum-r.reviewer_count),needs_adjudication:r.status==='conflict',reason:r.status==='conflict'?'conflict':r.reviewer_count?'insufficient':'unreviewed',reviewed_by:r.votes.map(v=>v.annotator.id)}));
  return {minimum,coverage,samples,followup,screening:screened.report,screened_out:screened.excluded,annotators:[...people.values()].map(({latest,...person})=>person)};
}
export function filterReviewRows(summary,filter){
  return summary.samples.filter(row=>filter==='received'?row.reviewer_count>0:filter==='needs_more'?row.reviewer_count<summary.minimum:filter==='all'?true:row.status===filter);
}
