from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
source = root / 'frames/heel-slide.png'
target = project / 'scene-lab/public/art/fight/boxer-20.webp'
manifest_path = target.with_name('manifest.json')
manifest = json.loads(manifest_path.read_text())
assert len(manifest['boxer']) in (20, 21)
original = Image.open(source).convert('RGBA')
original.save(target, lossless=True, exact=True, method=6)
decoded = Image.open(target).convert('RGBA')
assert original.size == decoded.size == (640, 600)
assert original.tobytes() == decoded.tobytes()
frame = dict(width=640, height=600, anchorX=268, anchorY=556, scale=1.19)
if len(manifest['boxer']) == 20:
    manifest['boxer'].append(frame)
else:
    manifest['boxer'][20] = frame
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
alpha = original.getchannel('A')
boot = [(x, y) for y in range(465, 558) for x in range(480, 545) if alpha.getpixel((x, y)) >= 128]
assert len(boot) > 100
tip = (max(x for x, _ in boot) - frame['anchorX']) * frame['scale']
padding = 332 - tip
assert 12 <= padding <= 24
record = dict(pose=20, source=str(source.relative_to(project)), source_commit='633cd547972788b450cb599f8dc56a72493d5c9f',
              source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
              runtime_sha256=hashlib.sha256(target.read_bytes()).hexdigest(), rgba_matches_preview=True,
              boot_roi=[480, 465, 545, 558], visible_tip=tip, contact_padding=padding,
              visible_bottom=(frame['anchorY'] - max(y for _, y in boot)) * frame['scale'],
              visible_top=(frame['anchorY'] - min(y for _, y in boot)) * frame['scale'])
(root / 'runtime-assets.json').write_text(json.dumps(record, indent=2) + '\n')
print('Slide RGBA matches approved preview; sole registered; heel padding12..24 world pixels')
