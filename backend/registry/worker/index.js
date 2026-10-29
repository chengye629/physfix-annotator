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
 if(!row||adminOnly&&row.role!=='admin')throw new ApiError(403,adminOnly?'需要管理员权限。':'请重新填写姓名进入。','forbidden');
 return row;
}
async function body(request){
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'请求内容无效。');
 const chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new ApiError(413,'请求内容过长。');}chunks.push(value);}
 const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.byteLength;}
 try{const value=JSON.parse(new TextDecoder().decode(all));if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();return value;}catch{throw new ApiError(400,'请求内容无效。');}
}
const SELECT_ACTIVE='SELECT * FROM registrations WHERE plan=?1 AND name_key=?2 AND released_at IS NULL';
const SELECT_ID='SELECT * FROM registrations WHERE plan=?1 AND claim_id=?2 AND released_at IS NULL';
const RELEASE='UPDATE registrations SET released_at=?1,released_by=?2,release_id=?3 WHERE plan=?4 AND claim_id=?5 AND released_at IS NULL';
const countFor=slot=>slot===null?0:Math.floor(DATASET_COUNT/CAPACITY)+(slot<=DATASET_COUNT%CAPACITY?1:0);
function mapped(row,withToken=false){
 return {plan:PLAN,participants:CAPACITY,person:row.slot,claim_id:row.claim_id,task_count:countFor(row.slot),annotator:{id:row.annotator_id,name:row.display_name},role:row.role,...(withToken?{token:row.session_token}:{})};
}
async function claim(request,env){
 const data=await body(request),input=normalizeName(data.name),member=participantFor(input),name=member?.name??input,key=nameKey(name);
 const existing=await env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key).first();if(existing)return mapped(existing,true);
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
 if(path==='/health')return {data:{ready:!!env.DB,plan:PLAN,participants:CAPACITY}};
 if(!env.DB)throw new ApiError(503,'登记服务暂时不可用。','storage_unavailable');
 if(path==='/api/claim'&&request.method==='POST')return {data:await claim(request,env)};
 if(path==='/api/lease'&&request.method==='GET'){
  const row=await authorize(request,env);
  if(row.claim_id!==url.searchParams.get('claim_id'))throw new ApiError(410,'任务已调整，请重新进入。','claim_released');
  return {data:mapped(row)};
 }
 if(path==='/api/admin/claims'&&request.method==='GET'){
  await authorize(request,env,true);
  const rows=(await env.DB.prepare('SELECT claim_id,slot,display_name,annotator_id,created_at,role FROM registrations WHERE plan=?1 AND released_at IS NULL ORDER BY slot').bind(PLAN).all()).results;
  const claims=PARTICIPANTS.map(member=>rows.find(row=>nameKey(row.display_name)===nameKey(member.name))??{claim_id:null,slot:member.person,display_name:member.name,role:member.role,created_at:null});
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
 const origin=request.headers.get('Origin'),self=new URL(request.url).origin;
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin&&(origin===WEB_ORIGIN||origin===self||(env.PRODUCTION===false&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))))headers['Access-Control-Allow-Origin']=origin;
 if(origin&&!headers['Access-Control-Allow-Origin'])return new Response(JSON.stringify({error:'不允许的来源。'}),{status:403,headers});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'600'}});
 try{const {data}=await handle(request,env);return new Response(JSON.stringify(data),{status:200,headers});}
 catch(error){const known=error instanceof ApiError;if(!known)console.error('Registry request failed:',error.name||'Error');return new Response(JSON.stringify({error:known?error.message:'登记服务暂时不可用，请稍后重试。',code:known?error.code:'service_unavailable'}),{status:known?error.status:503,headers});}
}};
