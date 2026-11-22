from pathlib import Path
from PIL import Image, ImageDraw, ImageChops
import hashlib
import json

root = Path(__file__).resolve().parent
frames = [Image.open(root / f'frames/{i}.png').convert('RGBA') for i in range(4)]
assert all(f.size == (500, 530) for f in frames)
assert len({f.tobytes() for f in frames}) == 4
unchanged = []
bounds = []
for i, (frame, drop) in enumerate(zip(frames, [0, 4, 8, 4])):
    original = frames[0].crop((0, 0, 500, 218))
    upper = frame.crop((0, drop, 500, 218 + drop))
    difference = ImageChops.difference(original, upper)
    assert all(channel.getextrema() == (0, 0) for channel in difference.split())
    opaque = sum(a >= 250 for a in original.getchannel('A').getdata())
    assert opaque > 15000
    unchanged.append({'pose': i, 'upper_drop_px': drop, 'identical_upper_pixels_alpha_ge_250': opaque})
    alpha = frame.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    bound = alpha.getbbox()
    assert bound is not None
    assert 2 <= bound[0] < bound[2] <= 498
    assert 0 <= bound[1] < bound[3] <= 498
    left = alpha.crop((0, 440, 210, 510)).getbbox()
    right = alpha.crop((230, 440, 500, 510)).getbbox()
    assert left is not None and right is not None
    assert left[3] >= 45 or right[3] >= 40
    bounds.append({'pose': i, 'alpha_bounds': bound, 'rear_sole_y': 440 + left[3], 'front_sole_y': 440 + right[3]})
board = Image.new('RGB', (2000, 570), '#2c2730')
draw = ImageDraw.Draw(board)
labels = ['STANCE', 'LEAD TRANSFER', 'WIDE SUPPORT', 'REAR RECOVERY']
for i, frame in enumerate(frames):
    board.paste(frame, (i * 500, 25), frame)
    draw.text((i * 500 + 20, 8), f'{i}: {labels[i]}', fill='white')
    draw.line((i * 500, 520, i * 500 + 499, 520), fill='#c29c81')
board.save(root / 'contact-sheet.png')
report = {
    'source_sha256': hashlib.sha256((root.parents[3] / 'scene-lab/public/art/fight/boxer-0.webp').read_bytes()).hexdigest(),
    'method': 'native texture rig; original face, guard, clothes and boots; no generated pixels',
    'registration': json.loads((root / 'rig.json').read_text()),
    'upper_body': unchanged,
    'bounds': bounds,
    'limits': 'Feet agree with support anchors at key poses. Continuous root movement during held sprites still produces sliding between keys, especially with two drawings.',
}
(root / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
