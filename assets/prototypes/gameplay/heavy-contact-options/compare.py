from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/previews/heavy-contact'
public.mkdir(exist_ok=True)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',17)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',14)
arena = Image.open(project/'scene-lab/public/art/fight/arena.webp').convert('RGB').resize((1600,900),Image.Resampling.LANCZOS)
options = [('current','СЕЙЧАС: ПРЯМОЙ','Текущий контакт сильного удара',478),
           ('01-head-hook','1. БОКОВОЙ В ГОЛОВУ','Разворот таза, высокий локоть, согнутая рука',493),
           ('02-body-hook','2. СИЛОВОЙ В КОРПУС','Просадка и диагональный крюк снизу',450),
           ('03-downward-overhand','3. РУБЯЩИЙ СВЕРХУ','Плечо над кулаком, вес идёт вниз',470)]
board = Image.new('RGB',(2000,730),'#201b20')
report=[]
for i,(name,title,description,height) in enumerate(options):
    panel = Image.new('RGB',(500,730),'#201b20')
    panel.paste(arena.crop((200,200,700,850)),(0,40))
    path=project/'scene-lab/public/art/fight/boxer-3.webp' if name=='current' else root/f'inputs/{name}.png'
    image=Image.open(path).convert('RGBA')
    bbox=image.getchannel('A').point(lambda a:255 if a>24 else 0).getbbox()
    assert bbox is not None and image.getchannel('A').getextrema()==(0,255)
    if name=='current':
        scaled=image.resize((round(image.width*1.19),round(image.height*1.19)),Image.Resampling.LANCZOS)
        x,y=round(230-150*1.19),round(660-480*1.19)
    else:
        image=image.crop(bbox);factor=height*1.19/image.height
        scaled=image.resize((round(image.width*factor),round(image.height*factor)),Image.Resampling.LANCZOS)
        x,y=round(250-scaled.width/2),660-scaled.height
    assert x>=0 and x+scaled.width<=500 and y>=40
    panel.paste(scaled,(x,y),scaled)
    d=ImageDraw.Draw(panel);d.text((12,10),title,font=font,fill='#ffe3c9')
    d.rectangle((0,690,500,730),fill='#201b20');d.text((12,704),description,font=small,fill='#ffe3c9')
    panel.save(public/f'{name}.png');board.paste(panel,(i*500,0))
    report.append({'name':name,'source_sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'preview_figure_height':height,'layout_box':[x,y,x+scaled.width,y+scaled.height]})
board.save(public/'comparison.png');board.save(root/'comparison.png')
(root/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'panels':len(report),'comparison_size':board.size,'transparent_inputs':True}))
