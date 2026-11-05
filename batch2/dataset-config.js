export const DATASET='physfixbench-batch2';
export const LEGACY_DATASETS=[];
export const DATASET_REVISION='ce67583873c46ffd6cd679edea9b22b60683b1ec';
export const HF_REVISION='ce67583873c46ffd6cd679edea9b22b60683b1ec';
export const TASK_COUNT=384;
export const GROUP_SIZE=50;
export const SOURCE_LABELS={'physicsiq':'Physics-IQ','mme-cof-pro':'MME-COF',physion_eval:'Physion',robojudge:'RoboJudge',phyground:'PhyGround',videophy2:'VideoPhy2'};
export const sourceOf=task=>task.record_id.split('::')[0];
export function taskLabel(task){const source=sourceOf(task);return source==='physion_eval'?task.record_id.split('::').at(-1):`${SOURCE_LABELS[source]||source} · ${String(task.slot??'').padStart(3,'0')}`;}
