import {mergeExports} from './core.js?v=8-full';
import {screenPlaybackExports} from './screening.js?v=8-full';
import {GROUP_SIZE,sourceOf} from './dataset-config.js?v=8-full';

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
export function groupTasks(tasks,group,source='all'){return tasks.filter((task,index)=>(group==='all'||Math.floor(index/GROUP_SIZE)===Number(group))&&(source==='all'||sourceOf(task)===source));}
export function resolveStartTask(tasks,state,params){
  const explicit=params.get('group'),count=Math.ceil(tasks.length/GROUP_SIZE);
  const validGroup=value=>/^\d+$/.test(value||'')&&Number(value)>=1&&Number(value)<=count;
  let group=validGroup(explicit)?String(Number(explicit)-1):String(state.group??'all');
  if(group!=='all'&&(!/^\d+$/.test(group)||Number(group)>=count))group='all';
  const sources=new Set(tasks.map(sourceOf)),requested=params.get('source');
  let source=requested??(validGroup(explicit)?'all':state.source_filter??'all');
  if(!sources.has(source))source='all';
  const sample=params.get('sample');
  let index=tasks.findIndex(t=>sample?t.record_id===sample||t.dir_name===sample:t.record_id===state.current_id);
  if(sample&&index<0){const matches=tasks.map((task,i)=>({task,i})).filter(({task})=>task.record_id.split('::').at(-1)===sample);if(matches.length===1)index=matches[0].i;}
  if(index>=0&&!groupTasks(tasks,group,source).includes(tasks[index])){
    if(sample){group='all';source='all';}else index=-1;
  }
  if(!groupTasks(tasks,group,source).length)group='all';
  if(index<0){const selected=groupTasks(tasks,group,source);index=tasks.indexOf(selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0]);}
  return {group,source,index:Math.max(0,index)};
}
export function groupLink(base,group,source='all'){
  const url=new URL(base);url.hash='';url.search='';
  if(group!=='all')url.searchParams.set('group',String(Number(group)+1));
  if(source!=='all')url.searchParams.set('source',source);
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
