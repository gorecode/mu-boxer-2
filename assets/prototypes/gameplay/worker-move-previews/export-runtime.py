from pathlib import Path
import hashlib
import json

from PIL import Image

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
ART = PROJECT / 'scene-lab/public/art/fight'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    source = ROOT / 'frames/shove-contact.png'
    output = ART / 'worker-12.webp'
    image = Image.open(source).convert('RGBA')
    assert image.size == (500, 550)
    bounds = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    assert bounds and abs(bounds[3] - 525) <= 2
    originals = {p.name: sha(p) for p in ART.glob('worker-*.webp') if p.name != output.name}
    assert len(originals) == 12
    image.save(output, lossless=True, exact=True)
    assert Image.open(output).convert('RGBA').tobytes() == image.tobytes()
    manifest_path = ART / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    assert len(manifest['worker']) in (12, 13)
    registration = {'width': 500, 'height': 550, 'anchorX': 228, 'anchorY': 525, 'scale': 1.22}
    manifest['worker'][12:] = [registration]
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    assert all(sha(ART / name) == digest for name, digest in originals.items())
    report = {'source': str(source.relative_to(PROJECT)), 'source_sha256': sha(source),
              'runtime': str(output.relative_to(PROJECT)), 'runtime_sha256': sha(output),
              'registration': registration, 'opaque_bounds': bounds, 'unchanged_worker_sha256': originals,
              'low_high_existing_poses': [7, 9, 7, 3, 8, 7, 0]}
    (ROOT / 'runtime-assets.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Selected shove RGBA preserved; worker manifest 13; original 12 worker drawings unchanged')


if __name__ == '__main__':
    main()
