from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import importlib.util
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('body_turn', ROOT.parent / 'body-turn/export.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
PUBLIC = preview.base.PUBLIC / 'one-inbetween'
DURATIONS = [560, 40, 140, 20, 840]
SCHEDULE = ['idle', 'intermediate', 'contact', 'intermediate', 'idle']


def panel(sprite, index, key):
    preview.base.TITLES = ['ЦВЕТА ИЗ СТОЙКИ · 2 РИСУНКА', '+1 ПРОМЕЖУТОЧНЫЙ · 3 РИСУНКА']
    frame = preview.panel(sprite, index, key == 'contact')
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 38, 420, 70), fill='#21191f')
    draw.text((15, 43), 'ТОТ ЖЕ КОНТАКТ · ОДИН НОВЫЙ РИСУНОК', font=ImageFont.truetype(preview.base.FONT, 11), fill='#bca7a4')
    draw.rectangle((0, 596, 420, 620), fill='#21191f')
    label = {'idle': 'СТОЙКА', 'intermediate': 'ПРОМЕЖУТОЧНЫЙ', 'contact': 'КОНТАКТ · 140 мс'}[key]
    draw.text((15, 601), label, font=ImageFont.truetype(preview.base.FONT, 12), fill='#ffdf9c' if key == 'contact' else '#bca7a4')
    return frame


def encode(path, frames, palette, speed=1):
    if len(frames) != 5 or speed not in (1, 4):
        raise ValueError('Expected five timeline states and speed 1 or 4')
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=[d * speed for d in DURATIONS], loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        states = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
    assert durations == [d * speed for d in DURATIONS]
    assert states[0].tobytes() == states[-1].tobytes()
    assert states[1].tobytes() == states[3].tobytes()
    return states


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    frames_dir = ROOT / 'frames'
    frames_dir.mkdir(exist_ok=True)
    raw = preview.register(Image.open(ROOT / 'inputs/intermediate.png'), [7, 0])
    raw.save(frames_dir / 'intermediate-raw.png')
    subprocess.run(['node', str(ROOT.parent / 'color-match/build.mjs'), str(ROOT / 'color-settings.json')], check=True)
    for key, source in [('idle', ROOT.parent / 'body-turn/frames/idle.png'), ('contact', ROOT.parent / 'color-match/frames/contact.png')]:
        shutil.copyfile(source, frames_dir / f'{key}.png')
    sprites = {key: Image.open(frames_dir / f'{key}.png').convert('RGBA') for key in set(SCHEDULE)}
    old_keys = ['contact' if k == 'contact' else 'idle' for k in SCHEDULE]
    old = [panel(sprites[key], 0, key) for key in old_keys]
    new = [panel(sprites[key], 1, key) for key in SCHEDULE]
    palette = preview.base.palette_for([*old[:3], *new[:3]])
    comparison = []
    for left, right in zip(old, new):
        frame = Image.new('RGB', (840, 620))
        frame.paste(left, (0, 0))
        frame.paste(right, (420, 0))
        comparison.append(frame)
    decoded = encode(PUBLIC / 'comparison.gif', comparison, palette)
    encode(PUBLIC / 'comparison-slow.gif', comparison, palette, 4)
    encode(PUBLIC / 'uppercut.gif', new, palette)
    encode(PUBLIC / 'uppercut-slow.gif', new, palette, 4)
    sheet = Image.new('RGB', (840, 1860))
    for row, frame in enumerate(decoded[:3]):
        sheet.paste(frame, (0, 620 * row))
    sheet.save(ROOT / 'decoded-sheet.png')
    sheet.save(PUBLIC / 'decoded-sheet.png')
    report = {'durations_ms': DURATIONS, 'schedule': SCHEDULE, 'offset': [7, 0], 'added_drawings': 1,
              'source_sha256': preview.base.sha(ROOT / 'inputs/intermediate.png'),
              'frames': {k: preview.base.sha(frames_dir / f'{k}.png') for k in sprites},
              'gif_sha256': preview.base.sha(PUBLIC / 'comparison.gif')}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Three drawings, same 600ms contact start and 140ms contact hold; decoded both speeds')


if __name__ == '__main__':
    main()
