import {escapeHTML as h,videoUrl} from './core.js?v=12-cloud';
const examples=[
 {id:'physion_eval::full::T1_01334',pass:true,title:'冰块融化异常',reason:'融水增加时冰块反而变大，物理问题明确，修复目标清楚。'},
 {id:'physion_eval::full::T1_07464',pass:true,title:'纸张自行裂开',reason:'剪刀停下后纸张仍自行裂开，异常集中，可以明确描述修复要求。'},
 {id:'physion_eval::full::T1_03453',pass:false,title:'人物和篮球多处变形',reason:'肢体穿插、篮球塌缩等问题交织，整体质量过差，不适合局部修复。'},
 {id:'physion_eval::full::T1_09608',pass:false,title:'工具形态混乱',reason:'工具变形并穿过手指，多处异常交织，难以形成清晰的修复目标。'}
];
const container=document.querySelector('#guide-examples');
container.innerHTML=examples.map((example,index)=>'<section class="example"><h3><span class="decision'+(example.pass?'':' reject')+'">'+(example.pass?'通过':'不通过')+'</span>'+h(example.title)+'</h3><video id="example-'+index+'" controls playsinline preload="metadata" aria-label="'+h(example.title)+'示例视频"></video><p>'+h(example.reason)+'</p><div class="video-error" hidden><button type="button">重试视频</button></div></section>').join('');
async function loadVideos(){
 let manifest={};try{const response=await fetch('./data/video-manifest.json?v=8-full');if(response.ok)manifest=(await response.json()).videos||{};}catch{}
 examples.forEach((example,index)=>{
  const video=document.querySelector('#example-'+index),error=video.parentElement.querySelector('.video-error'),retry=error.querySelector('button'),item=manifest[example.id];
  const urls=[...(item?.file?[new URL(item.file,location.href).href]:[]),videoUrl(example.id,item?.upstream_file)];
  let source=0;
  video.addEventListener('error',()=>{if(source+1<urls.length){source++;video.src=urls[source];video.load();}else error.hidden=false;});
  video.addEventListener('loadeddata',()=>{error.hidden=true;});
  retry.onclick=()=>{source=0;error.hidden=true;video.src=urls[source];video.load();};
  video.src=urls[source];
 });
}
document.querySelector('#print-guide').onclick=()=>window.print();
document.querySelector('#download-guide').onclick=()=>{
 const copy=document.documentElement.cloneNode(true);copy.querySelectorAll('script,.actions,.video-error').forEach(el=>el.remove());
 const blob=new Blob(['<!doctype html>\n'+copy.outerHTML],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='PhysFixBench_标注守则.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
};
void loadVideos();
