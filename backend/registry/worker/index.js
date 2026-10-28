export const PLAN='physfixbench-batch1-seven-v1';
export const CAPACITY=7,DATASET_COUNT=606;
const ADMIN_NAMES=new Set(['叶程','马思远']);
const WEB_ORIGIN='https://chengye629.github.io';
class ApiError extends Error{constructor(status,message,code='request_error'){super(message);Object.assign(this,{status,code});}}
export function normalizeName(value){
 const name=String(value??'').normalize('NFC').trim().replace(/\s+/g,' ');
 if(!name||name.length>32||!/[\p{L}\p{N}]/u.test(name)||/[\p{Cc}\p{Cf}]/u.test(name))throw new ApiError(400,'请填写有效姓名。','invalid_name');
 return name;
}
const keyFor=name=>name.toLocaleLowerCase('en-US');
const roleFor=name=>ADMIN_NAMES.has(name)?'admin':'member';
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
const AVAILABLE='(SELECT 1 slot UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7)';
const SELECT_ACTIVE='SELECT * FROM registrations WHERE plan=?1 AND name_key=?2 AND released_at IS NULL';
const SELECT_ID='SELECT * FROM registrations WHERE plan=?1 AND claim_id=?2 AND released_at IS NULL';
const INSERT_FREE=`INSERT OR IGNORE INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token)
 SELECT ?1,?2,a.slot,?3,?4,?5,?6,?7,?8 FROM ${AVAILABLE} a
 WHERE NOT EXISTS(SELECT 1 FROM registrations c WHERE c.plan=?2 AND c.slot=a.slot AND c.released_at IS NULL)
 AND NOT EXISTS(SELECT 1 FROM registrations c WHERE c.plan=?2 AND c.name_key=?3 AND c.released_at IS NULL) ORDER BY a.slot LIMIT 1`;
const RELEASE='UPDATE registrations SET released_at=?1,released_by=?2,release_id=?3 WHERE plan=?4 AND claim_id=?5 AND released_at IS NULL';
function mapped(row,withToken=false){
 return {plan:PLAN,participants:CAPACITY,person:row.slot,claim_id:row.claim_id,task_count:row.slot===null?0:Math.floor(DATASET_COUNT/CAPACITY)+(row.slot<=DATASET_COUNT%CAPACITY?1:0),annotator:{id:row.annotator_id,name:row.display_name},role:row.role,...(withToken?{token:row.session_token}:{})};
}
async function claim(request,env){
 const data=await body(request),name=normalizeName(data.name),key=keyFor(name),role=roleFor(name);
 let id=typeof data.annotator_id==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(data.annotator_id)?data.annotator_id:crypto.randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  const token=crypto.randomUUID()+crypto.randomUUID(),timestamp=new Date().toISOString();
  const results=await env.DB.batch([
   env.DB.prepare(`UPDATE registrations SET slot=(SELECT a.slot FROM ${AVAILABLE} a WHERE NOT EXISTS(SELECT 1 FROM registrations c WHERE c.plan=?1 AND c.slot=a.slot AND c.released_at IS NULL) ORDER BY a.slot LIMIT 1) WHERE plan=?1 AND name_key=?2 AND slot IS NULL AND released_at IS NULL`).bind(PLAN,key),
   env.DB.prepare(INSERT_FREE).bind(crypto.randomUUID(),PLAN,key,name,id,timestamp,role,token),
   env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key),
   env.DB.prepare('SELECT COUNT(*) count FROM registrations WHERE plan=?1 AND slot IS NOT NULL AND released_at IS NULL').bind(PLAN)
  ]);
  const row=results[2].results?.[0];if(row)return mapped(row,true);
  if(results[3].results?.[0]?.count>=CAPACITY){
   if(role==='admin'){
    await env.DB.prepare('INSERT OR IGNORE INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token) VALUES(?1,?2,NULL,?3,?4,?5,?6,?7,?8)').bind(crypto.randomUUID(),PLAN,key,name,id,timestamp,role,token).run();
    const admin=await env.DB.prepare(SELECT_ACTIVE).bind(PLAN,key).first();if(admin)return mapped(admin,true);
   }
   throw new ApiError(409,'7 份任务已领完，请联系管理员。','capacity_full');
  }
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
  const rows=await env.DB.prepare('SELECT claim_id,slot,display_name,annotator_id,created_at,role FROM registrations WHERE plan=?1 AND released_at IS NULL ORDER BY slot').bind(PLAN).all();
  return {data:{plan:PLAN,participants:CAPACITY,claims:rows.results.map(row=>({...row,task_count:row.slot===null?0:Math.floor(DATASET_COUNT/CAPACITY)+(row.slot<=DATASET_COUNT%CAPACITY?1:0)}))}};
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
  const name=normalizeName(data.name),key=keyFor(name);
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
