import test from 'node:test';import assert from 'node:assert/strict';
import {CARD_RESOLUTIONS} from '../worker/card-resolutions.js';
import {HISTORICAL_REVIEWS} from '../worker/human-reviews.js';
import {PHYSICS_EVIDENCE} from '../worker/physics-evidence.js';
import {PARTICIPANTS} from '../worker/participants.js';
import {buildQualityStatistics} from '../worker/quality-metrics.js';
test('confirmed card revisions add 22 accepted videos and reject the two withdrawn candidates',()=>{
 const names=PARTICIPANTS.map(p=>p.name),before=buildQualityStatistics([],HISTORICAL_REVIEWS,[],[],names),after=buildQualityStatistics([],[...HISTORICAL_REVIEWS,...CARD_RESOLUTIONS],[],[],names);
 assert.equal(CARD_RESOLUTIONS.length,25);assert.equal(new Set(CARD_RESOLUTIONS.map(r=>r.record_id)).size,25);
 assert.equal(after.totals.final_accepted,before.totals.final_accepted+22);assert.equal(after.totals.pending_card_edits,before.totals.pending_card_edits-24);
 assert.equal(after.totals.selection_rejected,before.totals.selection_rejected+2);assert.equal(after.totals.ai_accepted,before.totals.ai_accepted);assert.equal(after.judgments.length,before.judgments.length);
 for(const r of CARD_RESOLUTIONS){assert.equal(r.reviewer,'叶程');assert.equal(PHYSICS_EVIDENCE[r.record_id].decision,r.decision);assert.deepEqual(PHYSICS_EVIDENCE[r.record_id].pending_issues,[]);assert.equal(r.decision,['T1_03014','vp2_3087_cogvideo'].includes(r.record_id.split('::').at(-1))?'reject':'pass');}
});
