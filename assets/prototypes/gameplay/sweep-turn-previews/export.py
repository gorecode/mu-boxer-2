from pathlib import Path
import hashlib
import json
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/sweep-turns'
PREVIOUS = ROOT.parent / 'crouching-kick-previews/frames'
SIZE = (840, 550)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def encode(path, frames, times, palette, speed):
    indexed = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[t * speed for t in times], loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        decoded = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        assert gif.info['loop'] == 0
        assert [f.info['duration'] for f in ImageSequence.Iterator(gif)] == [t * speed for t in times]
        assert len(decoded) == len(frames)
        assert decoded[0].tobytes() == decoded[-1].tobytes()
    return decoded


def main():
    registration = json.loads((ROOT / 'registration.json').read_text())
    poses, hashes = {}, {}
    for name, source in [('idle', 'idle'), ('prep', 'c-sweep-chamber'), ('hit', 'c-sweep-contact')]:
        path = PREVIOUS / f'{source}.png'
        sprite = Image.open(path).convert('RGBA')
        out = Image.new('RGBA', SIZE)
        out.paste(sprite, (140, 0))
        assert out.crop((140, 0, 780, 550)).tobytes() == sprite.tobytes()
        poses[name] = out
        hashes[name] = sha(path)
    for name, record in registration.items():
        image = Image.open(ROOT / f'inputs/{record["source"]}.png').convert('RGBA')
        assert image.size == (1536, 1024) and image.getchannel('A').getextrema()[0] == 0
        cell = record['cell']
        split = 620 if record['source'] == 'a-windup' else 768
        left, right = (0, split) if cell == 0 else (split, image.width)
        part = image.crop((left, 0, right, 1024))
        scale = record['scale']
        resized = part.resize((round(part.width * scale), round(1024 * scale)), Image.Resampling.LANCZOS)
        x, y = record['palm']
        offset = (round(375 - x * scale), round(485 - y * scale))
        bounds = resized.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
        assert bounds
        placed = [bounds[0] + offset[0], bounds[1] + offset[1], bounds[2] + offset[0], bounds[3] + offset[1]]
        assert placed[0] > 2 and placed[1] > 60 and placed[2] < 838 and placed[3] < 510, placed
        out = Image.new('RGBA', SIZE)
        out.alpha_composite(resized, offset)
        out.save(ROOT / f'frames/{name}.png')
        poses[name] = out
        record.update(offset=offset, bounds=placed, source_sha256=sha(ROOT / f'inputs/{record["source"]}.png'))
    variants = [
        ('old', 'ДО · ПОДСЕЧКА БЕЗ РАЗВОРОТА', ['idle', 'prep', 'hit', 'prep', 'idle'], [560, 80, 120, 40, 800]),
        ('a-windup', 'А · РАЗВОРОТ ПЕРЕД КОНТАКТОМ', ['idle', 'prep', 'a0', 'a1', 'hit', 'prep', 'idle'], [560, 40, 50, 50, 120, 40, 740]),
        ('b-follow', 'Б · ДОВОРОТ ПОСЛЕ КОНТАКТА', ['idle', 'prep', 'hit', 'b0', 'b1', 'prep', 'idle'], [560, 80, 120, 50, 50, 40, 700]),
        ('c-circle', 'В · КРУГОВАЯ ПОДСЕЧКА', ['idle', 'prep', 'c0', 'c1', 'hit', 'prep', 'idle'], [560, 40, 80, 40, 120, 40, 720]),
        ('a-integrated', 'А · ИТОГОВЫЙ ИГРОВОЙ РИТМ', ['idle', 'prep', 'a0', 'a1', 'hit', 'prep', 'idle'], [560, 50, 60, 40, 100, 60, 730]),
    ]
    arena = Image.open(PROJECT / 'scene-lab/public/art/fight/arena.webp').convert('RGB').resize((978, 550)).crop((69, 0, 909, 550))
    arena = Image.blend(arena, Image.new('RGB', SIZE, '#22171d'), .32)
    panels = {}
    for name, title, keys, times in variants:
        assert len(keys) == len(times) and sum(times) == 1600
        frames = []
        for key in keys:
            frame = arena.copy().convert('RGBA')
            frame.alpha_composite(poses[key])
            draw = ImageDraw.Draw(frame)
            draw.rectangle((0, 0, 840, 59), fill='#21191f')
            draw.text((16, 12), title, font=ImageFont.truetype(FONT, 22), fill='#f2d1b6')
            draw.text((16, 39), 'ОБЩИЙ МАСШТАБ · КОНТАКТ И ПРИСЕД ИЗ ИГРЫ', font=ImageFont.truetype(FONT, 13), fill='#bca7a4')
            draw.rectangle((0, 517, 840, 550), fill='#21191f')
            draw.text((16, 525), key.upper(), font=ImageFont.truetype(FONT, 15), fill='#ffdf9c')
            frames.append(frame.convert('RGB'))
        panels[name] = frames
    atlas = Image.new('RGB', (840 * len(variants), 550 * 7))
    for col, (name, _, _, _) in enumerate(variants):
        for row, frame in enumerate(panels[name]):
            atlas.paste(frame, (840 * col, 550 * row))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    for name, _, keys, times in variants:
        decoded = encode(PUBLIC / f'{name}.gif', panels[name], times, palette, 1)
        encode(PUBLIC / f'{name}-slow.gif', panels[name], times, palette, 4)
        sheet = Image.new('RGB', (840 * len(decoded), 550))
        for index, frame in enumerate(decoded):
            sheet.paste(frame, (840 * index, 0))
        sheet.resize((round(sheet.width / 2), 275)).save(PUBLIC / f'{name}-decoded.png')
    (ROOT / 'verification.json').write_text(json.dumps({'original_sha256': hashes, 'registration': registration,
        'variants': [{'id': n, 'schedule': k, 'times_ms': t} for n, _, k, t in variants],
        'outputs': {p.name: sha(p) for p in PUBLIC.glob('*.gif')}}, indent=2) + '\n')
    print('Verified 10 GIFs: decoded durations, 1600ms loops,1x/4x, unclipped nonempty sprites, original RGBA unchanged.')


if __name__ == '__main__':
    main()
