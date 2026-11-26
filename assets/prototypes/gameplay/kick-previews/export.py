from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/kicks'
MASTER = PROJECT / 'assets/prototypes/gameplay/standing-uppercut-preview/one-inbetween/frames/idle.png'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
IDS = ['a-front', 'b-side', 'c-low']
TITLES = ['А · ПРЯМОЙ В КОРПУС', 'Б · БОКОВОЙ ПЯТКОЙ', 'В · ЛОУ-КИК ПО БЕДРУ']
DURATIONS = [560, 80, 120, 40, 800]
SCHEDULE = ['idle', 'chamber', 'contact', 'chamber', 'idle']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def silhouette(image):
    return image.getchannel('A').point(lambda a: 255 if a >= 128 else 0)


def support(image):
    mask = silhouette(image)
    bounds = mask.getbbox()
    if not bounds:
        raise ValueError('Empty sprite')
    band = mask.crop((0, bounds[3] - 12, image.width, bounds[3])).getbbox()
    if not band or band[2] - band[0] < 20:
        raise ValueError('Missing boot sole')
    return round((band[0] + band[2]) / 2), bounds[3]


def target_foot(master, front):
    x, y, right, bottom = (230, 470, 365, 530) if front else (50, 470, 155, 530)
    foot = master.crop((x, y, right, bottom))
    foot_x, foot_y = support(foot)
    return foot_x + x + 40, foot_y + y + 37


def register(part, target):
    scale = 550 / part.height
    sprite = part.resize((round(part.width * scale), 550), Image.Resampling.LANCZOS)
    foot = support(sprite)
    offset = (target[0] - foot[0], target[1] - foot[1])
    bounds = silhouette(sprite).getbbox()
    placed = [bounds[0] + offset[0], bounds[1] + offset[1], bounds[2] + offset[0], bounds[3] + offset[1]]
    if min(placed[:2]) < 2 or placed[2] > 638 or placed[3] > 598:
        raise ValueError(f'Clipped sprite: {placed}')
    frame = Image.new('RGBA', (640, 600))
    frame.alpha_composite(sprite, offset)
    return frame, {'scale': scale, 'offset': offset, 'support_before': foot, 'support_after': target, 'bounds': placed}


def panel(background, sprite, index, key, returning=False):
    frame = background.copy().convert('RGBA')
    draw = ImageDraw.Draw(frame)
    draw.ellipse((90, 623, 437, 641), fill='#120c16a0')
    frame.alpha_composite(sprite, (0, 70))
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, 640, 71), fill='#21191f')
    draw.text((18, 14), TITLES[index], font=ImageFont.truetype(FONT, 19), fill='#f2d1b6')
    draw.text((18, 44), 'СТОЙКА + 2 НОВЫХ РИСУНКА · ЭСКИЗ', font=ImageFont.truetype(FONT, 13), fill='#bca7a4')
    draw.rectangle((0, 672, 640, 700), fill='#21191f')
    label = 'ВОЗВРАТ · 40 мс' if returning else {
        'idle': 'ИСХОДНАЯ СТОЙКА', 'chamber': 'ПОДГОТОВКА · 80 мс', 'contact': 'КОНТАКТ · 120 мс',
    }[key]
    draw.text((18, 679), label, font=ImageFont.truetype(FONT, 13), fill='#ffdf9c' if key == 'contact' else '#bca7a4')
    return frame.convert('RGB')


def encode(path, frames, palette, multiplier):
    if len(frames) != 5 or multiplier not in (1, 4):
        raise ValueError('Expected five states and speed1 or4')
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[d * multiplier for d in DURATIONS], loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        decoded = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        times = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
        assert gif.info['loop'] == 0 and times == [d * multiplier for d in DURATIONS]
    assert len(decoded) == 5 and decoded[0].tobytes() == decoded[-1].tobytes()
    assert decoded[0].tobytes() != decoded[1].tobytes() != decoded[2].tobytes()
    return decoded


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    frames_dir = ROOT / 'frames'
    frames_dir.mkdir(exist_ok=True)
    master_hash = sha(MASTER)
    master = Image.open(MASTER).convert('RGBA')
    idle = Image.new('RGBA', (640, 600))
    idle.alpha_composite(master, (40, 37))
    assert idle.crop((40, 37, 540, 587)).tobytes() == master.tobytes()
    idle.save(frames_dir / 'idle.png')
    background = Image.open(PROJECT / 'scene-lab/public/art/fight/arena.webp').convert('RGB')
    background = background.resize((1244, 700)).crop((300, 0, 940, 700))
    background = Image.blend(background, Image.new('RGB', (640, 700), '#1d141b'), .38)
    variants, records = [], {}
    for index, name in enumerate(IDS):
        source = ROOT / f'inputs/{name}.png'
        strip = Image.open(source).convert('RGBA')
        assert abs(strip.width / strip.height - 1000 / 550) < .02
        assert strip.getchannel('A').getextrema() == (0, 255)
        target = target_foot(master, name == 'c-low')
        sprites, registration = {'idle': idle}, {}
        for cell, key in enumerate(['chamber', 'contact']):
            part = strip.crop((round(strip.width * cell / 2), 0, round(strip.width * (cell + 1) / 2), strip.height))
            sprite, registration[key] = register(part, target)
            sprites[key] = sprite
            sprite.save(frames_dir / f'{name}-{key}.png')
        variants.append([panel(background, sprites[key], index, key, state == 3) for state, key in enumerate(SCHEDULE)])
        records[name] = {'source_sha256': sha(source), 'support_leg': 'lead' if name == 'c-low' else 'rear',
                         'registration': registration, 'frames_sha256': {key: sha(frames_dir / f'{name}-{key}.png') for key in registration}}
    atlas = Image.new('RGB', (1920, 2100))
    for col, frames in enumerate(variants):
        for row in range(3):
            atlas.paste(frames[row], (640 * col, 700 * row))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    comparison = []
    for state in range(5):
        frame = Image.new('RGB', (1920, 700))
        for col, frames in enumerate(variants):
            frame.paste(frames[state], (640 * col, 0))
        comparison.append(frame)
    for name, frames in [('comparison', comparison), *zip(IDS, variants)]:
        decoded = encode(PUBLIC / f'{name}.gif', frames, palette, 1)
        encode(PUBLIC / f'{name}-slow.gif', frames, palette, 4)
        if name == 'comparison':
            sheet = Image.new('RGB', (1920, 2100))
            for row in range(3):
                sheet.paste(decoded[row], (0, 700 * row))
            sheet.save(PUBLIC / 'decoded-sheet.png')
    assert sha(MASTER) == master_hash
    report = {'master_sha256': master_hash, 'new_drawings_per_variant': 2, 'unique_drawings_per_variant': 3,
              'durations_ms': DURATIONS, 'schedule': SCHEDULE, 'variants': records,
              'gif_sha256': {p.name: sha(p) for p in sorted(PUBLIC.glob('*.gif'))}}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('3 kick drafts, 8 GIFs decoded at1x/4x, original idle preserved, support soles registered')


if __name__ == '__main__':
    main()
