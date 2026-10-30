import {stableStringify} from './approval.js?v=12-cloud';
export const fingerprint=annotation=>stableStringify(annotation);
export const hasProgress=annotation=>annotation?.status==='submitted'||(annotation?.revision||0)>0||(annotation?.watch?.play_count||0)>0||!!annotation?.legacy;
export function cloudMetadata(state){
 if(state.cloud?.owner!==state.annotator.id)state.cloud={owner:state.annotator.id,versions:{},ack:{},conflicts:{}};
 state.cloud.versions??={};state.cloud.ack??={};state.cloud.conflicts??={};return state.cloud;
}
export function mergeCloudRecords(state,records,{isUntouched=a=>!hasProgress(a)}={}){
 const meta=cloudMetadata(state);
 for(const row of records){
  const remote=row.annotation,id=remote.record_id,local=state.annotations[id],remoteKey=fingerprint(remote),localKey=local?fingerprint(local):null;
  if(!local||isUntouched(local)||localKey===remoteKey||localKey===meta.ack[id]){
   state.annotations[id]=structuredClone(remote);meta.versions[id]=row.version;meta.ack[id]=remoteKey;delete meta.conflicts[id];
  }else if(meta.versions[id]!==row.version){
   meta.conflicts[id]={annotation:structuredClone(remote),version:row.version,saved_at:row.saved_at};
  }
 }
 return state;
}
export function pendingRecords(state){
 const meta=cloudMetadata(state);
 return Object.values(state.annotations).filter(a=>!meta.conflicts[a.record_id]&&fingerprint(a)!==meta.ack[a.record_id]);
}
export function resolveCloudConflict(state,id,choice){
 const meta=cloudMetadata(state),conflict=meta.conflicts[id];if(!conflict)return;
 meta.versions[id]=conflict.version;meta.ack[id]=fingerprint(conflict.annotation);
 if(choice==='cloud')state.annotations[id]=structuredClone(conflict.annotation);
 else if(choice!=='local')throw new Error('请选择保留本机或使用云端。');
 delete meta.conflicts[id];
}
export class CloudSync{
 constructor(registry,{getState,save=()=>{},onStatus=()=>{},normalize=a=>a,isUntouched=a=>!hasProgress(a),delay=1200}={}){
  Object.assign(this,{registry,getState,save,onStatus,normalize,isUntouched,delay});this.generation=0;this.owner=null;this.timer=null;this.busy=false;this.ready=false;this.error='';
 }
 stop(){clearTimeout(this.timer);this.timer=null;this.generation++;this.owner=null;this.ready=false;this.busy=false;}
 valid(generation){return this.owner&&this.generation===generation&&this.getState().annotator.id===this.owner;}
 status(){
  if(!this.owner)return;
  const state=this.getState(),conflicts=Object.keys(cloudMetadata(state).conflicts).length,pending=pendingRecords(state).length;
  this.onStatus({pending,conflicts,busy:this.busy,error:this.error,ready:this.ready});
 }
 async start(){
  this.stop();this.owner=this.getState().annotator.id;const generation=this.generation;cloudMetadata(this.getState());this.status();
  try{const data=await this.registry.annotations();if(!this.valid(generation))return;
   mergeCloudRecords(this.getState(),data.records.map(row=>({...row,annotation:this.normalize(row.annotation)})),{isUntouched:this.isUntouched});this.save();this.error='';
   for(const id of Object.keys(cloudMetadata(this.getState()).conflicts)){if(!this.valid(generation))return;await this.archiveConflict(id);}
  }catch(error){if(this.valid(generation))this.error=error.message;}
  if(!this.valid(generation))return;this.ready=true;this.status();this.schedule();
 }
 async archiveConflict(id){
  const generation=this.generation,state=this.getState(),meta=cloudMetadata(state),conflict=meta.conflicts[id];if(!conflict)return true;
  const local=structuredClone(state.annotations[id]),key=fingerprint(local);
  if(conflict.archived_local===key)return true;
  const result=await this.registry.syncAnnotations([{annotation:local,base_version:null}]);if(!this.valid(generation))return false;
  const currentMeta=cloudMetadata(this.getState()),remote=result.conflicts[0];
  if(remote){const changed=remote.version!==conflict.version;currentMeta.conflicts[id]={annotation:this.normalize(remote.annotation),version:remote.version,saved_at:remote.saved_at,archived_local:key};this.save();return !changed;}
  const saved=result.saved[0];if(saved){currentMeta.versions[id]=saved.version;currentMeta.ack[id]=key;delete currentMeta.conflicts[id];this.save();}return true;
 }
 schedule(){if(!this.owner||!this.ready)return;this.status();if(this.timer||this.busy)return;if(!pendingRecords(this.getState()).length)return;this.timer=setTimeout(()=>{this.timer=null;void this.flush();},this.delay);}
 async flush(){
  if(!this.owner||!this.ready||this.busy)return;clearTimeout(this.timer);this.timer=null;
  const generation=this.generation;this.busy=true;this.error='';this.status();
  try{
   for(let round=0;round<100&&this.valid(generation);round++){
    const state=this.getState(),meta=cloudMetadata(state),pending=pendingRecords(state);if(!pending.length)break;
    const records=[];let bytes=0;
    for(const annotation of pending.slice(0,20)){const copy=structuredClone(annotation),size=new TextEncoder().encode(JSON.stringify(copy)).length;if(records.length&&bytes+size>900000)break;bytes+=size;records.push({annotation:copy,base_version:meta.versions[annotation.record_id]??null});}
    const result=await this.registry.syncAnnotations(records);if(!this.valid(generation))return;
    const currentMeta=cloudMetadata(this.getState());
    for(const saved of result.saved){const sent=records.find(r=>r.annotation.record_id===saved.record_id);if(sent){currentMeta.versions[saved.record_id]=saved.version;currentMeta.ack[saved.record_id]=fingerprint(sent.annotation);delete currentMeta.conflicts[saved.record_id];}}
    for(const conflict of result.conflicts){currentMeta.conflicts[conflict.annotation.record_id]={annotation:this.normalize(conflict.annotation),version:conflict.version,saved_at:conflict.saved_at,archived_local:fingerprint(records.find(r=>r.annotation.record_id===conflict.annotation.record_id).annotation)};}
    this.save();this.status();
   }
  }catch(error){if(this.valid(generation))this.error=error.message;}
  finally{if(this.valid(generation)){this.busy=false;this.status();}}
 }
}
