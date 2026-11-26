from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import importlib.util
import json

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('uppercut_base', ROOT.parent / 'export.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PUBLIC = base.PUBLIC / 'body-turn'
IDS = ['a-shoulder', 'b-transfer', 'c-rising']
base.TITLES = ['1 · ДОВОРОТ ПЛЕЧА', '2 · ПЕРЕНОС ВЕСА', '3 · ВОСХОДЯЩИЙ']
DURATIONS = [600, 140, 860]
REGISTRATION = {
    'a-shoulder': {'offset': [-5, 4], 'intent': 'both feet planted'},
    'b-transfer': {'offset': [-3, 9], 'intent': 'weight transfer, small rear pivot'},
    'c-rising': {'offset': [7, 10], 'intent': 'rear heel raised, front foot planted'},
}


def register(source, offset):
    source = source.convert('RGBA')
    if abs(source.width / source.height - 500 / 550) > .005:
        raise ValueError('Source must preserve the reference canvas ratio')
    box = source.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box or box[3] - box[1] < source.height * .6:
        raise ValueError('Missing full-body contact')
    frame = Image.new('RGBA', (500, 550))
    frame.alpha_composite(source.resize((500, 550), Image.Resampling.LANCZOS), tuple(offset))
    bounds = frame.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not bounds or min(bounds[:2]) < 2 or bounds[2] > 498 or bounds[3] > 548:
        raise ValueError('Contact is clipped')
    return frame


def panel(sprite, index, contact):
    frame = base.panel(sprite, index, contact)
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 38, 420, 70), fill='#21191f')
    draw.text((15, 43), 'КОРПУС И ГОЛОВА · КЛЮЧЕВЫЕ ПОЗЫ', font=ImageFont.truetype(base.FONT, 12), fill='#bca7a4')
    draw.rectangle((0, 596, 420, 620), fill='#21191f')
    draw.text((15, 601), 'КОНТАКТ · 140 мс' if contact else 'ИСХОДНАЯ СТОЙКА', font=ImageFont.truetype(base.FONT, 12), fill='#ffdf9c' if contact else '#bca7a4')
    return frame


def encode(path, frames, palette, multiplier=1):
    if len(frames) != 3 or multiplier not in (1, 4):
        raise ValueError('Expected idle/contact/idle and normal or quarter speed')
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[d * multiplier for d in DURATIONS], loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        states = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
        assert gif.info['loop'] == 0
    assert durations == [d * multiplier for d in DURATIONS]
    assert len(states) == 3 and states[0].tobytes() == states[-1].tobytes()
    assert states[0].tobytes() != states[1].tobytes()
    return states


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (ROOT / 'frames').mkdir(exist_ok=True)
    idle = base.idle_frame()
    idle.save(ROOT / 'frames/idle.png')
    sequences, records = [], {}
    for i, name in enumerate(IDS):
        source = ROOT / 'inputs' / f'{name}.png'
        contact = register(Image.open(source), REGISTRATION[name]['offset'])
        contact.save(ROOT / 'frames' / f'{name}.png')
        sequences.append([panel(idle, i, False), panel(contact, i, True), panel(idle, i, False)])
        records[name] = dict(REGISTRATION[name], source_sha256=base.sha(source), frame_sha256=base.sha(ROOT / 'frames' / f'{name}.png'))
    palette = base.palette_for([f for seq in sequences for f in seq[:2]])
    comparisons = [Image.new('RGB', (1260, 620)) for _ in DURATIONS]
    sheet = Image.new('RGB', (1260, 1240))
    for i, name in enumerate(IDS):
        decoded = encode(PUBLIC / f'{name}.gif', sequences[i], palette)
        encode(PUBLIC / f'{name}-slow.gif', sequences[i], palette, 4)
        for j, frame in enumerate(sequences[i]):
            comparisons[j].paste(frame, (420 * i, 0))
        for j in range(2):
            sheet.paste(decoded[j], (420 * i, 620 * j))
        records[name]['gif_sha256'] = base.sha(PUBLIC / f'{name}.gif')
    encode(PUBLIC / 'comparison.gif', comparisons, palette)
    encode(PUBLIC / 'comparison-slow.gif', comparisons, palette, 4)
    sheet.save(PUBLIC / 'decoded-sheet.png')
    sheet.save(ROOT / 'decoded-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps({'durations_ms': DURATIONS, 'canvas': [500, 550],
        'idle_sha256': base.sha(base.ART / 'boxer-0.webp'), 'variants': records}, indent=2) + '\n')
    print('Rendered 3 full-body contacts; decoded 8 GIFs with shared palette')


if __name__ == '__main__':
    main()
