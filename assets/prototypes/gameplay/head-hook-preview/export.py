from pathlib import Path
from PIL import Image, ImageSequence, ImageDraw
import json
import hashlib

root=Path(__file__).resolve().parent
project=root.parents[3]
public=project/'scene-lab/public/previews/head-hook-v2'
public.mkdir(exist_ok=True)
expected={0:[550,120,540],1:[470,80,120,20,520],2:[470,40,40,120,20,520]}
registration=json.loads((root/'registration.json').read_text())
assert registration['stage']==dict(width=500,height=530,anchorX=228,anchorY=495,scale=1.19)
assert len(registration['registration'])==6
for r in registration['registration']:
    assert r['source']['footPixels']>100
    assert max(abs(r['x']+r['source']['toeX']*r['scale']-344),abs(r['y']+r['source']['soleY']*r['scale']-485))<1e-8
sprites={p.stem:Image.open(p).convert('RGBA') for p in (root/'frames').glob('*.png')}
assert set(sprites)=={'idle','left-early','left-late','left-contact','right-early','right-late','right-contact'}
assert all(s.size==(500,530) and s.getchannel('A').getextrema()[0]==0 and s.getchannel('A').getextrema()[1]>=250 for s in sprites.values())
for name,im in sprites.items():
    pixels=[(x,y) for y in range(440,530) for x in range(300,400) if im.getpixel((x,y))[3]>24]
    assert len(pixels)>100
    assert abs(max(x for x,y in pixels)-344)<=1 and abs(max(y for x,y in pixels)-485)<=1,name
selected=project/'assets/prototypes/gameplay/heavy-contact-options/inputs/01-head-hook.png'
assert selected.read_bytes()==(root/'inputs/left-contact.png').read_bytes()
board=Image.new('RGB',(2000,1120),'#28212a');d=ImageDraw.Draw(board)
for row,hand in enumerate(['left','right']):
    for col,pose in enumerate(['idle','early','late','contact']):
        im=sprites['idle' if pose=='idle' else hand+'-'+pose];board.paste(im,(col*500,row*560+28),im)
        d.text((col*500+12,row*560+9),hand.upper()+' / '+pose.upper(),fill='white')
board.save(root/'contact-sheet.png');board.save(public/'contact-sheet.png')
sample=Image.new('RGB',(1500,650*10))
for row,(hand,index) in enumerate((h,i) for h in ['left','right'] for i in [0,47,51,55,68]):
    with Image.open(root/f'.capture/{hand}/{index*10:04d}.png') as im:sample.paste(im.convert('RGB'),(0,row*650))
palette=sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
report={}
def save_gif(name,indexed,durations,expected_times):
    for suffix,multiplier in [('',1),('-slow',4)]:
        path=public/f'{name}{suffix}.gif'
        indexed[0].save(path,save_all=True,append_images=indexed[1:],duration=[n*multiplier for n in durations],loop=0,optimize=False)
        with Image.open(path) as gif:
            decoded=[(f.convert('RGB').copy(),f.info['duration']) for f in ImageSequence.Iterator(gif)]
            times=[t for _,t in decoded]
            assert times==[n*multiplier for n in expected_times],(name,times)
            assert sum(times)==1210*multiplier and gif.info['loop']==0
            assert decoded[0][0].tobytes()==decoded[-1][0].tobytes()
            unique=len({f.tobytes() for f,_ in decoded})
            if '-compare' not in name:assert unique==int(name[-1])+2
            if not suffix:
                strip=Image.new('RGB',(1500,len(decoded)*250),'#201b20');draw=ImageDraw.Draw(strip);clock=0
                for row,(f,t) in enumerate(decoded):
                    display=f.resize((450,195)) if '-compare' in name else f.resize((205,234))
                    strip.paste(display,(0,row*250));draw.text((470,row*250+12),f'{clock} - {clock+t} ms',fill='white');clock+=t
                strip.save(root/f'decoded-{name}.png')
        report[path.name]={'size':gif.size,'decoded_states':len(decoded),'distinct_images':unique,'duration_ms':sum(times),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()}
for hand in ['left','right']:
    paths=sorted((root/f'.capture/{hand}').glob('*.png'));assert len(paths)==121
    frames=[Image.open(p).convert('RGB').quantize(palette=palette,dither=Image.Dither.NONE) for p in paths]
    save_gif(f'{hand}-compare',frames,[10]*121,[470,40,40,120,20,520])
    for i in range(3):
        cropped=[f.crop((i*500,0,(i+1)*500,570)) for f in frames]
        save_gif(f'{hand}-{i}',cropped,[10]*121,expected[i])
report['sources']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'inputs').glob('*.png'))}
report['correction_sources']={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'correction-v2').glob('*')) if p.is_file()}
report['checks']=['six animations with exactly 0/1/2 additional drawings','identical 120 ms contact','20 ms hybrid return','decoded GIF durations and loop','planted front toe registration','selected left contact input retained; preview costume/head repaired','unclipped transparent native frames']
(root/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:{'states':v['decoded_states'],'unique':v['distinct_images'],'ms':v['duration_ms']} for k,v in report.items() if k.endswith('.gif')},indent=2))
