import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const project=path.resolve(root,'../../../../..');
const require=createRequire(path.join(project,'scene-lab/package.json'));
const {chromium}=require('playwright');
const {PNG}=require(path.join(path.dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
const source=await readFile(path.join(root,'../body-turn/frames/c-rising.png'));
const reference=await readFile(path.join(root,'../body-turn/frames/idle.png'));
const regions=[
 {name:'shirt',sample:[174,190,210,230],reference:[145,180,170,214],polygon:[[174,116],[159,120],[150,140],[153,163],[162,185],[170,194],[165,215],[160,235],[158,250],[187,255],[217,258],[235,258],[240,245],[241,216],[247,199],[257,187],[240,183],[224,173],[218,164],[217,156],[224,149],[235,142],[240,139],[231,129],[214,125],[194,121]]},
 {name:'trousers',sample:[160,276,194,310],reference:[145,280,180,313],polygon:[[158,250],[187,255],[217,258],[235,258],[255,278],[274,299],[290,320],[306,345],[310,372],[306,400],[300,427],[302,458],[312,480],[292,488],[264,486],[253,481],[254,459],[250,434],[246,412],[240,391],[233,373],[225,354],[214,336],[211,324],[195,349],[178,376],[159,405],[144,430],[132,452],[121,474],[116,482],[101,482],[86,471],[91,456],[103,432],[120,405],[133,380],[143,351],[149,322],[152,292]]},
];
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const result=await page.evaluate(async ({source,reference,regions})=>{
  const load=async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();return image;};
  const images=await Promise.all([load(source),load(reference)]);
  const canvas=document.createElement('canvas');canvas.width=500;canvas.height=550;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(images[0],0,0);const original=ctx.getImageData(0,0,500,550);
  ctx.clearRect(0,0,500,550);ctx.drawImage(images[1],0,0);const idle=ctx.getImageData(0,0,500,550);
  const mask=document.createElement('canvas');mask.width=500;mask.height=550;
  const mc=mask.getContext('2d',{willReadFrequently:true});
  const median=(pixels,box,channel)=>{
   const values=[];
   for(let y=box[1];y<box[3];y++)for(let x=box[0];x<box[2];x++){
    const i=(y*500+x)*4;if(pixels.data[i+3]>240)values.push(pixels.data[i+channel]);
   }
   if(values.length<100)throw new Error('Empty clothing sample');
   values.sort((a,b)=>a-b);return values[Math.floor(values.length/2)];
  };
  const report=[];
  for(const region of regions){
   mc.clearRect(0,0,500,550);mc.fillStyle='white';mc.beginPath();
   region.polygon.forEach(([x,y],i)=>i?mc.lineTo(x,y):mc.moveTo(x,y));mc.closePath();mc.fill();
   const area=mc.getImageData(0,0,500,550).data;
   const input=[0,1,2].map(c=>median(original,region.sample,c));
   const target=[0,1,2].map(c=>median(idle,region.reference,c));
   const lut=input.map((middle,c)=>{
    if(middle<=24||middle>=200||target[c]<=24||target[c]>=200)throw new Error('Invalid clothing median');
    const stops=[[0,0],[24,24],[middle,target[c]],[200,200],[255,255]];
    return Array.from({length:256},(_,v)=>{
     const j=stops.findIndex(([x])=>x>=v);if(j===0)return 0;
     const [a,b]=[stops[j-1],stops[j]];return Math.round(a[1]+(b[1]-a[1])*(v-a[0])/(b[0]-a[0]));
    });
   });
   let count=0;
   for(let i=0;i<area.length;i+=4){
    if(area[i+3]===0||original.data[i+3]===0)continue;
    count++;
   }
   if(count<1000)throw new Error('Missing clothing mask');
   region.mask=mask.toDataURL('image/png').split(',')[1];
   report.push({name:region.name,input,target,pixels:count,lut,sample:region.sample,reference:region.reference,polygon:region.polygon});
  }
  return {masks:regions.map(r=>({name:r.name,png:r.mask})),report};
 },{source:source.toString('base64'),reference:reference.toString('base64'),regions});
 await mkdir(path.join(root,'frames'),{recursive:true});
 const original=PNG.sync.read(source);
 const output=new PNG({width:original.width,height:original.height});
 output.data=Buffer.from(original.data);
 for(const region of result.report){
  const mask=PNG.sync.read(Buffer.from(result.masks.find(m=>m.name===region.name).png,'base64'));
  for(let i=0;i<output.data.length;i+=4){
   if(mask.data[i+3]===0||original.data[i+3]===0)continue;
   for(let c=0;c<3;c++)output.data[i+c]=region.lut[c][original.data[i+c]];
  }
 }
 await writeFile(path.join(root,'frames/contact.png'),PNG.sync.write(output));
 for(const mask of result.masks)await writeFile(path.join(root,mask.name+'-mask.png'),Buffer.from(mask.png,'base64'));
 await writeFile(path.join(root,'palette.json'),JSON.stringify({source:'../body-turn/frames/c-rising.png',reference:'../body-turn/frames/idle.png',regions:result.report.map(({lut,...region})=>region)},null,2)+'\n');
 console.log(JSON.stringify(result.report.map(({name,input,target,pixels})=>({name,input,target,pixels}))));
}finally{await browser.close();}
