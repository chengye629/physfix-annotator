export function stableStringify(value){
 if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
const clean=value=>String(value??'').normalize('NFC').replace(/\r\n?/g,'\n').trim();
function timeKey(value){
 const text=clean(value).replace(/^第\s*/,'').replace(/(?:秒|s|左右)/gi,'').replace(/\s/g,'');
 const parts=text.split(/[–—−~～\-至]/),seconds=value=>value.split(':').reduce((sum,n)=>sum*60+Number(n),0);
 return parts.length<=2&&parts.every(p=>/^\d+(?::\d{1,2}){0,2}(?:\.\d+)?$/.test(p))?parts.map(seconds).join('–'):text;
}
const cardKey=issues=>stableStringify((issues||[]).map(card=>({timestamp:timeKey(card.timestamp),problem:clean(card.problem),expected:clean(card.expected)})));
export function compareApproval(annotation,originalIssues){
 return cardKey(annotation.issues)===cardKey(originalIssues)?'direct':'modified';
}
export function classifyApproval(annotation,originalIssues){
 if(annotation.status!=='submitted'||annotation.verdict!=='pass')return annotation;
 if(!originalIssues)return annotation;
 return {...annotation,approval_type:compareApproval(annotation,originalIssues),approval_source:annotation.approval_source==='button'?'button':'comparison'};
}
export const outcome=annotation=>annotation?.verdict==='pass'&&annotation.approval_type==='modified'?'pass_modified':annotation?.verdict;
export const OUTCOMES={pass:'直接通过',pass_modified:'修改后通过',reject_no_clear_issue:'拒绝：没有明确、无争议的物理问题',reject_poor_quality:'拒绝：整体质量太差，物理问题过多'};
