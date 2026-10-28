import test from 'node:test';
import assert from 'node:assert/strict';
import {RegistryClient} from '../registry-client.js';
const plan='physfixbench-batch1-seven-v1';
const claim={plan,participants:7,person:1,claim_id:'claim-a',token:'session-only',annotator:{id:'person-a',name:'张三'},role:'member'};
test('registration uses a shared service and keeps the session token out of returned backup metadata',async()=>{
 const calls=[],client=new RegistryClient('https://registry.test',{fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(claim));}});
 const result=await client.claim('张三','old-id',plan);assert.equal(result.person,1);assert.equal(result.annotator.name,'张三');assert.equal(result.token,undefined);assert.equal(client.session.token,'session-only');
 assert.deepEqual(JSON.parse(calls[0].options.body),{name:'张三',annotator_id:'old-id'});assert.equal(calls[0].options.headers.Authorization,undefined);
});
test('invalid or unavailable registration never falls back to a locally guessed slot',async()=>{
 const mismatch=new RegistryClient('https://registry.test',{fetcher:async()=>new Response(JSON.stringify({...claim,plan:'wrong-plan'}))});
 await assert.rejects(mismatch.claim('张三','a',plan),/版本不一致/);assert.equal(mismatch.session,null);
 const failed=new RegistryClient('https://registry.test',{fetcher:async()=>{throw new Error('offline');}});
 await assert.rejects(failed.claim('张三','a',plan),/无法连接/);assert.equal(failed.session,null);
});
test('submissions check the current server lease and reject a released or changed task',async()=>{
 const client=new RegistryClient('https://registry.test',{fetcher:async()=>new Response(JSON.stringify(claim))});await client.claim('张三','a',plan);
 client.fetcher=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer session-only');return new Response(JSON.stringify({...claim,person:2}));};
 await assert.rejects(client.check(),/任务已调整/);
 client.fetcher=async()=>new Response(JSON.stringify({error:'请重新进入',code:'forbidden'}),{status:403});
 await assert.rejects(client.check(),error=>error.status===403);
});
test('admin requests use the authenticated session and surface server errors without changing assignment',async()=>{
 const client=new RegistryClient('https://registry.test',{fetcher:async()=>new Response(JSON.stringify({...claim,role:'admin'}))});await client.claim('张三','a',plan);
 client.fetcher=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer session-only');assert.equal(JSON.parse(options.body).claim_id,'target');return new Response(JSON.stringify({error:'领取记录已变化'}),{status:409});};
 await assert.rejects(client.release('target'),/已变化/);assert.equal(client.session.person,1);
});
