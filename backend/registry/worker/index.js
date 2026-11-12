import {BATCH1_REREVIEW_CAMPAIGN,BATCH1_REREVIEW_TASKS} from './batch1-rereview.js';
import {BATCH2_REVIEW_CAMPAIGN,BATCH2_REVIEW_TASKS} from './batch2-review-campaign.js';
import {CARD_RESOLUTIONS} from './card-resolutions.js';
import {BATCH2_DATA} from './batch2-data.js';
import {PHYSICS_EVIDENCE} from './physics-evidence.js';
import {HISTORICAL_REVIEWS} from './human-reviews.js';
import {buildQualityStatistics} from './quality-metrics.js';
import {REVIEW_CAMPAIGN,REVIEW_TASKS} from './review-campaign.js';
import {STATIC_ASSETS} from './static-assets.js';
import {classifyApproval,stableStringify,outcome,compareApproval} from './approval.js';
import {BASELINES} from './baselines.js';
import {ASSIGNMENT_PLAN,PARTICIPANT_COUNT,PARTICIPANTS,participantFor,nameKey} from './participants.js';
export const PLAN=ASSIGNMENT_PLAN;
export const CAPACITY=PARTICIPANT_COUNT,DATASET_COUNT=606;
const WEB_ORIGIN='https://chengye629.github.io';
class ApiError extends Error{constructor(status,message,code='request_error'){super(message);Object.assign(this,{status,code});}}
export function normalizeName(value){
 const name=String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');
 if(!name||name.length>32||!/[\p{L}\p{N}]/u.test(name)||/[\p{Cc}\p{Cf}]/u.test(name))throw new ApiError(400,'请填写有效姓名。','invalid_name');
 return name;
}
const roleFor=name=>participantFor(name)?.role??'member';
async function authorize(request,env,adminOnly=false){
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
 const row=token?await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND session_token=?2 AND released_at IS NULL').bind(PLAN,token).first():null;
 if(row){const role=roleFor(row.display_name);if(row.role!==role){await env.DB.prepare('UPDATE registrations SET role=?1 WHERE claim_id=?2').bind(role,row.claim_id).run();row.role=role;}}
 if(!row||adminOnly&&row.role!=='admin')throw new ApiError(403,adminOnly?'需要管理员权限。':'请重新填写姓名进入。','forbidden');
 return row;
}
async function body(request,maxBytes=4096){
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'请求内容无效。');
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new ApiError(413,'请求内容过长。');}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(all));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new ApiError(400,'请求内容无效。');}
}
const SELECT_ACTIVE='SELECT * FROM registrations WHERE plan=?1 AND name_key=?2 AND released_at IS NULL';
const SELECT_ID='SELECT * FROM registrations WHERE plan=?1 AND claim_id=?2 AND released_at IS NULL';
const RELEASE='UPDATE registrations SET released_at=?1,released_by=?2,release_id=?3 WHERE plan=?4 AND claim_id=?5 AND released_at IS NULL';
const countFor=slot=>slot===null||slot===9?0:Math.floor(DATASET_COUNT/CAPACITY)+(slot<=DATASET_COUNT%CAPACITY?1:0);
function mapped(row,withToken=false){
 return {plan:PLAN,participants:CAPACITY,person:row.slot,claim_id:row.claim_id,task_count:countFor(row.slot),annotator:{id:row.annotator_id,name:row.display_name},role:row.role,...(withToken?{token:row.session_token}:{})};
}
async function claim(request,env){
 const data=await body(request),input=normalizeName(data.name),member=participantFor(input),name=member?.name??input,key=nameKey(name);
 let existing=await env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key).first();
 if(!existing&&member){const active=await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND released_at IS NULL').bind(PLAN).all();existing=active.results.find(row=>participantFor(row.display_name)?.person===member.person);if(existing){await env.DB.prepare('UPDATE registrations SET name_key=?1,display_name=?2 WHERE claim_id=?3').bind(key,name,existing.claim_id).run();existing.name_key=key;existing.display_name=name;}}if(existing){const role=roleFor(existing.display_name);if(existing.role!==role){await env.DB.prepare('UPDATE registrations SET role=?1 WHERE claim_id=?2').bind(role,existing.claim_id).run();existing.role=role;}return mapped(existing,true);}
 if(!member)throw new ApiError(400,'未在名单中找到这个姓名，请填写中文姓名或完整英文拼音。','unknown_participant');
 const previous=await env.DB.prepare('SELECT display_name,annotator_id FROM registrations WHERE plan<>?1 AND released_at IS NULL ORDER BY created_at DESC LIMIT 100').bind(PLAN).all();
 const legacy=previous.results.find(row=>participantFor(row.display_name)?.person===member.person);
 let id=legacy?.annotator_id??(typeof data.annotator_id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(data.annotator_id)?data.annotator_id:crypto.randomUUID());
 for(let attempt=0;attempt<2;attempt++){
  const results=await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind(crypto.randomUUID(),PLAN,member.person,key,name,id,new Date().toISOString(),member.role,crypto.randomUUID()+crypto.randomUUID()),
   env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key)
  ]);
  const row=results[1].results?.[0];if(row)return mapped(row,true);
  const occupied=await env.DB.prepare('SELECT claim_id FROM registrations WHERE plan=?1 AND slot=?2 AND released_at IS NULL').bind(PLAN,member.person).first();
  if(occupied)throw new ApiError(409,'你的预设任务已由管理员调整，请联系叶程或马思远。','slot_reassigned');
  id=crypto.randomUUID();
 }
 throw new ApiError(503,'登记暂时失败，请重试。');
}
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;
 if(path==='/health')return {data:{ready:!!env.DB,plan:PLAN,participants:CAPACITY,annotations:true,api_version:2}};
 if(!env.DB)throw new ApiError(503,'登记服务暂时不可用。','storage_unavailable');
 if(path.startsWith('/api/batch2/'))return {data:await batch2Route(request,env,url)};
 if(path==='/api/demos'&&request.method==='GET')return {data:await publishedDemos(env)};
 if(path==='/api/claim'&&request.method==='POST')return {data:await claim(request,env)};
 if(['/api/annotations','/api/annotations/sync','/api/examples','/api/admin/annotations'].includes(path)){const owner=await authorize(request,env,path==='/api/admin/annotations');return {data:await annotationRoute(request,env,owner,url)};}
 if(['/api/admin/batch1-rereview','/api/admin/batch1-rereview/save'].includes(path)){const owner=await authorize(request,env,true),target=new URL(url);target.pathname=path.replace('/batch1-rereview','/reviews');return {data:await adminReviewRoute(request,env,owner,target,{campaign:BATCH1_REREVIEW_CAMPAIGN,tasks:BATCH1_REREVIEW_TASKS,sourceTable:'annotations',frozenSource:true,sharedReview:true})};}
 if(['/api/admin/reviews','/api/admin/reviews/save'].includes(path)){const owner=await authorize(request,env,true);return {data:await adminReviewRoute(request,env,owner,url)};}
 if(path==='/api/admin/quality'&&request.method==='GET'){
  await authorize(request,env,true);
  const annotations=(await env.DB.prepare('SELECT * FROM annotations').all()).results.map(cloudRow);
  const reviews=(await env.DB.prepare('SELECT * FROM admin_reviews WHERE campaign_id=?1').bind(REVIEW_CAMPAIGN.id).all()).results;
  const statistics=buildQualityStatistics(annotations,[...HISTORICAL_REVIEWS,...CARD_RESOLUTIONS],REVIEW_TASKS,reviews,PARTICIPANTS.map(p=>p.name));
  const physics_evidence={...PHYSICS_EVIDENCE};
  for(const row of reviews){const a=JSON.parse(row.payload);if(a.status==='submitted'&&!physics_evidence[a.record_id])physics_evidence[a.record_id]={issues:a.issues,pending_issues:[],note:a.note||'',basis:'admin_review_cards'};}
  for(const t of REVIEW_TASKS)if(!physics_evidence[t.record_id])physics_evidence[t.record_id]={issues:t.snapshot_annotation.issues,pending_issues:[],basis:'annotation_cards'};
  return {data:{...statistics,physics_evidence,transferred_to_batch2:BATCH2_DATA.carried_ids.length}};
 }
 if(path==='/api/lease'&&request.method==='GET'){
  const row=await authorize(request,env);
  if(row.claim_id!==url.searchParams.get('claim_id'))throw new ApiError(410,'任务已调整，请重新进入。','claim_released');
  return {data:mapped(row)};
 }
 if(path==='/api/admin/claims'&&request.method==='GET'){
  await authorize(request,env,true);
  const rows=(await env.DB.prepare('SELECT claim_id,slot,display_name,annotator_id,created_at,role FROM registrations WHERE plan=?1 AND released_at IS NULL ORDER BY slot').bind(PLAN).all()).results;
  const claims=PARTICIPANTS.map(member=>{const row=rows.find(row=>nameKey(row.display_name)===nameKey(member.name));return row?{...row,role:member.role}:{claim_id:null,slot:member.person,display_name:member.name,role:member.role,created_at:null};});
  claims.push(...rows.filter(row=>!PARTICIPANTS.some(member=>nameKey(member.name)===nameKey(row.display_name))));
  return {data:{plan:PLAN,participants:CAPACITY,claims:claims.map(row=>({...row,task_count:countFor(row.slot)}))}};
 }
 if(['/api/admin/release','/api/admin/reassign'].includes(path)&&request.method==='POST'){
  const admin=await authorize(request,env,true),data=await body(request);
  const old=await env.DB.prepare(SELECT_ID).bind(PLAN,String(data.claim_id||'')).first();
  if(!old)throw new ApiError(404,'领取记录已变化，请刷新。');
  if(old.claim_id===admin.claim_id)throw new ApiError(409,'请由另一位管理员调整你的任务。');
  const nonce=crypto.randomUUID(),time=new Date().toISOString();
  if(path.endsWith('/release')){
   const result=await env.DB.prepare(RELEASE).bind(time,admin.display_name,nonce,PLAN,old.claim_id).run();
   if(!result.meta.changes)throw new ApiError(409,'领取记录已变化，请刷新。');
   return {data:{released:true,person:old.slot}};
  }
  const input=normalizeName(data.name),name=participantFor(input)?.name??input,key=nameKey(name);
  if(await env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key).first())throw new ApiError(409,'该姓名已经领取任务。');
  try{
   const results=await env.DB.batch([
    env.DB.prepare(RELEASE).bind(time,admin.display_name,nonce,PLAN,old.claim_id),
    env.DB.prepare(`INSERT INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token)
     SELECT ?1,plan,slot,?2,?3,?4,?5,?6,?7 FROM registrations WHERE claim_id=?8 AND release_id=?9`).bind(crypto.randomUUID(),key,name,crypto.randomUUID(),time,roleFor(name),crypto.randomUUID()+crypto.randomUUID(),old.claim_id,nonce)
   ]);
   if(!results[1].meta.changes)throw new ApiError(409,'领取记录已变化，请刷新。');
  }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(409,'重新分配失败，请刷新人员列表。');}
  return {data:{reassigned:true,person:old.slot,name}};
 }
 throw new ApiError(404,'接口不存在。');
}
export default {async fetch(request,env){
 const assetPath=new URL(request.url).pathname;const asset=STATIC_ASSETS[assetPath==='/'?'index.html':assetPath.endsWith('/')?assetPath.slice(1)+'index.html':assetPath.slice(1)];
 if(asset&&['GET','HEAD'].includes(request.method)){const bytes=Uint8Array.from(atob(asset.data),char=>char.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});}
 const origin=request.headers.get('Origin'),self=new URL(request.url).origin;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin&&(origin===WEB_ORIGIN||origin===self||(env.PRODUCTION===false&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))))headers['Access-Control-Allow-Origin']=origin;
 if(origin&&!headers['Access-Control-Allow-Origin'])return new Response(JSON.stringify({error:'不允许的来源。'}),{status:403,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
 try{const {data}=await handle(request,env);return new Response(JSON.stringify(data),{status:200,headers});}
 catch(error){const known=error instanceof ApiError;if(!known)console.error('Registry request failed:',error.name||'Error');return new Response(JSON.stringify({error:known?error.message:'登记服务暂时不可用，请稍后重试。',code:known?error.code:'service_unavailable'}),{status:known?error.status:503,headers});}
}};

const recordKey=(owner,id)=>JSON.stringify([owner,id]);
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const cloudRow=row=>({annotator:{id:row.annotator_id,name:row.annotator_name},annotation:JSON.parse(row.payload),version:row.version,saved_at:row.saved_at});
const validateCloudAnnotation=value=>{
 if(!value||!Object.hasOwn(BASELINES,value.record_id)||!['draft','submitted'].includes(value.status)||!['','pass','reject_no_clear_issue','reject_poor_quality'].includes(value.verdict)||!Array.isArray(value.issues)||value.issues.length>50||!Number.isSafeInteger(value.revision)||value.revision<0||typeof value.updated_at!=='string'||!Number.isFinite(Date.parse(value.updated_at)))throw new ApiError(400,'标注格式无效，请保留本机备份并刷新页面。');
 for(const card of value.issues)if(!card||typeof card.timestamp!=='string'||card.timestamp.length>80||typeof card.problem!=='string'||card.problem.length>4000||typeof card.expected!=='string'||card.expected.length>4000)throw new ApiError(400,'问题卡片格式无效。');
 if(value.status==='submitted'&&!value.verdict)throw new ApiError(400,'已提交标注缺少判定。');
 if(new TextEncoder().encode(JSON.stringify(value)).length>524288)throw new ApiError(413,'单条标注内容过长。');
 return classifyApproval(value,BASELINES[value.record_id]);
};
async function annotationRoute(request,env,owner,url){
 const path=url.pathname;
 if(path==='/api/annotations/sync'&&request.method==='POST'){
  const data=await body(request,2097152);
  if(!Array.isArray(data.records)||!data.records.length||data.records.length>20)throw new ApiError(400,'每次同步应包含 1–20 条标注。');
  const saved=[],conflicts=[],demoCandidates=[];
  for(const entry of data.records){
   const raw=entry.annotation,annotation=validateCloudAnnotation(raw),key=recordKey(owner.annotator_id,annotation.record_id);
   const payload=stableStringify(annotation),hash=await digest(payload),rawPayload=stableStringify(raw),eventId=await digest(key+rawPayload);
   if(entry.base_version!==null&&(!Number.isSafeInteger(entry.base_version)||entry.base_version<0))throw new ApiError(400,'同步版本无效。');
   const time=new Date().toISOString();
   const results=await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO annotation_history(event_id,record_key,annotator_id,payload,created_at) VALUES(?1,?2,?3,?4,?5)').bind(eventId,key,owner.annotator_id,rawPayload,time),
    env.DB.prepare('INSERT INTO annotations(record_key,annotator_id,annotator_name,record_id,payload,content_hash,version,saved_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7) ON CONFLICT(record_key) DO UPDATE SET payload=excluded.payload,content_hash=excluded.content_hash,annotator_name=excluded.annotator_name,version=annotations.version+1,saved_at=excluded.saved_at WHERE annotations.version=?8 AND annotations.content_hash<>excluded.content_hash').bind(key,owner.annotator_id,owner.display_name,annotation.record_id,payload,hash,time,entry.base_version??-1),
    env.DB.prepare('SELECT * FROM annotations WHERE record_key=?1').bind(key)
   ]);
   const row=results[2].results[0];
   if(row.content_hash===hash){saved.push({record_id:annotation.record_id,version:row.version});demoCandidates.push(JSON.parse(row.payload));}
   else conflicts.push(cloudRow(row));
  }
  await freezeDemoSnapshot(env,owner,demoCandidates);
  return {saved,conflicts};
 }
 if(path==='/api/annotations'&&request.method==='GET'){
  const rows=await env.DB.prepare('SELECT * FROM annotations WHERE annotator_id=?1 ORDER BY record_id').bind(owner.annotator_id).all();
  await freezeDemoSnapshot(env,owner,rows.results.map(row=>JSON.parse(row.payload)));
  return {records:rows.results.map(cloudRow)};
 }
 if((path==='/api/examples'||path==='/api/admin/annotations')&&request.method==='GET'){
  const cursor=Number(url.searchParams.get('cursor')||0),limit=Math.min(100,Number(url.searchParams.get('limit')||50));
  if(!Number.isSafeInteger(cursor)||cursor<0||cursor>10000||!Number.isSafeInteger(limit)||limit<1)throw new ApiError(400,'分页参数无效。');
  let rows;
  if(path==='/api/examples'){
   const names=PARTICIPANTS.filter(p=>p.role==='admin').map(p=>p.name);
   rows=(await env.DB.prepare('SELECT * FROM annotations WHERE annotator_name IN (?1,?2,?3) ORDER BY saved_at DESC,record_key').bind(...names).all()).results;
   const stats=names.map(name=>{const all=rows.filter(r=>r.annotator_name===name).map(r=>JSON.parse(r.payload)).filter(a=>a.status==='submitted');return {name,total:all.length,pass_direct:all.filter(a=>outcome(a)==='pass').length,pass_modified:all.filter(a=>outcome(a)==='pass_modified').length,reject_no_clear_issue:all.filter(a=>a.verdict==='reject_no_clear_issue').length,reject_poor_quality:all.filter(a=>a.verdict==='reject_poor_quality').length};});
   rows=rows.filter(row=>JSON.parse(row.payload).status==='submitted');
   const selected=url.searchParams.get('name'),decision=url.searchParams.get('outcome');if(selected)rows=rows.filter(row=>row.annotator_name===selected);if(decision)rows=rows.filter(row=>outcome(JSON.parse(row.payload))===decision);
   return {admins:stats,total:rows.length,records:rows.slice(cursor,cursor+limit).map(cloudRow),next_cursor:cursor+limit<rows.length?cursor+limit:null};
  }
  rows=(await env.DB.prepare('SELECT * FROM annotations ORDER BY annotator_name,record_id LIMIT ?1 OFFSET ?2').bind(limit+1,cursor).all()).results;
  return {records:rows.slice(0,limit).map(cloudRow),next_cursor:rows.length>limit?cursor+limit:null};
 }
 throw new ApiError(404,'接口不存在。');
}

const DEMO_SOURCES=new Set(['马思远','林炬乙']);
async function freezeDemoSnapshot(env,owner,annotations){
 if(!DEMO_SOURCES.has(owner.display_name))return;
 const key=nameKey(owner.display_name),existing=await env.DB.prepare('SELECT payload FROM demo_snapshots WHERE source_key=?1').bind(key).first();
 const prior=existing?JSON.parse(existing.payload):[],seen=new Set(prior.map(row=>row.annotation.record_id));
 if(prior.length>=10)return;
 const available=annotations.filter(a=>Object.hasOwn(BASELINES,a.record_id)&&!seen.has(a.record_id)).sort((a,b)=>(a.updated_at||'').localeCompare(b.updated_at||'')||a.record_id.localeCompare(b.record_id));
 for(const a of available.slice(0,10-prior.length)){
  const time=new Date().toISOString();
  const annotation=Object.fromEntries(['record_id','status','verdict','approval_type','issues','duration','watch','submitted_watch','revision','updated_at'].filter(field=>a[field]!==undefined).map(field=>[field,a[field]]));
  const row={case_id:(await digest(key+':'+a.record_id)).slice(0,16),annotation,original:BASELINES[a.record_id],frozen_at:time},item=JSON.stringify(row);
  await env.DB.prepare("INSERT INTO demo_snapshots(source_key,payload,frozen_at) VALUES(?1,?2,?3) ON CONFLICT(source_key) DO UPDATE SET payload=json_insert(demo_snapshots.payload,'$[#]',json(?4)) WHERE json_array_length(demo_snapshots.payload)<10 AND NOT EXISTS(SELECT 1 FROM json_each(demo_snapshots.payload) WHERE json_extract(value,'$.annotation.record_id')=?5)").bind(key,'['+item+']',time,item,a.record_id).run();
 }
}
async function publishedDemos(env){
 for(const name of DEMO_SOURCES){
  const source=(await env.DB.prepare('SELECT payload FROM annotations WHERE annotator_name=?1 ORDER BY record_id').bind(name).all());
  await freezeDemoSnapshot(env,{display_name:name},source.results.map(row=>JSON.parse(row.payload)));
 }
 const rows=(await env.DB.prepare('SELECT payload,frozen_at FROM demo_snapshots ORDER BY frozen_at,source_key').all()).results;
 return {frozen:true,per_admin_limit:10,snapshot_count:rows.length,cases:rows.flatMap(row=>JSON.parse(row.payload))};
}

const reviewTaskById=new Map(REVIEW_TASKS.map(task=>[task.record_id,task]));
const reviewKey=id=>JSON.stringify([REVIEW_CAMPAIGN.id,id]);
const reviewRow=row=>row?{payload:JSON.parse(row.payload),version:row.version,saved_at:row.saved_at,reviewer:row.reviewer_name}:null;
async function adminReviewRoute(request,env,owner,url,context={campaign:REVIEW_CAMPAIGN,tasks:REVIEW_TASKS,sourceTable:'annotations'}){
 const {campaign,tasks,sourceTable}=context;const reviewTaskById=new Map(tasks.map(t=>[t.record_id,t]));
 const path=url.pathname;
 if(path==='/api/admin/reviews'&&request.method==='GET'){
  const stored=(await env.DB.prepare('SELECT * FROM admin_reviews WHERE campaign_id=?1').bind(campaign.id).all()).results;
  const sources=[];
  for(let start=0;!context.frozenSource&&start<tasks.length;start+=80){const page=tasks.slice(start,start+80);sources.push(...(await env.DB.prepare('SELECT * FROM '+sourceTable+' WHERE record_id IN ('+page.map((_,i)=>'?'+(i+1)).join(',')+')').bind(...page.map(t=>t.record_id)).all()).results);}
  const listedTasks=tasks.map(t=>{const source=sources.find(r=>r.record_id===t.record_id&&r.annotator_id===t.original_annotator.id);return {record_id:t.record_id,assignee:t.assignee,audit:t.audit,audit_source_version:t.audit_source_version,source_version:source?.version??t.audit_source_version,original_annotation:source?JSON.parse(source.payload):t.snapshot_annotation,review:reviewRow(stored.find(row=>row.record_id===t.record_id))};});
  return {campaign,tasks:listedTasks};
 }
 if(path==='/api/admin/reviews/save'&&request.method==='POST'){
  const data=await body(request,524288),a=data.review,task=reviewTaskById.get(a?.record_id);
  if(data.campaign_id!==campaign.id||!task)throw new ApiError(400,'未知复核任务。');
  if(!context.sharedReview&&task.assignee!==owner.display_name)throw new ApiError(403,'此任务分配给其他管理员，仅供查看。');
  if(!Number.isSafeInteger(data.base_version)||data.base_version<0)throw new ApiError(400,'复核版本无效。');
  if(!['draft','submitted'].includes(a.status)||!['','pass','pass_modified','reject_no_clear_issue','reject_poor_quality'].includes(a.decision)||!Array.isArray(a.issues)||a.issues.length>50||typeof a.note!=='string'||a.note.length>4000||!Number.isSafeInteger(a.source_version)||typeof a.updated_at!=='string'||!Number.isFinite(Date.parse(a.updated_at)))throw new ApiError(400,'复核内容格式无效。');
  for(const c of a.issues)if(!c||typeof c.timestamp!=='string'||c.timestamp.length>80||typeof c.problem!=='string'||c.problem.length>4000||typeof c.expected!=='string'||c.expected.length>4000)throw new ApiError(400,'卡片格式无效。');
  const source=context.frozenSource?null:await env.DB.prepare('SELECT payload,version FROM '+sourceTable+' WHERE record_key=?1').bind(recordKey(task.original_annotator.id,a.record_id)).first();
  const sourceVersion=source?.version??task.audit_source_version,original=source?JSON.parse(source.payload):task.snapshot_annotation;
  if(a.status==='submitted'){
   if(!a.decision)throw new ApiError(400,'请选择复核结果。');
   if(a.source_version!==sourceVersion)throw new ApiError(409,'原标注已更新，请刷新核对后再提交。','review_source_changed');
   if(a.decision.startsWith('pass')){
    if(!a.issues.length||a.issues.some(c=>!c.timestamp.trim()||!c.problem.trim()||!c.expected.trim()))throw new ApiError(400,'通过时请填写完整问题卡片。');
    const changed=compareApproval(a,original.issues)==='modified';
    if(a.decision==='pass'&&changed)throw new ApiError(400,'卡片已修改，请选择修改卡片后通过。');
    if(a.decision==='pass_modified'&&!changed)throw new ApiError(400,'卡片未修改，请选择确认通过。');
   }
  }
  const clean={record_id:a.record_id,status:a.status,decision:a.decision,issues:a.issues.map(c=>({timestamp:c.timestamp,problem:c.problem,expected:c.expected})),note:a.note,source_version:a.source_version,updated_at:a.updated_at};
  const payload=stableStringify(clean),key=JSON.stringify([campaign.id,a.record_id]),time=new Date().toISOString(),eventId=await digest(key+payload);
  const results=await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO admin_review_history(event_id,review_key,payload,created_at) VALUES(?1,?2,?3,?4)').bind(eventId,key,payload,time),
   env.DB.prepare('INSERT INTO admin_reviews(review_key,campaign_id,record_id,reviewer_name,payload,version,saved_at) SELECT ?1,?2,?3,?4,?5,1,?6 WHERE ?7=0 OR EXISTS(SELECT 1 FROM admin_reviews WHERE review_key=?1) ON CONFLICT(review_key) DO UPDATE SET payload=excluded.payload,version=admin_reviews.version+1,saved_at=excluded.saved_at WHERE admin_reviews.version=?7 AND admin_reviews.payload<>excluded.payload').bind(key,campaign.id,a.record_id,owner.display_name,payload,time,data.base_version),
   env.DB.prepare('SELECT * FROM admin_reviews WHERE review_key=?1').bind(key)
  ]);
  const row=results[2].results[0];if(!row||row.payload!==payload)throw new ApiError(409,'另一窗口已保存新版本，请刷新后选择要保留的内容。','review_conflict');
  return {review:reviewRow(row)};
 }
 throw new ApiError(404,'接口不存在。');
}

async function batch2Route(request,env,url){
 const path=url.pathname.replace('/api/batch2','/api'),plan=BATCH2_DATA.plan,parts=BATCH2_DATA.participants;
 const memberFor=name=>nameKey(name)==='shihua'?parts.find(p=>p.person===10):participantFor(name),count=slot=>BATCH2_DATA.tasks.filter(t=>t.person===slot).length;
 const canonicalOwner=row=>parts.find(p=>p.person===row.slot);
 const mapped2=(row,token=false)=>({plan,participants:parts.length,person:row.slot,claim_id:row.claim_id,task_count:count(row.slot),annotator:{id:row.annotator_id,name:canonicalOwner(row)?.name||row.display_name},role:canonicalOwner(row)?.role||'member',...(token?{token:row.session_token}:{})});
 if(path==='/api/claim'&&request.method==='POST'){
  const input=await body(request),member=memberFor(normalizeName(input.name));if(!member)throw new ApiError(400,'未在名单中找到这个姓名。');
  let row=await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND name_key=?2 AND released_at IS NULL').bind(plan,nameKey(member.name)).first();
  if(!row){
   const parent=member.person<=9?await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND slot=?2 AND released_at IS NULL').bind(PLAN,member.person).first():null;
   const id=parent?.annotator_id||crypto.randomUUID();
   await env.DB.prepare('INSERT OR IGNORE INTO registrations(claim_id,plan,slot,name_key,session_token,role,display_name,annotator_id,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind(crypto.randomUUID(),plan,member.person,nameKey(member.name),crypto.randomUUID()+crypto.randomUUID(),member.role,member.name,id,new Date().toISOString()).run();
   row=await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND name_key=?2 AND released_at IS NULL').bind(plan,nameKey(member.name)).first();
   if(!row)throw new ApiError(409,'任务登记已变化，请刷新重试。');
   if(parent&&member.person===9&&parent.display_name!==member.name)await env.DB.prepare('UPDATE registrations SET display_name=?1,name_key=?2 WHERE claim_id=?3').bind(member.name,nameKey(member.name),parent.claim_id).run();
  }
  return mapped2(row,true);
 }
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'',owner=token?await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND session_token=?2 AND released_at IS NULL').bind(plan,token).first():null;
 if(!owner)throw new ApiError(403,'请重新填写姓名进入 batch2。');const isAdmin=canonicalOwner(owner)?.role==='admin';
 if(path.startsWith('/api/admin/')&&!isAdmin)throw new ApiError(403,'需要管理员权限。');
 if(path==='/api/lease'&&request.method==='GET'){if(url.searchParams.get('claim_id')!==owner.claim_id)throw new ApiError(410,'任务登记已变化。');return mapped2(owner);}
 if(path==='/api/annotations'&&request.method==='GET')return {records:(await env.DB.prepare('SELECT * FROM batch2_annotations WHERE annotator_id=?1 ORDER BY record_id').bind(owner.annotator_id).all()).results.map(cloudRow)};
 if(path==='/api/annotations/sync'&&request.method==='POST'){
  const input=await body(request,2097152);if(!Array.isArray(input.records)||!input.records.length||input.records.length>20)throw new ApiError(400,'每次同步应包含 1–20 条记录。');const saved=[],conflicts=[];
  for(const entry of input.records){const a=entry.annotation,t=BATCH2_DATA.tasks.find(t=>t.record_id===a?.record_id);
   if(!t||!['draft','submitted'].includes(a.status)||!['','pass','reject_no_clear_issue','reject_poor_quality'].includes(a.verdict)||!Array.isArray(a.issues)||a.issues.length>50||!Number.isSafeInteger(a.revision)||a.revision<0||!Number.isFinite(Date.parse(a.updated_at)))throw new ApiError(400,'batch2 标注格式无效。');
   if(!isAdmin&&owner.slot!==t.person)throw new ApiError(403,'此视频未分配给你。');
   for(const c of a.issues)if(!c||['timestamp','problem','expected'].some(f=>typeof c[f]!=='string'||c[f].length>(f==='timestamp'?80:4000)))throw new ApiError(400,'问题卡片格式无效。');
   if(a.status==='submitted'&&!a.verdict)throw new ApiError(400,'缺少提交判定。');
   if(entry.base_version!==null&&(!Number.isSafeInteger(entry.base_version)||entry.base_version<0))throw new ApiError(400,'同步版本无效。');
   const normalized=classifyApproval(a,t.issues),payload=stableStringify(normalized),hash=await digest(payload),key=JSON.stringify([owner.annotator_id,a.record_id]),time=new Date().toISOString(),raw=stableStringify(a);
   const result=await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO batch2_annotation_history(event_id,record_key,annotator_id,payload,created_at) VALUES(?1,?2,?3,?4,?5)').bind(await digest(key+raw),key,owner.annotator_id,raw,time),
    env.DB.prepare('INSERT INTO batch2_annotations(record_key,annotator_id,annotator_name,record_id,payload,content_hash,version,saved_at) VALUES(?1,?2,?3,?4,?5,?6,1,?7) ON CONFLICT(record_key) DO UPDATE SET payload=excluded.payload,content_hash=excluded.content_hash,annotator_name=excluded.annotator_name,version=batch2_annotations.version+1,saved_at=excluded.saved_at WHERE batch2_annotations.version=?8 AND batch2_annotations.content_hash<>excluded.content_hash').bind(key,owner.annotator_id,canonicalOwner(owner).name,a.record_id,payload,hash,time,entry.base_version??-1),
    env.DB.prepare('SELECT * FROM batch2_annotations WHERE record_key=?1').bind(key)
   ]);const row=result[2].results[0];if(row.content_hash===hash)saved.push({record_id:a.record_id,version:row.version});else conflicts.push(cloudRow(row));
  }return {saved,conflicts};
 }
 if(path==='/api/admin/claims'&&request.method==='GET'){
  const rows=(await env.DB.prepare('SELECT * FROM registrations WHERE plan=?1 AND released_at IS NULL').bind(plan).all()).results;
  return {plan,participants:parts.length,claims:parts.map(p=>{const row=rows.find(r=>r.slot===p.person);return {claim_id:row?.claim_id||null,slot:p.person,display_name:p.name,annotator_id:row?.annotator_id||null,created_at:row?.created_at||null,role:p.role,task_count:count(p.person)};})};
 }
 if(path==='/api/admin/annotations'&&request.method==='GET'){
  const cursor=Number(url.searchParams.get('cursor')||0),limit=Math.min(100,Number(url.searchParams.get('limit')||50));if(!Number.isSafeInteger(cursor)||cursor<0||!Number.isSafeInteger(limit)||limit<1)throw new ApiError(400,'分页参数无效。');
  const rows=(await env.DB.prepare('SELECT * FROM batch2_annotations ORDER BY annotator_name,record_id LIMIT ?1 OFFSET ?2').bind(limit+1,cursor).all()).results;return {records:rows.slice(0,limit).map(cloudRow),next_cursor:rows.length>limit?cursor+limit:null};
 }
 if(path==='/api/admin/quality'&&request.method==='GET'){
  const rows=(await env.DB.prepare('SELECT * FROM batch2_annotations').all()).results.map(cloudRow),reviews=(await env.DB.prepare('SELECT * FROM admin_reviews WHERE campaign_id=?1').bind(BATCH2_REVIEW_CAMPAIGN.id).all()).results;return {...buildQualityStatistics(rows,[],BATCH2_REVIEW_TASKS,reviews,parts.map(p=>p.name)),batch:'batch2',physics_evidence:{}};
 }
 if(path==='/api/examples'&&request.method==='GET'){
  let rows=(await env.DB.prepare('SELECT * FROM batch2_annotations ORDER BY saved_at DESC').all()).results.filter(r=>memberFor(r.annotator_name)?.role==='admin'&&JSON.parse(r.payload).status==='submitted');const admins=parts.filter(p=>p.role==='admin').map(p=>({name:p.name,total:rows.filter(r=>r.annotator_name===p.name).length,pass_direct:rows.filter(r=>r.annotator_name===p.name&&outcome(JSON.parse(r.payload))==='pass').length,pass_modified:rows.filter(r=>r.annotator_name===p.name&&outcome(JSON.parse(r.payload))==='pass_modified').length}));
  const name=url.searchParams.get('name'),decision=url.searchParams.get('outcome');if(name)rows=rows.filter(r=>r.annotator_name===name);if(decision)rows=rows.filter(r=>outcome(JSON.parse(r.payload))===decision);const cursor=Number(url.searchParams.get('cursor')||0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new ApiError(400,'分页参数无效。');return {admins,total:rows.length,records:rows.slice(cursor,cursor+50).map(cloudRow),next_cursor:cursor+50<rows.length?cursor+50:null};
 }
 if(path==='/api/admin/release'||path==='/api/admin/reassign')throw new ApiError(409,'batch2 使用固定任务分配，无需重置或转交。');
 if(path==='/api/admin/reviews'||path==='/api/admin/reviews/save'){const target=new URL(url);target.pathname=path;return adminReviewRoute(request,env,{...owner,display_name:canonicalOwner(owner).name},target,{campaign:BATCH2_REVIEW_CAMPAIGN,tasks:BATCH2_REVIEW_TASKS,sourceTable:'batch2_annotations'});}
 throw new ApiError(404,'batch2 接口不存在。');
}
