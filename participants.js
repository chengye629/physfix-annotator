export const ASSIGNMENT_PLAN='physfixbench-batch1-nine-v1';
export const PARTICIPANT_COUNT=9;
const rows=[
 ['叶程','Ye Cheng','Cheng Ye'],
 ['马思远','Ma Siyuan','Siyuan Ma'],
 ['高晗晴','Gao Hanqing','Hanqing Gao'],
 ['罗景午','Luo Jingwu','Jingwu Luo'],
 ['杨陈策','Yang Chence','Chence Yang'],
 ['陈广宇','Chen Guangyu','Guangyu Chen','陈广宁','Chen Guangning','Guangning Chen'],
 ['林炬乙','Lin Juyi','Juyi Lin'],
 ['刘皓天','Liu Haotian','Haotian Liu'],
 ['Shihua','Shi Hua']
];
export const nameKey=value=>String(value??'').normalize('NFKC').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('en-US').replace(/[\s._'’\-]/g,'');
export const PARTICIPANTS=Object.freeze(rows.map(([name,...aliases],index)=>Object.freeze({name,aliases:Object.freeze([name,...aliases]),person:index+1,role:['叶程','马思远','林炬乙'].includes(name)?'admin':'member'})));
const byAlias=new Map(PARTICIPANTS.flatMap(person=>person.aliases.map(alias=>[nameKey(alias),person])));
export const participantFor=name=>byAlias.get(nameKey(name))??null;
