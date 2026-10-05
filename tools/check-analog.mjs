import assert from 'node:assert/strict';
// Validate the game encoder against samples produced by Composite Lab's Metal
// game-export engine, including the route's causal base latency.
import {readFileSync} from 'node:fs';
import {GAME_SIGNAL,gameSignalClock} from '../analog.js';
const directory=process.argv[2]||new URL('./fixtures/',import.meta.url).pathname;
const nativeLine=JSON.parse(readFileSync(`${directory}/game-signal-line.json`));
const us=GAME_SIGNAL.sampleRate/1e6;
for(let x=0;x<910;x++){
 const tick=x-32,F=525*910,ft=(tick%F+F)%F,parity=Math.floor(ft/(F/2)),local=ft-parity*(F/2),lp=ft%910;
 const halfLine=Math.floor(local/455),hp=local%455;
 const width=halfLine>=6&&halfLine<12?455-4.7*us:2.3*us;
 const expected=halfLine<18?(hp<width?-2/7:0):lp<4.7*us?-2/7:lp>=5.3*us&&lp<5.3*us+36?-Math.cos(tick*Math.PI/2)/7:0;
 assert(Math.abs(nativeLine[x]-expected)<1e-5,`Metal/game waveform disagreement at sample ${x}`);
}
assert(Math.abs(GAME_SIGNAL.sampleRate/910-15734.265734265734)<1e-8);
console.log('Passed sample-by-sample Metal/game sync, burst, blanking, carrier phase, and base latency agreement.');

// Uneven display redraws must never phase-shift an otherwise identical interferer.
const period=910*525/GAME_SIGNAL.sampleRate;
for(const elapsed of [0,.005,.016,.03,.031,.047,.06,.061,.117,1.234]) {
 const clock=gameSignalClock(100+elapsed,100);
 assert.equal(clock.frame,Math.floor(elapsed/period));
 const recordedOffset=(clock.time-100)*GAME_SIGNAL.sampleRate;
 assert(Math.abs(recordedOffset-clock.frame*910*525)<1e-6,'display draw jitter leaked into the signal clock');
}
