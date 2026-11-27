from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/art/fight'
manifest_path = public / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
assert len(manifest['boxer']) in (16, 20, 21, 25, 26, 28)
records = []
for kind, first, folder, name, commit, boot, edge in [
    ('leadKick', 16, root, 'a-front', 'a95e18282615afbf730e2d03318ebf4e51790514', (380, 190, 455, 335), 218),
    ('rearKick', 18, root / 'rear', 'a-rear-front', 'f33bf59ed563de1fdee8e5c80deaa45192be9276', (500, 200, 580, 340), 366),
]:
    for offset, key in enumerate(['chamber', 'contact']):
        source = folder / f'frames/{name}-{key}.png'
        original = Image.open(source).convert('RGBA')
        pose = first + offset
        target = public / f'boxer-{pose}.webp'
        original.save(target, lossless=True, exact=True, method=6)
        decoded = Image.open(target).convert('RGBA')
        assert original.size == decoded.size == (640, 600)
        assert original.tobytes() == decoded.tobytes()
        frame = dict(width=640, height=600, anchorX=268, anchorY=562, scale=1.19)
        if pose < len(manifest['boxer']):
            manifest['boxer'][pose] = frame
        else:
            manifest['boxer'].append(frame)
        record = dict(kind=kind, pose=pose, key=key, source_commit=commit,
                      source=str(source.relative_to(project)),
                      source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                      runtime_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
                      rgba_matches_preview=True)
        if key == 'contact':
            left, top, right, bottom = boot
            alpha = original.getchannel('A')
            pixels = [(x, y) for y in range(top, bottom) for x in range(left, right) if alpha.getpixel((x, y)) >= 128]
            assert len(pixels) > 100
            tip = (max(x for x, _ in pixels) - frame['anchorX']) * frame['scale']
            padding = edge - tip
            assert 12 <= padding <= 24
            record.update(boot_roi=boot, visible_tip=tip, contact_padding=padding,
                          visible_bottom=(frame['anchorY'] - max(y for _, y in pixels)) * frame['scale'],
                          visible_top=(frame['anchorY'] - min(y for _, y in pixels)) * frame['scale'])
        records.append(record)
assert len(manifest['boxer']) in (20, 21, 25, 26, 28)
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps({'frames': records}, indent=2) + '\n')
print('Four lossless runtime kick cels match the selected PNGs exactly; boot padding12..24 world pixels')
