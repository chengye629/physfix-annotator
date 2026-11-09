import {SOURCE_LABELS,sourceOf} from './dataset-config.js?v=29-identities';
const models={wan22_ti2v5b_1280x704_f169:'Wan 2.2 TI2V-5B',cogvideo_i2v_f113:'CogVideo I2V',gigaworld_gr1_2b_f113:'GigaWorld GR1 2B',wan26_flash:'Wan 2.6 Flash',cosmos3:'Cosmos 3',wow_wan14b_f105:'WoW Wan 14B',abot_physworld_f113:'ABot PhysWorld',happyhorse:'HappyHorse',veo31_lite:'Veo 3.1 Lite',kling:'Kling'};
export function videoMetadata(task){const source=sourceOf(task),raw=String(task.generator||'').trim();return {source,source_label:SOURCE_LABELS[source]||source,generator:raw||null,model:models[raw.replace(/_(prefix|rewrite)$/,'')]||raw||'模型未提供'};}
export function videoMetadataLabel(task){const m=videoMetadata(task);return `${m.source_label} · ${m.model}`;}
