import {PARTICIPANT_COUNT} from './participants.js?v=11-roster';
export class RegistryError extends Error{constructor(message,status=0,code=''){super(message);Object.assign(this,{status,code});}}
export class RegistryClient{
 constructor(base,{fetcher=(...args)=>fetch(...args)}={}){this.base=base?.replace(/\/$/,'');this.fetcher=fetcher;this.session=null;}
 async request(path,{body,token=this.session?.token}={}){
  if(!this.base)throw new RegistryError('自动分配服务尚未配置。');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await this.fetcher(this.base+path,{method:body?'POST':'GET',cache:'no-store',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
   let data;try{data=await response.json();}catch{throw new RegistryError('分配服务响应无效。');}
   if(!response.ok)throw new RegistryError(data.error||'分配暂时失败，请重试。',response.status,data.code);
   return data;
  }catch(error){if(error instanceof RegistryError)throw error;throw new RegistryError('无法连接分配服务，请稍后重试。');}finally{clearTimeout(timer);}
 }
 async claim(name,annotatorId,expectedPlan){
  const data=await this.request('/api/claim',{body:{name,annotator_id:annotatorId},token:null});
  if(data.plan!==expectedPlan||data.participants!==PARTICIPANT_COUNT||!data.token||!data.claim_id||!data.annotator?.id||!data.annotator?.name||!['member','admin'].includes(data.role)||(data.person===null?data.role!=='admin':!Number.isInteger(data.person)||data.person<1||data.person>PARTICIPANT_COUNT))throw new RegistryError('任务分配版本不一致，请刷新网页。');
  this.session=data;const {token,...registration}=data;return registration;
 }
 async check(){if(!this.session)throw new RegistryError('请重新填写姓名进入。',403);const data=await this.request('/api/lease?claim_id='+encodeURIComponent(this.session.claim_id));if(data.claim_id!==this.session.claim_id||data.person!==this.session.person||data.annotator.id!==this.session.annotator.id||data.plan!==this.session.plan)throw new RegistryError('任务已调整，请重新进入。',410);return data;}
 async list(){return this.request('/api/admin/claims');}
 async release(claimId){return this.request('/api/admin/release',{body:{claim_id:claimId}});}
 async reassign(claimId,name){return this.request('/api/admin/reassign',{body:{claim_id:claimId,name}});}
}
