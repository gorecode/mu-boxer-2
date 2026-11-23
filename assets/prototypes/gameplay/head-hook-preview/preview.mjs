import {stage,schedules,poseAt,leadInMs} from './schedule.mjs';
import {repair} from './correction-v2/repair.mjs';
import {assembleRight} from './correction-v5/assemble.mjs';
const load=async path=>{const im=new Image();im.src=path;await im.decode();return im;};
const make=()=>Object.assign(document.createElement('canvas'),{width:stage.width,height:stage.height});
const idle=await load('../../../../scene-lab/public/art/fight/boxer-0.webp');
const arena=await load('../../../../scene-lab/public/art/fight/arena.webp');
const frames={idle:make()};frames.idle.getContext('2d').drawImage(idle,64,0);
function scan(image){
 const c=Object.assign(document.createElement('canvas'),{width:image.width,height:image.height}),ctx=c.getContext('2d');ctx.drawImage(image,0,0);
 const data=ctx.getImageData(0,0,c.width,c.height).data;
 let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,toeX=-1,soleY=-1,footPixels=0;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
  if(data[(y*c.width+x)*4+3]<=24)continue;
  minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
  if(y>c.height*.85&&x>c.width*.6){toeX=Math.max(toeX,x);soleY=Math.max(soleY,y);footPixels++;}
 }
 if(footPixels<100||!Number.isFinite(minX))throw new Error('Empty leading-foot reference');
 return {minX,minY,maxX,maxY,toeX,soleY,footPixels};
}
const idleFoot=scan(idle),targetToe=[idleFoot.toeX+64,idleFoot.soleY];
const registration=[];
for(const hand of ['left','right'])for(const pose of ['early','late','contact']){
 const name=`${hand}-${pose}`,image=await load(`./inputs/${name}.png`),source=scan(image);
 const scale=480/(source.maxY-source.minY+1),x=targetToe[0]-source.toeX*scale,y=targetToe[1]-source.soleY*scale;
 const bounds=[x+source.minX*scale,y+source.minY*scale,x+source.maxX*scale,y+source.maxY*scale];
 if(bounds[0]<-1||bounds[1]<-2||bounds[2]>=500||bounds[3]>=530)throw new Error('Registration clips '+name+' '+JSON.stringify(bounds));
 const c=make(),ctx=c.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,x,y,image.width*scale,image.height*scale);frames[name]=c;
 registration.push({name,source,scale,x,y,bounds,leadingToe:targetToe});
}
const correction=await repair(frames,load,make);
const consistency=await assembleRight(frames,load,make,scan);
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
const labels=['0 IN-BETWEENS','1 IN-BETWEEN','2 IN-BETWEENS'];
function panel(hand,index,ms){
 const world=Object.assign(document.createElement('canvas'),{width:1600,height:900}),p=world.getContext('2d');p.drawImage(arena,0,0,1600,900);
 const selected=poseAt(schedules[index],ms-leadInMs),key=selected==='idle'?'idle':`${hand}-${selected}`;
 p.save();p.translate(530,820);p.scale(stage.scale,stage.scale);p.drawImage(frames[key],-stage.anchorX,-stage.anchorY);p.restore();
 return {world,selected,key};
}
function render(hand,ms){
 ctx.fillStyle='#201b20';ctx.fillRect(0,0,1500,650);const selected=[];
 for(let i=0;i<3;i++){
  const p=panel(hand,i,ms);selected.push(p.selected);
  ctx.drawImage(p.world,215,175,700,665,i*500,45,500,475);
  ctx.fillStyle='#f5dbc3';ctx.font='bold 17px sans-serif';ctx.fillText(`${hand==='left'?'A / LEFT':'B / RIGHT'}  |  ${labels[i]}`,i*500+12,27);
  ctx.font='15px sans-serif';ctx.fillText(p.selected.toUpperCase(),i*500+12,548);
 }
 ctx.fillStyle='#f5dbc3';ctx.font='15px sans-serif';ctx.fillText('HEAD HOOK  |  250 ms windup / 120 ms contact / 20 ms visual return  |  DRAFT',12,590);
 return {png:canvas.toDataURL().split(',')[1],selected};
}
window.hookPreview={frames:Object.fromEntries(Object.entries(frames).map(([name,c])=>[name,c.toDataURL().split(',')[1]])),registration,correction,consistency,stage,render};window.ready=true;
