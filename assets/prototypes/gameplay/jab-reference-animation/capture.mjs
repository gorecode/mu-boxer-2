import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs/promises';import {existsSync} from 'node:fs';
const root=path.dirname(fileURLToPath(import.meta.url)),project=path.resolve(root,'../../../..');const {chromium}=createRequire(path.join(project,'scene-lab/package.json'))('playwright');

(async()=>{const browser=await chromium.launch({executablePath:existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':undefined,args:['--no-sandbox']});for(const folder of ['.capture']){const stage=JSON.parse(await fs.readFile(path.join(root,'metadata.json'),'utf8')).stage;
 const page=await browser.newPage({viewport:{width:1600,height:1100}});await page.route('**/__candidate/*.png',async route=>{const i=new URL(route.request().url()).pathname.split('/').at(-1);await route.fulfill({path:`${root}/frames/${i}`,contentType:'image/png'});});
 await page.clock.install({time:new Date('2026-11-22T09:00:00Z')});await page.goto(process.argv[2]??'https://gorecode.github.io/mu-boxer-2/fight.html');await page.waitForFunction(()=>document.querySelector('#start').textContent==='НАЧАТЬ БОЙ →');await page.clock.pauseAt(new Date('2026-11-22T10:00:00Z'));
 await page.evaluate(async stage=>{
  const frames=await Promise.all(Array.from({length:18},async(_,i)=>{const image=new Image();image.src=`./__candidate/${String(i).padStart(2,'0')}.png`;await image.decode();return image}));
  const manifest=await fetch('./art/fight/manifest.json').then(r=>r.json());const draw=CanvasRenderingContext2D.prototype.drawImage;window.drawn=[];
  CanvasRenderingContext2D.prototype.drawImage=function(...args){const img=args[0];if(img instanceof HTMLImageElement && /\/jab\/jab-\d\.webp$/.test(img.src)){
    const t=Number(document.querySelector('#arena').dataset.playerActionTime),i=Math.min(17,Math.max(0,Math.floor((t+1e-9)*50)));const m=this.getTransform();this.save();const scale=manifest.jab[Number(img.src.match(/jab-(\d)/)[1])].scale;const world=n=>Math.round(n/scale*1e6)/1e6;this.setTransform(world(m.a),world(m.b),world(m.c),world(m.d),m.e,m.f);this.scale(stage.scale,stage.scale);draw.call(this,frames[i],-stage.anchorX,-stage.anchorY,stage.width,stage.height);this.restore();window.drawn.push({t,i,x:m.e,y:m.f});return;}
    return Reflect.apply(draw,this,args);
  };
 },stage);
 await page.locator('#training-mode').check();await page.locator('#start').click();await page.clock.runFor(1800);await page.locator('#arena').focus();await fs.mkdir(`${root}/${folder}/in-arena`,{recursive:true});
 for(let i=0;i<61;i++){
  if(i===10)await page.keyboard.press('j');
  const png=await page.evaluate(()=>{const source=document.querySelector('#arena'),c=document.createElement('canvas');c.width=650;c.height=665;c.getContext('2d').drawImage(source,170,175,650,665,0,0,650,665);return c.toDataURL().split(',')[1]});await fs.writeFile(`${root}/${folder}/in-arena/${String(i).padStart(3,'0')}.png`,Buffer.from(png,'base64'));await page.clock.runFor(20);
 }
 const drawn=await page.evaluate(()=>window.drawn);if(drawn.length===0||!drawn.some(f=>f.i===4))throw new Error('Candidate was not drawn in the game');await fs.writeFile(`${root}/${folder}/in-arena/drawn.json`,JSON.stringify(drawn,null,2));await page.close();
}await browser.close()})().catch(e=>{console.error(e);process.exit(1)});
