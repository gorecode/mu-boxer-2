from pathlib import Path
from PIL import Image, ImageDraw
import importlib.util
import json

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('uppercut_base', ROOT.parent / 'export.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PUBLIC = base.PUBLIC / 'c-still-head'
IDS = ['c1-compact', 'c2-balanced', 'c3-high']
base.TITLES = ['В1 · КОМПАКТНЫЙ', 'В2 · СРЕДНИЙ ВЫНОС', 'В3 · ВЫШЕ КУЛАК']


def edit_mask():
    mask = Image.new('L', (500, 550))
    draw = ImageDraw.Draw(mask)
    draw.polygon([(110, 130), (155, 105), (195, 103), (225, 125), (285, 132),
                  (285, 5), (410, 5), (410, 260), (110, 260)], fill=255)
    draw.polygon([(185, 15), (289, 15), (291, 104), (282, 125), (268, 134),
                  (252, 133), (230, 126), (202, 117), (190, 98)], fill=0)
    draw.rectangle((0, 260, 500, 550), fill=0)
    return mask


def compose_contact(source, idle):
    source = source.convert('RGBA')
    if abs(source.width / source.height - 500 / 550) > .025:
        raise ValueError('Generation must retain the reference canvas framing')
    if not source.getchannel('A').getbbox():
        raise ValueError('Empty generated contact')
    generated = source.resize((500, 550), Image.Resampling.LANCZOS)
    return Image.composite(generated, idle, edit_mask())


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (ROOT / 'frames').mkdir(exist_ok=True)
    idle = base.idle_frame()
    mask = edit_mask()
    mask.save(ROOT / 'edit-mask.png')
    idle.save(ROOT / 'frames/idle.png')
    panels, records = [], {}
    for i, name in enumerate(IDS):
        source = ROOT / 'inputs' / f'{name}.png'
        frame = compose_contact(Image.open(source), idle)
        frame.save(ROOT / 'frames' / f'{name}.png')
        panels.append([base.panel(idle, i, False), base.panel(frame, i, True), base.panel(idle, i, False)])
        records[name] = {'source_sha256': base.sha(source), 'contact_sha256': base.sha(ROOT / 'frames' / f'{name}.png')}
    palette = base.palette_for([frame for sequence in panels for frame in sequence[:2]])
    comparisons = [Image.new('RGB', (1260, 620)) for _ in range(3)]
    sheet = Image.new('RGB', (1260, 1240))
    for i, name in enumerate(IDS):
        decoded = base.encode(PUBLIC / f'{name}.gif', panels[i], palette, 1)
        base.encode(PUBLIC / f'{name}-slow.gif', panels[i], palette, 4)
        for j in range(3):
            comparisons[j].paste(panels[i][j], (420 * i, 0))
        sheet.paste(decoded[0], (420 * i, 0))
        sheet.paste(decoded[1], (420 * i, 620))
        records[name]['gif_sha256'] = base.sha(PUBLIC / f'{name}.gif')
    base.encode(PUBLIC / 'comparison.gif', comparisons, palette, 1)
    base.encode(PUBLIC / 'comparison-slow.gif', comparisons, palette, 4)
    sheet.save(PUBLIC / 'decoded-sheet.png')
    sheet.save(ROOT / 'decoded-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps({'mask_sha256': base.sha(ROOT / 'edit-mask.png'),
        'idle_sha256': base.sha(base.ART / 'boxer-0.webp'), 'variants': records}, indent=2) + '\n')
    print('Rendered three C variants with original idle head and legs preserved')


if __name__ == '__main__':
    main()
