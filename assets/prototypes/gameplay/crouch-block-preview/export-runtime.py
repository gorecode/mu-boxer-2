from pathlib import Path
import hashlib
import json
from PIL import Image

root = Path(__file__).resolve().parent
project = root.parents[3]
source = root / 'frames/a-shell.png'
target = project / 'scene-lab/public/art/fight/boxer-25.webp'
manifest_path = target.with_name('manifest.json')
manifest = json.loads(manifest_path.read_text())
assert len(manifest['boxer']) in (25, 26)
original = Image.open(source).convert('RGBA')
assert original.size == (500, 550)
assert original.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()[3] == 524
original.save(target, lossless=True, exact=True, method=6)
assert original.tobytes() == Image.open(target).convert('RGBA').tobytes()
frame = dict(width=500, height=550, anchorX=228, anchorY=525, scale=1.19)
if len(manifest['boxer']) == 25:
    manifest['boxer'].append(frame)
else:
    manifest['boxer'][25] = frame
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
record = dict(pose=25, source=str(source.relative_to(project)),
              source_commit='5d8268b', source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
              runtime=str(target.relative_to(project)), runtime_sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
              rgba_matches_preview=True, frame=frame)
(root / 'runtime-assets.json').write_text(json.dumps(record, indent=2) + '\n')
print('Crouching guard A: runtime RGBA matches selected PNG; sole and anchor preserved.')
