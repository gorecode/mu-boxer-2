from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import importlib.util
import json

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('body_turn', ROOT.parent / 'body-turn/export.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)
PUBLIC = preview.base.PUBLIC / 'color-match'


def panel(sprite, index, contact):
    preview.base.TITLES = ['3 · ПРЕЖНЯЯ ПАЛИТРА', '3 · ЦВЕТА ИЗ СТОЙКИ']
    frame = preview.panel(sprite, index, contact)
    draw = ImageDraw.Draw(frame)
    draw.rectangle((0, 38, 420, 70), fill='#21191f')
    draw.text((15, 43), 'ТОТ ЖЕ РИСУНОК · ПРАВКА ЦВЕТА ОДЕЖДЫ', font=ImageFont.truetype(preview.base.FONT, 11), fill='#bca7a4')
    return frame


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    idle = preview.base.idle_frame()
    before = Image.open(ROOT.parent / 'body-turn/frames/c-rising.png').convert('RGBA')
    after = Image.open(ROOT / 'frames/contact.png').convert('RGBA')
    sequences = [[panel(idle, i, False), panel(contact, i, True), panel(idle, i, False)] for i, contact in enumerate([before, after])]
    palette = preview.base.palette_for([f for seq in sequences for f in seq[:2]])
    both = []
    for left, right in zip(*sequences):
        frame = Image.new('RGB', (840, 620))
        frame.paste(left, (0, 0))
        frame.paste(right, (420, 0))
        both.append(frame)
    decoded = preview.encode(PUBLIC / 'comparison.gif', both, palette)
    preview.encode(PUBLIC / 'comparison-slow.gif', both, palette, 4)
    preview.encode(PUBLIC / 'c-rising.gif', sequences[1], palette)
    preview.encode(PUBLIC / 'c-rising-slow.gif', sequences[1], palette, 4)
    sheet = Image.new('RGB', (840, 1240))
    sheet.paste(decoded[0], (0, 0))
    sheet.paste(decoded[1], (0, 620))
    sheet.save(ROOT / 'decoded-sheet.png')
    sheet.save(PUBLIC / 'decoded-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps({'durations_ms': preview.DURATIONS,
        'selected_motion': 'body-turn/c-rising', 'source_sha256': preview.base.sha(ROOT.parent / 'body-turn/frames/c-rising.png'),
        'contact_sha256': preview.base.sha(ROOT / 'frames/contact.png'),
        'palette_sha256': preview.base.sha(ROOT / 'palette.json'),
        'gif_sha256': preview.base.sha(PUBLIC / 'comparison.gif')}, indent=2) + '\n')
    print('Encoded selected motion and old/new palette comparison in normal and quarter speed')


if __name__ == '__main__':
    main()
