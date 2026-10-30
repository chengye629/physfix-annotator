import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{PLAN} from '../worker/index.js';
import {BASELINES} from '../worker/baselines.js';
import {localDatabase} from './sqlite-adapter.mjs';
const id=Object.keys(BASELINES)[0];
const annotation=(change={})=>({record_id:id,status:'submitted',verdict:'pass',issues:structuredClone(BASELINES[id]),keep:'保持场景',duration:8,revision:5,updated_at:'2026-10-30T08:00:00.000Z',...change});
function setup(){const DB=localDatabase(),env={DB,PRODUCTION:true};return {DB,async request(path,body,token){const response=await worker.fetch(new Request('https://registry.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://chengye629.github.io',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:response.status,data:await response.json()};}};}
const claim=async(api,name)=>(await api.request('/api/claim',{name})).data;
const sync=(api,person,a,base_version=null)=>api.request('/api/annotations/sync',{records:[{annotation:a,base_version}]},person.token);
test('existing Lin registration is promoted in place with identical identity, slot and token',async()=>{
 const api=setup();try{
 const person=await claim(api,'林炬乙');await api.DB.prepare('UPDATE registrations SET role=?1 WHERE claim_id=?2').bind('member',person.claim_id).run();
 const admin=await api.request('/api/admin/claims',null,person.token);assert.equal(admin.status,200);
 const resumed=await claim(api,'Juyi Lin');for(const key of ['claim_id','token','person'])assert.equal(resumed[key],person[key]);assert.equal(resumed.annotator.id,person.annotator.id);assert.equal(resumed.role,'admin');assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM registrations').first()).count,1);
 }finally{api.DB.close();}
});
test('old submitted content is preserved exactly and only receives comparison metadata; retries are idempotent',async()=>{
 const api=setup();try{
 const person=await claim(api,'马思远'),old=annotation(),result=await sync(api,person,old);assert.equal(result.status,200);assert.equal(result.data.saved[0].version,1);
 const retry=await sync(api,person,old);assert.equal(retry.data.saved[0].version,1);
 const rows=(await api.request('/api/annotations',null,person.token)).data.records;assert.equal(rows.length,1);const a=rows[0].annotation;assert.equal(a.approval_type,'direct');assert.equal(a.approval_source,'comparison');
 for(const key of Object.keys(old))assert.deepEqual(a[key],old[key]);assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM annotation_history').first()).count,1);
 const edited=annotation();edited.issues[0].problem+='，经人工修改';const next=await sync(api,person,edited,1);assert.equal(next.data.saved[0].version,2);assert.equal((await api.request('/api/annotations',null,person.token)).data.records[0].annotation.approval_type,'modified');
 }finally{api.DB.close();}
});
test('stale devices cannot overwrite cloud content, and both incoming versions remain in history',async()=>{
 const api=setup();try{
 const person=await claim(api,'高晗晴'),first=annotation();await sync(api,person,first);
 const second=annotation({revision:6});second.issues[0].problem='设备 A 的修改';await sync(api,person,second,1);
 const third=annotation({revision:7});third.issues[0].problem='设备 B 的修改';const conflict=await sync(api,person,third,1);
 assert.equal(conflict.data.saved.length,0);assert.equal(conflict.data.conflicts[0].annotation.issues[0].problem,'设备 A 的修改');
 assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM annotation_history').first()).count,3);
 const resolved=await sync(api,person,third,2);assert.equal(resolved.data.saved[0].version,3);
 }finally{api.DB.close();}
});
test('owners are isolated; members can view only submitted admin examples while admin export sees all owners',async()=>{
 const api=setup();try{
 const ma=await claim(api,'马思远'),lin=await claim(api,'林炬乙'),member=await claim(api,'刘皓天');
 await sync(api,ma,annotation());const modified=annotation();modified.issues[0].expected+='，保持自然运动';await sync(api,lin,modified);
 await sync(api,member,annotation({status:'draft',verdict:''}));
 const own=(await api.request('/api/annotations',null,member.token)).data;assert.equal(own.records.length,1);assert.equal(own.records[0].annotation.status,'draft');
 const examples=(await api.request('/api/examples',null,member.token)).data;assert.equal(examples.records.length,2);assert.equal(examples.admins.find(a=>a.name==='林炬乙').pass_modified,1);assert.ok(examples.records.every(r=>r.annotator.name!=='刘皓天'));assert.ok(!JSON.stringify(examples).includes('session_token'));
 const filtered=(await api.request('/api/examples?name='+encodeURIComponent('林炬乙')+'&outcome=pass_modified',null,member.token)).data;assert.equal(filtered.records.length,1);
 assert.equal((await api.request('/api/admin/annotations',null,member.token)).status,403);assert.equal((await api.request('/api/admin/annotations',null,lin.token)).data.records.length,3);
 }finally{api.DB.close();}
});
test('invalid records and anonymous writes do not create annotations',async()=>{
 const api=setup();try{
 const person=await claim(api,'叶程');assert.equal((await sync(api,{token:null},annotation())).status,403);
 for(const a of [annotation({record_id:'foreign'}),annotation({status:'bogus'}),annotation({issues:[{timestamp:'1',problem:null,expected:'x'}]})])assert.equal((await sync(api,person,a)).status,400);
 assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM annotations').first()).count,0);
 }finally{api.DB.close();}
});

test('the old misspelled Chen registration resumes as Chen Guangyu without changing identity or task',async()=>{
 const api=setup();try{
 await api.DB.prepare('INSERT INTO registrations(claim_id,plan,slot,name_key,display_name,annotator_id,created_at,role,session_token) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind('chen-old',PLAN,6,'陈广宁','陈广宁','chen-existing-id','2026-10-29','member','chen-existing-token').run();
 const corrected=(await api.request('/api/claim',{name:'Chen Guangyu'})).data;
 assert.equal(corrected.annotator.name,'陈广宇');assert.equal(corrected.annotator.id,'chen-existing-id');assert.equal(corrected.claim_id,'chen-old');assert.equal(corrected.token,'chen-existing-token');assert.equal(corrected.person,6);
 const alias=(await api.request('/api/claim',{name:'Chen Guangning'})).data;assert.equal(alias.annotator.name,'陈广宇');assert.equal(alias.claim_id,corrected.claim_id);
 }finally{api.DB.close();}
});

test('fallback frontend serves current UI and compressed dataset without changing API registration',async()=>{
 const api=setup();try{
 const response=await worker.fetch(new Request('https://registry.test/'),{DB:api.DB,PRODUCTION:true});assert.equal(response.status,200);assert.ok(response.headers.get('Content-Type').includes('text/html'));const html=await response.text();assert.ok(html.includes('value="pass_modified"'));assert.ok(html.includes('id="entry-origin-note"'));
 const asset=await worker.fetch(new Request('https://registry.test/cloud-sync.js?v=12-cloud'),{DB:api.DB,PRODUCTION:true});assert.ok(asset.headers.get('Content-Type').includes('javascript'));
 const compressed=await worker.fetch(new Request('https://registry.test/data/physfixbench_full.jsonl.gz?v=12-cloud'),{DB:api.DB,PRODUCTION:true});const {gunzipSync}=await import('node:zlib');assert.equal(gunzipSync(Buffer.from(await compressed.arrayBuffer())).toString('utf8').trim().split('\n').length,606);
 const manifest=await worker.fetch(new Request('https://registry.test/data/video-manifest.json'),{DB:api.DB,PRODUCTION:true});assert.ok(Object.values((await manifest.json()).videos).every(v=>v.file.startsWith('https://chengye629.github.io/')));
 assert.equal((await api.DB.prepare('SELECT COUNT(*) count FROM registrations').first()).count,0);
 }finally{api.DB.close();}
});


test('first ten synced records include unsubmitted content, append gradually, and never replace earlier examples',async()=>{
 const api=setup();try{
 const ma=await claim(api,'马思远'),lin=await claim(api,'林炬乙'),ids=Object.keys(BASELINES);
 const first=annotation({status:'draft',verdict:''});await sync(api,ma,first);
 const initial=(await api.request('/api/demos')).data;assert.equal(initial.cases.length,1);assert.equal(initial.cases[0].annotation.status,'draft');
 const edited=annotation({revision:8});edited.issues[0].problem='后来的修改';await sync(api,ma,edited,1);
 assert.deepEqual((await api.request('/api/demos')).data.cases[0],initial.cases[0]);
 const records=ids.slice(1,14).map(id=>({base_version:null,annotation:annotation({record_id:id,issues:structuredClone(BASELINES[id]),status:'draft',verdict:''})}));
 assert.equal((await api.request('/api/annotations/sync',{records},ma.token)).status,200);
 assert.equal((await api.request('/api/demos')).data.cases.length,10);
 await sync(api,lin,first);const data=(await api.request('/api/demos')).data;assert.equal(data.cases.length,11);assert.equal(data.per_admin_limit,10);
 assert.ok(!JSON.stringify(data).includes('马思远'));assert.ok(!JSON.stringify(data).includes('林炬乙'));
 assert.equal((await api.request('/api/annotations',null,ma.token)).data.records.find(r=>r.annotation.record_id===first.record_id).annotation.issues[0].problem,'后来的修改');
 }finally{api.DB.close();}
});
