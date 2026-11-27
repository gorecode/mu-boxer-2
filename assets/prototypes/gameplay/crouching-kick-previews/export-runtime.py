from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/art/fight'
manifest_path = public / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
assert len(manifest['boxer']) in (21, 25)
records = []
for name, first in [('a-straight', 21), ('c-sweep', 23)]:
    for i, key in enumerate(['chamber', 'contact']):
        source = root / f'frames/{name}-{key}.png'
        image = Image.open(source).convert('RGBA')
        target = public / f'boxer-{first + i}.webp'
        image.save(target, lossless=True, exact=True, method=6)
        assert image.size == (640, 550)
        assert image.tobytes() == Image.open(target).convert('RGBA').tobytes()
        frame = dict(width=640, height=550, anchorX=240, anchorY=485, scale=1.19)
        if first + i < len(manifest['boxer']):
            manifest['boxer'][first + i] = frame
        else:
            manifest['boxer'].append(frame)
        records.append(dict(source=str(source.relative_to(project)),
                            source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
                            runtime=str(target.relative_to(project)),
                            runtime_sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps(records, indent=2) + '\n')
print('Four chosen crouching kick PNGs match runtime WebP RGBA exactly.')
