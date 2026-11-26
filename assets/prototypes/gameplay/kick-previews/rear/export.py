from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import importlib.util
import json
import shutil

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lead_kick_preview', ROOT.parent / 'export.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PUBLIC = base.PUBLIC / 'rear'
IDS = ['a-rear-front', 'b-rear-heel', 'c-rear-round']
base.TITLES = ['1 · ПРЯМОЙ ЗАДНЕЙ НОГОЙ', '2 · ПЯТКОЙ С ДОВОРОТОМ', '3 · КРУГОВОЙ В КОРПУС']


def approved_panel(background, sprite, key):
    frame = base.panel(background, sprite, 0, key)
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 0, 640, 40), fill='#21191f')
    draw.text((18, 14), 'ВЫБРАННЫЙ А · ПЕРЕДНЕЙ', font=ImageFont.truetype(base.FONT, 19), fill='#f2d1b6')
    return frame


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    frames_dir = ROOT / 'frames'
    frames_dir.mkdir(exist_ok=True)
    approved_paths = [ROOT.parent / f'frames/a-front-{key}.png' for key in ['chamber', 'contact']]
    approved_paths += [base.PUBLIC / 'a-front.gif', ROOT.parent / 'frames/idle.png']
    approved_hashes = {str(p.relative_to(base.PROJECT)): base.sha(p) for p in approved_paths}
    master = Image.open(base.MASTER).convert('RGBA')
    idle = Image.open(ROOT.parent / 'frames/idle.png').convert('RGBA')
    assert idle.crop((40, 37, 540, 587)).tobytes() == master.tobytes()
    shutil.copyfile(ROOT.parent / 'frames/idle.png', frames_dir / 'idle.png')
    target = base.target_foot(master, True)
    background = Image.open(base.PROJECT / 'scene-lab/public/art/fight/arena.webp').convert('RGB')
    background = background.resize((1244, 700)).crop((300, 0, 940, 700))
    background = Image.blend(background, Image.new('RGB', (640, 700), '#1d141b'), .38)
    variants, records = [], {}
    for index, name in enumerate(IDS):
        source = ROOT / f'inputs/{name}.png'
        strip = Image.open(source).convert('RGBA')
        assert abs(strip.width / strip.height - 1000 / 550) < .02
        assert strip.getchannel('A').getextrema() == (0, 255)
        sprites, registration = {'idle': idle}, {}
        for cell, key in enumerate(['chamber', 'contact']):
            part = strip.crop((round(strip.width * cell / 2), 0, round(strip.width * (cell + 1) / 2), strip.height))
            sprites[key], registration[key] = base.register(part, target)
            sprites[key].save(frames_dir / f'{name}-{key}.png')
        variants.append([base.panel(background, sprites[key], index, key, state == 3) for state, key in enumerate(base.SCHEDULE)])
        records[name] = {'source_sha256': base.sha(source), 'striking_leg': 'rear', 'support_leg': 'lead',
                         'registration': registration,
                         'frames_sha256': {key: base.sha(frames_dir / f'{name}-{key}.png') for key in registration}}
    approved_sprites = {'idle': idle, **{key: Image.open(ROOT.parent / f'frames/a-front-{key}.png').convert('RGBA') for key in ['chamber', 'contact']}}
    reference = [approved_panel(background, approved_sprites[key], key) for key in ['idle', 'chamber', 'contact']]
    atlas = Image.new('RGB', (2560, 2100))
    for col, frames in enumerate([reference, *variants]):
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
        decoded = base.encode(PUBLIC / f'{name}.gif', frames, palette, 1)
        base.encode(PUBLIC / f'{name}-slow.gif', frames, palette, 4)
        if name == 'comparison':
            sheet = Image.new('RGB', (1920, 2100))
            for row in range(3):
                sheet.paste(decoded[row], (0, 700 * row))
            sheet.save(PUBLIC / 'decoded-sheet.png')
            audit = Image.new('RGB', (2560, 2100))
            for row, ref in enumerate(reference):
                audit.paste(ref.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB'), (0, 700 * row))
            audit.paste(sheet, (640, 0))
            audit.save(PUBLIC / 'with-approved-sheet.png')
    assert approved_hashes == {str(p.relative_to(base.PROJECT)): base.sha(p) for p in approved_paths}
    report = {'approved_lead_kick_sha256': approved_hashes, 'striking_leg': 'rear', 'support_leg': 'lead',
              'new_drawings_per_variant': 2, 'unique_drawings_per_variant': 3,
              'durations_ms': base.DURATIONS, 'schedule': base.SCHEDULE, 'variants': records,
              'gif_sha256': {p.name: base.sha(p) for p in sorted(PUBLIC.glob('*.gif'))}}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('3 rear-leg drafts,8 GIFs decoded; front support registered; approved lead kick unchanged')


if __name__ == '__main__':
    main()
