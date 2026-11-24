from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[3] / 'scene-lab/public/previews/right-hook-three'
POSES = json.loads((ROOT / 'poses.json').read_text())


def panel(pose, title):
    image = Image.new('RGB', (500, 560), '#201b20')
    image.paste(Image.open(ROOT / f'panels/{pose}.png'), (0, 45))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 16)
    draw.text((12, 14), title, font=font, fill='#f5dbc3')
    draw.text((12, 532), 'IDLE → КОНТАКТ  |  2 РИСУНКА', font=font, fill='#f5dbc3')
    return image


def export():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    pairs = [(panel('idle', pose['title']), panel(pose['name'], pose['title'])) for pose in POSES]
    boards = []
    for state in [0, 1]:
        board = Image.new('RGB', (1500, 560))
        for i, pair in enumerate(pairs):
            board.paste(pair[state], (i * 500, 0))
        boards.append(board)
    sheet = Image.new('RGB', (1500, 1120))
    sheet.paste(boards[0]); sheet.paste(boards[1], (0, 560))
    palette = sheet.quantize(colors=256)
    report = []
    for name, (idle, contact) in [('comparison', boards)] + [(pose['name'], pairs[i]) for i, pose in enumerate(POSES)]:
        frames = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in [idle, contact, idle]]
        for suffix, speed in [('', 1), ('-slow', 4)]:
            path = PUBLIC / f'{name}{suffix}.gif'
            frames[0].save(path, save_all=True, append_images=frames[1:], duration=[550 * speed, 120 * speed, 540 * speed], loop=0, optimize=False, disposal=1)
            with Image.open(path) as gif:
                decoded = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                durations = [frame.info['duration'] for frame in ImageSequence.Iterator(gif)]
                assert durations == [550 * speed, 120 * speed, 540 * speed]
                assert len(set(frame.tobytes() for frame in decoded)) == 2
                assert decoded[0].tobytes() == decoded[-1].tobytes()
                assert gif.info['loop'] == 0
            report.append({'file': path.name, 'durationsMs': durations, 'uniqueDrawings': 2, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    sheet.save(PUBLIC / 'contact-sheet.png')
    with Image.open(PUBLIC / 'comparison.gif') as gif:
        gif.seek(1); gif.convert('RGB').save(ROOT / 'decoded-contact.png')
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Eight GIFs decoded: exactly two drawings, identical idle return, shared palette')


if __name__ == '__main__':
    export()
