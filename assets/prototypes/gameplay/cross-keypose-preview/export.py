from pathlib import Path
from PIL import Image, ImageDraw, ImageSequence
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/previews/boxer-cross'
public.mkdir(parents=True, exist_ok=True)
frames = [Image.open(p).convert('RGB') for p in sorted((root / '.capture').glob('*.png'))]
assert len(frames) == 121 and all(f.size == (1500, 650) for f in frames)
sprites = {n: Image.open(root / f'frames/{n}.png').convert('RGBA') for n in ['idle','outgoing','contact','return']}
assert all(f.size == (500,530) and f.getchannel('A').getextrema() == (0,255) for f in sprites.values())
for name in ['outgoing','return']:
    assert sprites[name].crop((0,225,500,530)).tobytes() == sprites['idle'].crop((0,225,500,530)).tobytes()
    face = sprites['idle'].crop((215,12,275,80))
    assert face.getchannel('A').getbbox() is not None
    assert sprites[name].crop((215,12,275,80)).tobytes() == face.tobytes()
    assert sprites[name].getchannel('A').getbbox()[2] < sprites['contact'].getchannel('A').getbbox()[2]
manifest = json.loads((project / 'scene-lab/public/art/fight/manifest.json').read_text())
for name, index in [('idle',0),('contact',3)]:
    source = Image.open(project / f'scene-lab/public/art/fight/boxer-{index}.webp').convert('RGBA')
    expected = Image.new('RGBA',(500,530))
    m = manifest['boxer'][index]
    expected.paste(source,(228-m['anchorX'],495-m['anchorY']))
    assert expected.getchannel('A').tobytes() == sprites[name].getchannel('A').tobytes()
    opaque = [(a,b) for a,b in zip(expected.getdata(),sprites[name].getdata()) if a[3] >= 240]
    assert len(opaque) > 10000 and all(max(abs(a[k]-b[k]) for k in range(3)) <= 2 for a,b in opaque)
board = Image.new('RGB',(2000,560),'#30242c')
draw = ImageDraw.Draw(board)
for i,(name,image) in enumerate(sprites.items()):
    board.paste(image,(i*500,30),image);draw.text((i*500+12,10),name.upper(),fill='white')
board.save(root/'contact-sheet.png')
board.save(public/'contact-sheet.png')
sample = Image.new('RGB',(1500,650*4))
for row,index in enumerate([0,40,44,54]):sample.paste(frames[index],(0,row*650))
palette = sample.quantize(colors=256,method=Image.Quantize.MEDIANCUT)
indexed = [im.quantize(palette=palette,dither=Image.Dither.NONE) for im in frames]
report = {}
for suffix,ms in [('',10),('-slow',40)]:
    target = public/f'comparison{suffix}.gif'
    indexed[0].save(target,save_all=True,append_images=indexed[1:],duration=ms,loop=0,optimize=False)
    with Image.open(target) as gif:
        decoded = [(f.convert('RGB').copy(),f.info['duration']) for f in ImageSequence.Iterator(gif)]
        assert len(decoded) >= 5 and sum(t for _,t in decoded) == 121*ms
        assert decoded[0][0].tobytes() == decoded[-1][0].tobytes() and gif.info['loop'] == 0
        assert [t for _,t in decoded] == [400*ms//10,40*ms//10,90*ms//10,20*ms//10,660*ms//10]
        report[target.name] = {'decoded_states':len(decoded),'duration_ms':121*ms,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
        if not suffix:
            strip = Image.new('RGB',(1500,200*len(decoded)),'#201b20')
            d = ImageDraw.Draw(strip);clock = 0
            for i,(f,duration) in enumerate(decoded):
                strip.paste(f.resize((450,195)),(0,i*200));d.text((470,i*200+10),f'{clock} - {clock+duration} ms',fill='white');clock += duration
            strip.save(root/'decoded-gif-states.png')
report['sprites'] = {n:hashlib.sha256((root/f'frames/{n}.png').read_bytes()).hexdigest() for n in sprites}
report['checks'] = ['fixed lower body in new frames','original face pixels in checked region','original idle/contact unchanged','in-between reach below original contact','decoded GIF duration and loop']
for suffix,ms in [('',10),('-slow',40)]:
    single = [f.crop((1000,0,1500,570)) for f in indexed]
    single[0].save(public/f'hybrid{suffix}.gif',save_all=True,append_images=single[1:],duration=ms,loop=0,optimize=False)
(root/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
