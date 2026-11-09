import {escapeHTML as h,seedIssues,OUTCOMES,outcome,makeExport} from './core.js?v=29-identities';
import {resolveCloudConflict,cloudMetadata} from './cloud-sync.js?v=29-identities';
import {VideoDelivery} from './video-delivery.js?v=29-identities';
import {SegmentPlayer} from './segment-player.js?v=29-identities';
import {playbackAssessment} from './playback.js?v=29-identities';
import {buildTeamProgress} from './team-progress.js?v=29-identities';
const $=selector=>document.querySelector(selector);
const cardHTML=card=>'<article class="sample-card" tabindex="0" data-time="'+h(card.timestamp)+'"><strong>'+h(card.timestamp)+' 秒</strong><p><b>物理问题</b><br>'+h(card.problem)+'</p><p><b>修改后应有的正确状态</b><br>'+h(card.expected)+'</p></article>';
const submittedLabel=a=>OUTCOMES[outcome(a)]||'草稿';
export function mountCloudUI({registry,cloud,getState,save,refresh,beforeResolve,getTasks,download}){
 let records=[],cursor=0,nextCursor=null;
 let progressTimer=null,progressRequest=0,progressLoading=false;
 const progressDialog=$('#team-progress-dialog');
 const syncDate=value=>{const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});};
 async function loadTeamProgress(){
  if(progressLoading||!progressDialog.open)return;
  progressLoading=true;const request=++progressRequest;$('#refresh-team-progress').disabled=true;$('#team-progress-status').textContent='读取中…';
  try{
   const [data,records]=await Promise.all([registry.list(),registry.allAnnotations()]);
   if(request!==progressRequest||!progressDialog.open)return;
   const rows=buildTeamProgress(getTasks(),data.claims,records),completed=rows.reduce((n,p)=>n+p.submitted,0),assigned=rows.reduce((n,p)=>n+p.assigned,0),historical=rows.reduce((n,p)=>n+p.historical,0);
   $('#team-progress-status').textContent='已提交 '+completed+' / '+assigned+' · '+Math.round(completed/(assigned||1)*100)+'%'+(historical?'（另有 '+historical+' 条历史标注）':'');
   $('#team-progress-body').innerHTML=rows.map(p=>'<tr><td><strong>'+h(p.name)+'</strong></td><td class="person-completion"><span>'+p.submitted+' / '+p.assigned+'</span><progress max="'+(p.assigned||1)+'" value="'+p.submitted+'" aria-label="'+h(p.name)+'完成进度"></progress></td><td>'+p.pass_direct+'</td><td>'+p.pass_modified+'</td><td>'+p.reject_no_clear_issue+'</td><td>'+p.reject_poor_quality+'</td><td>'+p.remaining+'</td><td>'+h(p.last_synced?syncDate(p.last_synced):p.registered?'尚未同步':'未进入')+'</td></tr>').join('');
  }catch(error){if(request===progressRequest&&progressDialog.open)$('#team-progress-status').textContent='读取失败：'+error.message+' 可点击刷新重试。';}
  finally{if(request===progressRequest){progressLoading=false;$('#refresh-team-progress').disabled=false;}}
 }
 function stopProgress(){clearInterval(progressTimer);progressTimer=null;progressRequest++;progressLoading=false;$('#refresh-team-progress').disabled=false;}
 $('#team-progress-button').onclick=()=>{stopProgress();$('#team-progress-body').innerHTML='';progressDialog.showModal();void loadTeamProgress();progressTimer=setInterval(()=>{if(!document.hidden)void loadTeamProgress();},30000);};
 $('#refresh-team-progress').onclick=()=>void loadTeamProgress();
 $('#close-team-progress').onclick=()=>progressDialog.close();progressDialog.addEventListener('close',stopProgress);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&progressDialog.open)void loadTeamProgress();});
 const video=$('#example-video'),delivery=new VideoDelivery(video,{getNextId:()=>null,onStatus:()=>{}}),segment=new SegmentPlayer(video,{onError:message=>{$('#example-detail-status').textContent=message;}});
 function status(value){
  const button=$('#sync-button');button.dataset.state=value.conflicts?'conflict':value.error?'error':value.pending?'pending':'saved';
  button.textContent=value.conflicts?value.conflicts+' 条版本待确认':value.error?'待同步 · 重试':value.busy?'正在同步…':!value.ready?'读取云端…':value.pending?'待同步 '+value.pending+' 条':'已同步';
  button.title=value.error||'本机自动保存，联网同步到后台';
 }
 function conflictView(){
  const state=getState(),entries=Object.entries(cloudMetadata(state).conflicts);
  $('#conflict-list').innerHTML=entries.map(([id,remote])=>'<section class="conflict-entry"><h3>'+h(id)+'</h3><div class="conflict-columns"><div><h4>本机 · '+h(submittedLabel(state.annotations[id]))+'</h4>'+state.annotations[id].issues.map(cardHTML).join('')+'</div><div><h4>云端 · '+h(submittedLabel(remote.annotation))+'</h4>'+remote.annotation.issues.map(cardHTML).join('')+'</div></div><div class="merge-tools"><button data-resolve-local="'+h(id)+'">保留本机并同步</button><button data-resolve-cloud="'+h(id)+'">使用云端版本</button></div></section>').join('')||'<p>没有待确认的版本。</p>';
 }
 $('#sync-button').onclick=()=>{if(Object.keys(cloudMetadata(getState()).conflicts).length){conflictView();$('#conflict-dialog').showModal();}else void cloud.flush();};
 $('#close-conflicts').onclick=()=>$('#conflict-dialog').close();
 $('#conflict-list').onclick=async e=>{
  const local=e.target.closest('[data-resolve-local]'),remote=e.target.closest('[data-resolve-cloud]');if(!local&&!remote)return;
  const id=local?.dataset.resolveLocal??remote.dataset.resolveCloud;beforeResolve();
  try{if(!await cloud.archiveConflict(id)){conflictView();return;}resolveCloudConflict(getState(),id,local?'local':'cloud');save();refresh();conflictView();void cloud.flush();}catch(error){$('#conflict-notice').textContent='备份未完成，已保留本机内容。'+error.message;}
 };
 async function loadExamples(reset=false){
  if(reset)cursor=0;$('#examples-status').textContent='读取中…';
  try{
   const data=await registry.examples({name:$('#example-person').value,decision:$('#example-outcome').value,cursor});
   records=data.records;nextCursor=data.next_cursor;
   $('#examples-status').textContent=data.admins.map(a=>a.name+'：'+a.total+' 条（直接通过 '+a.pass_direct+'，修改后通过 '+a.pass_modified+'）').join('；');
   $('#example-list').innerHTML=records.map((r,index)=>'<button class="example-row" data-example="'+index+'"><span>'+h(r.annotator.name)+' · '+h(r.annotation.record_id.split('::').at(-1))+'</span><span>'+h(submittedLabel(r.annotation))+'</span></button>').join('')||'<p>管理员尚未同步这类标注。同步后会显示真实案例。</p>';
   $('#examples-prev').disabled=cursor===0;$('#examples-next').disabled=nextCursor===null;
   $('#examples-page').textContent=data.total?'第 '+(cursor+1)+'–'+(cursor+records.length)+' 条 / '+data.total:'0 条';
  }catch(error){$('#examples-status').textContent=error.message;}
 }
 $('#examples-button').onclick=()=>{$('#examples-dialog').showModal();void loadExamples(true);};
 $('#close-examples').onclick=()=>{segment.stop();delivery.dispose();video.removeAttribute('src');video.load();$('#examples-dialog').close();};
 $('#examples-refresh').onclick=()=>loadExamples(true);$('#example-person').onchange=()=>loadExamples(true);$('#example-outcome').onchange=()=>loadExamples(true);
 $('#examples-next').onclick=()=>{if(nextCursor!==null){cursor=nextCursor;void loadExamples();}};$('#examples-prev').onclick=()=>{cursor=Math.max(0,cursor-50);void loadExamples();};
 $('#example-list').onclick=e=>{
  const button=e.target.closest('[data-example]');if(!button)return;const row=records[Number(button.dataset.example)],a=row.annotation,task=getTasks().find(t=>t.record_id===a.record_id);
  segment.stop();$('#example-detail').hidden=false;$('#example-detail-title').textContent=row.annotator.name+' · '+submittedLabel(a)+' · '+a.record_id.split('::').at(-1);
  const assessment=playbackAssessment(a.submitted_watch,a.duration);$('#example-detail-status').textContent=assessment.valid?'已完整观看':'播放记录不完整，需复核观看情况';
  $('#example-cards').innerHTML=a.issues.map(cardHTML).join('')||'<p>此视频已拒绝，未保留问题卡片。</p>';
  $('#example-original').innerHTML=(task?seedIssues(task):[]).map(cardHTML).join('');
  delivery.load(a.record_id);
 };
 $('#example-cards').onclick=e=>{const card=e.target.closest('[data-time]');if(card)segment.play(card.dataset.time,0);};
 $('#example-cards').onkeydown=e=>{if(e.key==='Enter'&&e.target.matches('[data-time]')){e.preventDefault();segment.play(e.target.dataset.time,0);}};
 async function readAll(){
  $('#cloud-read-status').textContent='读取后台标注…';
  try{const rows=await registry.allAnnotations(),people=new Map();for(const row of rows){if(!people.has(row.annotator.id))people.set(row.annotator.id,{annotator:row.annotator,annotations:[]});people.get(row.annotator.id).annotations.push(row.annotation);}
   $('#cloud-read-status').textContent='已读取 '+rows.length+' 条';
   return [...people.values()].map(person=>makeExport({annotator:person.annotator,annotations:Object.fromEntries(person.annotations.map(a=>[a.record_id,a]))}));
  }catch(error){$('#cloud-read-status').textContent=error.message;return null;}
 }
 $('#download-cloud').onclick=async()=>{const exports=await readAll();if(exports)download({export_type:'team_backups',exported_at:new Date().toISOString(),exports},'physfix_team');};
 $('#read-cloud-merge').onclick=async()=>{const exports=await readAll();if(exports)document.dispatchEvent(new CustomEvent('physfix-cloud-review',{detail:exports}));};
 $('#guide-button').onclick=()=>window.open('../guide.html?v=16-guide','physfix-guide');
 return {status,setManifest:value=>delivery.setManifest(value),stop:()=>{stopProgress();progressDialog.close();$('#team-progress-body').innerHTML='';segment.stop();delivery.dispose();}};
}
