from pathlib import Path
from PIL import Image,ImageDraw,ImageSequence
import json
root=Path(__file__).resolve().parent
out=root/'.capture';frames=[Image.open(p).convert('RGB') for p in sorted((out/'in-arena').glob('*.png'))]
assert len(frames)==61,'Run capture.mjs first'

def animation(path):
    decoded=[];clock=0
    with Image.open(path) as image:
        for f in ImageSequence.Iterator(image):
            pixels=f.convert('RGB').copy();duration=f.info['duration'];decoded.append((clock,pixels));clock+=duration
    assert clock==1220
    return [next(p for t,p in reversed(decoded) if t<=i*20) for i in range(61)]

old=animation(root/'baseline-original.webp');rejected=animation(root/'baseline-rejected.webp');comparison=[]
for i in range(61):
    c=Image.new('RGB',(1950,695),(30,25,28));d=ImageDraw.Draw(c)
    for col,(name,image) in enumerate([('ORIGINAL',old[i]),('REDRAW / REJECTED',rejected[i]),('ORIGINAL TEXTURES',frames[i])]):
        c.paste(image,(col*650,30));d.text((col*650+12,8),name,fill='white')
    comparison.append(c)
verification={}
for name,images in [('jab-final',frames),('comparison-final',comparison)]:
    images[0].save(root/('jab-in-arena.webp' if name=='jab-final' else 'comparison.webp'),save_all=True,append_images=images[1:],duration=20,lossless=True,loop=0)
    palette=images[18].quantize(colors=256);indexed=[i.quantize(palette=palette,dither=Image.Dither.NONE) for i in images]
    for suffix,duration in [('',20),('-slow',80)]:
        file=out/(name+suffix+'.gif');indexed[0].save(file,save_all=True,append_images=indexed[1:],duration=duration,loop=0,optimize=False)
        with Image.open(file) as gif:
            decoded=[(i.convert('RGB').copy(),i.info['duration']) for i in ImageSequence.Iterator(gif)]
            assert sum(d for _,d in decoded)==61*duration;assert decoded[0][0].tobytes()==decoded[-1][0].tobytes();assert gif.info['loop']==0
            verification[file.name]={'frames':len(decoded),'duration_ms':61*duration,'size':gif.size}
comparison[18].save(root/'contact-comparison.png')
(root/'export-verification.json').write_text(json.dumps(verification,indent=2)+'\n')
print(json.dumps(verification))
