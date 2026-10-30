import {PARTICIPANT_COUNT,ASSIGNMENT_PLAN} from './participants.js?v=11-namefix';
export {PARTICIPANT_COUNT,ASSIGNMENT_PLAN};
export function validPerson(value){const number=Number(value);return /^\d+$/.test(String(value))&&Number.isInteger(number)&&number>=1&&number<=PARTICIPANT_COUNT?number:null;}
export function assignedTasks(tasks,person=null){return person===null?tasks:tasks.filter((task,index)=>index%PARTICIPANT_COUNT===person-1);}
export function assignmentLink(base,person){const url=new URL(base);url.search='';url.hash='';if(person===null)url.searchParams.set('view','all');else{if(!validPerson(person))throw new Error('任务编号无效。');url.searchParams.set('person',String(person));}return url.href;}
export function linkedAssignment(params){
  const person=validPerson(params.get('person'));
  if(person)return String(person);
  if(params.get('view')==='all'||['group','source','sample'].some(key=>params.has(key)))return 'all';
  return '';
}
export function assignmentDetails(tasks,person){return person===null?null:{plan:ASSIGNMENT_PLAN,participants:PARTICIPANT_COUNT,person,record_ids:assignedTasks(tasks,person).map(t=>t.record_id)};}
export function normalizeAssignment(value,knownIds){
  if(!value)return null;
  if(typeof value.plan!=='string'||!value.plan.trim()||value.plan.length>120||!Number.isSafeInteger(value.participants)||value.participants<1||value.participants>knownIds.size||!Number.isSafeInteger(value.person)||value.person<1||value.person>value.participants||!Array.isArray(value.record_ids)||!value.record_ids.length||value.record_ids.length>knownIds.size||new Set(value.record_ids).size!==value.record_ids.length||value.record_ids.some(id=>!knownIds.has(id)))throw new Error('备份中的任务分配信息无效。');
  return {plan:value.plan,participants:value.participants,person:value.person,record_ids:[...value.record_ids],...(typeof value.claim_id==='string'&&value.claim_id.length<=120?{claim_id:value.claim_id}:{})};
}
