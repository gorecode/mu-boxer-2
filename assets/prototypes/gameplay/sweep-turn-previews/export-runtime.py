from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/art/fight'
manifest_path = public / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
assert len(manifest['boxer']) in (26, 28)
records = []
for index, name in enumerate(['a0', 'a1'], 26):
    source = root / f'frames/{name}.png'
    target = public / f'boxer-{index}.webp'
    image = Image.open(source).convert('RGBA')
    assert image.size == (840, 550)
    image.save(target, lossless=True, exact=True, method=6)
    assert image.tobytes() == Image.open(target).convert('RGBA').tobytes()
    frame = dict(width=840, height=550, anchorX=380, anchorY=485, scale=1.19)
    if index < len(manifest['boxer']):
        manifest['boxer'][index] = frame
    else:
        manifest['boxer'].append(frame)
    records.append(dict(source=str(source.relative_to(project)),
                        source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                        runtime=str(target.relative_to(project)),
                        runtime_sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps(records, indent=2) + '\n')
print('Two selected rear views match runtime WebP RGBA exactly.')
