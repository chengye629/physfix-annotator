import {participantFor} from './participants.js?v=11-roster';
export const ACTIVE_WORKSPACE_KEY='physfix.workspace.v1';
const PROFILE_PREFIX='physfix.person.v1.';
export function normalizeName(value){
  const name=String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');
  if(!name||!/[\p{L}\p{N}]/u.test(name))throw new Error('请填写姓名。');
  if(name.length>32)throw new Error('姓名请控制在 32 个字符以内。');
  if(/[\p{Cc}\p{Cf}]/u.test(name))throw new Error('姓名中包含无效字符。');
  return name;
}
const canonical=name=>participantFor(name)?.name??normalizeName(name);
export const profileKey=name=>PROFILE_PREFIX+encodeURIComponent(normalizeName(name));
export const personalExportPrefix=(name,person=null)=>'physfix_'+canonical(normalizeName(name)).replace(/[^\p{L}\p{N}_-]/gu,'_')+(person===null?'':'_任务'+person);
export function openNamedWorkspace(current,value,storage,{createId=()=>crypto.randomUUID()}={}){
  const input=normalizeName(value),name=canonical(input),previous=String(current?.annotator?.name??'').normalize('NFC').trim().replace(/\s+/g,' ');
  const same=previous&&canonical(previous)===name,unnamed=!previous&&Object.keys(current?.annotations||{}).length;
  const keys=new Set([profileKey(name),profileKey(input)]);
  for(const key of storage.keys?.()??[]){
    if(!key.startsWith(PROFILE_PREFIX))continue;
    try{if(canonical(decodeURIComponent(key.slice(PROFILE_PREFIX.length)))===name)keys.add(key);}catch{}
  }
  const profiles=[];
  for(const key of keys){
    const raw=storage.getItem(key);if(!raw)continue;
    let saved;try{saved=JSON.parse(raw);}catch{throw new Error('该姓名的本机进度无法读取，请先使用备份恢复。');}
    if(!saved?.annotator?.id||!saved.annotator.name||canonical(saved.annotator.name)!==name||!saved.annotations||Array.isArray(saved.annotations)||typeof saved.annotations!=='object')throw new Error('该姓名的本机进度格式无效，请先使用备份恢复。');
    profiles.push(saved);
  }
  if(same||unnamed)profiles.push(current);
  let next=profiles.at(-1)??{schema_version:2,annotator:{id:createId(),name},annotations:{},current_id:null,group:'all',source_filter:'all'};
  const annotations={};
  for(const profile of profiles)for(const [id,annotation] of Object.entries(profile.annotations)){
    const old=annotations[id],aTime=Date.parse(annotation.updated_at)||0,bTime=Date.parse(old?.updated_at)||0;
    if(!old||aTime>bTime||(aTime===bTime&&(annotation.revision??0)>=(old.revision??0)))annotations[id]=annotation;
  }
  next={...next,annotator:{...next.annotator,name},annotations};
  // Keep the old spelling as a backup before switching people or canonicalizing an alias.
  if(previous&&(!same||previous!==name)){
    try{storage.setItem(profileKey(previous),JSON.stringify({...current,annotator:{...current.annotator,name:previous}}));}
    catch{throw new Error('切换前保存失败，请先导出当前进度。');}
  }
  return next;
}
