from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import importlib.util
import json

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('uppercut_base', ROOT.parent / 'export.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)
PUBLIC = base.PUBLIC / 'source-arm'
IDS = ['c1-compact', 'c2-balanced', 'c3-high']
base.TITLES = ['В1 · КОМПАКТНЫЙ', 'В2 · ДИАГОНАЛЬНЫЙ', 'В3 · ВЫШЕ КОНТАКТ']
STAGE = json.loads((ROOT / 'rig.json').read_text()) if (ROOT / 'rig.json').exists() else None


def encode(path, frames, palette, multiplier):
    durations = [s['duration'] * multiplier for s in STAGE['schedule']]
    frames = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
    frames[0].save(path, save_all=True, append_images=frames[1:], duration=durations, loop=0, disposal=2, optimize=False)
    with Image.open(path) as gif:
        decoded = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        actual = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
    assert actual == durations and len(decoded) == len(durations)
    assert decoded[0].tobytes() == decoded[-1].tobytes()
    return decoded


def panel(sprite, index, key):
    frame = base.panel(sprite, index, key == 'contact')
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 38, 420, 70), fill='#21191f')
    draw.text((15, 43), 'ИСХОДНАЯ ГРАФИКА РУКИ · ПРОБА', font=ImageFont.truetype(base.FONT, 12), fill='#bca7a4')
    draw.rectangle((0, 596, 420, 620), fill='#21191f')
    label = {'idle': 'СТОЙКА', 'preparation': 'КОРОТКАЯ ПОДГОТОВКА · 40 мс', 'drive': 'ВЫХОД / ВОЗВРАТ', 'contact': 'КОНТАКТ · 120 мс'}[key]
    draw.text((15, 601), label, font=ImageFont.truetype(base.FONT, 12), fill='#ffdf9c' if key == 'contact' else '#bca7a4')
    return frame


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    panels = []
    for i, name in enumerate(IDS):
        sequence = []
        for step in STAGE['schedule']:
            key = step['key']
            source = name if key == 'contact' else key
            sequence.append(panel(Image.open(ROOT / 'frames' / f'{source}.png').convert('RGBA'), i, key))
        panels.append(sequence)
    palette = base.palette_for([f for p in panels for f in p[:4]])
    comparisons = [Image.new('RGB', (1260, 620)) for _ in STAGE['schedule']]
    sheet = Image.new('RGB', (1260, 2480))
    report = {}
    for i, name in enumerate(IDS):
        decoded = encode(PUBLIC / f'{name}.gif', panels[i], palette, 1)
        encode(PUBLIC / f'{name}-slow.gif', panels[i], palette, 4)
        for j, frame in enumerate(panels[i]):
            comparisons[j].paste(frame, (420 * i, 0))
        for j in range(4):
            sheet.paste(decoded[j], (420 * i, 620 * j))
        report[name] = {'gif_sha256': base.sha(PUBLIC / f'{name}.gif'), 'elbow_angle': STAGE['poses'][name]['angle']}
    encode(PUBLIC / 'comparison.gif', comparisons, palette, 1)
    encode(PUBLIC / 'comparison-slow.gif', comparisons, palette, 4)
    old = Image.open(ROOT.parent / 'c-still-head/frames/c2-balanced.png').convert('RGBA')
    old_idle = Image.open(ROOT.parent / 'c-still-head/frames/idle.png').convert('RGBA')
    before_after = []
    base.TITLES = ['ПРЕЖНИЙ РИСУНОК', 'НОВАЯ ПРОБА · В2']
    for i, step in enumerate(STAGE['schedule']):
        left = base.panel(old if step['key'] == 'contact' else old_idle, 0, step['key'] == 'contact')
        draw = ImageDraw.Draw(left)
        draw.rectangle((0,38,420,70),fill='#21191f')
        draw.text((15,43),'ОТКЛОНЁН АВТОРОМ',font=ImageFont.truetype(base.FONT,12),fill='#bca7a4')
        draw.rectangle((0,596,420,620),fill='#21191f')
        draw.text((15,601),'КОНТАКТ · 120 мс' if step['key']=='contact' else 'СТОЙКА',font=ImageFont.truetype(base.FONT,12),fill='#bca7a4')
        right = panels[1][i].copy()
        draw = ImageDraw.Draw(right)
        draw.rectangle((0,0,420,37),fill='#21191f')
        draw.text((15,13),base.TITLES[1],font=ImageFont.truetype(base.FONT,17),fill='#f2d1b6')
        both = Image.new('RGB',(840,620)); both.paste(left,(0,0)); both.paste(right,(420,0)); before_after.append(both)
    pair_palette = base.palette_for([f.crop((x,0,x+420,620)) for f in before_after for x in [0,420]])
    encode(PUBLIC / 'before-after.gif',before_after,pair_palette,1)
    encode(PUBLIC / 'before-after-slow.gif',before_after,pair_palette,4)
    sheet.save(PUBLIC / 'decoded-sheet.png')
    sheet.save(ROOT / 'decoded-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps({'source_sha256': STAGE['sourceSha256'], 'variants': report,
        'durations_ms': [s['duration'] for s in STAGE['schedule']]}, indent=2) + '\n')
    print('Encoded native-texture contacts and decoded all preparation, drive, contact and return drawings')


if __name__ == '__main__':
    main()
