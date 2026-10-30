import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
let entry=await readFile('worker/index.js','utf8');
for(const name of ['participants','approval','baselines','static-assets']){
 const source=(await readFile('worker/'+name+'.js','utf8')).replace(/^export /gm,'');
 const pattern=new RegExp("^import [^\\n]* from '\\./"+name+"\\.js';\\r?\\n",'m');
 if(!pattern.test(entry))throw new Error('Missing import: '+name);
 entry=entry.replace(pattern,()=>source+'\n');
}
await writeFile('dist/server/index.js',entry);await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Standalone Worker built.');
