import {build} from 'esbuild';import {readFile,writeFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';import {createHash} from 'node:crypto';
const front=resolve(process.argv[2]),base=resolve(front,'batch2');
async function bundle(entry,prefix){const result=await build({entryPoints:[resolve(base,entry)],bundle:true,write:false,format:'esm',target:'es2020',minify:true,plugins:[{name:'local-versioned-imports',setup(api){api.onResolve({filter:/^\.\/.*\.js\?v=/},args=>({path:resolve(args.resolveDir,args.path.split('?')[0])}));}}]});const content=result.outputFiles[0].text;const file=prefix+'-'+createHash('sha256').update(content).digest('hex').slice(0,16)+'.js';await writeFile(resolve(base,file),content);return file;}
const app=await bundle('app.js','annotation'),quality=await bundle('quality-page.js','statistics');
let html;try{html=await readFile(resolve(base,'start.html'),'utf8');}catch{html=await readFile(resolve(base,'index.html'),'utf8');}
html=html.replace(/src="\.\/(?:app\.js[^" ]*|annotation-[^" ]*)"/,`src="./${app}"`);await writeFile(resolve(base,'start.html'),html);
let stats=await readFile(resolve(base,'quality.html'),'utf8');stats=stats.replace(/src="\.\/(?:quality-page\.js[^" ]*|statistics-[^" ]*)"/,`src="./${quality}"`);await writeFile(resolve(base,'quality.html'),stats);
await writeFile(resolve(base,'index.html'),'<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>视频标注</title><script>const target=new URL("./start.html",location.href);target.search=location.search;target.hash=location.hash;location.replace(target.href);</script><a href="./start.html">进入标注</a></html>');
console.log(JSON.stringify({annotation:app,statistics:quality,entry:'batch2/start.html'}));
