import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {VARIANTS,reviewKey,resultFor,filteredSamples,safeVideoURL,validReviews} from '../results-core.js';
const data=JSON.parse(readFileSync(new URL('../data/model-results.json',import.meta.url)));
test('snapshot maps exactly 50 originals to all three distinct published results',()=>{
  assert.equal(data.samples.length,50);assert.equal(new Set(data.samples.map(s=>s.id)).size,50);
  const urls=new Set();
  for(const s of data.samples){assert.equal(s.results.length,3);assert.ok(s.mirror_url);assert.equal(new Set(s.results.map(r=>r.variant)).size,3);for(const variant of Object.keys(VARIANTS)){const r=resultFor(s,data.models[0].id,variant);assert.equal(r.status,'success');assert.ok(r.prompt);assert.ok(r.url.includes('/'+data.revision+'/'));urls.add(safeVideoURL(r.url));}}
  assert.equal(urls.size,150);
});
test('review state is isolated by sample, model and prompt; filters compose',()=>{
  const s=data.samples[0],model=data.models[0].id,variant='self_fixing';
  const reviews=validReviews({[reviewKey(s.id,model,variant)]:{status:'normal',note:'visible motion'}});
  assert.deepEqual(filteredSamples(data.samples,{review:'normal',model,variant},reviews),[s]);
  assert.equal(filteredSamples(data.samples,{review:'normal',model,variant:'problem_only'},reviews).length,0);
  assert.equal(filteredSamples(data.samples,{review:'normal',model:'other',variant},reviews).length,0);
  assert.equal(filteredSamples(data.samples,{review:'pending',model,variant},reviews).length,49);
  assert.equal(filteredSamples(data.samples,{search:'NOT_AN_ID',model,variant},reviews).length,0);
  assert.deepEqual(filteredSamples(data.samples,{search:s.id.toUpperCase(),source:s.source,model,variant},reviews),[s]);
});
test('malformed saved reviews and executable video URLs are rejected',()=>{
  assert.throws(()=>validReviews([]));assert.throws(()=>validReviews({'bad':{status:'normal',note:''}}));
  assert.throws(()=>safeVideoURL('javascript:alert(1)'));
  assert.throws(()=>safeVideoURL('http://example.com/video.mp4'));
});
