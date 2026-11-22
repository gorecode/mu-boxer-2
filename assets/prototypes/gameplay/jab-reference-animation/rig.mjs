import {solveTwoBone} from '../../../../.claude/skills/video-reference-animation/scripts/retarget.mjs';
const load=async name=>{const i=new Image();i.src='./inputs/'+name;await i.decode();return i;};
const [idle,contact]=await Promise.all([load('boxer-0.webp'),load('boxer-2.webp')]);
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const stage={width:500,height:530,anchorX:164,anchorY:495,scale:1.19};
function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
const armCut=[[218,79],[270,79],[272,200],[219,207],[189,179],[188,154],[207,133],[211,116]];
const plate=document.createElement('canvas');plate.width=281;plate.height=493;const pc=plate.getContext('2d');pc.drawImage(idle,0,0);pc.globalCompositeOperation='destination-out';polygon(pc,armCut);pc.fill();
const upperPoly=[[207,79],[239,78],[271,78],[295,73],[299,109],[275,120],[246,126],[218,126],[205,120]];
const forePoly=[[279,79],[310,72],[340,72],[361,70],[375,75],[375,104],[359,113],[345,111],[320,106],[295,117],[278,112]];
function part(points){const c=document.createElement('canvas');c.width=375;c.height=480;const x=c.getContext('2d');polygon(x,points);x.clip();x.drawImage(contact,0,0);return c;}
const upper=part(upperPoly),fore=part(forePoly);
const source={shoulder:[220,98],elbow:[286,94],wrist:[350,88]};
const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
const lengths=[length(source.shoulder,source.elbow),length(source.elbow,source.wrist)];
function lerp(a,b,t){return a+(b-a)*t;}
const keys=[{p:0,s:[194,136],w:[241,114]},{p:.3,s:[199,128],w:[268,106]},{p:.7,s:[207,118],w:[314,96]},{p:1,s:[219,110],w:[349,100]}];
const timing=[[0,0],[20,.15],[50,.7],[80,1],[159.9999,1],[160,.98],[195,.88],[240,.43],[290,.12],[340,0]];
function progressAt(t){const i=timing.findIndex(k=>k[0]>=t);if(i<0)return 0;if(i===0)return timing[0][1];const a=timing[i-1],b=timing[i];return lerp(a[1],b[1],(t-a[0])/(b[0]-a[0]));}

const idleSource={shoulder:[194,136],elbow:[229,183],wrist:[241,121]};
const idleLengths=[length(idleSource.shoulder,idleSource.elbow),length(idleSource.elbow,idleSource.wrist)];
function idlePart(points){const c=document.createElement('canvas');c.width=281;c.height=493;const x=c.getContext('2d');polygon(x,armCut);x.clip();polygon(x,points);x.clip();x.drawImage(idle,0,0);return c;}
const idleUpper=idlePart([[180,120],[215,130],[247,175],[247,200],[220,210],[185,170]]);
const idleFore=idlePart([[216,79],[270,79],[270,193],[222,205],[213,182],[217,147]]);
function drawProjected(img,a,b,A,B){ctx.save();ctx.translate(A[0],A[1]);const k=length(A,B)/length(a,b);ctx.rotate(Math.atan2(B[1]-A[1],B[0]-A[0]));ctx.scale(k,1);ctx.rotate(-Math.atan2(b[1]-a[1],b[0]-a[0]));ctx.translate(-a[0],-a[1]);ctx.drawImage(img,0,0);ctx.restore();}
function jointsV3(p){
 const i=keys.findIndex(k=>k.p>=p),a=keys[Math.max(0,i-1)],b=keys[Math.max(0,i)],t=b.p===a.p?0:(p-a.p)/(b.p-a.p);
 const s=a.s.map((x,j)=>lerp(x,b.s[j],t)),w=a.w.map((x,j)=>lerp(x,b.w[j],t));w[1]+=7*(1-p);const lens=lengths.map((n,i)=>lerp(idleLengths[i],n,p));
 const result=solveTwoBone(s,w,lens);return {s,e:result.elbow,w:result.wrist,lengths:lens};
}
function renderV3(p,variant){
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();
 if(p<=0)ctx.drawImage(idle,0,0);
 else {const {s,e,w}=jointsV3(p);if(p<.5){drawProjected(idleUpper,idleSource.shoulder,idleSource.elbow,s,e);drawProjected(idleFore,idleSource.elbow,idleSource.wrist,e,w);}else{drawProjected(upper,source.shoulder,source.elbow,s,e);drawProjected(fore,source.elbow,source.wrist,e,w);}ctx.drawImage(plate,0,0);}
 ctx.restore();return canvas.toDataURL('image/png').split(',')[1];
}


window.jabExperiment={render:renderV3,stage,joints:jointsV3,lengths,idleLengths,keys,timing,progressAt};window.ready=true;
