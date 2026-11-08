import assert from 'node:assert/strict';
import {prepareTimeline,sampleTimeline} from '../assets/js/motion-timeline.js';

const keys=[0,50,130,190,270].map((at,i)=>({at,state:{x:[0,2,3,3,-1][i],yaw:[0,0,2,5,Math.PI*2][i]}}));
const timeline=prepareTimeline(keys,['x','yaw']);
for(const key of keys)assert.deepEqual(sampleTimeline(timeline,key.at),key.state);
assert.deepEqual(sampleTimeline(timeline,-100),keys[0].state);
assert.deepEqual(sampleTimeline(timeline,500),keys.at(-1).state);
const forward=[];
for(let position=0;position<=270;position++){
  const state=sampleTimeline(timeline,position);forward.push(state);
  const i=Math.min(keys.length-2,keys.findLastIndex(key=>position>=key.at));
  for(const p of ['x','yaw']){
    assert.ok(Number.isFinite(state[p]));
    assert.ok(state[p]>=Math.min(keys[i].state[p],keys[i+1].state[p])-1e-10);
    assert.ok(state[p]<=Math.max(keys[i].state[p],keys[i+1].state[p])+1e-10);
  }
}
for(let position=270;position>=0;position--)assert.deepEqual(sampleTimeline(timeline,position),forward[position]);
// Velocity is continuous through waypoints, rather than restarting per segment.
for(const key of keys.slice(1,-1))for(const p of ['x','yaw']){
  const epsilon=.001,center=sampleTimeline(timeline,key.at)[p];
  const before=(center-sampleTimeline(timeline,key.at-epsilon)[p])/epsilon;
  const after=(sampleTimeline(timeline,key.at+epsilon)[p]-center)/epsilon;
  assert.ok(Math.abs(before-after)<1e-5,`Velocity discontinuity: ${key.at}/${p}`);
}
console.log('Motion timeline: exact waypoints, no overshoot, continuous velocity, deterministic reverse — passed.');
