const headPolygon=[[194,0],[286,0],[286,67],[280,93],[270,104],[251,99],[235,86],[209,83],[194,67]];
const offsets={left:[[-4,9],[-43,4],[-52,4]],right:[[5,9],[-6,4],[-28,4]]};
function polygon(ctx,points){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}
function bounds(canvas,x0=0,y0=0,x1=canvas.width,y1=canvas.height){
 const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
 let minX=Infinity,minY=Infinity,maxX=-1,maxY=-1,count=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(data[(y*canvas.width+x)*4+3]>24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
 if(count<100)throw new Error('Empty repair registration');
 return {minX,minY,maxX,maxY,count};
}
export async function repair(frames,load,make){
 const head=make(),h=head.getContext('2d');h.save();polygon(h,headPolygon);h.clip();h.drawImage(frames.idle,0,0);h.restore();
 const records=[];
 for(const hand of ['left','right']){
  const sheet=await load(hand==='right'?'./correction-v3/right-shirt.png':`./correction-v2/${hand}-shirt.png`);
  for(const [i,pose] of ['early','late','contact'].entries()){
   const name=`${hand}-${pose}`,before=frames[name],src=Object.assign(document.createElement('canvas'),{width:sheet.width/3,height:sheet.height}),sc=src.getContext('2d');
   sc.drawImage(sheet,i*src.width,0,src.width,src.height,0,0,src.width,src.height);
   const b=bounds(src),target=bounds(before,0,0,500,270),hips=bounds(before,0,255,500,270),sourceHips=bounds(src,0,b.maxY-14,src.width,b.maxY+1);
   const scale=(270-target.minY)/(b.maxY-b.minY+1),x=(hips.minX+hips.maxX)/2-(sourceHips.minX+sourceHips.maxX)/2*scale,y=270-(b.maxY+1)*scale;
   const [dx,dy]=offsets[hand][i];
   const normalized=make(),nc=normalized.getContext('2d');nc.imageSmoothingQuality='high';nc.drawImage(src,x,y,src.width*scale,src.height*scale);
   const hair=bounds(normalized,0,Math.max(0,target.minY),500,Math.ceil(target.minY+35)),delta=239+dx-(hair.minX+hair.maxX)/2;
   const aligned=make(),ac=aligned.getContext('2d');ac.transform(1,0,-delta/215,1,delta*245/215,0);ac.drawImage(normalized,0,0);
   const alignedBounds=bounds(aligned,0,0,500,245),pivot=239+dx,reachScale=(target.maxX-pivot)/(alignedBounds.maxX-pivot);
   if(reachScale<=0||reachScale>1.5)throw new Error('Invalid repaired arm registration');
   const c=make(),ctx=c.getContext('2d');ctx.drawImage(before,0,0);
   ctx.clearRect(0,0,500,245);ctx.drawImage(aligned,0,0,pivot,245,0,0,pivot,245);ctx.drawImage(aligned,pivot,0,500-pivot,245,pivot,0,(500-pivot)*reachScale,245);
   const erase=[[170+dx,0],[289+dx,0],[289+dx,54+dy],[279+dx,70+dy],[276+dx,97+dy],[254+dx,101+dy],[237+dx,86+dy],[210+dx,81+dy],[170+dx,68+dy]];
   ctx.save();ctx.globalCompositeOperation='destination-out';polygon(ctx,erase);ctx.fill();ctx.restore();ctx.drawImage(head,dx,dy);
   const sourcePixels=h.getImageData(0,0,500,530),result=ctx.getImageData(0,0,500,530);
   for(let sy=0;sy<530;sy++)for(let sx=0;sx<500;sx++){
    if(sx+dx<0||sx+dx>=500||sy+dy<0||sy+dy>=530)continue;
    const from=(sy*500+sx)*4,to=((sy+dy)*500+sx+dx)*4;
    if(sourcePixels.data[from+3]>=240)result.data.set(sourcePixels.data.subarray(from,from+4),to);
   }
   ctx.putImageData(result,0,0);
   frames[name]=c;records.push({name,headOffset:[dx,dy],headPolygon,shirt:{scale,x,y,source:b,headAlignmentShear:delta,reachScale,cutoffY:245},unchangedFromY:245});
  }
 }
 return {records,head:head.toDataURL().split(',')[1]};
}
