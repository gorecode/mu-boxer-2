from array import array
from collections import deque
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent
OUTPUT = ROOT / 'scene-lab/public/art/fight'
OUTPUT.mkdir(parents=True, exist_ok=True)
Image.open(SOURCE / 'fight-arena-source.png').convert('RGB').save(OUTPUT / 'arena.webp', quality=91)
manifest = {}
for name, anchors, baselines in [
    ('boxer', [178, 530, 890, 1245, 177, 530, 890, 1250], [514]*4 + [1066, 1066, 1066, 915]),
    ('worker', [180, 540, 920, 1275, 215, 575, 935, 1270], [528]*4 + [1050]*4),
]:
    im = Image.open(SOURCE / f'fight-{name}-source.png').convert('RGBA')
    w, h = im.size
    alpha = im.getchannel('A').tobytes()
    labels = array('i', [0]) * (w*h)
    objects = []
    component = 0
    for seed in range(w*h):
        if labels[seed] or alpha[seed] < 24:
            continue
        component += 1
        labels[seed] = component
        queue = deque([seed])
        points = []
        while queue:
            p = queue.popleft()
            points.append(p)
            x, y = p % w, p // w
            for q in ([p-1] if x else []) + ([p+1] if x+1 < w else []) + ([p-w] if y else []) + ([p+w] if y+1 < h else []):
                if not labels[q] and alpha[q] >= 24:
                    labels[q] = component
                    queue.append(q)
        if len(points) > 12000:
            xs = [p % w for p in points]
            ys = [p // w for p in points]
            objects.append((min(xs), min(ys), max(xs)+1, max(ys)+1, component))
    assert len(objects) == 8, (name, objects)
    objects.sort(key=lambda r: (int((r[1]+r[3])/2 > h/2), r[0]))
    frames = []
    for idx, (x0, y0, x1, y1, component) in enumerate(objects):
        crop = im.crop((x0, y0, x1, y1))
        mask = bytes(alpha[y*w+x] if labels[y*w+x] == component else 0 for y in range(y0, y1) for x in range(x0, x1))
        crop.putalpha(Image.frombytes('L', crop.size, mask))
        crop.save(OUTPUT / f'{name}-{idx}.webp', quality=94, method=6)
        frames.append({'width': x1-x0, 'height': y1-y0, 'anchorX': anchors[idx]-x0, 'anchorY': baselines[idx]-y0})
        print(name, idx, (x0, y0, x1, y1), frames[-1])
    manifest[name] = frames
for name, anchors, baselines, scales in [
    ('boxer', [410, 1280, 440, 1320], [442, 442, 882, 875], [1.12, 1.2, 1.37, .88]),
    ('worker', [470, 1390, 455, 1310], [420, 420, 882, 855], [1.15, 1.1, 1.3, .88]),
]:
    for frame in manifest[name]:
        frame['scale'] = 1.22 if name == 'worker' else 1.19
    im = Image.open(SOURCE / f'fight-{name}-extra-source.png').convert('RGBA')
    w, h = im.size
    for i in range(4):
        x0, y0 = i % 2 * (w // 2), i // 2 * (h // 2)
        rect = (x0, y0, (i % 2 + 1) * (w // 2), h if i > 1 else h // 2)
        cell = im.crop(rect)
        bbox = cell.getchannel('A').point(lambda value: 255 if value >= 24 else 0).getbbox()
        assert bbox and (bbox[2]-bbox[0]) * (bbox[3]-bbox[1]) > 10000
        crop = cell.crop(bbox)
        crop.save(OUTPUT / f'{name}-{i+8}.webp', quality=94, method=4)
        manifest[name].append({'width': crop.width, 'height': crop.height,
            'anchorX': anchors[i] - x0 - bbox[0], 'anchorY': baselines[i] - y0 - bbox[1], 'scale': scales[i]})
        print(name, i+8, manifest[name][-1])
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
