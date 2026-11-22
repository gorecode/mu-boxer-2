import './rig.mjs';
const view=document.querySelector('#view'),ctx=view.getContext('2d'),slider=document.querySelector('#time'),button=document.querySelector('#play'),speed=document.querySelector('#speed');
const arena=new Image();arena.src='../../../../scene-lab/public/art/fight/arena.webp';await arena.decode();
let running=false,clock=200,last=0;
function draw(t){window.jabExperiment.render(window.jabExperiment.progressAt(t));ctx.clearRect(0,0,1600,900);ctx.drawImage(arena,0,0,1600,900);const stage=window.jabExperiment.stage;ctx.save();ctx.translate(600,820);ctx.scale(stage.scale,stage.scale);ctx.drawImage(document.querySelector('#sprite'),-stage.anchorX,-stage.anchorY);ctx.restore();document.querySelector('#stamp').textContent=`${Math.round(t)} мс`;slider.value=String(t);}
slider.addEventListener('input',()=>{running=false;button.textContent='ПУСК';clock=Number(slider.value)+200;draw(Number(slider.value));});
button.addEventListener('click',()=>{running=!running;button.textContent=running?'ПАУЗА':'ПУСК';last=0;});
function frame(now){if(running){clock=(clock+(last?now-last:0)*Number(speed.value))%1220;draw(Math.max(0,Math.min(340,clock-200)));}last=now;requestAnimationFrame(frame);}
draw(0);window.previewReady=true;requestAnimationFrame(frame);
