import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDataset} from '../dataset-loader.js';

const original=await readFile(new URL('../data/physfixbench_full.jsonl',import.meta.url),'utf8');
const packed=await readFile(new URL('../data/physfixbench_full.jsonl.gz',import.meta.url));
test('compressed startup data decompresses to the exact 606-record source',async()=>{
  const requests=[];const text=await loadDataset(async path=>{requests.push(path);return new Response(packed);});
  assert.equal(text,original);assert.equal(text.trim().split('\n').length,606);assert.equal(requests.length,1);
  assert.ok(packed.length<Buffer.byteLength(original)/3);
});
test('unavailable gzip file falls back to the original JSONL',async()=>{
  const requests=[];const text=await loadDataset(async path=>{requests.push(path);return path.split('?')[0].endsWith('.gz')?new Response('',{status:404}):new Response(original);});
  assert.equal(text,original);assert.equal(requests.length,2);
});
test('browsers without decompression support load the source directly',async()=>{
  const requests=[];const text=await loadDataset(async path=>{requests.push(path);return new Response(original);},null);
  assert.equal(text,original);assert.equal(requests.length,1);assert.ok(!requests[0].split('?')[0].endsWith('.gz'));
});
