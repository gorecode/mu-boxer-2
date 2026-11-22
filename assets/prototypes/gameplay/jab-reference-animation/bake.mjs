import { createRequire } from 'node:module';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../../../..');
const { chromium }=createRequire(path.join(project,'scene-lab/package.json'))('playwright');
const url=process.argv[2]??'http://127.0.0.1:4201/assets/prototypes/gameplay/jab-reference-animation/preview.html';
const browser=await chromium.launch({executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto(url);await page.waitForFunction(()=>window.ready);
 await mkdir(path.join(root,'frames'),{recursive:true});const samples=[];
 for(let i=0;i<=17;i++){
  const result=await page.evaluate(i=>{const e=window.jabExperiment,t=i*20,progress=e.progressAt(t);return {png:e.render(progress),time:t,progress,joints:e.joints(progress)};},i);
  await writeFile(path.join(root,'frames',`${String(i).padStart(2,'0')}.png`),Buffer.from(result.png,'base64'));delete result.png;samples.push(result);
 }
 const metadata=await page.evaluate(()=>{const e=window.jabExperiment;return {stage:e.stage,timing:e.timing,lengths:e.lengths};});
 await writeFile(path.join(root,'metadata.json'),JSON.stringify({...metadata,samples},null,2)+'\n');
 console.log(`Baked ${samples.length} original-texture frames`);
} finally { await browser.close(); }
