import {RegistryClient} from './registry-client.js?v=29-identities';
import {REGISTRY_API} from './registry-config.js?v=29-identities';
import {loadDataset} from './dataset-loader.js?v=29-identities';
import {buildTeamProgress} from './team-progress.js?v=29-identities';
import {escapeHTML as h} from './core.js?v=29-identities';
const $=s=>document.querySelector(s),registry=new RegistryClient(REGISTRY_API);let data,tasks=[];
let refreshing=false;
async function refresh(){
 if(refreshing)return;refreshing=true;
 try{
 const [claims,records,quality]=await Promise.all([registry.list(),registry.allAnnotations(),registry.request('/api/admin/quality')]);
 const rows=buildTeamProgress(tasks,claims.claims,records),c=quality.review_campaign,t=quality.totals;
 data={batch:'batch2',generated_at:quality.generated_at,total:tasks.length,rows,records,quality};
 const direct=c.reviewers.reduce((n,r)=>n+r.pass,0),modified=c.reviewers.reduce((n,r)=>n+r.pass_modified,0);
 $('#quality-summary').innerHTML=[['初审通过',t.submitted_passed],['已复核',c.completed+' / '+c.total],['复核通过',t.final_accepted],['复核拒绝',t.selection_rejected],['待复核',c.total-c.completed]].map(([label,value])=>`<article><span>${h(label)}</span><strong>${h(String(value))}</strong></article>`).join('');
 $('#quality-result').textContent=`复核通过 ${t.final_accepted} 条（直接通过 ${direct}，修改后通过 ${modified}）。`;
 $('#quality-reviewers').innerHTML=c.reviewers.map(r=>`<tr><td>${h(r.name)}</td><td>${r.completed} / ${r.assigned}</td><td>${r.pass}</td><td>${r.pass_modified}</td><td>${r.reject}</td><td>${r.remaining}</td></tr>`).join('');
 $('#quality-precision').innerHTML=quality.rows.map(r=>`<tr><td>${h(r.name)}</td><td>${r.submitted_passed}</td><td>${r.reviewed_predicted_pass}</td><td>${r.final_accepted}</td><td>${r.selection_rejected}</td><td>${r.submitted_passed-r.reviewed_predicted_pass}</td><td>${r.precision===null?'—':(r.precision*100).toFixed(1)+'%'}</td></tr>`).join('');
 $('#quality-total').textContent='初审已提交 '+rows.reduce((n,r)=>n+r.submitted,0)+' / '+tasks.length;
 $('#quality-rows').innerHTML=rows.map(r=>`<tr><td>${h(r.name)}</td><td>${r.submitted} / ${r.assigned}</td><td>${r.pass_direct}</td><td>${r.pass_modified}</td><td>${r.reject_no_clear_issue}</td><td>${r.reject_poor_quality}</td><td>${r.remaining}</td></tr>`).join('');
 $('#quality-updated').textContent='更新于 '+new Date(quality.generated_at).toLocaleString('zh-CN',{hour12:false});
 $('#quality-live-error').hidden=true;
 }finally{refreshing=false;}
}
async function run(action){try{$('#quality-live-error').hidden=true;await action();}catch(e){$('#quality-error').textContent=e.message;$('#quality-error').hidden=false;$('#quality-live-error').textContent=e.message;$('#quality-live-error').hidden=false;}}
async function login(name){const identity=await registry.claim(name,undefined,'physfixbench-batch2-nine-v1');if(identity.role!=='admin')throw new Error('仅管理员可查看统计。');tasks=(await loadDataset()).trim().split(/\r?\n/).map(JSON.parse);await refresh();$('#quality-person').textContent=identity.annotator.name;$('#entry').hidden=true;$('#quality-app').hidden=false;}
$('#quality-login').onsubmit=e=>{e.preventDefault();void run(()=>login($('#quality-name').value));};$('#quality-refresh').onclick=()=>run(refresh);$('#quality-export').onclick=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='batch2_统计_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
try{const name=JSON.parse(localStorage.getItem('physfix.workspace.batch2.v1')||'{}').annotator?.name;if(name){$('#quality-name').value=name;void run(()=>login(name));}}catch{}
setInterval(()=>{if(data&&!document.hidden)void run(refresh);},30000);
document.addEventListener('visibilitychange',()=>{if(data&&!document.hidden)void run(refresh);});
