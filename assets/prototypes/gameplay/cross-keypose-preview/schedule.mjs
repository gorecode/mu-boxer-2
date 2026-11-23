export const stage = {width:500,height:530,anchorX:228,anchorY:495,scale:1.19};
export const durationMs = 1200;
export const schedules = {
  original:[[0,'idle'],[140,'contact'],[230,'idle']],
  one:[[0,'idle'],[100,'outgoing'],[140,'contact'],[230,'outgoing'],[250,'idle']],
  two:[[0,'idle'],[100,'outgoing'],[140,'contact'],[230,'return'],[250,'idle']],
};
export function poseAt(schedule, ms) {
  let pose=schedule[0][1];
  for(const [start,name] of schedule) { if(ms < start) break; pose=name; }
  return pose;
}
