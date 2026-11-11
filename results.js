import {VARIANTS,reviewKey,resultFor,filteredSamples,safeVideoURL,validReviews} from './results-core.js';
const $=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
const STORAGE='physfix.model-inspection.v1';
const sourceNames={physion_eval:'Physion',phyground:'PhyGround',robojudge:'RoboJudge',videophy2:'VideoPhy2'};
const labels={normal:'生成正常',collapsed:'明显崩塌',flagged:'待复查'};
let data,reviews={},storageError='',readBlocked=false,selected='',variant='self_fixing',model='',visible=[],useMirror=true;
const videos=[$('#original'),$('#generated')];
try{const raw=localStorage.getItem(STORAGE);if(raw)reviews=validReviews(JSON.parse(raw));}catch{storageError='本机抽查存储无法读取；请先导出当前可见记录。现有存储不会被覆盖。';readBlocked=true;}
function current(){return data.samples.find(s=>s.id===selected);}
function key(){return reviewKey(selected,model,variant);}
function pause(){videos.forEach(v=>v.pause());$('#play-both').textContent='同时播放';}
function stats(){
  $('#sample-count').textContent=data.samples.length;
  $('#result-count').textContent=`${data.samples.reduce((n,s)=>n+s.results.filter(r=>r.status==='success').length,0)} / ${data.models.reduce((n,m)=>n+m.expected,0)}`;
  const keys=new Set(data.samples.flatMap(s=>s.results.map(r=>reviewKey(s.id,r.model,r.variant))));
  $('#review-count').textContent=Object.entries(reviews).filter(([k,r])=>keys.has(k)&&r.status).length;
}
function queue(){
  visible=filteredSamples(data.samples,{search:$('#search').value,source:$('#source-filter').value,review:$('#review-filter').value,model,variant},reviews);
  $('#list-count').textContent=`${visible.length} / ${data.samples.length}`;
  $('#queue').replaceChildren();
  if(!visible.length){const p=document.createElement('p');p.textContent='没有符合筛选条件的视频。';p.className='muted';$('#queue').append(p);}
  for(const s of visible){
    const b=document.createElement('button'),title=document.createElement('strong'),sub=document.createElement('small');
    b.type='button';b.setAttribute('aria-current',String(s.id===selected));title.textContent=s.id.split('::').at(-1);
    const status=reviews[reviewKey(s.id,model,variant)]?.status;
    sub.textContent=`${sourceNames[s.source]||s.source} · ${labels[status]||'未抽查'}`;
    b.append(title,sub);b.onclick=()=>select(s.id);$('#queue').append(b);
  }
  const index=visible.findIndex(s=>s.id===selected);
  $('#position').textContent=index>=0?`${index+1} / ${visible.length}`:'筛选外';
  $('#prev').disabled=index<=0;$('#next').disabled=index<0||index>=visible.length-1;
}
function loadVideo(video,url,status){
  video.pause();video.removeAttribute('src');video.load();
  status.textContent='正在读取视频…';
  if(!url){status.textContent='此结果尚未接入。';return;}
  try{video.src=safeVideoURL(url);video.playbackRate=Number($('#speed').value);video.load();}
  catch(e){status.textContent=e.message;}
}
function loadOriginal(){const s=current();const url=(useMirror&&s.mirror_url)||s.input_url;$('#original-link').href=safeVideoURL(url);$('#source-line').textContent=useMirror&&s.mirror_url?'原片：网站镜像 · 切换 HF':'原片：HF · 切换镜像';loadVideo(videos[0],url,$('#original-status'));}
function renderReview(){const r=reviews[key()]||{status:'',note:''};$('#note').value=r.note;all('[data-review]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.review===r.status&&Boolean(r.status))));$('#save-status').textContent=storageError||(r.updated_at?'已保存到此浏览器':'尚未抽查');}
function select(id){
  pause();selected=id;const s=current(),r=resultFor(s,model,variant);queue();
  $('#sample-source').textContent=`${sourceNames[s.source]||s.source} / ${s.generator||'原始样本'}`;
  $('#sample-title').textContent=s.id.split('::').at(-1);$('#record-id').textContent=s.id;
  const hash=new URLSearchParams({id:selected,model,variant});history.replaceState(null,'',`#${hash}`);
  loadOriginal();loadVideo(videos[1],r?.url,$('#generated-status'));
  $('#output-title').textContent=data.models.find(m=>m.id===model)?.name||model;
  $('#output-badge').textContent=r?.status==='success'?'已生成':'未接入';
  if(r?.url)$('#output-link').href=safeVideoURL(r.url);else $('#output-link').removeAttribute('href');
  $('#play-both').disabled=!r?.url;
  $('#prompt').textContent=r?.prompt||'暂无提示词';$('#params').textContent=JSON.stringify(r?.params||{},null,2);
  for(const [selector,items] of [['#problems',s.problems],['#expected',s.expected]]){const el=$(selector);el.replaceChildren();for(const text of items.length?items:['未提供']){const p=document.createElement('p');p.textContent=text;el.append(p);}}
  all('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===variant)));renderReview();
}
function save(status){
  if(readBlocked){$('#save-status').textContent=storageError;return;}
  reviews[key()]={status:status??reviews[key()]?.status??'',note:$('#note').value,updated_at:new Date().toISOString()};
  try{localStorage.setItem(STORAGE,JSON.stringify(reviews));storageError='';}catch{storageError='本机保存失败，请立即导出 JSON 备份。';}
  stats();queue();renderReview();
}
function filter(){queue();if(visible.length&&!visible.some(s=>s.id===selected))select(visible[0].id);}
$('#search').oninput=filter;$('#source-filter').onchange=filter;$('#review-filter').onchange=filter;
$('#model').onchange=()=>{model=$('#model').value;select(selected);};
all('[data-variant]').forEach(b=>b.onclick=()=>{variant=b.dataset.variant;select(selected);});
all('[data-review]').forEach(b=>b.onclick=()=>save(b.dataset.review));$('#note').oninput=()=>save();
$('#prev').onclick=()=>select(visible[visible.findIndex(s=>s.id===selected)-1].id);
$('#next').onclick=()=>select(visible[visible.findIndex(s=>s.id===selected)+1].id);
$('#source-line').onclick=()=>{pause();useMirror=!useMirror;loadOriginal();};
$('#retry').onclick=()=>{pause();loadVideo(videos[1],resultFor(current(),model,variant)?.url,$('#generated-status'));};
$('#speed').onchange=()=>videos.forEach(v=>v.playbackRate=Number($('#speed').value));
$('#reset-both').onclick=()=>{pause();videos.forEach(v=>{if(v.readyState)v.currentTime=0;});};
$('#play-both').onclick=async()=>{
  if(videos.some(v=>!v.paused)){pause();return;}
  $('#play-both').disabled=true;
  const outcomes=await Promise.allSettled(videos.map(v=>{if(v.ended)v.currentTime=0;return v.play();}));
  $('#play-both').disabled=false;
  if(outcomes.some(x=>x.status==='rejected')){pause();$('#generated-status').textContent='暂时无法同时播放，请检查视频线路后重试。';}
  else $('#play-both').textContent='全部暂停';
};
videos.forEach((v,i)=>{const status=i?$('#generated-status'):$('#original-status');v.onloadedmetadata=()=>{status.textContent=`${v.videoWidth} × ${v.videoHeight} · ${v.duration.toFixed(2)} s`;};v.onerror=()=>{status.textContent='视频加载失败，可重载、切换线路或单独打开。';};v.onended=()=>{if(videos.every(x=>x.paused))$('#play-both').textContent='同时播放';};});
$('#export').onclick=()=>{const blob=new Blob([JSON.stringify({schema_version:1,benchmark:'physfix_sample50',result_revision:data.revision,exported_at:new Date().toISOString(),reviews},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='physfix_model_inspection.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
try{
  const response=await fetch('./data/model-results.json');if(!response.ok)throw new Error(`HTTP ${response.status}`);data=await response.json();
  const hash=new URLSearchParams(location.hash.slice(1));model=data.models.some(m=>m.id===hash.get('model'))?hash.get('model'):data.models[0].id;
  if(Object.hasOwn(VARIANTS,hash.get('variant')))variant=hash.get('variant');
  for(const m of data.models){const option=new Option(m.name,m.id);$('#model').add(option);}$('#model').value=model;
  for(const s of [...new Set(data.samples.map(s=>s.source))])$('#source-filter').add(new Option(sourceNames[s]||s,s));
  $('#snapshot-date').textContent=data.snapshot_date;$('#hf-link').href=data.repo_url;stats();
  $('#workspace').hidden=false;$('#load-status').hidden=true;
  select(data.samples.some(s=>s.id===hash.get('id'))?hash.get('id'):data.samples[0].id);
}catch(e){$('#load-status').textContent=`结果清单加载失败，请刷新重试：${e.message}`;}
