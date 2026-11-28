from pathlib import Path
import hashlib
import json
import math

from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
ART = PROJECT / 'scene-lab/public/art/fight'
PUBLIC = PROJECT / 'scene-lab/public/previews/worker-moves'
DT, LENGTH = 40, 2800
SIZE, GROUND = (800, 554), 410
NAMES = ('shaft-shove', 'low-high')
TITLES = ('ОТБОЙ ДРЕВКОМ', 'ПОДСЕЧКА → УДАР СВЕРХУ')
KEYS = (0, 440, 600, 640, 800, 880, 1080, 1240, 1320, 1440)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ease(t, start, end):
    p = min(1., max(0., (t - start) / (end - start)))
    return 1 - (1 - p) ** 2


def load_sprites():
    manifest = json.loads((ART / 'manifest.json').read_text())
    paths = {}
    sprites = {}
    for who, indices in [('worker', (0, 3, 5, 7, 8, 9)), ('boxer', (0, 4, 6, 25))]:
        for index in indices:
            key = f'{who}-{index}'
            path = ART / f'{key}.webp'
            m = manifest[who][index]
            sprites[key] = (Image.open(path).convert('RGBA'), (m['anchorX'], m['anchorY']), m['scale'])
            paths[key] = path
    raw_path = ROOT / 'source/shove-contact-generated.png'
    raw = Image.open(raw_path).convert('RGBA')
    factor = .30
    resized = raw.resize((round(raw.width * factor), round(raw.height * factor)), Image.Resampling.LANCZOS)
    sole = resized.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()[3]
    anchor = (228, 525)
    offset = (anchor[0] - 177, anchor[1] - sole - 1)
    contact = Image.new('RGBA', (500, 550))
    contact.alpha_composite(resized, offset)
    (ROOT / 'frames').mkdir(exist_ok=True)
    contact.save(ROOT / 'frames/shove-contact.png')
    sprites['shove'] = (contact, anchor, 1.22)
    paths['shove-source'] = raw_path
    paths['arena'] = ART / 'arena.webp'
    paths['manifest'] = ART / 'manifest.json'
    return sprites, paths, {'uniform_source_scale': factor, 'source_root_x': 177,
                            'offset': offset, 'anchor': anchor, 'world_scale': 1.22,
                            'opaque_bounds': contact.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()}


def state(name, t):
    if name not in NAMES or t < 0 or t >= LENGTH:
        raise ValueError('Unknown preview or timestamp outside the loop')
    if t >= 2240:
        return state(name, 0)
    s = {'worker': 'worker-0', 'boxer': 'boxer-0', 'wx': 960, 'bx': 750,
         'spark': -1, 'contact': (880, 440), 'blocked': False, 'label': 'Рабочий держит дистанцию'}
    if name == 'shaft-shove':
        if 400 <= t < 560:
            s.update(worker='worker-5', label='Лопата поперёк корпуса · подготовка отбоя')
        elif 560 <= t < 640:
            s.update(worker='worker-5', label='Короткий ответ из защиты')
        elif 640 <= t < 800:
            s.update(worker='shove', boxer='boxer-6', spark=t - 640,
                     contact=(842, 445), label='Древком в корпус → отталкивание')
        elif 800 <= t < 880:
            s.update(worker='worker-5', boxer='boxer-6', label='Боксёр отодвинут · Рабочий возвращает защиту')
        elif t >= 880:
            s.update(boxer='boxer-6' if t < 1000 else 'boxer-0', label='Дистанция восстановлена · без падения')
        s['bx'] -= 200 * ease(t, 720, 1000)
    else:
        s.update(wx=1060, bx=710)
        if 560 <= t < 880:
            s.update(worker='worker-7', boxer='boxer-25', label='Подготовка низкого удара · нижний блок')
        elif 880 <= t < 1040:
            s.update(worker='worker-9', boxer='boxer-25', blocked=True, spark=t - 880,
                     contact=(755, 760), label='Первый контакт · низкий блок')
        elif 1040 <= t < 1120:
            s.update(worker='worker-7', boxer='boxer-25', label='Раздельные удары · лопата начинает подниматься')
        elif 1120 <= t < 1400:
            s.update(worker='worker-3', boxer='boxer-25' if t < 1240 else 'boxer-4',
                     label='Читаемый верхний замах · встаём в блок')
        elif 1400 <= t < 1560:
            s.update(worker='worker-8', boxer='boxer-4', blocked=True, spark=t - 1400,
                     contact=(790, 350), label='Второй контакт · верхний блок')
        elif 1560 <= t < 1720:
            s.update(worker='worker-7', boxer='boxer-4', label='Окончание связки · окно для ответа')
        elif 1720 <= t < 1920:
            s.update(boxer='boxer-4', label='Связка завершена · окно для ответа')
        elif t >= 1920:
            s['label'] = 'Оба удара заблокированы · низ → верх'
    return s


def actor(canvas, sprites, key, x):
    im, anchor, scale = sprites[key]
    factor = scale * .5
    resized = im.resize((round(im.width * factor), round(im.height * factor)), Image.Resampling.LANCZOS)
    px = round(x * .5 - anchor[0] * factor)
    py = round(GROUND - anchor[1] * factor)
    canvas.alpha_composite(resized, (px, py))


def render(name, t, sprites, background):
    s = state(name, t)
    scene = background.copy().convert('RGBA')
    d = ImageDraw.Draw(scene)
    for x in (s['wx'], s['bx']):
        d.ellipse((x * .5 - 70, GROUND - 4, x * .5 + 70, GROUND + 8), fill='#1a111788')
    actor(scene, sprites, s['worker'], s['wx'])
    actor(scene, sprites, s['boxer'], s['bx'])
    if 0 <= s['spark'] < 80:
        d = ImageDraw.Draw(scene)
        x, y = (v * .5 for v in s['contact'])
        color = '#99e6ff' if s['blocked'] else '#ffdbab'
        for angle in range(0, 360, 45):
            r = math.radians(angle)
            d.line((x + math.cos(r) * 4, y + math.sin(r) * 4,
                    x + math.cos(r) * 13, y + math.sin(r) * 13), fill=color, width=2)
    if 2080 <= t < 2240:
        scene = Image.blend(scene, Image.new('RGBA', scene.size, '#21191f'), (t - 2080) / 160)
    elif 2240 <= t < 2400:
        scene = Image.blend(Image.new('RGBA', scene.size, '#21191f'), scene, (t - 2240) / 160)
    frame = Image.new('RGB', SIZE, '#21191f')
    frame.paste(scene.convert('RGB'), (0, 58))
    d = ImageDraw.Draw(frame)
    d.text((18, 8), TITLES[NAMES.index(name)], font=ImageFont.truetype(FONT, 22), fill='#f2d1b6')
    subtitle = '1 новый ключ · короткий толчок после блока' if name == NAMES[0] else '0 новых рисунков · смена уровня защиты'
    d.text((18, 36), subtitle, font=ImageFont.truetype(FONT, 13), fill='#bca7a4')
    d.text((18, 518), s['label'], font=ImageFont.truetype(FONT, 14), fill='#ffdf9c')
    return frame


def encode(path, frames, palette, speed):
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:], duration=DT * speed,
                    loop=0, disposal=1, optimize=False)
    with Image.open(path) as gif:
        decoded = [(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(gif)]
        assert gif.info['loop'] == 0 and gif.size == frames[0].size
        assert sum(ms for _, ms in decoded) == LENGTH * speed
        assert len({f.tobytes() for f, _ in decoded}) > 10
        assert decoded[0][0].tobytes() == decoded[-1][0].tobytes()
    return {'records': len(decoded), 'duration_ms': sum(ms for _, ms in decoded), 'sha256': sha(path)}


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    sprites, paths, registration = load_sprites()
    sources = {k: {'path': str(p.relative_to(PROJECT)), 'sha256': sha(p)} for k, p in paths.items()}
    background = Image.open(ART / 'arena.webp').convert('RGB').resize((800, 450), Image.Resampling.LANCZOS)
    background = Image.blend(background, Image.new('RGB', background.size, '#21141c'), .22)
    times = list(range(0, LENGTH, DT))
    variants = {n: [render(n, t, sprites, background) for t in times] for n in NAMES}
    comparison = []
    for i in range(len(times)):
        frame = Image.new('RGB', (1600, SIZE[1]))
        for col, name in enumerate(NAMES):
            frame.paste(variants[name][i], (col * 800, 0))
        comparison.append(frame)
    sample = Image.new('RGB', (1600, SIZE[1] * len(KEYS)))
    for row, t in enumerate(KEYS):
        sample.paste(comparison[t // DT], (0, row * SIZE[1]))
    palette = sample.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    reports = {}
    for name, frames in [*variants.items(), ('comparison', comparison)]:
        for speed in (1, 4):
            filename = name + ('-slow' if speed == 4 else '') + '.gif'
            reports[filename] = encode(PUBLIC / filename, frames, palette, speed)
    with Image.open(PUBLIC / 'comparison.gif') as gif:
        decoded = [(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(gif)]
    sheet = Image.new('RGB', sample.size)
    for row, t in enumerate(KEYS):
        clock = 0
        for frame, ms in decoded:
            if clock <= t < clock + ms:
                sheet.paste(frame, (0, row * SIZE[1]))
                break
            clock += ms
    sheet.save(PUBLIC / 'decoded-sheet.png')
    (ROOT / 'schedule.json').write_text(json.dumps({n: [{'time_ms': t, **state(n, t)} for t in times] for n in NAMES}, indent=2, ensure_ascii=False) + '\n')
    report = {'scope': 'unapproved visual previews only; not gameplay', 'dt_ms': DT, 'length_ms': LENGTH,
              'sources': sources, 'shove_registration': registration, 'gifs': reports}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
    assert all(sha(PROJECT / s['path']) == s['sha256'] for s in sources.values())
    print('6 GIFs decoded; loops 2.8s / 11.2s; original runtime asset hashes unchanged')


if __name__ == '__main__':
    main()
