from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[4]
SOURCE = ROOT.parent / 'one-inbetween/frames'
PUBLIC = PROJECT / 'scene-lab/public/previews/standing-uppercut/hop'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
SIZE = (420, 680)
TIMES = [0, *range(520, 801, 20), 1600]
DURATIONS = [b - a for a, b in zip(TIMES, TIMES[1:])]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pose_at(t):
    if 560 <= t < 600 or 740 <= t < 760:
        return 'intermediate'
    return 'contact' if 600 <= t < 740 else 'idle'


def height_at(t):
    u = (t - 560) / 200
    return round(32 * 4 * u * (1 - u)) if 0 < u < 1 else 0


def panel(background, sprite, key, height, hop):
    frame = background.copy().convert('RGBA')
    draw = ImageDraw.Draw(frame)
    radius = 137 - round(height * .45)
    draw.ellipse((210 - radius, 628, 210 + radius, 647), fill='#120c16a0')
    frame.alpha_composite(sprite, (-18, 112 - height))
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, 420, 71), fill='#21191f')
    draw.text((15, 13), 'С НЕБОЛЬШИМ ПОДСКОКОМ' if hop else 'ТЕКУЩИЙ · НА ЗЕМЛЕ',
              font=ImageFont.truetype(FONT, 17), fill='#f2d1b6')
    draw.text((15, 43), 'ТЕ ЖЕ 3 РИСУНКА · ПОДЪЁМ ДО 32 px' if hop else 'ТЕ ЖЕ ТАЙМИНГИ · КОНТАКТ 140 мс',
              font=ImageFont.truetype(FONT, 11), fill='#bca7a4')
    draw.rectangle((0, 656, 420, 680), fill='#21191f')
    label = {'idle': 'СТОЙКА', 'intermediate': 'ПЕРЕХОД', 'contact': 'УДАР'}[key]
    draw.text((15, 661), label, font=ImageFont.truetype(FONT, 12), fill='#ffdf9c')
    return frame.convert('RGB')


def encode(path, frames, palette, multiplier):
    if len(frames) != len(DURATIONS) or multiplier not in (1, 4):
        raise ValueError('Invalid timeline or playback multiplier')
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[d * multiplier for d in DURATIONS], loop=0,
                    disposal=2, optimize=False)
    with Image.open(path) as gif:
        decoded = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        assert gif.info['loop'] == 0
        assert sum(f.info['duration'] for f in ImageSequence.Iterator(gif)) == 1600 * multiplier
    assert decoded[0].tobytes() == decoded[-1].tobytes()


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    files = {k: SOURCE / f'{k}.png' for k in ('idle', 'intermediate', 'contact')}
    before = {k: sha(p) for k, p in files.items()}
    sprites = {k: Image.open(p).convert('RGBA') for k, p in files.items()}
    assert all(s.size == (500, 550) for s in sprites.values())
    background = Image.open(PROJECT / 'scene-lab/public/art/fight/arena.webp').convert('RGB')
    background = background.resize((1209, 680)).crop((394, 0, 814, 680))
    background = Image.blend(background, Image.new('RGB', SIZE, '#1d141b'), .38)
    grounded, hop, comparison = [], [], []
    for t in TIMES[:-1]:
        key = pose_at(t)
        left = panel(background, sprites[key], key, 0, False)
        right = panel(background, sprites[key], key, height_at(t), True)
        pair = Image.new('RGB', (840, 680))
        pair.paste(left, (0, 0))
        pair.paste(right, (420, 0))
        grounded.append(left)
        hop.append(right)
        comparison.append(pair)
    atlas = Image.new('RGB', (840, 680 * len(comparison)))
    for i, frame in enumerate(comparison):
        atlas.paste(frame, (0, i * 680))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    for name, frames in [('comparison', comparison), ('uppercut', hop)]:
        encode(PUBLIC / f'{name}.gif', frames, palette, 1)
        encode(PUBLIC / f'{name}-slow.gif', frames, palette, 4)
    with Image.open(PUBLIC / 'comparison.gif') as gif:
        decoded = []
        clock = 0
        for f in ImageSequence.Iterator(gif):
            decoded.append((clock, f.info['duration'], f.convert('RGB').copy()))
            clock += f.info['duration']
    sheet = Image.new('RGB', (840, 2040))
    for row, t in enumerate([580, 660, 760]):
        frame = next(f for start, duration, f in decoded if start <= t < start + duration)
        sheet.paste(frame, (0, row * 680))
    sheet.save(PUBLIC / 'decoded-sheet.png')
    assert before == {k: sha(p) for k, p in files.items()}
    assert [pose_at(t) for t in (559, 560, 599, 600, 739, 740, 759, 760)] == [
        'idle', 'intermediate', 'intermediate', 'contact', 'contact', 'intermediate', 'intermediate', 'idle']
    assert [height_at(t) for t in (559, 560, 660, 760, 761)] == [0, 0, 32, 0, 0]
    report = {'new_drawings': 0, 'source_sha256': before, 'height_px': 32,
              'flight_ms': [560, 760], 'horizontal_shift_px': 0, 'scale': 1,
              'timeline': [{'t_ms': t, 'duration_ms': d, 'pose': pose_at(t), 'height_px': height_at(t)}
                           for t, d in zip(TIMES, DURATIONS)],
              'gif_sha256': {p.name: sha(p) for p in sorted(PUBLIC.glob('*.gif'))}}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('4 GIFs decoded: loops 1600/6400ms; 3 unchanged drawings; vertical hop only')


if __name__ == '__main__':
    main()
