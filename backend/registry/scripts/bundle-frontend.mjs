import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const front=resolve(process.argv[2]||'../physfix-annotator');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.jsonl':'application/x-ndjson; charset=utf-8','.gz':'application/gzip'};
const files=(await readdir(front)).filter(name=>/\.(html|js|css|svg)$/.test(name)).sort();
files.push('data/physfixbench_full.jsonl.gz','data/physfixbench_full.jsonl','data/video-manifest.json','data/dataset-manifest.json');
const assets={};
for(const name of files){
 let bytes=await readFile(resolve(front,name));
 if(name==='data/video-manifest.json'){
  const manifest=JSON.parse(bytes.toString('utf8'));
  for(const video of Object.values(manifest.videos))video.file=new URL(video.file,'https://chengye629.github.io/physfix-annotator/').href;
  bytes=Buffer.from(JSON.stringify(manifest));
 }
 assets[name]={type:types[extname(name)],data:bytes.toString('base64')};
}
await writeFile('worker/static-assets.js','// Public frontend fallback; generated from the accompanying frontend source. No credentials or annotations.\nexport const STATIC_ASSETS='+JSON.stringify(assets)+';\n');
console.log('Bundled '+files.length+' frontend assets without video files.');
