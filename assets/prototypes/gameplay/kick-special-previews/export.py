"""Preview choreography only; does not define gameplay damage or input."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json
import math

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
ART = PROJECT / 'scene-lab/public/art/fight'
KICKS = ROOT.parent / 'kick-previews'
PUBLIC = PROJECT / 'scene-lab/public/previews/kick-specials'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
DT, LENGTH = 40, 2400
SIZE, STAGE_Y, GROUND = (800, 554), 58, 410
NAMES = ['double-piston', 'heel-slide']
TITLES = ['ДВОЙНОЙ ПОРШЕНЬ', 'ПОДКАТ ПЯТКОЙ']
KEYS = [0, 560, 640, 760, 840, 960, 1200, 1520, 2320]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ease(t, start, end):
    p = min(1., max(0., (t - start) / (end - start)))
    return 1 - (1 - p) ** 2


def load_sprites():
    manifest = json.loads((ART / 'manifest.json').read_text())
    paths = {'idle': KICKS / 'frames/idle.png',
             'lead-up': KICKS / 'frames/a-front-chamber.png',
             'lead-hit': KICKS / 'frames/a-front-contact.png',
             'rear-up': KICKS / 'rear/frames/a-rear-front-chamber.png',
             'rear-hit': KICKS / 'rear/frames/a-rear-front-contact.png'}
    sprites = {k: (Image.open(p).convert('RGBA'), (268, 562), 1.19) for k, p in paths.items()}
    raw_path = ROOT / 'source/heel-slide-generated.png'
    raw = Image.open(raw_path).convert('RGBA')
    # Scale from head/body landmarks, not the shortened pose's overall height.
    # 298px generated hair-to-chin becomes 86px, matching the approved idle head.
    scale, offset = .29, (100, 290)
    resized = raw.resize((round(raw.width * scale), round(raw.height * scale)), Image.Resampling.LANCZOS)
    slide = Image.new('RGBA', (640, 600))
    slide.alpha_composite(resized, offset)
    slide.save(ROOT / 'frames/heel-slide.png')
    sprites['slide'] = (slide, (268, 556), 1.19)
    paths['slide-raw'] = raw_path
    for key, who, index in [('crouch', 'boxer', 5), ('worker', 'worker', 0),
                            ('hurt', 'worker', 6), ('down', 'worker', 11)]:
        path = ART / f'{who}-{index}.webp'
        meta = manifest[who][index]
        sprites[key] = (Image.open(path).convert('RGBA'), (meta['anchorX'], meta['anchorY']), meta['scale'])
        paths[key] = path
    return sprites, paths, {'scale': scale, 'offset': offset, 'anchor': [268, 556],
                            'opaque_bounds': slide.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()}


def state(name, t):
    """All coordinates are world pixels, before the single preview render scale."""
    if name not in NAMES or t < 0 or t >= LENGTH:
        raise ValueError('Unknown move or timestamp outside the preview loop')
    if t >= 2080:
        return state(name, 0)
    if name == 'double-piston':
        hero, x = 'idle', 500
        if 560 <= t < 640:
            hero = 'lead-up'
        elif 640 <= t < 760:
            hero = 'lead-hit'
        elif 760 <= t < 800:
            hero = 'lead-up'
        elif 800 <= t < 840:
            hero = 'idle'
        elif 840 <= t < 920:
            hero = 'rear-up'
        elif 920 <= t < 1080:
            hero = 'rear-hit'
        elif 1080 <= t < 1120:
            hero = 'rear-up'
        wx = 740 + 120 * ease(t, 680, 920) + 200 * ease(t, 1000, 1280)
        worker = 'hurt' if 640 <= t < 1480 else 'worker'
        label = 'Первый контакт · короткий стоп' if 640 <= t < 760 else 'Второй контакт · сильный толчок' if 920 <= t < 1080 else 'Передняя → задняя нога'
        return {'hero': hero, 'x': x, 'wx': wx, 'worker': worker, 'lift': 0,
                'tilt': 0, 'spark': (t - 640 if 640 <= t < 760 else t - 920 if 920 <= t < 1080 else -1),
                'contact': (690, 485) if t < 920 else (840, 485), 'label': label}
    hero, x = 'idle', 380
    if 560 <= t < 640:
        hero = 'crouch'
    elif 640 <= t < 1120:
        hero = 'slide'
        x += 160 * ease(t, 640, 840) + 60 * ease(t, 880, 1120)
    elif t >= 1120:
        x = 600
        if t < 1280:
            hero = 'crouch'
    wx = 1000 + 110 * ease(t, 880, 1280)
    worker = 'worker' if t < 840 else 'hurt' if t < 1200 else 'down'
    p = max(0, min(1, (t - 880) / 320))
    return {'hero': hero, 'x': x, 'wx': wx, 'worker': worker,
            'lift': 90 * math.sin(math.pi * p) if worker == 'hurt' else 0,
            'tilt': 85 * p if worker == 'hurt' else 0,
            'spark': t - 840 if 840 <= t < 960 else -1,
            'contact': (850, 790), 'label': 'Пятка по голеням → подсечка' if 840 <= t < 1200 else 'Низкий вход · скольжение · возврат'}


def actor(canvas, sprites, key, x, lift=0, angle=0):
    im, anchor, scale = sprites[key]
    factor = scale * .5
    scaled = im.resize((round(im.width * factor), round(im.height * factor)), Image.Resampling.LANCZOS)
    px, py = round(x * .5 - anchor[0] * factor), round(GROUND - lift * .5 - anchor[1] * factor)
    if angle:
        # Opponent reaction only; boxer drawings are never rotated or warped.
        pivot = (round(x * .5), round(GROUND - 230 * .5 - lift * .5))
        layer = Image.new('RGBA', (800, 450))
        layer.alpha_composite(scaled, (px, py))
        layer = layer.rotate(-angle, Image.Resampling.BICUBIC, center=pivot)
        canvas.alpha_composite(layer)
    else:
        canvas.alpha_composite(scaled, (px, py))


def render(name, t, sprites, background):
    s = state(name, t)
    scene = background.copy().convert('RGBA')
    d = ImageDraw.Draw(scene)
    for x, wide in [(s['x'], 75 if s['hero'] != 'slide' else 125), (s['wx'], 80)]:
        d.ellipse((x * .5 - wide, GROUND - 4, x * .5 + wide, GROUND + 8), fill='#1a111777')
    if s['hero'] == 'slide':
        for i in range(8):
            trail = (t // DT + i) % 8
            dx = s['x'] * .5 - 110 - i * 9
            dy = GROUND - 1 - trail * 2
            d.ellipse((dx, dy, dx + 12, dy + 4), fill=(108, 81, 72, 105))
    actor(scene, sprites, s['worker'], s['wx'], s['lift'], s['tilt'])
    actor(scene, sprites, s['hero'], s['x'])
    if s['spark'] >= 0 and s['spark'] < 80:
        d = ImageDraw.Draw(scene)
        cx, cy = (c * .5 for c in s['contact'])
        radius = 13 if s['spark'] < 40 else 8
        for a in range(0, 360, 45):
            r = math.radians(a)
            d.line((cx + math.cos(r) * 4, cy + math.sin(r) * 4,
                    cx + math.cos(r) * radius, cy + math.sin(r) * radius), fill='#ffd6a8', width=2)
    frame = Image.new('RGB', SIZE, '#21191f')
    frame.paste(scene.convert('RGB'), (0, STAGE_Y))
    d = ImageDraw.Draw(frame)
    d.text((20, 8), TITLES[NAMES.index(name)], font=ImageFont.truetype(FONT, 22), fill='#f2d1b6')
    subtitle = '0 новых рисунков · два раздельных попадания' if name == NAMES[0] else '1 новый рисунок · скользящий низкий удар'
    d.text((20, 36), subtitle, font=ImageFont.truetype(FONT, 13), fill='#bca7a4')
    d.text((20, 518), s['label'], font=ImageFont.truetype(FONT, 15), fill='#ffdf9c')
    return frame


def encode(path, frames, palette, speed):
    converted = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in frames]
    converted[0].save(path, save_all=True, append_images=converted[1:], duration=DT * speed,
                      loop=0, disposal=1, optimize=False)
    with Image.open(path) as gif:
        assert gif.info['loop'] == 0 and gif.size == frames[0].size
        decoded, times = [], []
        for f in ImageSequence.Iterator(gif):
            decoded.append(f.convert('RGB').copy())
            times.append(f.info['duration'])
        assert sum(times) == LENGTH * speed
        assert all(n > 0 and n % 10 == 0 for n in times)
        assert len({f.tobytes() for f in decoded}) >= 8
        assert decoded[0].tobytes() == decoded[-1].tobytes()
    return {'duration_ms': sum(times), 'records': len(decoded), 'sha256': sha(path)}


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    sprites, paths, registration = load_sprites()
    sources = {key: {'path': str(path.relative_to(PROJECT)), 'sha256': sha(path)} for key, path in paths.items()}
    background = Image.open(ART / 'arena.webp').convert('RGB').resize((800, 450), Image.Resampling.LANCZOS)
    background = Image.blend(background, Image.new('RGB', background.size, '#21141c'), .22)
    times = list(range(0, LENGTH, DT))
    variants = {name: [render(name, t, sprites, background) for t in times] for name in NAMES}
    comparison = []
    for index in range(len(times)):
        both = Image.new('RGB', (1600, SIZE[1]))
        for col, name in enumerate(NAMES):
            both.paste(variants[name][index], (800 * col, 0))
        comparison.append(both)
    # Both moves use one shared palette, including contact and fall states.
    sample = Image.new('RGB', (1600, SIZE[1] * len(KEYS)))
    for row, t in enumerate(KEYS):
        sample.paste(comparison[t // DT], (0, SIZE[1] * row))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    reports = {}
    for name, frames in [*variants.items(), ('comparison', comparison)]:
        for speed in (1, 4):
            filename = name + ('-slow' if speed == 4 else '') + '.gif'
            reports[filename] = encode(PUBLIC / filename, frames, palette, speed)
    with Image.open(PUBLIC / 'comparison.gif') as gif:
        sheet = Image.new('RGB', (1600, SIZE[1] * len(KEYS)))
        for row, t in enumerate(KEYS):
            clock = 0
            for f in ImageSequence.Iterator(gif):
                end = clock + f.info['duration']
                if clock <= t < end:
                    sheet.paste(f.convert('RGB'), (0, row * SIZE[1]))
                    break
                clock = end
        sheet.save(PUBLIC / 'decoded-sheet.png')
    schedules = {name: [{'time_ms': t, **state(name, t)} for t in times] for name in NAMES}
    (ROOT / 'schedule.json').write_text(json.dumps(schedules, indent=2, ensure_ascii=False) + '\n')
    report = {'scope': 'preview only, not integrated', 'dt_ms': DT, 'length_ms': LENGTH,
              'sources': sources, 'slide_registration': registration, 'gifs': reports}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    assert all(sha(PROJECT / rec['path']) == rec['sha256'] for rec in sources.values())
    print('6 GIFs decoded; 2.4s/9.6s loops; source hashes unchanged; shared palette')


if __name__ == '__main__':
    main()
