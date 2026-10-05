import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createPreviewReceiver} from '../composite-worker.js';
import {CompositeReceiver} from '../composite-receiver.js';
const root=process.argv[2]??'/tmp/composite-full-validation';
const preview=createPreviewReceiver(),normal=new CompositeReceiver();
for(let frame=0;frame<3;frame++){
 const bytes=readFileSync(`${root}/game-receiver-input-${frame}.f32`),samples=new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4);
 const expected=normal.recover(samples).slice();
 for(let refresh=0;refresh<4;refresh++)assert.deepEqual(preview(samples,{frame}),expected,'Display refresh must not advance the analog receiver clock');
}
console.log('Repeated monitor refreshes preserve normal Lab receiver state and next-frame output.');
