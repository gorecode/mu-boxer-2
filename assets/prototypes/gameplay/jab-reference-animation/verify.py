import hashlib,json,math
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent
folder=root
frames=[Image.open(p).convert('RGBA') for p in sorted((folder/'frames').glob('*.png'))]
assert len(frames)==18
base=frames[0]; report={'frames':len(frames),'immutable_regions':{},'tips':[]}
assert all(im.size==(500,530) for im in frames)
assert all(im.getextrema()[3]==(0,255) for im in frames)
assert frames[-1].tobytes()==base.tobytes(),'loop boundary differs from original idle'
for name,rect in [('lower_body',(0,220,500,530))]:
 ref=base.crop(rect).tobytes();assert all(im.crop(rect).tobytes()==ref for im in frames),name
 report['immutable_regions'][name]=hashlib.sha256(ref).hexdigest()
face=[(x,y) for y in range(0,92) for x in range(126,220) if base.getpixel((x,y))[3]>=250]
assert face
assert all(im.getpixel(p)==base.getpixel(p) for im in frames for p in face),'opaque face artwork changed'
report['immutable_regions']['face_pixels']=len(face)
for im in frames:
 for rect in [(0,0,175,530),(400,0,500,530),(0,0,500,60),(0,210,500,530)]:
  assert im.crop(rect).tobytes()==base.crop(rect).tobytes(),f'changes outside moving arm region: {rect}'
for im in frames:
 alpha=im.getchannel('A');tip=max(x for y in range(60,210) for x in range(500) if alpha.getpixel((x,y))>=128)-164
 report['tips'].append(round(tip*1.19,5))
assert max(report['tips'])<=257,'hand extends beyond original contact reach'
assert report['tips'][0]==report['tips'][-1]
assert report['tips'][:5]==sorted(report['tips'][:5]),'fist reverses before full extension'
assert report['tips'][8:]==sorted(report['tips'][8:],reverse=True),'fist moves forward again during return'
assert all(frames[i].tobytes()==frames[4].tobytes() for i in [5,6,7]),'contact hold is not stable'
assert frames[8].tobytes()!=frames[4].tobytes(),'first recovery frame still uses contact pose'
m=json.loads((folder/'metadata.json').read_text())
for sample in m['samples']:
 j=sample['joints'];lens=j['lengths']
 for i,(a,b) in enumerate([('s','e'),('e','w')]):assert abs(math.dist(j[a],j[b])-lens[i])<1e-6
 assert all(n<=limit+1e-7 for n,limit in zip(lens,m['lengths']))
report['max_tip']=max(report['tips']);report['contact_hold_ms']=80;report['total_move_ms']=340
(folder/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
# Native-size export avoids an extra resample of the original ink texture.
captures=sorted((folder/'.capture/in-arena').glob('*.png'))
if captures:
    from PIL import ImageChops,ImageDraw
    assert len(captures)==61
    masks={}
    for name,rect in [('face',(126,0,220,92)),('body_interior',(1,220,279,491))]:
        mask=Image.new('L',(650,665));draw=ImageDraw.Draw(mask);points=[]
        for y in range(rect[1],rect[3]):
            for x in range(rect[0],rect[2]):
                if base.getpixel((x,y))[3]>=250:
                    points.append((int(260+(x+.5-164)*1.19),int(645+(y+.5-495)*1.19)))
        assert len(points)>1000
        for p in points:draw.point(p,fill=255)
        masks[name]=mask.convert('RGB')
    initial=Image.open(captures[0]).convert('RGB')
    game_deltas={name:0 for name in masks}
    for path in captures:
        difference=ImageChops.difference(initial,Image.open(path).convert('RGB'))
        for name,mask in masks.items():
            delta=max(high for low,high in ImageChops.multiply(difference,mask).getextrema())
            game_deltas[name]=max(game_deltas[name],delta)
            assert delta<=(1 if name=='face' else 0),f'in-game {name} changed: {path.name}'
    report['in_game_max_channel_delta']=game_deltas
    (folder/'verification.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Native game pixel comparison:',game_deltas)
