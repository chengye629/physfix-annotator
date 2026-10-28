import {DATASET,SCHEMA_VERSION,VERDICTS,shortId,escapeHTML as h,emptyIssue,seedIssues,createDraft,validateAnnotation,makeExport,normalizeExport,upgradeAnnotation,mergeExports} from './core.js?v=10-shared';
import {VideoDelivery} from './video-delivery.js?v=8-full';
import {loadDataset} from './dataset-loader.js?v=8-full';
import {SegmentPlayer} from './segment-player.js?v=8-full';
import {annotationStage,matchesTaskStatus,groupTasks,resolveStartTask,groupLink,buildReviewSummary,filterReviewRows} from './workflow.js?v=8-full';
import {PlaybackTracker,playbackAssessment} from './playback.js?v=8-full';
import {TASK_COUNT,GROUP_SIZE,SOURCE_LABELS,sourceOf,taskLabel} from './dataset-config.js?v=8-full';
import {openNamedWorkspace,normalizeName,personalExportPrefix} from './annotator-entry.js?v=10-shared';
import {ASSIGNMENT_PLAN,PARTICIPANT_COUNT,assignedTasks,assignmentLink,linkedAssignment,assignmentDetails,validPerson} from './assignments.js?v=10-shared';
import {RegistryClient,RegistryError} from './registry-client.js?v=10-shared';
import {REGISTRY_API} from './registry-config.js?v=10-shared';
const registry=new RegistryClient(REGISTRY_API);
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const STORAGE_KEY='physfix.workspace.v1';
let tasks=[],currentIndex=0,mergedFiles=[],mergedRows=[],reviewSummary=null,toastTimer,storageAvailable=true,legacyLocal=false,entered=false,ready=false,person=null,registration=null,entering=false;
let state={schema_version:SCHEMA_VERSION,annotator:{id:crypto.randomUUID(),name:''},annotations:{},current_id:null,group:'all',source_filter:'all'};
try{const raw=localStorage.getItem(STORAGE_KEY);if(raw){const saved=JSON.parse(raw);if(saved?.annotator?.id&&saved.annotations&&typeof saved.annotations==='object'){state={...state,...saved};legacyLocal=saved.schema_version!==SCHEMA_VERSION;if(legacyLocal&&!localStorage.getItem(STORAGE_KEY+'.before-cards')){try{localStorage.setItem(STORAGE_KEY+'.before-cards',raw);}catch{}}}}}catch{storageAvailable=false;}
const video=$('#video');
const current=()=>tasks[currentIndex];
const isAdmin=()=>registration?.role==='admin';
const ownTasks=()=>assignedTasks(tasks,person);
const selectedTasks=()=>groupTasks(ownTasks(),state.group,state.source_filter);
const active=()=>state.annotations[current()?.record_id];
const now=()=>new Date().toISOString();
const shortResults={pass:'通过',reject_no_clear_issue:'无明确问题',reject_poor_quality:'质量差'};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3500);}
function persist(){state.schema_version=SCHEMA_VERSION;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));storageAvailable=true;return true;}catch{storageAvailable=false;toast('本机保存失败，请立即导出 JSON。');return false;}}
function nextWarmId(){const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===current()?.record_id);return [...selected.slice(position+1),...selected.slice(0,position)].find(t=>state.annotations[t.record_id]?.status!=='submitted')?.record_id||null;}
function updatePlaybackStatus(){const result=playbackAssessment(active()?.watch);$('#watch-status').textContent=result.valid?'已看完':result.coverage>0?`已观看 ${Math.min(99,Math.floor(result.coverage*100))}%`:'未播放';$('#watch-status').dataset.complete=String(result.valid);}
const watch=new PlaybackTracker(video,{onChange:(id,evidence)=>{const a=state.annotations[id];if(a){a.watch=evidence;persist();}if(id===current()?.record_id)updatePlaybackStatus();}});
const delivery=new VideoDelivery(video,{getNextId:nextWarmId,onBeforeReset:()=>watch.capture(true),onStatus:({kind,text})=>{$('#video-load-status').textContent=kind==='ready'?(text.includes('下一条')?'下一条已预加载':'已就绪'):text;}});
delivery.mode=['auto','site','original'].includes(state.video_source)?state.video_source:'auto';$('#video-source').value=delivery.mode;
const segment=new SegmentPlayer(video,{onActiveChange:index=>{$$('.issue').forEach(el=>el.classList.toggle('active',index!==null&&Number(el.dataset.issue)===index));},onError:toast});
function draftStatus(){const a=active(),stage=annotationStage(a);document.getElementById('draft-status').dataset.status=a?.status||'draft';$('#draft-status').textContent=!storageAvailable?'请导出备份':a?.status==='submitted'?`已提交：${shortResults[a.verdict]||''}`:stage==='draft'?'草稿已保存':'预标注';}
function renderGroups(){
  $('#group-filter').hidden=person!==null;$('#merge-button').hidden=!isAdmin();$('#manage-button').hidden=!isAdmin();$('#copy-group-link').textContent='复制入口链接';
  if(person!==null){$('#group-filter').innerHTML='<option value="all">我的任务</option>';$('#group-filter').value='all';return;}
  const source=state.source_filter,all=groupTasks(tasks,'all',source);
  $('#group-filter').innerHTML='<option value="all">全部 '+all.length+' 条</option>'+Array.from({length:Math.ceil(tasks.length/GROUP_SIZE)},(_,i)=>({i,list:groupTasks(tasks,String(i),source)})).filter(v=>v.list.length).map(({i})=>`<option value="${i}">${i*GROUP_SIZE+1}–${Math.min((i+1)*GROUP_SIZE,tasks.length)}</option>`).join('');
  $('#group-filter').value=state.group;
}
function renderQueue(){
  const query=$('#search').value.trim().toLowerCase(),filter=$('#status-filter').value,selected=selectedTasks();
  const visible=selected.filter(t=>`${taskLabel(t)} ${t.record_id} ${t.dir_name}`.toLowerCase().includes(query)&&matchesTaskStatus(state.annotations[t.record_id],filter));
  const scroll=$('#queue').scrollTop;
  $('#queue').innerHTML=visible.map(t=>{const a=state.annotations[t.record_id],index=tasks.indexOf(t),stage=annotationStage(a),done=a?.status==='submitted';return `<button class="queue-item ${index===currentIndex?'active':''}" data-index="${index}" ${index===currentIndex?'aria-current="true"':''} title="${h(taskLabel(t))} · ${done?h(VERDICTS[a.verdict]):stage==='draft'?'草稿':'未提交'}"><span>${person===null?index+1:ownTasks().indexOf(t)+1}. ${h(taskLabel(t))}</span>${done||stage==='draft'?`<span class="result" data-verdict="${done?h(a.verdict):'draft'}">${!done?'·':a.verdict==='pass'?'✓':a.verdict==='reject_poor_quality'?'差':'×'}</span>`:''}</button>`;}).join('')||'无匹配任务';
  $('#queue').scrollTop=scroll;
  const done=selected.filter(t=>state.annotations[t.record_id]?.status==='submitted').length;
  $('#progress-text').textContent=`已提交 ${done} / ${selected.length}`;
  $('#task-progress').max=selected.length||1;$('#task-progress').value=done;
  $('#resume-button').disabled=done===selected.length;
  for(const option of $('#group-filter').options){if(option.value==='all')continue;const list=groupTasks(tasks,option.value,state.source_filter),count=list.filter(t=>state.annotations[t.record_id]?.status==='submitted').length;option.textContent=`${Number(option.value)*GROUP_SIZE+1}–${Math.min((Number(option.value)+1)*GROUP_SIZE,tasks.length)}（${count}/${list.length}）`;}
}

function issueHTML(v,i){return `<article class="issue" data-issue="${i}" tabindex="0" aria-label="问题 ${i+1}，点击播放对应片段"><div class="issue-header"><strong>问题 ${i+1}</strong><button type="button" data-play="${i}">播放片段</button><button type="button" data-remove="${i}" aria-label="删除问题 ${i+1}">删除</button></div><label>时间戳（秒）<input class="timestamp" data-field="timestamp" value="${h(v.timestamp)}" placeholder="1.0–3.5" maxlength="80" aria-label="问题 ${i+1} 时间戳"></label><label>当前视频的物理问题描述<textarea data-field="problem" rows="3" maxlength="4000" aria-label="问题 ${i+1} 物理问题描述">${h(v.problem)}</textarea></label><label>应该修改后状态的描述<textarea data-field="expected" rows="3" maxlength="4000" aria-label="问题 ${i+1} 修改后状态">${h(v.expected)}</textarea></label></article>`;}
function renderIssues(issues){segment.stop();$('#issues').innerHTML=issues.map(issueHTML).join('');$('#add-issue').disabled=issues.length>=50;}
function readForm(){watch.capture(true);const old=active()||createDraft(current().record_id,current());return {...old,issues:$$('.issue').map(el=>Object.fromEntries(['timestamp','problem','expected'].map(key=>[key,el.querySelector(`[data-field="${key}"]`).value]))),duration:Number.isFinite(video.duration)&&video.duration>0?video.duration:old.duration};}
function saveDraft(){if(!current())return;const a=readForm();a.status='draft';a.updated_at=now();a.revision=(active()?.revision||0)+1;state.annotations[a.record_id]=a;persist();draftStatus();renderQueue();$('#form-error').hidden=true;}
function showTask(index){
  if(!entered)return;
  if(index<0||index>=tasks.length||(person!==null&&!ownTasks().includes(tasks[index])))return;watch.detach();segment.stop();currentIndex=index;const task=current();state.current_id=task.record_id;
  if(!active())state.annotations[task.record_id]=createDraft(task.record_id,task);
  const a=active();if(a.legacy?.verdict===''&&a.legacy.status==='draft'&&a.issues.length&&a.issues.every(v=>!v.timestamp&&!v.problem&&!v.expected))a.issues=seedIssues(task);
  $('#workspace').hidden=false;$('#sample-id').textContent=taskLabel(task);$('#sample-id').title=task.record_id;$('#sample-position').textContent=person===null?`${index+1} / ${tasks.length}`:`${ownTasks().indexOf(task)+1} / ${ownTasks().length}`;
  video.playbackRate=Number($('#speed').value);delivery.load(task.record_id);watch.attach(task.record_id,a.watch);updatePlaybackStatus();$('#video-time').textContent='0.00 / — s';
  renderIssues(a.issues);$('#form-error').hidden=true;persist();draftStatus();renderQueue();
  const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===task.record_id);$('#prev-button').disabled=position<=0;$('#next-button').disabled=position===selected.length-1;
}
function navigate(delta){const selected=selectedTasks(),position=selected.findIndex(t=>t.record_id===current()?.record_id),next=selected[position+delta];if(next)showTask(tasks.indexOf(next));}
function playCard(el){if(!el)return;const timestamp=el.querySelector('[data-field="timestamp"]').value;segment.play(timestamp,Number(el.dataset.issue));}
async function submit(verdict){
  if(!entered||!current()||!Object.hasOwn(VERDICTS,verdict))return;
  if(!state.annotator.name)return;
  const a={...readForm(),verdict},errors=validateAnnotation(a);if(errors.length){$('#form-error').textContent=errors.join('\n');$('#form-error').hidden=false;return;}
  const taskId=a.record_id,revision=active()?.revision;$$('.submission-actions button').forEach(b=>b.disabled=true);
  try{await registry.check();if(current()?.record_id!==taskId||active()?.revision!==revision){toast('视频或标注已变化，请重新提交。');return;}}catch(error){toast(error.message);if([403,410].includes(error.status)){backToEntry();$('#entry-export').hidden=false;$('#entry-error').textContent='任务已调整，请重新填写姓名进入。';$('#entry-error').hidden=false;}return;}finally{$$('.submission-actions button').forEach(b=>b.disabled=false);}
  a.submitted_watch=watch.capture(true);a.watch=a.submitted_watch;a.status='submitted';a.updated_at=now();a.revision=(active()?.revision||0)+1;state.annotations[a.record_id]=a;
  const saved=persist();renderQueue();draftStatus();const nextId=nextWarmId();toast(saved?(nextId?`已提交：${shortResults[verdict]}`:'本组已完成，请导出 JSON。'):'已保留在内存，请立即导出 JSON。');if(saved&&nextId)showTask(tasks.findIndex(t=>t.record_id===nextId));
}
function download(data,prefix){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${prefix}_${now().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function exportPersonal(){watch.capture(true);if(!state.annotator.name.trim()){toast('请先填写姓名。');$('#entry-name').focus();return;}download(makeExport(state),personalExportPrefix(state.annotator.name,registration?.person??person));}
function renderMerge(){
  reviewSummary=buildReviewSummary(mergedFiles,tasks.map(t=>t.record_id),Number($('#minimum-reviews').value));
  mergedRows=reviewSummary.samples.filter(r=>r.reviewer_count>0);
  const c=reviewSummary.coverage;
  $('#merge-status').textContent=mergedFiles.length?`已导入 ${mergedFiles.length} 份文件 · ${reviewSummary.annotators.length} 位标注人 · 覆盖 ${c.covered}/${c.total} · 待补标 ${c.needs_more} · 分歧 ${c.conflicts} · ${c.eligible} 条一致通过 · 播放筛除 ${reviewSummary.screening.excluded}`:'未导入';
  const labels={eligible:'一致通过',conflict:'有分歧',insufficient:'人数不足',excluded:'一致拒绝',unreviewed:'未标注'};
  const visible=filterReviewRows(reviewSummary,$('#merge-filter').value);
  $('#merge-body').innerHTML=visible.map(r=>`<tr><td><button class="task-link" data-review-id="${h(r.record_id)}">${h(taskLabel(tasks.find(t=>t.record_id===r.record_id)))}</button></td><td>${r.votes.map(v=>`${h(v.annotator.name)}：${h(VERDICTS[v.annotation.verdict])}`).join('<br>')||'—'}</td><td>${r.reviewer_count}/${reviewSummary.minimum} · ${labels[r.status]}</td><td>${r.votes.length?`<details><summary>查看卡片</summary>${r.votes.map(v=>`<div class="merged-vote"><strong>${h(v.annotator.name)}</strong>${v.annotation.issues.map(i=>`<p>${h(i.timestamp)} s</p><p>${h(i.problem)}</p><p>${h(i.expected)}</p>`).join('')}</div>`).join('')}</details>`:'—'}</td></tr>`).join('')||'<tr><td colspan="4">无匹配记录</td></tr>';
  $('#annotator-body').innerHTML=reviewSummary.annotators.map(p=>`<tr><td>${h(p.name)}</td><td>${p.submitted}</td><td>${p.pass}</td><td>${p.reject_no_clear_issue}</td><td>${p.reject_poor_quality}</td></tr>`).join('');
  $('#annotator-progress').hidden=!reviewSummary.annotators.length;
  $('#merge-export').disabled=!mergedRows.length;$('#merge-export-valid').disabled=!mergedRows.some(r=>r.eligible);$('#merge-export-review').disabled=!mergedFiles.length||!reviewSummary.followup.length;$('#merge-export-screened').disabled=!reviewSummary.screened_out.length;
}
function exportMerged(onlyPassed=false){download({schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:onlyPassed?'consensus_problem_set':'merged_review',exported_at:now(),minimum_reviewers:reviewSummary.minimum,detail_review_required:true,coverage:reviewSummary.coverage,playback_screening:reviewSummary.screening,annotators:reviewSummary.annotators,samples:onlyPassed?mergedRows.filter(r=>r.eligible):mergedRows},onlyPassed?'physfix_consensus':'physfix_merged');}

async function enterAnnotation(value){
 if(!ready||entering)return;entering=true;$('#enter-button').disabled=true;$('#enter-button').textContent='正在领取…';
 try{
  const name=normalizeName(value),store={getItem:key=>{try{return localStorage.getItem(key);}catch{return null;}},setItem:(key,data)=>localStorage.setItem(key,data)};
  let next=openNamedWorkspace(state,name,store);const legacy=next.schema_version!==SCHEMA_VERSION;
  for(const [id,a] of Object.entries(next.annotations)){const task=tasks.find(t=>t.record_id===id);if(task)next.annotations[id]=upgradeAnnotation(a,task,legacy);}
  const claimed=await registry.claim(name,next.annotator.id,ASSIGNMENT_PLAN);registration=claimed;
  if(claimed.annotator.name!==name)next=openNamedWorkspace(state,claimed.annotator.name,store);
  state=next;state.schema_version=SCHEMA_VERSION;state.annotator=claimed.annotator;state.registration=claimed;
  person=claimed.role==='admin'&&new URLSearchParams(location.search).get('view')==='all'?null:claimed.person;
  state.assignment=assignmentDetails(tasks,claimed.person);if(state.assignment)state.assignment.claim_id=claimed.claim_id;
  state.group='all';state.source_filter='all';$('#annotator-name').textContent=state.annotator.name;$('#annotator-name').title=state.annotator.name;
  delivery.mode=['auto','site','original'].includes(state.video_source)?state.video_source:'auto';$('#video-source').value=delivery.mode;
  refreshScope();entered=true;$('#entry').hidden=true;$('#annotation-app').hidden=false;$('#entry-error').hidden=true;$('#entry-export').hidden=true;
  history.replaceState(null,'',new URL(location.pathname,location.href).href);
  const selected=selectedTasks(),resumed=selected.find(t=>t.record_id===state.current_id)||selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0];showTask(tasks.indexOf(resumed));
 }catch(error){$('#entry-error').textContent=error.message;$('#entry-error').hidden=false;$('#entry-export').hidden=!state.annotator.name||!Object.keys(state.annotations).length;}
 finally{entering=false;$('#enter-button').disabled=!ready;$('#enter-button').textContent='进入标注';}
}
function refreshScope(){
 const scope=ownTasks();$('#source-filter').innerHTML='<option value="all">全部来源</option>'+Object.entries(SOURCE_LABELS).map(([value,name])=>({value,name,count:scope.filter(t=>sourceOf(t)===value).length})).filter(v=>v.count).map(({value,name,count})=>`<option value="${value}">${name}（${count}）</option>`).join('');
 $('#source-filter').value='all';$('#search').value='';$('#status-filter').value='all';renderGroups();
}
function backToEntry(){
 segment.stop();watch.detach();video.pause();delivery.dispose();video.removeAttribute('src');video.load();persist();entered=false;
 $('#annotation-app').hidden=true;$('#entry').hidden=false;$('#entry-name').value=state.annotator.name;$('#entry-name').focus();$('#entry-name').select();
}
$('#entry-name').value=state.annotator.name;
$('#entry-form').onsubmit=e=>{e.preventDefault();enterAnnotation($('#entry-name').value);};
$('#entry-name').oninput=()=>{$('#entry-error').hidden=true;};
$('#entry-export').onclick=exportPersonal;$('#change-person').onclick=backToEntry;
async function renderManagement(){
 try{
  const data=await registry.list();$('#management-status').textContent=`已领取 ${data.claims.filter(c=>c.slot!==null).length} / ${data.participants} 份`;
  $('#management-body').innerHTML=data.claims.map(c=>`<tr><td>${h(c.display_name)}${c.role==='admin'?'（管理员）':''}</td><td>${c.slot===null?'未领任务':'第 '+c.slot+' 份 · '+c.task_count+' 条'}</td><td>${c.claim_id===registration?.claim_id?'当前人员':`<button data-reassign="${h(c.claim_id)}">转交</button> <button data-release="${h(c.claim_id)}">释放</button>`}</td></tr>`).join('');
  $('#view-all-tasks').textContent=person===null?'查看我的任务':'查看全部任务';$('#view-all-tasks').disabled=person===null&&registration?.person===null;
 }catch(error){$('#management-status').textContent=error.message;}
}
$('#manage-button').onclick=()=>{$('#management-dialog').showModal();renderManagement();};$('#close-management').onclick=()=>$('#management-dialog').close();
$('#management-body').onclick=async e=>{
 const release=e.target.closest('[data-release]'),reassign=e.target.closest('[data-reassign]');if(!release&&!reassign)return;
 try{
  if(release){if(!window.confirm('释放这份任务，供其他人重新领取？已有本机标注不会被删除。'))return;await registry.release(release.dataset.release);}
  else{const name=window.prompt('将这份任务转交给谁？请输入姓名。');if(!name)return;await registry.reassign(reassign.dataset.reassign,normalizeName(name));}
  await renderManagement();
 }catch(error){toast(error.message);}
};
$('#view-all-tasks').onclick=()=>{person=person===null?registration.person:null;state.group='all';state.source_filter='all';refreshScope();$('#management-dialog').close();const selected=selectedTasks();showTask(tasks.indexOf(selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0]));};
$('#queue').onclick=e=>{const button=e.target.closest('[data-index]');if(button)showTask(Number(button.dataset.index));};
$('#search').oninput=renderQueue;$('#status-filter').onchange=renderQueue;
$('#resume-button').onclick=()=>{const next=selectedTasks().find(t=>state.annotations[t.record_id]?.status!=='submitted');if(next){$('#status-filter').value='pending';$('#search').value='';showTask(tasks.indexOf(next));}};
$('#copy-group-link').onclick=async()=>{const url=new URL(location.pathname,location.href).href;try{await navigator.clipboard.writeText(url);toast('入口链接已复制');}catch{window.prompt('复制分组链接',url);}};
$('#source-filter').onchange=()=>{state.source_filter=$('#source-filter').value;state.group='all';renderGroups();const selected=selectedTasks();showTask(tasks.indexOf(selected.find(t=>state.annotations[t.record_id]?.status!=='submitted')||selected[0]));};
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
$('#restore-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10000000)throw new Error('文件不能超过 10 MB。');const data=normalizeExport(JSON.parse(await file.text()),new Set(tasks.map(t=>t.record_id)));if(data.assignment?.plan===ASSIGNMENT_PLAN&&registration?.person!==null&&data.assignment.person!==registration?.person)throw new Error('备份属于其他任务，请核对标注人姓名。');if(!window.confirm(`用「${data.annotator.name}」的备份替换本机进度？`))return;watch.detach();state.annotator=registration?.annotator||data.annotator;state.annotations=Object.fromEntries(data.annotations.map(a=>[a.record_id,a]));$('#annotator-name').textContent=state.annotator.name;persist();showTask(currentIndex);toast('已恢复。');}catch(error){toast(error.message);}finally{e.target.value='';}};
$('#merge-button').onclick=()=>{$('#merge-dialog').showModal();renderMerge();};$('#close-merge').onclick=()=>$('#merge-dialog').close();$('#merge-import').onclick=()=>$('#merge-file').click();
$('#merge-file').onchange=async e=>{const errors=[];for(const file of [...e.target.files]){try{if(file.size>10000000)throw new Error('文件不能超过 10 MB。');mergedFiles.push(normalizeExport(JSON.parse(await file.text()),new Set(tasks.map(t=>t.record_id))));}catch(error){errors.push(`${file.name}：${error.message}`);}}renderMerge();if(errors.length)toast(errors.join('\n'));e.target.value='';};
$('#merge-export-screened').onclick=()=>download({schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'playback_excluded',exported_at:now(),playback_screening:reviewSummary.screening,records:reviewSummary.screened_out},'physfix_playback_excluded');
$('#minimum-reviews').onchange=renderMerge;$('#merge-filter').onchange=renderMerge;$('#merge-export').onclick=()=>exportMerged();$('#merge-export-valid').onclick=()=>exportMerged(true);
$('#merge-export-review').onclick=()=>download({schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'review_queue',exported_at:now(),minimum_reviewers:reviewSummary.minimum,coverage:reviewSummary.coverage,playback_screening:reviewSummary.screening,samples:reviewSummary.followup},'physfix_review_queue');
$('#merge-body').onclick=e=>{const button=e.target.closest('[data-review-id]');if(!button)return;const index=tasks.findIndex(t=>t.record_id===button.dataset.reviewId);if(index<0)return;if(person!==null&&!ownTasks().includes(tasks[index])){toast('该视频不在当前任务中。');return;}if(!selectedTasks().includes(tasks[index])){state.group='all';state.source_filter='all';$('#source-filter').value='all';renderGroups();}$('#merge-dialog').close();showTask(index);};
window.addEventListener('pagehide',()=>watch.capture(true));
document.addEventListener('visibilitychange',()=>watch.capture(true));
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY)toast('其他标签页修改了进度，请先导出当前内容。');});
async function init(){try{
  const manifestRequest=fetch('./data/video-manifest.json?v=8-full',{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
  tasks=(await loadDataset()).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);if(tasks.length!==TASK_COUNT||new Set(tasks.map(t=>t.record_id)).size!==TASK_COUNT)throw new Error('数据索引不完整。');
  for(const [id,a] of Object.entries(state.annotations)){const task=tasks.find(t=>t.record_id===id);if(task)state.annotations[id]=upgradeAnnotation(a,task,legacyLocal);}
  const manifest=await manifestRequest;
  delivery.setManifest({videos:Object.fromEntries(tasks.map(t=>[t.record_id,{...manifest?.videos?.[t.record_id],upstream_file:t.video_file}]))});
  $('#source-filter').innerHTML='<option value="all">全部来源</option>'+Object.entries(SOURCE_LABELS).map(([value,name])=>`<option value="${value}">${name}（${tasks.filter(t=>sourceOf(t)===value).length}）</option>`).join('');
  ready=true;$('#enter-button').disabled=false;
}catch(error){$('#entry-error').hidden=false;$('#entry-error').textContent=`加载失败：${error.message}`;}}
init();
