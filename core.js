export const DATASET = 'physfixbench-physion300';
export const SCHEMA_VERSION = 1;
export const HF_BASE = 'https://huggingface.co/datasets/HuggingFriends/PhysFixBench/resolve/main/videos/';
export const CATEGORIES = { temporal_causal:'时序与因果', persistence_identity:'物体永存与同一性', motion_force:'力与运动', material_state:'材质与状态', contact_interaction:'接触与交互', geometry_structure:'几何与碰撞', other:'其他物理问题' };
export const PRIMITIVES = { articulation_open_close:'开合操作', pour_flow:'倾倒与流动', pick_place_transfer:'拿取与转移', deformation_state_change:'形变与状态变化', body_motion:'肢体运动', other_multistep:'多步操作', collision_impact:'碰撞与冲击', throw_projectile:'抛射运动' };
export const DOMAINS = { fluid_thermal_optical_phenomena:'流体 / 热 / 光', human_animal_body_motion:'人 / 动物肢体', rigid_object_dynamics:'刚体动力学', deformable_materials:'可变形材料', tool_machine_operation:'工具与机械' };
export const VERDICTS = { obvious:'明确有物理问题', none:'无明显物理问题', unsure:'不确定', unplayable:'无法播放' };
const text = (v, max=4000) => typeof v === 'string' ? v.slice(0,max) : '';
export const shortId = id => id.split('::').at(-1);
export const videoUrl = id => HF_BASE + encodeURIComponent(shortId(id)) + '.mp4';
export const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function emptyIssue(category='') { return {category,start:'',end:'',problem:'',expected:''}; }
export function createDraft(recordId) { return {record_id:recordId,status:'draft',verdict:'',issues:[emptyIssue()],keep:'',notes:'',checks:{visible:false,objective:false,unambiguous:false},duration:null,revision:0,updated_at:new Date().toISOString()}; }
export function buildPrompt(annotation) {
  const issues=annotation.issues || [];
  return `【存在的问题】\n${issues.map((v,i)=>`${i+1}. 第${v.start || '0'}s–${v.end || '0'}s：${v.problem}`).join('\n')}\n\n【应修改为】\n${issues.map((v,i)=>`${i+1}. ${v.expected}`).join('\n')}\n\n请在保持${annotation.keep || '其余正常内容'}不变的前提下，修正上述物理问题并重新生成视频。`;
}
export function validateAnnotation(a) {
  const errors=[];
  if (!a || !Object.hasOwn(VERDICTS,a.verdict)) return ['请先选择一个物理问题判定。'];
  if (a.verdict === 'obvious') {
    if (!Array.isArray(a.issues) || !a.issues.length || a.issues.length>12) errors.push('请记录 1–12 个明确问题。');
    for (const [i,v] of (Array.isArray(a.issues)?a.issues:[]).entries()) {
      const n=`问题 ${i+1}：`;
      if (!Object.hasOwn(CATEGORIES,v.category)) errors.push(n+'请选择物理问题类别。');
      const validTime = v.start !== '' && v.end !== '' && Number.isFinite(Number(v.start)) && Number.isFinite(Number(v.end)) && Number(v.start)>=0 && Number(v.end)>Number(v.start);
      if (!validTime) errors.push(n+'请填写有效起止秒数，结束时间须大于开始时间。');
      if (validTime && (!Number.isFinite(a.duration) || a.duration <= 0)) errors.push(n+'请先成功加载视频，或恢复包含视频时长的备份，再确认时间范围。');
      if (validTime && Number.isFinite(a.duration) && Number(v.end)>a.duration+0.15) errors.push(n+'结束时间超出视频时长。');
      if (text(v.problem).trim().length<6) errors.push(n+'可见异常至少填写 6 个字符，描述具体物体与变化。');
      if (text(v.expected).trim().length<6) errors.push(n+'正确表现至少填写 6 个字符。');
    }
    if (text(a.keep).trim().length<4) errors.push('请填写修复时保持不变的内容（至少 4 个字符）。');
    if (!a.checks?.visible || !a.checks?.objective || !a.checks?.unambiguous) errors.push('只有满足全部三项收录标准的明显、客观问题才能保存；否则请选择「不确定」。');
  } else if (text(a.notes).trim().length<6) errors.push('请说明判定依据或无法播放的情况（至少 6 个字符）。');
  return errors;
}
export function isEffective(a) { return a?.status==='submitted' && a.verdict==='obvious' && validateAnnotation(a).length===0; }
export function makeExport(state) {
  return {schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'personal_backup',exported_at:new Date().toISOString(),annotator:{id:state.annotator.id,name:state.annotator.name},annotations:Object.values(state.annotations).map(a=>({...a,fixing_prompt_zh:a.verdict==='obvious'?buildPrompt(a):null}))};
}
export function normalizeExport(raw, knownIds) {
  if (!raw || raw.schema_version!==SCHEMA_VERSION || raw.dataset!==DATASET || raw.export_type!=='personal_backup') throw new Error('不是受支持的 PhysFix 个人备份。请导入「导出备份」生成的 JSON。');
  if (!raw.annotator || !text(raw.annotator.id,120).trim() || !text(raw.annotator.name,32).trim()) throw new Error('备份缺少有效的标注员身份或昵称。');
  if (!Array.isArray(raw.annotations) || raw.annotations.length>300) throw new Error('备份记录格式不正确或超过 300 条。');
  const seen=new Set(); const annotations=[];
  for (const item of raw.annotations) {
    if (!item || !knownIds.has(item.record_id) || seen.has(item.record_id)) throw new Error('备份包含未知或重复样本，未导入。');
    seen.add(item.record_id);
    if (!['draft','submitted'].includes(item.status)) throw new Error('备份包含无效记录状态。');
    if (item.verdict!=='' && !Object.hasOwn(VERDICTS,item.verdict)) throw new Error('备份包含无效判定。');
    if (!Array.isArray(item.issues) || item.issues.length>12) throw new Error('备份问题列表格式无效。');
    const a={record_id:item.record_id,status:item.status,verdict:item.verdict,issues:item.issues.map(v=>({category:text(v?.category,60),start:typeof v?.start==='number'?String(v.start):text(v?.start,30),end:typeof v?.end==='number'?String(v.end):text(v?.end,30),problem:text(v?.problem,2000),expected:text(v?.expected,2000)})),keep:text(item.keep,1500),notes:text(item.notes,2000),checks:{visible:item.checks?.visible===true,objective:item.checks?.objective===true,unambiguous:item.checks?.unambiguous===true},duration:typeof item.duration==='number'&&Number.isFinite(item.duration)&&item.duration>0?item.duration:null,revision:Number.isSafeInteger(item.revision)&&item.revision>=0?item.revision:0,updated_at:typeof item.updated_at==='string'&&Number.isFinite(Date.parse(item.updated_at))?new Date(item.updated_at).toISOString():'1970-01-01T00:00:00.000Z'};
    if (a.status==='submitted' && validateAnnotation(a).length) throw new Error(`${shortId(a.record_id)} 的已完成标注不符合收录校验，请回到原文件修正后导出。`);
    annotations.push(a);
  }
  return {schema_version:SCHEMA_VERSION,dataset:DATASET,export_type:'personal_backup',annotator:{id:text(raw.annotator.id,120),name:text(raw.annotator.name,32)},annotations};
}
export function mergeExports(exports, minimumReviews=2) {
  const latest=new Map();
  for (const data of exports) for (const a of data.annotations) {
    const key=JSON.stringify([data.annotator.id,a.record_id]);
    const old=latest.get(key);
    // Include drafts when resolving repeated exports: a newer draft withdraws an older completed judgment.
    const newer=!old || Date.parse(a.updated_at)>Date.parse(old.annotation.updated_at) || (a.updated_at===old.annotation.updated_at&&a.revision>old.annotation.revision);
    if (newer) latest.set(key,{annotator:data.annotator,annotation:a});
  }
  const groups=new Map();
  for (const vote of latest.values()) {
    if (vote.annotation.status!=='submitted') continue;
    const id=vote.annotation.record_id;
    if (!groups.has(id)) groups.set(id,[]);
    groups.get(id).push(vote);
  }
  return [...groups].map(([record_id,votes])=>{
    const verdicts=new Set(votes.map(v=>v.annotation.verdict));
    const conflict=verdicts.size>1;
    const eligible=votes.length>=minimumReviews && !conflict && votes.every(v=>isEffective(v.annotation));
    const status=conflict?'conflict':eligible?'eligible':votes.length<minimumReviews?'insufficient':'excluded';
    return {record_id,reviewer_count:votes.length,status,eligible,votes};
  }).sort((a,b)=>a.record_id.localeCompare(b.record_id));
}
