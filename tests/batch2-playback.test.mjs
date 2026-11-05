import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';
import {VideoDelivery} from '../batch2/video-delivery.js';
const manifest=JSON.parse(readFileSync(new URL('../batch2/data/video-manifest.json',import.meta.url)));
test('all MME-COF and Physics-IQ tasks have compatible playback with their original source preserved',()=>{
 const required=Object.entries(manifest.videos).filter(([id])=>id.startsWith('mme-cof-pro::')||id.startsWith('physicsiq::'));assert.equal(required.length,90);
 for(const [id,m] of required){assert.equal(m.playback_codec,'h264',id);assert.ok(m.original_url.startsWith('https://huggingface.co/'));assert.equal(m.original_sha256.length,64);assert.ok(m.original_bytes>0);assert.notEqual(m.sha256,m.original_sha256);assert.ok(existsSync(new URL('../batch2/videos/'+m.file.split('/').at(-1),import.meta.url)));}
});
test('saved original-line preferences and automatic fallback never reselect an unsupported HEVC original',()=>{
 const delivery=new VideoDelivery({}, {baseURL:'https://example.test/batch2/'});delivery.setManifest(manifest);const id='mme-cof-pro::no_hint::11';
 for(const mode of ['auto','site','original']){delivery.mode=mode;const targets=delivery.targets(id);assert.equal(targets.length,1);assert.ok(targets[0].url.includes('/batch2/videos/'));assert.ok(!targets[0].url.includes('huggingface.co'));}
});
