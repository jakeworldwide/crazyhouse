import assert from 'node:assert/strict';
import {GAME_SIGNAL,gameSignalClock,gameClipOrigin} from '../analog.js';
const F=GAME_SIGNAL.samplesPerLine*GAME_SIGNAL.linesPerFrame,period=F/GAME_SIGNAL.sampleRate,epoch=10;
assert.equal(gameClipOrigin(13,null),null,'Clip loaded before play must acquire the game clock on first use');
for(let frame=0;frame<30;frame++)for(const fraction of [.01,.49,.99]){
 const seconds=epoch+(frame+fraction)*period,clock=gameSignalClock(seconds,epoch),origin=gameClipOrigin(seconds,epoch);
 const clipSamples=Math.round((clock.time-origin)*GAME_SIGNAL.sampleRate);
 assert(clipSamples===0||clipSamples===F,'Clip must start on a frame boundary');
 const globalSamples=clock.frame*F;
 assert.equal((globalSamples-clipSamples)%4,0,'Loading a clip must not invent carrier phase opposition');
}
console.log('Clip starts preserve raster timing and NTSC carrier phase across odd and even game frames.');
