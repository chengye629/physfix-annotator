export const DATASET='physfixbench-batch1';
export const LEGACY_DATASETS=['physfixbench-physion300'];
export const DATASET_REVISION='31d3ca543b1a586d48dd9e646c82f70dde63a746';
export const HF_REVISION='b1c24dfbe30229941d192abc52b99c6fd2d28c81';
export const TASK_COUNT=606;
export const GROUP_SIZE=50;
export const SOURCE_LABELS={physion_eval:'Physion',robojudge:'RoboJudge',phyground:'PhyGround',videophy2:'VideoPhy2'};
export const sourceOf=task=>task.record_id.split('::')[0];
export function taskLabel(task){const source=sourceOf(task);return source==='physion_eval'?task.record_id.split('::').at(-1):`${SOURCE_LABELS[source]||source} · ${String(task.slot??'').padStart(3,'0')}`;}
