import test from 'node:test';
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {normalizeCoachStats} from '../public/coach-training-stats.js';
import {decodePayload} from '../lib/coach-runner-core.mjs';
import {createStudyTools,combineCoachTools,STUDY_TOOLS,TRAINING_STATS_TOOL} from '../lib/coach-study-tools.mjs';
import {GAME_TOOLS} from '../lib/coach-agent.mjs';
const raw={games:{played:3,wins:1,draws:1,losses:1,reviewed:2,accuracy:80.123,user:'private',pgn:'private'},puzzles:{attempts:3,clean:2,assisted:1,skipped:1,target:1200,accuracy:999,topics:{pin:{attempts:2,clean:1},fork:{attempts:4,clean:2},secret:{attempts:1,clean:1}},records:['private']}};
test('only bounded aggregate statistics cross the client/runner boundary',()=>{
 const stats=normalizeCoachStats(raw);
 assert.deepEqual(stats,{games:{played:3,wins:1,draws:1,losses:1,reviewed:2,accuracy:80.1},puzzles:{attempts:3,clean:2,assisted:1,skipped:1,target:1200,accuracy:67,topics:{pin:{attempts:2,clean:1}}}});
 assert.ok(!JSON.stringify(stats).includes('private'));
 const encoded=Buffer.from(JSON.stringify({question:'q',stats:raw})).toString('base64');
 assert.deepEqual(decodePayload(encoded).stats,stats);
});
test('invalid or absent statistics do not masquerade as zero attempts',()=>{
 assert.equal(normalizeCoachStats(null),null);
 assert.equal(normalizeCoachStats({games:{played:3,wins:1,draws:1,losses:0,reviewed:2},puzzles:{...raw.puzzles,clean:99}}),null);
 assert.equal(normalizeCoachStats({puzzles:{...raw.puzzles,target:9999}}),null);
 assert.equal(decodePayload(Buffer.from('{"question":"q"}').toString('base64')).stats,null);
});
test('training_stats is advertised and available only with a shared aggregate snapshot',async()=>{
 const stats=normalizeCoachStats(raw);
 const on=combineCoachTools(null,createStudyTools({Chess,stats}),GAME_TOOLS,[...STUDY_TOOLS,TRAINING_STATS_TOOL]);
 assert.ok(on.schemas.some(s=>s.function.name==='training_stats'));
 assert.deepEqual(await on.execute('training_stats','{}'),{ok:true,data:stats});
 assert.equal((await on.execute('training_stats','{"user":"other"}')).ok,false);
 const off=combineCoachTools(null,createStudyTools({Chess}),GAME_TOOLS);
 assert.ok(!off.schemas.some(s=>s.function.name==='training_stats'));
 assert.equal((await off.execute('training_stats','{}')).ok,false);
 assert.equal((await on.execute('stockfish_move','{"ply":0}')).ok,false);
});
