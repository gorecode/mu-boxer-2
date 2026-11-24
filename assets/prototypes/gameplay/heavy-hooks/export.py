from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
public = project / 'scene-lab/public/art/fight'
records = []
for pose, name in [(12, 'left'), (13, 'right-b')]:
    source = root / f'frames/{name}.png'
    original = Image.open(source).convert('RGBA')
    target = public / f'boxer-{pose}.webp'
    original.save(target, lossless=True, exact=True, method=6)
    decoded = Image.open(target).convert('RGBA')
    assert original.size == decoded.size == (500, 530)
    assert original.tobytes() == decoded.tobytes()
    records.append({'pose': pose, 'name': name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'runtime_sha256': hashlib.sha256(target.read_bytes()).hexdigest(),
                    'rgba_sha256': hashlib.sha256(decoded.tobytes()).hexdigest(), 'rgba_matches_preview': True})
manifest_path = public / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['boxer'] = manifest['boxer'][:12] + [dict(width=500, height=530, anchorX=228, anchorY=495, scale=1.19) for _ in range(2)]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps({'source_commit': '4957c56cd1df4a4f2ad69b6429d5de5aa3c0033c', 'frames': records}, indent=2) + '\n')
print('Two lossless WebP contacts match the author-selected preview pixels exactly')
