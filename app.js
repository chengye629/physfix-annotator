import {DATASET,SCHEMA_VERSION,VERDICTS,shortId,escapeHTML as h,emptyIssue,seedIssues,createDraft,validateAnnotation,makeExport,normalizeExport,upgradeAnnotation,mergeExports} from './core.js?v=4-cards';
import {VideoDelivery} from './video-delivery.js?v=3-media';
import {loadDataset} from './dataset-loader.js?v=3-media';
import {SegmentPlayer} from './segment-player.js?v=4-cards';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const STORAGE_KEY='physfix.workspace.v1';
let tasks=[],currentIndex=0,mergedFiles=[],mergedRows=[],toastTimer,storageAvailable=true,legacyLocal=false;
let state={schema_version:SCHEMA_VERSION,annotator:{id:crypto.randomUUID(),name:''},annotations:{},current_id:null,group:'all'};
try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const saved=JSON.parse(raw);if(saved?.annotator?.id&&saved.annotations&&typeof saved.annotations==='object'){state={...state,...saved};legacyLocal=saved.schema_version!==SCHEMA_VERSION;if(legacyLocal&&!localStorage.getItem(STORAGE_KEY+'.before-cards')){try{localStorage.setItem(STORAGE_KEY+'.before-cards',raw);}catch{}}}}}catch{storageAvailable=false;}
const video=$('#video');
const current=()=>tasks[currentIndex];
const selectedTasks=()=>tasks.filter((t,i)=>state.group==='all'||Math.floor(i/50)===Number(state.group));
const active=()=>state.annotations[current()?.record_id];
const now=()=>new Date().toISOString();
const shortResults={pass:'通过',reject_no_clear_issue:'无明确问题',reject_poor_quality:'质量差'};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function persist(){state.schema_version=SCHEMA_VERSION;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;return true;}catch{storageAvailable=false;toast('本机保存失败，请立即导出 JSON。');return false;}}
function nextWarmId(){const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===current()?.record_id);return [...selected.slice(position+1),...selected.slice(0,position)].find(t=>state.annotations[t.record_id]?.status!=='submitted')?.record_id||null;}
const delivery=new VideoDelivery(video,{getNextId:nextWarmId,onStatus:({kind,text})=>{$('#video-load-status').textContent=kind==='ready'?(text.includes('下一条')?'下一条已预加载':'已就绪'):text;}});
delivery.mode=['auto','site','original'].includes(state.video_source)?state.video_source:'auto';$('#video-source').value=delivery.mode;
const segment=new SegmentPlayer(video,{onActiveChange:index=>{$$('.issue').forEach(el=>el.classList.toggle('active',index!==null&&Number(el.dataset.issue)===index));},onError:toast});
function draftStatus(){const a=active();document.getElementById('draft-status').dataset.status=a?.status||'draft';$('#draft-status').textContent=!storageAvailable?'请导出备份':a?.status==='submitted'?`已提交：${shortResults[a.verdict]||''}`:'已保存';}
function renderQueue(){
  const query=$('#search').value.trim().toLowerCase(),filter=$('#status-filter').value;
  const selected=selectedTasks(),visible=selected.filter(t=>{const done=state.annotations[t.record_id]?.status==='submitted';return shortId(t.record_id).toLowerCase().includes(query)&&(filter==='all'||(filter==='submitted'&&done)||(filter==='pending'&&!done));});
  const scroll=$('#queue').scrollTop;
  $('#queue').innerHTML=visible.map(t=>{const a=state.annotations[t.record_id],index=tasks.indexOf(t),done=a?.status==='submitted';return `<button class="queue-item ${index===currentIndex?'active':''}" data-index="${index}" ${index===currentIndex?'aria-current="true"':''} title="${done?h(VERDICTS[a.verdict]):'未提交'}"><span>${index+1}. ${h(shortId(t.record_id))}</span>${done?`<span class="result" data-verdict="${h(a.verdict)}">${a.verdict==='pass'?'✓':a.verdict==='reject_poor_quality'?'差':'×'}</span>`:''}</button>`;}).join('')||'无匹配任务';
  $('#queue').scrollTop=scroll;
  $('#progress').textContent=`已提交 ${selected.filter(t=>state.annotations[t.record_id]?.status==='submitted').length} / ${selected.length}`;
}
function issueHTML(v,i){return `<article class="issue" data-issue="${i}" tabindex="0" aria-label="问题 ${i+1}，点击播放对应片段"><div class="issue-header"><strong>问题 ${i+1}</strong><button type="button" data-play="${i}">播放片段</button><button type="button" data-remove="${i}" aria-label="删除问题 ${i+1}">删除</button></div><label>时间戳（秒）<input class="timestamp" data-field="timestamp" value="${h(v.timestamp)}" placeholder="1.0–3.5" maxlength="80" aria-label="问题 ${i+1} 时间戳"></label><label>当前视频的物理问题描述<textarea data-field="problem" rows="3" maxlength="4000" aria-label="问题 ${i+1} 物理问题描述">${h(v.problem)}</textarea></label><label>应该修改后状态的描述<textarea data-field="expected" rows="3" maxlength="4000" aria-label="问题 ${i+1} 修改后状态">${h(v.expected)}</textarea></label></article>`;}
function renderIssues(issues){segment.stop();$('#issues').innerHTML=issues.map(issueHTML).join('');$('#add-issue').disabled=issues.length>=50;}
function readForm(){const old=active()||createDraft(current().record_id,current());return {...old,issues:$$('.issue').map(el=>Object.fromEntries(['timestamp','problem','expected'].map(key=>[key,el.querySelector(`[data-field="${key}"]`).value]))),duration:Number.isFinite(video.duration)&&video.duration>0?video.duration:old.duration};}
function saveDraft(){if(!current())return;const a=readForm();a.status='draft';a.updated_at=now();a.revision=(active()?.revision||0)+1;state.annotations[a.record_id]=a;persist();draftStatus();renderQueue();$('#form-error').hidden=true;}
function showTask(index){
  if(index<0||index>=tasks.length)return;segment.stop();currentIndex=index;const task=current();state.current_id=task.record_id;
  if(!active())state.annotations[task.record_id]=createDraft(task.record_id,task);
  const a=active();if(a.legacy?.verdict===''&&a.legacy.status==='draft'&&a.issues.length&&a.issues.every(v=>!v.timestamp&&!v.problem&&!v.expected))a.issues=seedIssues(task);
  $('#workspace').hidden=false;$('#sample-id').textContent=shortId(task.record_id);$('#sample-position').textContent=`${index+1} / ${tasks.length}`;
  video.playbackRate=Number($('#speed').value);delivery.load(task.record_id);$('#video-time').textContent='0.00 / — s';
  renderIssues(a.issues);$('#form-error').hidden=true;persist();draftStatus();renderQueue();
  const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===task.record_id);$('#prev-button').disabled=position<=0;$('#next-button').disabled=position===selected.length-1;
}
function navigate(delta){const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===current()?.record_id),next=selected[position+delta];if(next)showTask(tasks.indexOf(next));}
function playCard(el){if(!el)return;const timestamp=el.querySelector('[data-field="timestamp"]').value;segment.play(timestamp,Number(el.dataset.issue));}
function submit(verdict){
  if(!current()||!Object.hasOwn(VERDICTS,verdict))return;
  state.annotator.name=$('#annotator-name').value.trim();if(!state.annotator.name){$('#annotator-name').reportValidity();$('#annotator-name').focus();return;}
  const a={...readForm(),verdict},errors=validateAnnotation(a);if(errors.length){$('#form-error').textContent=errors.join('\n');$('#form-error').hidden=false;return;}
  a.status='submitted';a.updated_at=now();a.revision=(active()?.revision||0)+1;state.annotations[a.record_id]=a;
  const saved=persist();renderQueue();draftStatus();const nextId=nextWarmId();toast(saved?(nextId?`已提交：${shortResults[verdict]}`:'本组已完成，请导出 JSON。'):'已保留在内存，请立即导出 JSON。');if(nextId)showTask(tasks.findIndex(t=>t.record_id===nextId));
}
function download(data,prefix){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${prefix}_${now().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportPersonal(){if(!state.annotator.name.trim()){toast('请填写标注人。');$('#annotator-name').focus();return;}download(makeExport(state),'physfix_'+state.annotator.name.replace(/[^\p{L}\p{N}_-]/gu,'_'));}
function renderMerge(){
  mergedRows=mergeExports(mergedFiles,Number($('#minimum-reviews').value));$('#merge-status').textContent=`${mergedFiles.length} 份文件，${mergedRows.length} 条视频，${mergedRows.filter(r=>r.eligible).length} 条一致通过`;
  const labels={eligible:'一致通过',conflict:'有分歧',insufficient:'人数不足',excluded:'拒绝'};
  $('#merge-body').innerHTML=mergedRows.map(r=>`<tr><td>${h(shortId(r.record_id))}</td><td>${r.votes.map(v=>`${h(v.annotator.name)}：${h(VERDICTS[v.annotation.verdict])}`).join('<br>')}</td><td>${labels[r.status]}</td><td><details><summary>查看卡片</summary>${r.votes.map(v=>`<div class="merged-vote"><strong>${h(v.annotator.name)}</strong>${v.annotation.issues.map(i=>`<p>${h(i.timestamp)} s</p><p>${h(i.problem)}</p><p>${h(i.expected)}</p>`).join('')}</div>`).join('')}</details></td></tr>`).join('');
  $('#merge-export').disabled=!mergedRows.length;$('#merge-export-valid').disabled=!mergedRows.some(r=>r.eligible);
}
function exportMerged(onlyPassed=false){download({schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:onlyPassed?'consensus_problem_set':'merged_review',exported_at:now(),minimum_reviewers:Number($('#minimum-reviews').value),detail_review_required:true,samples:onlyPassed?mergedRows.filter(r=>r.eligible):mergedRows},onlyPassed?'physfix_consensus':'physfix_merged');}
$('#annotator-name').value=state.annotator.name;$('#annotator-name').oninput=()=>{state.annotator.name=$('#annotator-name').value.trim();persist();};
$('#queue').onclick=e=>{const button=e.target.closest('[data-index]');if(button)showTask(Number(button.dataset.index));};
$('#search').oninput=renderQueue;$('#status-filter').onchange=renderQueue;
$('#group-filter').onchange=()=>{state.group=$('#group-filter').value;const selected=selectedTasks();showTask(tasks.indexOf(selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0]));};
$('#prev-button').onclick=()=>navigate(-1);$('#next-button').onclick=()=>navigate(1);
$('#annotation-form').onsubmit=e=>{e.preventDefault();submit(e.submitter?.value);};
$('#annotation-form').addEventListener('input',()=>{segment.stop();saveDraft();});
$('#annotation-form').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input'))e.preventDefault();});
$('#add-issue').onclick=()=>{const a=readForm();if(a.issues.length>=50)return;a.issues.push(emptyIssue());renderIssues(a.issues);saveDraft();$$('.issue').at(-1).querySelector('input').focus();};
$('#issues').onclick=e=>{const card=e.target.closest('.issue');if(!card)return;const remove=e.target.closest('[data-remove]');if(remove){const a=readForm();a.issues.splice(Number(remove.dataset.remove),1);renderIssues(a.issues);saveDraft();return;}if(e.target.closest('[data-play]')||!e.target.closest('input,textarea,label,button,a,select'))playCard(card);};
$('#issues').onkeydown=e=>{if(e.target.matches('.issue')&&['Enter',' '].includes(e.key)){e.preventDefault();playCard(e.target);}};
function step(delta){segment.stop();video.pause();if(Number.isFinite(video.duration))video.currentTime=Math.max(0,Math.min(video.duration,video.currentTime+delta/30));}
$('#frame-back').onclick=()=>step(-1);$('#frame-forward').onclick=()=>step(1);$('#speed').onchange=()=>video.playbackRate=Number($('#speed').value);
function updateTime(){$('#video-time').textContent=`${video.currentTime.toFixed(2)} / ${Number.isFinite(video.duration)?video.duration.toFixed(2):'—'} s`;}
video.addEventListener('timeupdate',updateTime);
video.addEventListener('loadedmetadata',()=>{updateTime();if(active()&&Number.isFinite(video.duration)&&video.duration>0){active().duration=video.duration;persist();}});
$('#retry-video').onclick=()=>{segment.stop();delivery.retry();};$('#video-source').onchange=()=>{segment.stop();state.video_source=$('#video-source').value;persist();delivery.setMode(state.video_source);};
$('#export-button').onclick=exportPersonal;$('#restore-button').onclick=()=>$('#restore-file').click();
$('#restore-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw new Error('文件不能超过 10 MB。');const data=normalizeExport(JSON.parse(await file.text()),new Set(tasks.map(t=>t.record_id)));if(!window.confirm(`用「${data.annotator.name}」的备份替换本机进度？`))return;state.annotator=data.annotator;state.annotations=Object.fromEntries(data.annotations.map(a=>[a.record_id,a]));$('#annotator-name').value=state.annotator.name;persist();showTask(currentIndex);toast('已恢复。');}catch(error){toast(error.message);}finally{e.target.value='';}};
$('#merge-button').onclick=()=>{$('#merge-dialog').showModal();renderMerge();};$('#close-merge').onclick=()=>$('#merge-dialog').close();$('#merge-import').onclick=()=>$('#merge-file').click();
$('#merge-file').onchange=async e=>{const errors=[];for(const file of [...e.target.files]){try{if(file.size>10000000)throw new Error('文件不能超过 10 MB。');mergedFiles.push(normalizeExport(JSON.parse(await file.text()),new Set(tasks.map(t=>t.record_id))));}catch(error){errors.push(`${file.name}：${error.message}`);}}renderMerge();if(errors.length)toast(errors.join('\n'));e.target.value='';};
$('#minimum-reviews').onchange=renderMerge;$('#merge-export').onclick=()=>exportMerged();$('#merge-export-valid').onclick=()=>exportMerged(true);
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)toast('其他标签页修改了进度，请先导出当前内容。');});
async function init(){try{
  const manifestRequest=fetch('./data/video-manifest.json?v=1',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  tasks=(await loadDataset()).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);if(tasks.length!==300||new Set(tasks.map(t=>t.record_id)).size!==300)throw new Error('数据索引不完整。');
  for(const [id,a] of Object.entries(state.annotations)){const task=tasks.find(t=>t.record_id===id);if(task)state.annotations[id]=upgradeAnnotation(a,task,legacyLocal);}
  delivery.setManifest(await manifestRequest);
  const params=new URLSearchParams(location.search),group=params.get('group');if(group&&/^[1-6]$/.test(group))state.group=String(Number(group)-1);if(!['all','0','1','2','3','4','5'].includes(String(state.group)))state.group='all';$('#group-filter').value=state.group;
  const sample=params.get('sample');let index=tasks.findIndex(t=>sample?shortId(t.record_id)===sample:t.record_id===state.current_id);
  if(index>=0&&state.group!=='all'&&Math.floor(index/50)!==Number(state.group)){state.group='all';$('#group-filter').value='all';}
  if(index<0)index=tasks.indexOf(selectedTasks().find(t=>state.annotations[t.record_id]?.status!=='submitted')||selectedTasks()[0]);showTask(Math.max(0,index));
}catch(error){$('#load-error').hidden=false;$('#load-error').textContent=`加载失败：${error.message}`;}}
init();
