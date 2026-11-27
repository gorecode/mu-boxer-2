from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
ART = PROJECT / 'scene-lab/public/art/fight'
PUBLIC = PROJECT / 'scene-lab/public/previews/crouch-block'
NAMES = ['a-shell', 'b-cross', 'c-shoulder']
TITLES = ['А · ЗАКРЫТАЯ ЗАЩИТА', 'Б · СКРЕЩЕННЫЕ ПРЕДПЛЕЧЬЯ', 'В · ПЛЕЧО И КОРПУС']
SCHEDULE = ['idle', 'crouch', 'guard', 'crouch', 'idle']
DURATIONS = [520, 120, 960, 120, 520]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
ANCHOR = (228, 525)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def register(image, anchor):
    out = Image.new('RGBA', (500, 550))
    out.alpha_composite(image, (ANCHOR[0] - anchor[0], ANCHOR[1] - anchor[1]))
    return out


def panel(background, sprite, title, state):
    out = background.copy().convert('RGBA')
    d = ImageDraw.Draw(out)
    d.rectangle((0, 0, 500, 72), fill='#20171e')
    d.text((16, 12), title, font=ImageFont.truetype(FONT, 18), fill='#f3c9b0')
    d.text((16, 42), 'СТОЙКА → ПРИСЯД → БЛОК → ВОЗВРАТ', font=ImageFont.truetype(FONT, 12), fill='#b8a2a0')
    d.ellipse((105, 558, 352, 580), fill='#1a101a99')
    out.alpha_composite(sprite, (0, 46))
    d = ImageDraw.Draw(out)
    d.rectangle((0, 600, 500, 636), fill='#20171e')
    label = {'idle': 'ИСХОДНАЯ СТОЙКА', 'crouch': 'ИСХОДНЫЙ ПРИСЯД', 'guard': 'НОВЫЙ КАДР БЛОКА · УДЕРЖАНИЕ'}[state]
    d.text((16, 611), label, font=ImageFont.truetype(FONT, 13), fill='#ffe2ac' if state == 'guard' else '#b8a2a0')
    return out.convert('RGB')


def encode(path, frames, palette, speed=1):
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[t * speed for t in DURATIONS], loop=0, disposal=2, optimize=False)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    manifest = json.loads((ART / 'manifest.json').read_text())
    paths = [ART / 'boxer-0.webp', ART / 'boxer-4.webp', ART / 'boxer-5.webp', ART / 'arena.webp']
    records = {'source_hashes': {str(p.relative_to(PROJECT)): sha(p) for p in paths},
               'schedule': SCHEDULE, 'durations_ms': DURATIONS, 'anchor': ANCHOR, 'variants': {}}
    sprites = {}
    for name, index in [('idle', 0), ('crouch', 5)]:
        meta = manifest['boxer'][index]
        sprites[name] = register(Image.open(ART / f'boxer-{index}.webp').convert('RGBA'), (meta['anchorX'], meta['anchorY']))
        sprites[name].save(ROOT / f'frames/{name}.png')
    background = Image.open(ART / 'arena.webp').convert('RGB').resize((1131, 636)).crop((260, 0, 760, 636))
    background = Image.blend(background, Image.new('RGB', background.size, '#20141d'), .28)
    variants = []
    for name, title in zip(NAMES, TITLES):
        source = ROOT / f'source/{name}-generated.png'
        raw = Image.open(source).convert('RGBA')
        scaled = raw.resize((round(raw.width * .25), round(raw.height * .25)), Image.Resampling.LANCZOS)
        sole = scaled.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()[3]
        source_anchor = (130, sole + 1)
        guard = register(scaled, source_anchor)
        guard.save(ROOT / f'frames/{name}.png')
        frames = [panel(background, guard if state == 'guard' else sprites[state], title, state) for state in SCHEDULE]
        variants.append(frames)
        records['variants'][name] = {'source_sha256': sha(source), 'raw_size': raw.size,
                                    'uniform_scale': .25, 'source_anchor': source_anchor,
                                    'opaque_bounds': guard.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()}
    atlas = Image.new('RGB', (500 * 4, 636))
    for i, frame in enumerate([variants[0][0], *[v[2] for v in variants]]):
        atlas.paste(frame, (500 * i, 0))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    for name, frames in zip(NAMES, variants):
        encode(PUBLIC / f'{name}.gif', frames, palette)
        encode(PUBLIC / f'{name}-slow.gif', frames, palette, 4)
    comparison = []
    for state in range(len(SCHEDULE)):
        frame = Image.new('RGB', (1500, 636))
        for i, frames in enumerate(variants):
            frame.paste(frames[state], (500 * i, 0))
        comparison.append(frame)
    encode(PUBLIC / 'comparison.gif', comparison, palette)
    encode(PUBLIC / 'comparison-slow.gif', comparison, palette, 4)
    sheet = Image.new('RGB', (1500, 636))
    for i, name in enumerate(NAMES):
        with Image.open(PUBLIC / f'{name}.gif') as gif:
            gif.seek(2)
            sheet.paste(gif.convert('RGB'), (500 * i, 0))
    sheet.save(PUBLIC / 'decoded-sheet.png')
    (ROOT / 'registration.json').write_text(json.dumps(records, indent=2, ensure_ascii=False) + '\n')
    print('Exported three guards, x4 versions, comparison and decoded sheet.')


if __name__ == '__main__':
    main()
