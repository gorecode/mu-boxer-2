from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[3] / 'scene-lab/public/previews/heavy-two-pose'
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)


def panel(pose, title):
    result = Image.new('RGB', (500, 560), '#201b20')
    result.paste(Image.open(ROOT / f'panels/{pose}.png'), (0, 45))
    draw = ImageDraw.Draw(result)
    draw.text((12, 14), title, font=FONT, fill='#f5dbc3')
    draw.text((12, 532), 'IDLE → КОНТАКТ  |  2 РИСУНКА', font=FONT, fill='#f5dbc3')
    return result


def export_pair():
    pairs = [(panel('idle', title), panel(name, title)) for name, title in
             [('hook', 'A. ЛЕВЫЙ БОКОВОЙ — ВЫБРАН'), ('right', 'Б. ПРАВЫЙ БОКОВОЙ — НОВЫЙ')]]
    boards = []
    for state in [0, 1]:
        board = Image.new('RGB', (1000, 560))
        for i, pair in enumerate(pairs):
            board.paste(pair[state], (500 * i, 0))
        boards.append(board)
    sheet = Image.new('RGB', (1000, 1120))
    sheet.paste(boards[0]); sheet.paste(boards[1], (0, 560))
    palette = sheet.quantize(colors=256)
    report = []
    for name, (idle, contact) in [('hook-pair', boards), ('right-hook', pairs[1])]:
        frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in [idle, contact, idle]]
        for suffix, multiplier in [('', 1), ('-slow', 4)]:
            path = PUBLIC / f'{name}{suffix}.gif'
            frames[0].save(path, save_all=True, append_images=frames[1:], loop=0,
                           duration=[550 * multiplier, 120 * multiplier, 540 * multiplier], disposal=1, optimize=False)
            with Image.open(path) as gif:
                decoded = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                durations = [frame.info['duration'] for frame in ImageSequence.Iterator(gif)]
                assert durations == [550 * multiplier, 120 * multiplier, 540 * multiplier]
                assert len(set(frame.tobytes() for frame in decoded)) == 2
                assert decoded[0].tobytes() == decoded[2].tobytes()
                assert gif.info['loop'] == 0
            report.append({'file': path.name, 'durationsMs': durations, 'uniqueDrawings': 2,
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    sheet.save(PUBLIC / 'hook-pair-sheet.png')
    with Image.open(PUBLIC / 'hook-pair.gif') as gif:
        gif.seek(1); gif.convert('RGB').save(ROOT / 'decoded-hook-pair.png')
    (ROOT / 'pair-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Four hook GIFs decoded: idle/contact/idle, same timing and common palette')


if __name__ == '__main__':
    export_pair()
