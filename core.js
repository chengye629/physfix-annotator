import {classifyApproval,OUTCOMES,outcome} from './approval.js?v=12-cloud';
export {OUTCOMES,outcome};
import {normalizeAssignment} from './assignments.js?v=12-cloud';
import {normalizePlayback} from './playback.js?v=12-cloud';
import {DATASET,LEGACY_DATASETS,DATASET_REVISION,HF_REVISION} from './dataset-config.js?v=12-cloud';
export {DATASET};
export const SCHEMA_VERSION=2;
export const HF_BASE='https://huggingface.co/datasets/HuggingFriends/PhysFixBench/resolve/'+HF_REVISION+'/videos/';
export const VERDICTS={pass:'通过',reject_no_clear_issue:'拒绝：没有明确、无争议的物理问题',reject_poor_quality:'拒绝：整体质量太差，物理问题过多'};
export const shortId=id=>id.split('::').at(-1);
export const videoUrl=(id,filename=shortId(id)+'.mp4')=>HF_BASE+encodeURIComponent(filename);
export const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(v,max=4000)=>typeof v==='string'?v.slice(0,max):'';
export const emptyIssue=()=>({timestamp:'',problem:'',expected:''});
function seconds(value){if(!/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(value))return NaN;const parts=value.split(':').map(Number);if(parts.length>1&&parts.slice(1).some(n=>n>=60))return NaN;return parts.reduce((sum,n)=>sum*60+n,0);}
export function parseTimestamp(value){const clean=String(value??'').trim().replace(/^第\s*/,'').replace(/(?:秒|s|左右)/gi,'').replace(/\s/g,'');const parts=clean.split(/[–—−~～\-至]/);if(!clean||parts.length>2||parts.some(p=>!p))return null;const start=seconds(parts[0]),end=parts.length===2?seconds(parts[1]):start;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<start||(parts.length===2&&end===start))return null;return {start,end,point:parts.length===1};}
export function playbackRange(timestamp,duration){const t=parseTimestamp(timestamp);if(!t||!Number.isFinite(duration)||duration<=0||t.end>duration+0.15||t.start>=duration)return null;return t.point?{start:Math.max(0,t.start-0.5),end:Math.min(duration,t.end+0.75)}:{start:t.start,end:Math.min(duration,t.end)};}
export function seedIssues(task){
  const prefix=/^第?\s*(\d+(?:\.\d+)?)\s*s?\s*(?:([–—−~\-至])\s*(\d+(?:\.\d+)?)\s*s?|s)?\s*(?:左右)?\s*[：:]\s*/i;
  const issues=(task.fix_problems||[]).map((problem,i)=>{const m=problem.match(prefix);return {timestamp:m?(m[3]?`${m[1]}–${m[3]}`:m[1]):'',problem:m?problem.slice(m[0].length):problem,expected:task.fix_expected?.[i]||''};});return issues.length?issues:[emptyIssue()];
}
export function createDraft(recordId,task){return {record_id:recordId,status:'draft',verdict:'',issues:task?seedIssues(task):[emptyIssue()],keep:task?.fix_keep||'',duration:null,revision:0,updated_at:new Date().toISOString()};}
export function buildPrompt(a){const issues=a.issues||[];return `【存在的问题】\n${issues.map((v,i)=>`${i+1}. 第${v.timestamp}s：${v.problem}`).join('\n')}\n\n【应修改为】\n${issues.map((v,i)=>`${i+1}. ${v.expected}`).join('\n')}\n\n请在保持${a.keep||'其余正常内容'}不变的前提下，修正上述物理问题并重新生成视频。`;}
export function validateAnnotation(a){
  if(!a||!Object.hasOwn(VERDICTS,a.verdict))return ['请选择一个提交结果。'];if(a.verdict!=='pass')return [];
  const errors=[];if(!Array.isArray(a.issues)||!a.issues.length||a.issues.length>50)errors.push('请保留至少一张问题卡片。');
  if(!Number.isFinite(a.duration)||a.duration<=0)errors.push('请先成功加载视频。');
  for(const [i,v] of (Array.isArray(a.issues)?a.issues:[]).entries()){const t=parseTimestamp(v.timestamp);if(!t)errors.push(`问题 ${i+1}：时间戳无效，例如 1.0–3.5 或 2.0。`);else if(Number.isFinite(a.duration)&&(t.start>=a.duration||t.end>a.duration+0.15))errors.push(`问题 ${i+1}：时间戳超出视频时长。`);if(!text(v.problem).trim())errors.push(`问题 ${i+1}：请填写物理问题描述。`);if(!text(v.expected).trim())errors.push(`问题 ${i+1}：请填写修改后状态的描述。`);}return errors;
}
export const isEffective=a=>a?.status==='submitted'&&a.verdict==='pass'&&!validateAnnotation(a).length;
// Preserve edited cards. Old uncertain/unplayable votes require a fresh decision.
export function upgradeAnnotation(item,task,legacyVersion=false){
  if(!item||!['draft','submitted'].includes(item.status)||!Array.isArray(item.issues)||item.issues.length>50)throw new Error('记录格式无效。');
  const previous=item.verdict||'',legacy=legacyVersion||['obvious','none','unsure','unplayable'].includes(previous);let verdict=previous,status=item.status;
  if(legacy){verdict={obvious:'pass',none:'reject_no_clear_issue',unsure:'',unplayable:'','':''}[previous];if(verdict===undefined)throw new Error('备份包含无效判定。');if(['unsure','unplayable'].includes(previous))status='draft';}
  if(verdict!==''&&!Object.hasOwn(VERDICTS,verdict))throw new Error('备份包含无效判定。');
  let issues=item.issues.map(v=>{const start=typeof v?.start==='number'?String(v.start):text(v?.start,30),end=typeof v?.end==='number'?String(v.end):text(v?.end,30);return {timestamp:typeof v?.timestamp==='string'?text(v.timestamp,80):start&&end?(start===end?start:`${start}–${end}`):start,problem:text(v?.problem),expected:text(v?.expected)};});
  if(legacy&&!previous&&issues.length&&issues.every(v=>!v.timestamp&&!v.problem&&!v.expected)&&task)issues=seedIssues(task);
  const upgraded={record_id:item.record_id,status,verdict,issues,keep:text(item.keep,1500),duration:typeof item.duration==='number'&&Number.isFinite(item.duration)&&item.duration>0?item.duration:null,revision:Number.isSafeInteger(item.revision)&&item.revision>=0?item.revision:0,updated_at:typeof item.updated_at==='string'&&Number.isFinite(Date.parse(item.updated_at))?new Date(item.updated_at).toISOString():'1970-01-01T00:00:00.000Z',...(normalizePlayback(item.watch)?{watch:normalizePlayback(item.watch)}:{}),...(normalizePlayback(item.submitted_watch)?{submitted_watch:normalizePlayback(item.submitted_watch)}:{}),...(item.approval_type==='direct'||item.approval_type==='modified'?{approval_type:item.approval_type,approval_source:item.approval_source==='button'?'button':'comparison'}:{}),...(legacy?{legacy:{verdict:previous,status:item.status,notes:text(item.notes,2000),checks:item.checks||{}}}:item.legacy?{legacy:item.legacy}:{})};
  return classifyApproval(upgraded,task?seedIssues(task):null);
}
export function makeExport(state){return {schema_version:SCHEMA_VERSION,dataset:DATASET,dataset_revision:DATASET_REVISION,export_type:'personal_backup',exported_at:new Date().toISOString(),...(state.assignment?{assignment:structuredClone(state.assignment)}:{}),annotator:{id:state.annotator.id,name:state.annotator.name},annotations:Object.values(state.annotations).map(a=>({...a,fixing_prompt_zh:a.verdict==='pass'?buildPrompt(a):null}))};}
export function normalizeExport(raw,knownIds,taskById=null){
  if(!raw||![1,SCHEMA_VERSION].includes(raw.schema_version)||![DATASET,...LEGACY_DATASETS].includes(raw.dataset)||raw.export_type!=='personal_backup')throw new Error('请选择个人备份 JSON。');
  if(!raw.annotator||!text(raw.annotator.id,120).trim()||!text(raw.annotator.name,32).trim())throw new Error('备份缺少标注人。');
  if(!Array.isArray(raw.annotations)||raw.annotations.length>knownIds.size)throw new Error('备份记录格式无效。');
  const seen=new Set();const annotations=raw.annotations.map(item=>{if(!item||!knownIds.has(item.record_id)||seen.has(item.record_id))throw new Error('备份包含未知或重复样本。');seen.add(item.record_id);const a=upgradeAnnotation(item,taskById?.get(item.record_id)??null,raw.schema_version===1);if(a.status==='submitted'&&validateAnnotation(a).length)throw new Error(`${shortId(a.record_id)} 的已提交标注无效。`);return a;});
  return {schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'personal_backup',...(raw.assignment?{assignment:normalizeAssignment(raw.assignment,knownIds)}:{}),annotator:{id:text(raw.annotator.id,120),name:text(raw.annotator.name,32)},annotations};
}
export function selectLatestAnnotations(exports){
  const latest=new Map();for(const data of exports)for(const a of data.annotations){const key=JSON.stringify([data.annotator.id,a.record_id]),old=latest.get(key);if(!old||Date.parse(a.updated_at)>Date.parse(old.annotation.updated_at)||(a.updated_at===old.annotation.updated_at&&a.revision>old.annotation.revision))latest.set(key,{annotator:data.annotator,annotation:a});}
  return [...latest.values()];
}
export function mergeExports(exports,minimumReviews=2){
  const groups=new Map();for(const vote of selectLatestAnnotations(exports)){if(vote.annotation.status!=='submitted')continue;const id=vote.annotation.record_id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(vote);}
  return [...groups].map(([record_id,votes])=>{const conflict=new Set(votes.map(v=>v.annotation.verdict)).size>1,eligible=votes.length>=minimumReviews&&!conflict&&votes.every(v=>isEffective(v.annotation));return {record_id,reviewer_count:votes.length,status:conflict?'conflict':eligible?'eligible':votes.length<minimumReviews?'insufficient':'excluded',eligible,votes};}).sort((a,b)=>a.record_id.localeCompare(b.record_id));
}
