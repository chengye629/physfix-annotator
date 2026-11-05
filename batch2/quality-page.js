import {RegistryClient} from './registry-client.js';
import {REGISTRY_API} from './registry-config.js';
import {loadDataset} from './dataset-loader.js';
import {buildTeamProgress} from './team-progress.js';
import {escapeHTML as h} from './core.js';
const $=s=>document.querySelector(s),registry=new RegistryClient(REGISTRY_API);let data,tasks=[];
async function refresh(){const [claims,records]=await Promise.all([registry.list(),registry.allAnnotations()]);const rows=buildTeamProgress(tasks,claims.claims,records);data={batch:'batch2',generated_at:new Date().toISOString(),total:tasks.length,rows,records};$('#quality-total').textContent='已提交 '+rows.reduce((n,r)=>n+r.submitted,0)+' / '+tasks.length;$('#quality-rows').innerHTML=rows.map(r=>`<tr><td>${h(r.name)}</td><td>${r.submitted} / ${r.assigned}</td><td>${r.pass_direct}</td><td>${r.pass_modified}</td><td>${r.reject_no_clear_issue}</td><td>${r.reject_poor_quality}</td><td>${r.remaining}</td></tr>`).join('');}
async function run(action){try{$('#quality-error').hidden=true;await action();}catch(e){$('#quality-error').textContent=e.message;$('#quality-error').hidden=false;}}
async function login(name){const identity=await registry.claim(name,undefined,'physfixbench-batch2-nine-v1');if(identity.role!=='admin')throw new Error('仅管理员可查看统计。');tasks=(await loadDataset()).trim().split(/\r?\n/).map(JSON.parse);await refresh();$('#quality-person').textContent=identity.annotator.name;$('#entry').hidden=true;$('#quality-app').hidden=false;}
$('#quality-login').onsubmit=e=>{e.preventDefault();void run(()=>login($('#quality-name').value));};$('#quality-refresh').onclick=()=>run(refresh);$('#quality-export').onclick=()=>{if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='batch2_统计_'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
try{const name=JSON.parse(localStorage.getItem('physfix.workspace.batch2.v1')||'{}').annotator?.name;if(name){$('#quality-name').value=name;void run(()=>login(name));}}catch{}
