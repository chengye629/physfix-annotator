import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {normalizeExport,DATASET,SCHEMA_VERSION} from '../core.js';
import {screenPlaybackExports} from '../screening.js';

const args=process.argv.slice(2);
if(args.length<3||args[0]!=='--out'){
  console.error('用法：node scripts/filter-playback.mjs --out 新输出目录 甲.json 乙.json ...');
  process.exitCode=1;
}else{
  try{
    const destination=resolve(args[1]),paths=args.slice(2);
    const tasks=(await readFile(new URL('../data/physfixbench_full.jsonl',import.meta.url),'utf8')).trim().split(/\r?\n/).map(JSON.parse);
    const known=new Set(tasks.map(t=>t.record_id)),backups=[];
    for(const path of paths){const content=await readFile(resolve(path),'utf8');if(Buffer.byteLength(content)>10000000)throw new Error('文件不能超过 10 MB：'+path);backups.push(normalizeExport(JSON.parse(content),known));}
    const screened=screenPlaybackExports(backups),exported_at=new Date().toISOString();
    await mkdir(destination,{recursive:true});
    if((await readdir(destination)).length)throw new Error('输出目录必须为空，避免覆盖已有文件。');
    const metadata={schema_version:SCHEMA_VERSION,dataset:DATASET,exported_at};
    await mkdir(join(destination,'qualified'));
    for(const [index,backup] of screened.exports.entries()){
      const safeName=backup.annotator.name.replace(/[^\p{L}\p{N}_-]/gu,'_').slice(0,40)||'annotator';
      const name=String(index+1).padStart(3,'0')+'_'+safeName+'.json';
      await writeFile(join(destination,'qualified',name),JSON.stringify({...backup,exported_at},null,2),'utf8');
    }
    await writeFile(join(destination,'excluded.json'),JSON.stringify({...metadata,export_type:'playback_excluded',playback_screening:screened.report,records:screened.excluded},null,2),'utf8');
    await writeFile(join(destination,'report.json'),JSON.stringify({...metadata,export_type:'playback_screening_report',...screened.report},null,2),'utf8');
    console.log(JSON.stringify({output:destination,...screened.report}));
  }catch(error){console.error(error.message);process.exitCode=1;}
}
