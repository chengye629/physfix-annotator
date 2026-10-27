import {selectLatestAnnotations} from './core.js?v=8-full';
import {assessSubmittedPlayback} from './playback.js?v=8-full';

// Deduplicate first: a later invalid submission must withdraw an earlier valid vote.
export function screenPlaybackExports(exports){
  const latest=selectLatestAnnotations(exports),people=new Map(),excluded=[];
  for(const data of exports)if(!people.has(data.annotator.id))people.set(data.annotator.id,{schema_version:data.schema_version,dataset:data.dataset,export_type:'personal_backup',annotator:data.annotator,annotations:[]});
  const report={submitted:0,qualified:0,excluded:0,not_played:0,incomplete_playback:0,missing_playback:0};
  for(const vote of latest){
    const {annotation,annotator}=vote,person=people.get(annotator.id);
    if(annotation.status==='submitted'){
      report.submitted+=1;
      const assessment=assessSubmittedPlayback(annotation);
      if(!assessment.valid){
        report.excluded+=1;report[assessment.reason]+=1;
        excluded.push({...vote,...assessment});continue;
      }
      report.qualified+=1;
    }
    if(person){person.annotator=annotator;person.annotations.push(annotation);}
  }
  return {report,excluded,exports:[...people.values()]};
}
