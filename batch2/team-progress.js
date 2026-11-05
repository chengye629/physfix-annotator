import {PARTICIPANTS,participantFor} from './participants.js?v=12-cloud';
import {assignedTasks} from './assignments.js?v=12-cloud';
import {classifyApproval,outcome} from './approval.js?v=12-cloud';
import {seedIssues} from './core.js?v=12-cloud';

// Read-only totals: current assignments and historical records are kept separate.
export function buildTeamProgress(tasks,claims,records){
 const taskById=new Map(tasks.map(task=>[task.record_id,task]));
 const key=name=>participantFor(name)?.name??name;
 const people=PARTICIPANTS.map(member=>claims.find(c=>key(c.display_name)===member.name)??{display_name:member.name,slot:member.person,role:member.role,claim_id:null});
 for(const claim of claims)if(!people.includes(claim))people.push(claim);
 const occupied=new Set(claims.filter(c=>c.claim_id).map(c=>c.slot));
 const rows=people.map(claim=>({name:key(claim.display_name),role:claim.role,registered:!!claim.claim_id,owner:claim.annotator_id,ids:new Set(assignedTasks(tasks,(!claim.claim_id&&occupied.has(claim.slot)?0:claim.slot)??0).map(t=>t.record_id)),records:new Map()}));
 for(const record of records){
  const person=rows.find(p=>p.owner&&p.owner===record.annotator.id)??rows.find(p=>p.name===key(record.annotator.name));
  if(!person||!taskById.has(record.annotation.record_id))continue;
  const old=person.records.get(record.annotation.record_id);
  if(!old||(record.saved_at??'')>(old.saved_at??'')||record.saved_at===old.saved_at&&record.version>old.version)person.records.set(record.annotation.record_id,record);
 }
 return rows.map(person=>{
  const stats={name:person.name,role:person.role,registered:person.registered,assigned:person.ids.size,submitted:0,pass_direct:0,pass_modified:0,reject_no_clear_issue:0,reject_poor_quality:0,historical:0,last_synced:null};
  for(const record of person.records.values()){
   const a=record.annotation;
   if(record.saved_at&&(!stats.last_synced||record.saved_at>stats.last_synced))stats.last_synced=record.saved_at;
   if(!person.ids.has(a.record_id)){stats.historical++;continue;}
   if(a.status!=='submitted')continue;
   stats.submitted++;
   const result=outcome(classifyApproval(a,seedIssues(taskById.get(a.record_id))));
   if(result==='pass')stats.pass_direct++;else if(Object.hasOwn(stats,result))stats[result]++;
  }
  return {...stats,remaining:stats.assigned-stats.submitted};
 });
}
