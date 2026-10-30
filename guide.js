import {escapeHTML as h,OUTCOMES,outcome} from './core.js?v=12-cloud';
import {playbackAssessment} from './playback.js?v=12-cloud';
import {REGISTRY_API} from './registry-config.js?v=12-cloud';
const status=document.querySelector('#case-status'),container=document.querySelector('#guide-cases');
const card=issue=>'<div class="card"><b>'+h(issue.timestamp)+' 秒</b><p><b>物理问题：</b>'+h(issue.problem)+'</p><p><b>修改后应有的正确状态：</b>'+h(issue.expected)+'</p></div>';
const reasons={pass:'原预标注无需修改，管理员直接通过。',pass_modified:'视频被保留，预标注经过修订；请对照两侧卡片查看具体变化。',reject_no_clear_issue:'管理员判定没有明确、无争议的物理问题。模棱两可的全部拒绝。',reject_poor_quality:'管理员按整体质量太差或物理问题过多拒绝。原视频异常加速、减速也应归入此类。'};
async function load(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(REGISTRY_API+'/api/demos',{cache:'no-store',signal:controller.signal});
  if(!response.ok)throw new Error('示例读取失败');
  const data=await response.json();if(!data.frozen||!Array.isArray(data.cases))throw new Error('示例格式无效');
  status.textContent=data.cases.length?'每位管理员取前 10 条已同步记录，陆续同步后补齐；已展示的案例固定，不被后续修改替换。':'管理员的记录同步后会自动加入，每位最多 10 条。';
  container.innerHTML=data.cases.map((row,index)=>{
   const a=row.annotation,decision=a.status==='submitted'?outcome(a):'',watched=playbackAssessment(a.status==='submitted'?a.submitted_watch:a.watch,a.duration).valid;
   return '<section class="case"><h3>案例 '+(index+1)+' · 管理员'+(decision?' · '+h(OUTCOMES[decision]):'')+'</h3><p><code>'+h(a.record_id)+'</code></p><p>'+h(reasons[decision]||'')+'</p>'+(!watched?'<p class="notice">该条播放记录不完整，观看情况需复核。</p>':'')+'<div class="comparison"><div><h4>原始预标注</h4>'+row.original.map(card).join('')+'</div><div><h4>管理员标注</h4>'+a.issues.map(card).join('')+'</div></div></section>';
  }).join('');
 }catch{status.textContent='示例暂时无法读取，请稍后重新打开本页。';}
 finally{clearTimeout(timer);}
}
document.querySelector('#print-guide').onclick=()=>window.print();
document.querySelector('#download-guide').onclick=()=>{
 const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,.actions').forEach(el=>el.remove());
 const blob=new Blob(['<!doctype html>\n'+copy.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='PhysFixBench_标注守则与管理员案例.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
void load();
