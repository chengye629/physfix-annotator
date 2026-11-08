import {RegistryClient} from './registry-client.js?v=28-shihua';
import {REGISTRY_API} from './registry-config.js?v=28-shihua';
import {escapeHTML as h,shortId,emptyIssue,validateAnnotation} from './core.js?v=28-shihua';
import {compareApproval,stableStringify} from './approval.js?v=28-shihua';
import {VideoDelivery} from './video-delivery.js?v=28-shihua';
import {SegmentPlayer} from './segment-player.js?v=28-shihua';
const $=s=>document.querySelector(s),registry=new RegistryClient(REGISTRY_API);
const labels={pass:'确认通过',pass_modified:'修改后通过',reject_no_clear_issue:'拒绝：无明确问题',reject_poor_quality:'拒绝：质量差'};
let tasks=[],selected=null,identity=null,campaign=null,local={},versions={},saving=null,timer=null,ready=false;
const video=$('#review-video');
function notify(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#toast').hidden=true,4000);}
function error(text=''){$('#review-error').textContent=text;$('#review-error').hidden=!text;}
const segment=new SegmentPlayer(video,{onError:notify,onActiveChange:n=>document.querySelectorAll('[data-card]').forEach(el=>el.classList.toggle('active',Number(el.dataset.card)===n))});
const delivery=new VideoDelivery(video,{onStatus:({text})=>$('#review-video-status').textContent=text,getNextId:()=>visible().find(t=>t.record_id!==selected?.record_id&&current(t)?.status!=='submitted')?.record_id});
const key=()=>`physfix.admin-review.batch2.v1.${campaign.id}.${identity.annotator.id}`;
const editable=t=>t?.assignee===identity?.annotator.name;
const current=t=>local[t.record_id]?.payload||t.review?.payload;
function persist(){try{localStorage.setItem(key(),JSON.stringify(local));return true;}catch{error('本机保存失败，请保持页面打开并等待云端保存。');return false;}}
function visible(){const person=$('#review-person').value,filter=$('#review-filter').value,query=$('#review-search').value.trim().toLowerCase();return tasks.filter(t=>(!person||t.assignee===person)&&(!query||t.record_id.toLowerCase().includes(query))&&(filter==='all'||(current(t)?.status==='submitted')===(filter==='submitted')));}
function renderQueue(){
 const list=visible();$('#review-queue').innerHTML=list.map(t=>`<button class="queue-item ${t.record_id===selected?.record_id?'active':''}" data-id="${h(t.record_id)}" title="${h(t.record_id)}"><span>${h(shortId(t.record_id))}</span><span class="result" data-verdict="${current(t)?.decision?.startsWith('reject')?'reject_no_clear_issue':'pass'}">${current(t)?.status==='submitted'?'✓':local[t.record_id]?'·':''}</span></button>`).join('');
 const mine=tasks.filter(editable),done=mine.filter(t=>current(t)?.status==='submitted').length;$('#review-progress').textContent=`我的复核 ${done} / ${mine.length}`;
 $('#review-stats').innerHTML=campaign.reviewers.map(name=>{const all=tasks.filter(t=>t.assignee===name),done=all.filter(t=>current(t)?.status==='submitted').length;return `<span><strong>${h(name)}</strong>${done} / ${all.length}</span>`;}).join('');
 const index=list.findIndex(t=>t.record_id===selected?.record_id);$('#review-prev').disabled=index<=0;$('#review-next').disabled=index<0||index===list.length-1;
 $('#review-empty').hidden=!!list.length||!!selected;
}
const readCards=()=>[...document.querySelectorAll('[data-card]')].map(el=>Object.fromEntries(['timestamp','problem','expected'].map(f=>[f,el.querySelector(`[data-field="${f}"]`).value])));
function cardHTML(c,i){return `<article class="issue" data-card="${i}" tabindex="0"><div class="issue-header"><strong>问题 ${i+1}</strong><button type="button" data-play="${i}">播放片段</button><button type="button" data-remove="${i}">删除</button></div><label>时间戳（秒）<input data-field="timestamp" value="${h(c.timestamp)}" maxlength="80"></label><label>当前视频的物理问题描述<textarea data-field="problem" rows="3" maxlength="4000">${h(c.problem)}</textarea></label><label>修改后应有的正确状态<textarea data-field="expected" rows="3" maxlength="4000">${h(c.expected)}</textarea></label></article>`;}
function setCards(cards){$('#review-cards').innerHTML=cards.map(cardHTML).join('');$('#review-form').querySelectorAll('input,textarea,button').forEach(el=>el.disabled=!editable(selected));$('#review-add').disabled=!editable(selected)||cards.length>=50;}
function updateSaveStatus(){if(!selected)return;const pending=local[selected.record_id];$('#review-save-status').textContent=pending?(pending.conflict?'保存冲突':pending.error?'待重试':saving?.id===selected.record_id?'保存中…':'待同步'):selected.review?.payload?.status==='submitted'?`已提交：${labels[selected.review.payload.decision]}`:selected.review?'云端已保存':'';}
function edit(){if(!selected||!editable(selected))return;const old=current(selected);local[selected.record_id]={payload:{record_id:selected.record_id,status:'draft',decision:old?.decision||'',issues:readCards(),note:$('#review-note').value,source_version:old?.source_version??selected.source_version,updated_at:new Date().toISOString()},base_version:local[selected.record_id]?.base_version??versions[selected.record_id]??0};persist();clearTimeout(timer);timer=setTimeout(()=>void flush(),700);renderQueue();updateSaveStatus();}
async function flush(){
 if(saving)return saving.promise;
 const entry=Object.entries(local).find(([id,d])=>editable(tasks.find(t=>t.record_id===id))&&!d.conflict);if(!entry)return true;
 const [id,pending]=entry,sent=structuredClone(pending);
 const promise=(async()=>{try{
  const data=await registry.request('/api/admin/reviews/save',{body:{campaign_id:campaign.id,base_version:sent.base_version,review:sent.payload}});const task=tasks.find(t=>t.record_id===id);task.review=data.review;versions[id]=data.review.version;
  if(local[id]?.payload.updated_at===sent.payload.updated_at)delete local[id];else if(local[id])local[id].base_version=data.review.version;
  persist();renderQueue();return true;
 }catch(e){if(local[id]){local[id].error=e.message;local[id].conflict=e.status===409;}persist();error(e.status===409?'云端或原标注有更新，请导出本机内容，再点击刷新选择保留的版本。':e.message+'，本机内容已保留。');return false;
 }finally{saving=null;updateSaveStatus();}})();saving={id,promise};updateSaveStatus();const ok=await promise;if(ok&&Object.values(local).some(d=>!d.conflict))return flush();return ok;
}
function show(task){
 if(!task)return;segment.stop();selected=task;error();const a=current(task),cards=a?.issues||task.original_annotation.issues;
 $('#review-workspace').hidden=false;$('#review-empty').hidden=true;$('#review-id').textContent=shortId(task.record_id);$('#review-id').title=task.record_id;
 $('#audit-recommendation').textContent=task.audit.recommendation==='needs_confirmation'?'待确认':task.audit.recommendation_zh;$('#audit-reason').textContent=task.audit.reason;
 $('#review-original').innerHTML=task.original_annotation.issues.map(c=>`<article><strong>${h(c.timestamp)} 秒</strong><p>${h(c.problem)}</p><p><b>修改后应有的正确状态：</b>${h(c.expected)}</p></article>`).join('');
 $('#review-note').value=a?.note||'';setCards(cards);$('#review-readonly').hidden=editable(task);$('#review-source-changed').hidden=task.source_version===task.audit_source_version&&(!a||a.source_version===task.source_version);
 delivery.load(task.record_id);try{localStorage.setItem(key()+'.current',task.record_id);}catch{}renderQueue();updateSaveStatus();
}
async function load(){
 const data=await registry.request('/api/admin/reviews');campaign=data.campaign;tasks=data.tasks;versions=Object.fromEntries(tasks.map(t=>[t.record_id,t.review?.version||0]));
 try{local=JSON.parse(localStorage.getItem(key())||'{}');}catch{local={};}
 for(const [id,d] of Object.entries(local)){const task=tasks.find(t=>t.record_id===id);if(!task||!editable(task)){delete local[id];continue;}if(task.review&&stableStringify(task.review.payload)===stableStringify(d.payload)){delete local[id];continue;}if(d.base_version!==versions[id])d.conflict=true;}
 $('#review-person').innerHTML='<option value="">全部管理员</option>'+campaign.reviewers.map(n=>`<option>${h(n)}</option>`).join('');$('#review-person').value=identity.annotator.name;
 $('#reviewer-name').textContent=identity.annotator.name;$('#review-entry').hidden=true;$('#review-app').hidden=false;ready=true;
 let remembered;try{remembered=localStorage.getItem(key()+'.current');}catch{}
 show(visible().find(t=>t.record_id===remembered)||visible()[0]);renderQueue();void flush();
}
async function login(name){$('#login-error').hidden=true;$('#review-login button').disabled=true;try{identity=await registry.claim(name,undefined,'physfixbench-batch2-nine-v1');if(identity.role!=='admin')throw new Error('此页面仅供三位管理员复核。');const manifest=await fetch('./data/video-manifest.json').then(r=>{if(!r.ok)throw new Error('视频索引加载失败，请重试。');return r.json();});delivery.setManifest(manifest);await load();}catch(e){$('#login-error').textContent=e.message;$('#login-error').hidden=false;}finally{$('#review-login button').disabled=false;}}
$('#review-login').onsubmit=e=>{e.preventDefault();void login($('#review-name').value);};
$('#review-cards').oninput=edit;$('#review-note').oninput=edit;
$('#review-cards').onclick=e=>{const card=e.target.closest('[data-card]');if(!card)return;const i=Number(card.dataset.card);if(e.target.closest('[data-remove]')){const cards=readCards();cards.splice(i,1);setCards(cards);edit();}else if(e.target.closest('[data-play]')||!e.target.closest('input,textarea,label,button'))segment.play(card.querySelector('[data-field="timestamp"]').value,i);};
$('#review-cards').onkeydown=e=>{if(e.target.matches('[data-card]')&&['Enter',' '].includes(e.key)){e.preventDefault();segment.play(e.target.querySelector('[data-field="timestamp"]').value,Number(e.target.dataset.card));}};
$('#review-add').onclick=()=>{setCards([...readCards(),emptyIssue()]);edit();};
$('#review-queue').onclick=e=>{const id=e.target.closest('[data-id]')?.dataset.id;if(id)show(tasks.find(t=>t.record_id===id));};
for(const id of ['review-person','review-filter','review-search'])$('#'+id).addEventListener(id==='review-search'?'input':'change',()=>{show(visible()[0]);if(!visible().length){selected=null;$('#review-workspace').hidden=true;}renderQueue();});
function move(delta){const list=visible(),n=list.findIndex(t=>t.record_id===selected?.record_id);show(list[n+delta]);}
$('#review-prev').onclick=()=>move(-1);$('#review-next').onclick=()=>move(1);
$('#review-form').onsubmit=async e=>{
 e.preventDefault();if(!selected||!editable(selected))return;const task=selected,decision=e.submitter?.value;if(!labels[decision])return;
 const issues=readCards(),modified=compareApproval({issues},task.original_annotation.issues)==='modified';
 if(decision==='pass'&&modified){error('卡片已修改，请点击「修改卡片后通过」。');return;}
 if(decision==='pass_modified'&&!modified){error('卡片未修改，请点击「确认通过」。');return;}
 if(decision.startsWith('pass')){const errors=validateAnnotation({verdict:'pass',issues,duration:Number.isFinite(video.duration)?video.duration:null});if(errors.length){error(errors.join('\n'));return;}}
 if(local[task.record_id]?.conflict){error('存在保存冲突，请先导出本机内容，再刷新处理。');return;}
 const payload={record_id:task.record_id,status:'submitted',decision,issues,note:$('#review-note').value,source_version:task.source_version,updated_at:new Date().toISOString()};
 local[task.record_id]={payload,base_version:local[task.record_id]?.base_version??versions[task.record_id]??0};persist();clearTimeout(timer);$('#review-form').querySelectorAll('button').forEach(b=>b.disabled=true);
 const ok=await flush();if(selected?.record_id===task.record_id){setCards(current(task)?.issues||issues);if(ok&&!local[task.record_id]){notify('复核已提交');const next=visible().find(t=>t.record_id!==task.record_id&&current(t)?.status!=='submitted');if(next)show(next);else renderQueue();}}
};
$('#refresh-reviews').onclick=async()=>{try{await flush();if(Object.values(local).some(d=>d.conflict)){if(!confirm('有未同步的本机修改。确定用云端版本替换这些冲突内容？请先导出 JSON。'))return;for(const [id,d] of Object.entries(local))if(d.conflict)delete local[id];persist();}await load();error();}catch(e){error(e.message);}};
$('#export-reviews').onclick=()=>{const data={export_type:'admin_review',campaign_id:campaign.id,exported_at:new Date().toISOString(),reviewer:identity.annotator.name,records:tasks.filter(editable).map(t=>({record_id:t.record_id,review:current(t)||null,synced:!local[t.record_id]}))},a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=`复核_${identity.annotator.name}_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
$('#review-speed').onchange=()=>video.playbackRate=Number($('#review-speed').value);$('#review-source').onchange=()=>{delivery.mode=$('#review-source').value;if(selected)delivery.load(selected.record_id,{preserve:true});};$('#review-reload').onclick=()=>{if(selected)delivery.load(selected.record_id,{preserve:true});};
for(const [id,step] of [['review-back',-1],['review-forward',1]])$('#'+id).onclick=()=>{segment.stop();video.pause();video.currentTime=Math.max(0,Math.min(video.duration||0,video.currentTime+step/30));};
video.ontimeupdate=()=>$('#review-time').textContent=`${video.currentTime.toFixed(2)} / ${Number.isFinite(video.duration)?video.duration.toFixed(2):'—'} s`;
window.addEventListener('online',()=>{if(ready)void flush();});setInterval(()=>{if(ready&&!document.hidden)void flush();},20000);
window.addEventListener('beforeunload',e=>{if(ready&&Object.keys(local).length){persist();e.preventDefault();e.returnValue='';}});
try{const name=JSON.parse(localStorage.getItem('physfix.workspace.batch2.v1')||'{}').annotator?.name;if(name){$('#review-name').value=name;void login(name);}}catch{}
