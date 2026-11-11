export const VARIANTS={self_fixing:'自主修复',problem_only:'仅问题',problem_expected:'问题 + 预期'};
export const reviewKey=(sample,model,variant)=>JSON.stringify([sample,model,variant]);
export function resultFor(sample,model,variant){return sample.results.find(r=>r.model===model&&r.variant===variant);}
export function filteredSamples(samples,{search='',source='',review='',model,variant},reviews){
  const query=search.trim().toLowerCase();
  return samples.filter(s=>(!source||s.source===source)&&(!query||`${s.id} ${s.generator}`.toLowerCase().includes(query))&&(!review||(reviews[reviewKey(s.id,model,variant)]?.status||'pending')===review));
}
export function safeVideoURL(value){const url=new URL(value);if(url.protocol!=='https:')throw new Error('视频地址必须使用 HTTPS');return url.href;}
export function validReviews(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('抽查数据格式无效');
  for(const [key,row] of Object.entries(value)){
    const parts=JSON.parse(key);
    if(!Array.isArray(parts)||parts.length!==3||parts.some(x=>typeof x!=='string')||!row||!['','normal','collapsed','flagged'].includes(row.status)||typeof row.note!=='string')throw new Error('抽查数据格式无效');
  }
  return value;
}
