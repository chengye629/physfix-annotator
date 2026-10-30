import {escapeHTML as h,OUTCOMES,outcome} from './core.js?v=12-cloud';
import {playbackAssessment} from './playback.js?v=12-cloud';
const status=document.querySelector('#case-status'),container=document.querySelector('#guide-cases');
const card=issue=>'<div class="card"><b>'+h(issue.timestamp)+' 秒</b><p><b>物理问题：</b>'+h(issue.problem)+'</p><p><b>修改后状态：</b>'+h(issue.expected)+'</p></div>';
function request(){if(window.opener){status.textContent='正在读取两位管理员已同步的标注…';window.opener.postMessage({type:'physfix-guide-ready'},location.origin);}else status.textContent='请从标注页面点击“标注守则”载入真实案例。';}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.opener)return;
 if(event.data?.type==='physfix-guide-error'){status.textContent=event.data.error;return;}
 if(event.data?.type!=='physfix-guide-cases')return;
 const cases=event.data.cases||[],names=new Set(cases.map(row=>row.annotator.name));
 status.textContent=cases.length?'已载入 '+cases.length+' 个真实案例，来自 '+[...names].join('、')+'。以下保留管理员提交原文，并对照原始预标注。':'两位尚未同步已提交的标注。请两位在原浏览器中打开新版标注页，同步后点“刷新真实案例”。';
 container.innerHTML=cases.map(row=>{
  const a=row.annotation,watched=playbackAssessment(a.submitted_watch,a.duration).valid;
  return '<section class="case"><h3>'+h(row.annotator.name)+' · '+h(OUTCOMES[outcome(a)])+'</h3><p><code>'+h(a.record_id)+'</code><br>提交时间：'+h(a.updated_at)+'</p>'+(!watched?'<p class="notice">该条播放记录不完整，观看情况需复核。</p>':'')+'<div class="comparison"><div><h4>原始预标注</h4>'+row.original.map(card).join('')+'</div><div><h4>管理员最终标注</h4>'+a.issues.map(card).join('')+'</div></div></section>';
 }).join('');
});
document.querySelector('#refresh-cases').onclick=request;
document.querySelector('#print-guide').onclick=()=>window.print();
document.querySelector('#download-guide').onclick=()=>{
 const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,.actions').forEach(el=>el.remove());
 const blob=new Blob(['<!doctype html>\n'+copy.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='PhysFixBench_标注守则与真实案例.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
request();
