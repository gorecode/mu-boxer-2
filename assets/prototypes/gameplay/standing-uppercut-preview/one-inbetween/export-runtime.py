from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent
public = root.parents[4] / 'scene-lab/public/art/fight'
manifest_path = public / 'manifest.json'
manifest = json.loads(manifest_path.read_text())
manifest['boxer'] = manifest['boxer'][:14]
records = []
for pose, name in [(14, 'intermediate'), (15, 'contact')]:
    source = root / f'frames/{name}.png'
    original = Image.open(source).convert('RGBA')
    target = public / f'boxer-{pose}.webp'
    original.save(target, lossless=True, exact=True, method=6)
    decoded = Image.open(target).convert('RGBA')
    assert original.size == decoded.size == (500, 550)
    assert original.tobytes() == decoded.tobytes()
    manifest['boxer'].append(dict(width=500, height=550, anchorX=228, anchorY=525, scale=1.19))
    alpha = original.getchannel('A')
    fist = [(x, y) for y in range(60, 150) for x in range(290, 350) if alpha.getpixel((x, y)) >= 128]
    assert len(fist) > 100
    tip = (max(x for x, y in fist) - 228) * 1.19
    records.append({'pose': pose, 'name': name, 'source_sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                    'runtime_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'rgba_matches_preview': True,
                    'visible_tip': tip, 'contact_padding': 150 - tip if pose == 15 else None})
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
(root / 'runtime-assets.json').write_text(json.dumps({'source_commit': '5ebeecbe7145bf75ccd4bc9f533a95dafd38542d', 'frames': records}, indent=2) + '\n')
print('Two runtime WebP sprites match the selected preview exactly:', records)
