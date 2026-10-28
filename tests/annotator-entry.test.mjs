import test from 'node:test';
import assert from 'node:assert/strict';
import {openNamedWorkspace,normalizeName,profileKey,personalExportPrefix} from '../annotator-entry.js';
const person=(name,id='old-id',annotations={})=>({schema_version:2,annotator:{id,name},annotations,current_id:'video-a',group:'1',source_filter:'all'});
function memoryStorage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};}
test('entry requires a real nonempty name and personal filenames retain Chinese names',()=>{
  assert.equal(normalizeName('  张三  '),'张三');assert.equal(normalizeName('Alice   Wang'),'Alice Wang');
  assert.equal(normalizeName('Jose\u0301'),'José');
  for(const name of ['', '   ','///','a'.repeat(33),'张\u0000三'])assert.throws(()=>normalizeName(name));
  assert.equal(personalExportPrefix('张三'),'physfix_张三');
  assert.equal(personalExportPrefix('张三 / A'),'physfix_张三___A');
  assert.ok(!personalExportPrefix('张三 / A').includes('/'));
});
test('a fresh named entry starts an empty independent workspace',()=>{
  const next=openNamedWorkspace(person(''), '李四',memoryStorage(),{createId:()=> 'new-id'});
  assert.deepEqual(next.annotator,{id:'new-id',name:'李四'});assert.deepEqual(next.annotations,{});
  assert.equal(next.current_id,null);assert.equal(next.group,'all');
});
test('first naming preserves human edits from an older unnamed workspace',()=>{
  const current=person('', 'original-id',{'video-a':{issues:[{problem:'旧人工修改'}],revision:4}});
  const next=openNamedWorkspace(current,'张三',memoryStorage());
  assert.equal(next.annotator.id,'original-id');assert.equal(next.annotations['video-a'].issues[0].problem,'旧人工修改');
});
test('continuing the same name retains its identity and progress without archiving or replacing it',()=>{
  const current=person('张三','alice',{'video-a':{verdict:'pass'}});
  const storage=memoryStorage(),next=openNamedWorkspace(current,' 张三 ',storage);
  assert.equal(next.annotator.id,'alice');assert.deepEqual(next.annotations,current.annotations);assert.equal(storage.values.size,0);
});
test('switching people archives and restores each name without leaking cards or IDs',()=>{
  const storage=memoryStorage(),a=person('张三','a',{'video-a':{problem:'甲的标注'}});
  const b=openNamedWorkspace(a,'李四',storage,{createId:()=> 'b'});assert.deepEqual(b.annotations,{});
  b.annotations['video-b']={problem:'乙的标注'};
  const resumedA=openNamedWorkspace(b,'张三',storage);
  assert.equal(resumedA.annotator.id,'a');assert.deepEqual(resumedA.annotations,a.annotations);assert.equal(resumedA.annotations['video-b'],undefined);
  const resumedB=openNamedWorkspace(resumedA,'李四',storage);
  assert.equal(resumedB.annotator.id,'b');assert.deepEqual(resumedB.annotations,b.annotations);
});
test('a failed archive stops a person switch and keeps the original workspace intact',()=>{
  const current=person('张三','a',{'video-a':{problem:'不能丢'}});
  const before=structuredClone(current),storage={getItem:()=>null,setItem(){throw new Error('QuotaExceeded');}};
  assert.throws(()=>openNamedWorkspace(current,'李四',storage,{createId:()=> 'b'}),/导出当前进度/);
  assert.deepEqual(current,before);
});
test('corrupt or mismatched named profiles cannot be silently loaded under another name',()=>{
  const current=person('张三'),storage=memoryStorage();
  storage.setItem(profileKey('李四'),'{bad json');assert.throws(()=>openNamedWorkspace(current,'李四',storage),/无法读取/);
  storage.setItem(profileKey('李四'),JSON.stringify(person('王五')));assert.throws(()=>openNamedWorkspace(current,'李四',storage),/格式无效/);
  assert.equal(current.annotator.name,'张三');assert.equal(storage.getItem(profileKey('张三')),null);
});
