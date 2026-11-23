import {stage,schedules,poseAt} from './schedule.mjs';
const load=async path=>{const i=new Image();i.src=path;await i.decode();return i;};
const [idle,contact,outgoing,returning,arena]=await Promise.all([
 load('../../../../scene-lab/public/art/fight/boxer-0.webp'),load('../../../../scene-lab/public/art/fight/boxer-3.webp'),
 load('./inputs/outgoing-generated.png'),load('./inputs/return-generated.png'),load('../../../../scene-lab/public/art/fight/arena.webp'),
]);
const make=()=>Object.assign(document.createElement('canvas'),{width:500,height:530});
const frames={idle:make(),contact:make()};
frames.idle.getContext('2d').drawImage(idle,64,0);
frames.contact.getContext('2d').drawImage(contact,78,15);
const head=[[196,0],[285,0],[285,67],[280,93],[270,104],[251,99],[235,86],[209,83],[194,67]];
function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
for(const [name,image,scale,x,y] of [['outgoing',outgoing,493/1439,32,-1],['return',returning,493/1661,65,0]]){
 const canvas=make(),c=canvas.getContext('2d');
 c.save();c.beginPath();c.rect(0,0,500,225);c.clip();c.drawImage(image,x,y,image.width*scale,image.height*scale);c.restore();
 c.save();c.globalCompositeOperation='destination-out';polygon(c,[[188,0],[305,0],[305,101],[280,111],[257,113],[230,94],[205,88],[188,72]]);c.fill();c.restore();
 c.save();polygon(c,head);c.clip();c.drawImage(frames.idle,0,0);c.restore();
 if(name==='return'){
  const guard=[[277,77],[328,77],[336,178],[309,210],[283,203],[275,159]];
  c.save();c.globalCompositeOperation='destination-out';polygon(c,guard);c.fill();c.restore();
  c.save();polygon(c,guard);c.clip();c.drawImage(frames.idle,0,0);c.restore();
 }
 c.drawImage(frames.idle,0,225,500,305,0,225,500,305);
 frames[name]=canvas;
}
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const labels=['ORIGINAL / 2 POSES','HYBRID / +1 DRAWING','HYBRID / +2 DRAWINGS'];
const crop={x:215,y:175,width:700,height:665};
function panel(name,ms){
 const c=Object.assign(document.createElement('canvas'),{width:1600,height:900}),p=c.getContext('2d');
 p.drawImage(arena,0,0,1600,900);
 const time=ms-300,pose=poseAt(schedules[name],time);
 p.save();p.translate(530,820);p.scale(1.19,1.19);p.drawImage(frames[pose],-228,-495);p.restore();
 return {canvas:c,pose};
}
function render(ms){
 ctx.fillStyle='#201b20';ctx.fillRect(0,0,canvas.width,canvas.height);const poses=[];
 for(const [i,name] of Object.keys(schedules).entries()){
  const p=panel(name,ms);poses.push(p.pose);
  ctx.drawImage(p.canvas,crop.x,crop.y,crop.width,crop.height,i*500,45,500,475);
  ctx.fillStyle='#f5dbc3';ctx.font='bold 17px sans-serif';ctx.fillText(labels[i],i*500+15,25);
  ctx.font='15px sans-serif';ctx.fillText(p.pose.toUpperCase(),i*500+15,548);
 }
 ctx.fillStyle='#f5dbc3';ctx.font='15px sans-serif';ctx.fillText('CROSS / SECOND LIGHT PUNCH  |  140 ms windup / 90 ms contact / visual return 20 ms  |  DRAFT',15,590);
 return {png:canvas.toDataURL().split(',')[1],poses};
}
window.crossPreview={frames:Object.fromEntries(Object.entries(frames).map(([k,v])=>[k,v.toDataURL().split(',')[1]])),stage,render};window.ready=true;
