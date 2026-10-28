import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{PLAN} from '../worker/index.js';
import {localDatabase} from './sqlite-adapter.mjs';
function setup(){const DB=localDatabase(),env={DB,PRODUCTION:true};return {DB,async request(path,body,token){const response=await worker.fetch(new Request('https://registry.test'+path,{method:body?'POST':'GET',headers:{Origin:'https://chengye629.github.io',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:response.status,data:await response.json()};}};}
test('seven concurrent people receive distinct slots, four 87s and three 86s, and an eighth is rejected',async()=>{
 const api=setup();try{
 const results=await Promise.all(Array.from({length:7},(_,i)=>api.request('/api/claim',{name:'测试'+i})));
 assert.ok(results.every(r=>r.status===200));assert.equal(new Set(results.map(r=>r.data.person)).size,7);
 assert.deepEqual(results.map(r=>r.data.task_count).sort(),[86,86,86,87,87,87,87]);
 assert.equal((await api.request('/api/claim',{name:'第八人'})).status,409);
 }finally{api.DB.close();}
});
test('simultaneous repeated names resume one persisted identity and do not consume multiple slots',async()=>{
 const api=setup();try{const results=await Promise.all(Array.from({length:12},(_,i)=>api.request('/api/claim',{name:i%2?' Alice ':'alice',annotator_id:'old-person'})));assert.equal(new Set(results.map(r=>r.data.claim_id)).size,1);assert.equal(new Set(results.map(r=>r.data.token)).size,1);assert.equal(results[0].data.annotator.id,'old-person');assert.equal(results[0].data.plan,PLAN);assert.equal((await api.request('/api/claim',{name:'Bob',annotator_id:'old-person'})).data.person,2);}finally{api.DB.close();}
});
test('both named administrators can manage claims while ordinary members are refused',async()=>{
 const api=setup();try{
 const ye=(await api.request('/api/claim',{name:'叶程'})).data,ma=(await api.request('/api/claim',{name:'马思远'})).data,member=(await api.request('/api/claim',{name:'普通成员'})).data;
 assert.equal(ye.role,'admin');assert.equal(ma.role,'admin');assert.equal(member.role,'member');
 assert.equal((await api.request('/api/admin/claims',null,member.token)).status,403);
 for(const admin of [ye,ma]){const r=await api.request('/api/admin/claims',null,admin.token);assert.equal(r.status,200);assert.equal(r.data.claims.length,3);assert.ok(r.data.claims.every(c=>!('session_token'in c)));}
 }finally{api.DB.close();}
});
test('releasing or reassigning a claim revokes the old session and preserves the same task slot',async()=>{
 const api=setup();try{
 const admin=(await api.request('/api/claim',{name:'叶程'})).data,member=(await api.request('/api/claim',{name:'原成员'})).data;
 assert.equal((await api.request('/api/admin/release',{claim_id:member.claim_id},member.token)).status,403);
 assert.equal((await api.request('/api/admin/reassign',{claim_id:member.claim_id,name:'新成员'},admin.token)).status,200);
 assert.equal((await api.request('/api/lease?claim_id='+member.claim_id,null,member.token)).status,403);
 const next=(await api.request('/api/claim',{name:'新成员'})).data;assert.equal(next.person,member.person);
 assert.equal((await api.request('/api/admin/release',{claim_id:next.claim_id},admin.token)).status,200);
 const final=(await api.request('/api/claim',{name:'最后成员'})).data;assert.equal(final.person,member.person);
 }finally{api.DB.close();}
});
test('duplicate reassignment cannot remove a valid claim, and admins cannot lock out themselves',async()=>{
 const api=setup();try{
 const admin=(await api.request('/api/claim',{name:'叶程'})).data,a=(await api.request('/api/claim',{name:'甲'})).data,b=(await api.request('/api/claim',{name:'乙'})).data;
 assert.equal((await api.request('/api/admin/reassign',{claim_id:a.claim_id,name:'乙'},admin.token)).status,409);
 assert.equal((await api.request('/api/lease?claim_id='+a.claim_id,null,a.token)).status,200);
 assert.equal((await api.request('/api/admin/release',{claim_id:admin.claim_id},admin.token)).status,409);
 }finally{api.DB.close();}
});
test('an administrator can still enter management when all seven participant slots have been claimed',async()=>{
 const api=setup();try{
 await Promise.all(Array.from({length:7},(_,i)=>api.request('/api/claim',{name:'普通'+i})));
 const admin=(await api.request('/api/claim',{name:'叶程'})).data;assert.equal(admin.role,'admin');assert.equal(admin.person,null);
 assert.equal((await api.request('/api/admin/claims',null,admin.token)).status,200);
 }finally{api.DB.close();}
});
