from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageSequence
import json

root = Path(__file__).resolve().parent
capture = root / '.capture'
public = root.parents[3] / 'scene-lab/public/previews/boxer-walk'
public.mkdir(parents=True, exist_ok=True)
frames = [Image.open(p).convert('RGB') for p in sorted(capture.glob('[0-9][0-9][0-9][0-9].png'))]
assert len(frames) == 136
assert all(im.size == (1500, 600) for im in frames)
assert frames[0].tobytes() == frames[-1].tobytes()
sample = Image.new('RGB', (1500, 600 * 4))
for i, index in enumerate([0, 24, 30, 36]):
    sample.paste(frames[index], (0, i * 600))
palette = sample.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
delta = [indexed[0]]
for previous, current in zip(indexed, indexed[1:]):
    before = Image.frombytes('L', previous.size, previous.tobytes())
    after = Image.frombytes('L', current.size, current.tobytes())
    unchanged = ImageChops.difference(before, after).point(lambda p: 255 if p == 0 else 0)
    frame = current.copy()
    frame.paste(255, mask=unchanged)
    delta.append(frame)
report = {}
for name, ms in [('comparison.gif', 20), ('comparison-slow.gif', 80)]:
    path = public / name
    delta[0].save(path, save_all=True, append_images=delta[1:], duration=ms, loop=0, optimize=False, transparency=255, disposal=1)
    with Image.open(path) as gif:
        decoded = [(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(gif)]
        assert sum(t for _, t in decoded) == 136 * ms
        assert gif.info['loop'] == 0
        assert decoded[0][0].tobytes() == decoded[-1][0].tobytes()
        assert len(decoded) > 40
        clock = 0
        for frame, delay in decoded:
            for t in range(clock, clock + delay, ms):
                assert frame.tobytes() == indexed[t // ms].convert('RGB').tobytes()
            clock += delay
        report[name] = {'size': gif.size, 'decoded_frames': len(decoded), 'duration_ms': 136 * ms, 'bytes': path.stat().st_size}
frames[30].save(root / 'comparison.png')
board = Image.new('RGB', (1500, 600 * 5), '#241f29')
with Image.open(public / 'comparison.gif') as gif:
    for i, ms in enumerate([300, 420, 520, 600, 720]):
        elapsed = 0
        for f in ImageSequence.Iterator(gif):
            if elapsed + f.info['duration'] > ms:
                board.paste(f.convert('RGB'), (0, 600 * i))
                ImageDraw.Draw(board).text((10, 600 * i + 60), f'{ms} ms / decoded GIF', fill='white')
                break
            elapsed += f.info['duration']
board.save(capture / 'decoded-review.png')
(root / 'export-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
