export const ACTIVE_WORKSPACE_KEY='physfix.workspace.v1';
const PROFILE_PREFIX='physfix.person.v1.';
export function normalizeName(value){
  const name=String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');
  if(!name||!/[\p{L}\p{N}]/u.test(name))throw new Error('请填写姓名。');
  if(name.length>32)throw new Error('姓名请控制在 32 个字符以内。');
  if(/[\p{Cc}\p{Cf}]/u.test(name))throw new Error('姓名中包含无效字符。');
  return name;
}
export const profileKey=name=>PROFILE_PREFIX+encodeURIComponent(normalizeName(name));
export const personalExportPrefix=(name,person=null)=>'physfix_'+normalizeName(name).replace(/[^\p{L}\p{N}_-]/gu,'_')+(person===null?'':'_任务'+person);
export function openNamedWorkspace(current,value,storage,{createId=()=>crypto.randomUUID()}={}){
  const name=normalizeName(value),previous=String(current?.annotator?.name??'').normalize('NFC').trim().replace(/\s+/g,' ');
  // An old unnamed workspace may already contain human edits; keep them on first naming.
  if(previous===name||(!previous&&Object.keys(current?.annotations||{}).length)){
    return {...current,annotator:{...current.annotator,name}};
  }
  let next;
  const raw=storage.getItem(profileKey(name));
  if(raw){
    try{next=JSON.parse(raw);}catch{throw new Error('该姓名的本机进度无法读取，请先使用备份恢复。');}
    if(!next?.annotator?.id||next.annotator.name!==name||!next.annotations||Array.isArray(next.annotations)||typeof next.annotations!=='object'){
      throw new Error('该姓名的本机进度格式无效，请先使用备份恢复。');
    }
  }else{
    next={schema_version:2,annotator:{id:createId(),name},annotations:{},current_id:null,group:'all',source_filter:'all'};
  }
  // Archive the active person before replacing the active slot. A failed write must stop a switch.
  if(previous){
    try{storage.setItem(profileKey(previous),JSON.stringify({...current,annotator:{...current.annotator,name:previous}}));}
    catch{throw new Error('切换前保存失败，请先导出当前进度。');}
  }
  return next;
}
