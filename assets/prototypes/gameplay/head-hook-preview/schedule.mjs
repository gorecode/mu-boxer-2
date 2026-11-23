export const durationMs=1200;
export const leadInMs=300;
export const stage={width:500,height:530,anchorX:228,anchorY:495,scale:1.19};
export const schedules={
  0:[[0,'idle'],[250,'contact'],[370,'idle']],
  1:[[0,'idle'],[170,'late'],[250,'contact'],[370,'late'],[390,'idle']],
  2:[[0,'idle'],[170,'early'],[210,'late'],[250,'contact'],[370,'late'],[390,'idle']],
};
export function poseAt(schedule,ms){
  if(!Number.isFinite(ms))throw new RangeError('Expected a finite animation time');
  let pose='idle';for(const [start,name] of schedule){if(ms<start)break;pose=name;}return pose;
}
