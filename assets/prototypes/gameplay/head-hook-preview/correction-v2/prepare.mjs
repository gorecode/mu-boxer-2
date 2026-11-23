import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=createRequire(new URL('../../../../../scene-lab/package.json',import.meta.url))('playwright');
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 for(const hand of ['left','right']){
  const images=await Promise.all(['early','late','contact'].map(async pose=>(await readFile(root+`correction-v2/before/${hand}-${pose}.png`)).toString('base64')));
  const png=await page.evaluate(async images=>{
   const c=Object.assign(document.createElement('canvas'),{width:1500,height:285}),x=c.getContext('2d');x.fillStyle='#28212a';x.fillRect(0,0,1500,285);
   for(const [i,b] of images.entries()){const im=new Image();im.src='data:image/png;base64,'+b;await im.decode();x.drawImage(im,0,0,500,270,i*500,0,500,270);}
   return c.toDataURL().split(',')[1];
  },images);
  await writeFile(root+`correction-v2/${hand}-target.png`,Buffer.from(png,'base64'));
 }
}finally{await browser.close();}
