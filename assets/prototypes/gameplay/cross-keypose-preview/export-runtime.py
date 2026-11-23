from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
project = root.parents[3]
source = root / 'frames/outgoing.png'
target = project / 'scene-lab/public/art/fight/cross-hybrid/cross-0.webp'
target.parent.mkdir(exist_ok=True)
image = Image.open(source).convert('RGBA')
assert image.size == (500,530)
image.save(target, lossless=True, exact=True)
assert Image.open(target).convert('RGBA').tobytes() == image.tobytes()
manifest = project / 'scene-lab/public/art/fight/manifest.json'
data = json.loads(manifest.read_text())
data['cross'] = [json.loads((root / 'stage.json').read_text())]
manifest.write_text(json.dumps(data,indent=2)+'\n')
report = {'variant':'one','source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
          'runtime_sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rgba_matches_preview':True}
(root / 'runtime-assets.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report))
