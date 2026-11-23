import {solveTwoBone} from '../../../../../.claude/skills/video-reference-animation/scripts/retarget.mjs';
const armCut=[[154,103],[181,96],[204,105],[227,125],[260,113],[317,93],[360,96],[363,140],[294,151],[239,168],[208,175],[183,161],[162,146],[150,124]];
const upperMask=[[154,103],[181,96],[204,105],[225,125],[234,145],[225,168],[208,175],[183,161],[162,146],[150,124]];
const foreMask=[[197,143],[231,132],[317,98],[346,101],[356,117],[351,139],[294,151],[239,168],[208,175],[194,161]];
const source={shoulder:[177,124],elbow:[211,154],wrist:[329,122]};
const length=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
function polygon(c,points){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();}
function masked(image,points,make){const c=make(),x=c.getContext('2d');x.save();polygon(x,points);x.clip();x.drawImage(image,0,0);x.restore();return c;}
function projected(c,image,a,b,A,B){
 c.save();c.translate(...A);c.rotate(Math.atan2(B[1]-A[1],B[0]-A[0]));c.scale(length(A,B)/length(a,b),1);c.rotate(-Math.atan2(b[1]-a[1],b[0]-a[0]));c.translate(-a[0],-a[1]);c.drawImage(image,0,0);c.restore();
}
function shiftedUpper(image,dx,dy,make){
 const c=make(),x=c.getContext('2d');x.drawImage(image,0,0);
 const src=image.getContext('2d').getImageData(0,0,500,530),out=x.getImageData(0,0,500,530);
 for(let y=0;y<245;y++)for(let px=0;px<500;px++){
  const to=(y*500+px)*4,sx=px-dx,sy=y-dy;
  if(sx>=0&&sx<500&&sy>=0&&sy<245)out.data.set(src.data.subarray((sy*500+sx)*4,(sy*500+sx)*4+4),to);
  else out.data.fill(0,to,to+4);
 }
 x.putImageData(out,0,0);return c;
}
export async function assembleRight(frames,load,make,scan){
 const idle=frames.idle,contact=frames['right-contact'],generated=await load('./correction-v5/clean-plate-generated.png');
 const b=scan(generated),factor=482/(b.maxY-b.minY+1),gx=344-b.toeX*factor,gy=485-b.soleY*factor;
 const generatedNative=make();generatedNative.getContext('2d').drawImage(generated,gx,gy,generated.width*factor,generated.height*factor);
 const plate=make(),p=plate.getContext('2d');p.drawImage(contact,0,0);p.save();p.globalCompositeOperation='destination-out';polygon(p,armCut);p.fill();p.restore();
 p.save();polygon(p,armCut);p.clip();p.drawImage(generatedNative,0,0);p.restore();
 p.save();polygon(p,armCut);p.clip();polygon(p,[[275,78],[310,78],[318,102],[309,153],[292,193],[264,194],[251,169],[260,145],[274,123]]);p.clip();p.drawImage(generatedNative,10,-2);p.restore();
 const upper=masked(contact,upperMask,make),fore=masked(contact,foreMask,make);
 frames['right-early']=shiftedUpper(idle,-3,1,make);
 const late=shiftedUpper(plate,-4,1,make),c=late.getContext('2d');
 const shoulder=[173,125],target=[276,123],lengths=[length(source.shoulder,source.elbow),94],pose=solveTwoBone(shoulder,target,lengths);
 if(pose.clamped)throw new Error('Late hook wrist is unreachable');
 projected(c,upper,source.shoulder,source.elbow,shoulder,pose.elbow);
 projected(c,fore,source.elbow,source.wrist,pose.elbow,pose.wrist);
 const headImage=await load('./correction-v2/head-source.png'),head=make();head.getContext('2d').drawImage(headImage,0,0);
 const face=head.getContext('2d').getImageData(0,0,500,530),finished=c.getImageData(0,0,500,530);
 for(let y=0;y<110;y++)for(let x=190;x<290;x++){
  const at=(y*500+x)*4;
  if(face.data[at+3]>=240)finished.data.set(face.data.subarray(at,at+4),((y+5)*500+x-9)*4);
 }
 c.putImageData(finished,0,0);
 frames['right-late']=late;
 return {source,armCut,upperMask,foreMask,sourceLengths:[length(source.shoulder,source.elbow),length(source.elbow,source.wrist)],late:{shoulder,elbow:pose.elbow,wrist:pose.wrist,lengths},plateRegistration:{factor,x:gx,y:gy},headOffsets:{early:[-3,1],late:[-9,5],contact:[-5,4]},layers:Object.fromEntries(Object.entries({plate,upper,fore,generatedNative}).map(([k,v])=>[k,v.toDataURL().split(',')[1]]))};
}
