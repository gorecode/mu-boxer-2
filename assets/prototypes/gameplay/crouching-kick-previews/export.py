from pathlib import Path
import hashlib
import importlib.util
import json
from PIL import Image, ImageDraw, ImageFont, ImageSequence

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/crouching-kicks'
SPEC = importlib.util.spec_from_file_location('kick_export', ROOT.parent / 'kick-previews/export.py')
SHARED = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SHARED)
TIMES = [560, 80, 120, 40, 800]
SHARED.DURATIONS = TIMES
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
VARIANTS = [
    ('a-straight', 'А · ПРЯМОЙ ИЗ ПРИСЕДА', .44, [155, 825], 145),
    ('b-side', 'Б · НИЗКИЙ БОКОВОЙ', .42, [185, 760], 145),
    ('c-sweep', 'В · ПОДСЕЧКА С ОПОРОЙ', .44, [450, 1010], 320),
]
SIZE = (640, 550)
GROUND = 485


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def place(sheet, cell, scale, sole_x, target_x):
    left, right = (0, 620) if cell == 0 else (620, sheet.width)
    part = sheet.crop((left, 0, right, sheet.height))
    mask = part.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    foot = mask.crop((sole_x - left - 70, 800, sole_x - left + 70, sheet.height)).getbbox()
    assert foot, 'Missing supporting boot'
    source_y = 800 + foot[3]
    source_x = sole_x - left - 70 + (foot[0] + foot[2]) / 2
    sprite = part.resize((round(part.width * scale), round(part.height * scale)), Image.Resampling.LANCZOS)
    offset = (round(target_x - source_x * scale), round(GROUND - source_y * scale))
    bounds = sprite.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
    placed = [bounds[0] + offset[0], bounds[1] + offset[1], bounds[2] + offset[0], bounds[3] + offset[1]]
    assert placed[0] > 0 and placed[1] > 60 and placed[2] < SIZE[0] and placed[3] < 515, placed
    out = Image.new('RGBA', SIZE)
    out.alpha_composite(sprite, offset)
    return out, {'scale': scale, 'offset': offset, 'bounds': placed, 'sole_target': [target_x, GROUND]}


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    master_path = PROJECT / 'scene-lab/public/art/fight/boxer-5.webp'
    master = Image.open(master_path).convert('RGBA')
    idle = Image.new('RGBA', SIZE)
    idle.paste(master, (110, GROUND - 385))
    assert idle.crop((110, GROUND - 385, 364, GROUND)).tobytes() == master.tobytes()
    idle.save(ROOT / 'frames/idle.png')
    arena = Image.open(PROJECT / 'scene-lab/public/art/fight/arena.webp').convert('RGB')
    arena = arena.resize((978, 550)).crop((169, 0, 809, 550))
    arena = Image.blend(arena, Image.new('RGB', SIZE, '#22171d'), .32)
    variants, records = [], {}
    for name, title, scale, soles, target_x in VARIANTS:
        path = ROOT / f'inputs/{name}.png'
        sheet = Image.open(path).convert('RGBA')
        assert sheet.size == (1536, 1024) and sheet.getchannel('A').getextrema()[0] == 0
        poses, registration = [idle], []
        for cell in range(2):
            pose, record = place(sheet, cell, scale, soles[cell], target_x)
            pose.save(ROOT / f'frames/{name}-{["chamber", "contact"][cell]}.png')
            poses.append(pose)
            registration.append(record)
        frames = []
        for index in [0, 1, 2, 1, 0]:
            panel = arena.copy().convert('RGBA')
            panel.alpha_composite(poses[index])
            draw = ImageDraw.Draw(panel)
            draw.rectangle((0, 0, 640, 59), fill='#21191f')
            draw.text((16, 12), title, font=ImageFont.truetype(FONT, 22), fill='#f2d1b6')
            draw.text((16, 39), 'ИСХОДНЫЙ ПРИСЕД + 2 НОВЫХ РИСУНКА', font=ImageFont.truetype(FONT, 13), fill='#bca7a4')
            draw.rectangle((0, 517, 640, 550), fill='#21191f')
            draw.text((16, 525), ['ИСХОДНЫЙ ПРИСЕД', 'ПОДГОТОВКА', 'КОНТАКТ'][index], font=ImageFont.truetype(FONT, 15), fill='#ffdf9c')
            frames.append(panel.convert('RGB'))
        variants.append(frames)
        records[name] = {'source_sha256': digest(path), 'registration': registration}
    atlas = Image.new('RGB', (1920, 1650))
    for col, frames in enumerate(variants):
        for row in range(3):
            atlas.paste(frames[row], (640 * col, 550 * row))
    palette = atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    comparison = []
    for state in range(5):
        frame = Image.new('RGB', (1920, 550))
        for col, frames in enumerate(variants):
            frame.paste(frames[state], (640 * col, 0))
        comparison.append(frame)
    for name, frames in [('comparison', comparison), *zip([v[0] for v in VARIANTS], variants)]:
        decoded = SHARED.encode(PUBLIC / f'{name}.gif', frames, palette, 1)
        SHARED.encode(PUBLIC / f'{name}-slow.gif', frames, palette, 4)
        if name == 'comparison':
            sheet = Image.new('RGB', (1920, 1650))
            for row in range(3):
                sheet.paste(decoded[row], (0, 550 * row))
            sheet.save(PUBLIC / 'decoded-sheet.png')
    report = {'master_sha256': digest(master_path), 'schedule_ms': TIMES, 'variants': records,
              'outputs': {p.name: digest(p) for p in PUBLIC.glob('*.gif')}}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified: 8 looping GIFs, decoded timing1x/4x, different poses, identical loop ends, unchanged crouch pixels.')


if __name__ == '__main__':
    main()
