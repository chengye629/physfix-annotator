import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
await mkdir('dist/server',{recursive:true});await mkdir('dist/.openai',{recursive:true});
const roster=(await readFile('worker/participants.js','utf8')).replace(/^export /gm,'');
const worker=await readFile('worker/index.js','utf8');
const entry=worker.replace(/^import .* from '\.\/participants\.js';\r?\n/,()=>roster+'\n');
if(entry===worker)throw new Error('Roster import was not bundled.');
await writeFile('dist/server/index.js',entry);await copyFile('.openai/hosting.json','dist/.openai/hosting.json');
console.log('Standalone Worker built.');
