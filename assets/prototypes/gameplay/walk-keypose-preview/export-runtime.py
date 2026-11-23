from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
output = project / 'scene-lab/public/art/fight/walk'
output.mkdir(exist_ok=True)
stage = json.loads((root / 'rig.json').read_text())['stage']
report = []
for i in range(4):
    source = root / f'frames/{i}.png'
    target = output / f'walk-{i}.webp'
    image = Image.open(source).convert('RGBA')
    assert image.size == (stage['width'], stage['height'])
    image.save(target, lossless=True, exact=True)
    assert Image.open(target).convert('RGBA').tobytes() == image.tobytes()
    report.append({'frame': i, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                   'runtime_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'rgba_matches_preview': True})
manifest = project / 'scene-lab/public/art/fight/manifest.json'
data = json.loads(manifest.read_text())
data['walk'] = [stage.copy() for _ in range(4)]
manifest.write_text(json.dumps(data, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
