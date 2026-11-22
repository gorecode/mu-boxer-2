from pathlib import Path
from PIL import Image, ImageDraw, ImageSequence
import json

root = Path(__file__).resolve().parent
captures = root / '.capture'
variants = {name: [Image.open(p).convert('RGB') for p in sorted((captures / name).glob('*.png'))]
            for name in ['legacy', 'smooth', 'hybrid']}
assert all(len(frames) == 61 for frames in variants.values())
assert all(im.size == (650, 665) for frames in variants.values() for im in frames)
comparison = []
for i in range(61):
    image = Image.new('RGB', (1950, 695), (30, 25, 28))
    draw = ImageDraw.Draw(image)
    for j, (name, label) in enumerate([('legacy', 'ORIGINAL / 2 POSES'), ('smooth', 'SMOOTH / 18 FRAMES'), ('hybrid', 'HYBRID / +2 IN-BETWEENS')]):
        image.paste(variants[name][i], (j * 650, 30))
        draw.text((j * 650 + 12, 8), label, fill='white')
    comparison.append(image)
palette = comparison[18].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
report = {}
for name, images in [('hybrid', variants['hybrid']), ('comparison', comparison)]:
    images[0].save(root / f'{name}.webp', save_all=True, append_images=images[1:], duration=20, lossless=True, loop=0)
    indexed = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in images]
    for suffix, ms in [('', 20), ('-slow', 80)]:
        target = captures / f'{name}{suffix}.gif'
        indexed[0].save(target, save_all=True, append_images=indexed[1:], duration=ms, loop=0, optimize=False)
        with Image.open(target) as gif:
            states = [(frame.convert('RGB').copy(), frame.info['duration']) for frame in ImageSequence.Iterator(gif)]
            assert sum(t for _, t in states) == 61 * ms
            assert states[0][0].tobytes() == states[-1][0].tobytes()
            assert gif.info['loop'] == 0
            report[target.name] = {'decoded_states': len(states), 'duration_ms': 61 * ms, 'size': gif.size}
        if name == 'hybrid' and not suffix:
            board = Image.new('RGB', (650 * len(states), 690), (30, 25, 28))
            draw = ImageDraw.Draw(board)
            clock = 0
            for i, (frame, ms) in enumerate(states):
                board.paste(frame, (i * 650, 25)); draw.text((i * 650 + 10, 5), f'{clock} ms', fill='white'); clock += ms
            board.save(captures / 'decoded-states.png')
comparison[18].save(root / 'contact-comparison.png')
(root / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
