from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/heavy-two-pose'
OPTIONS = [('hook', '1. БОКОВОЙ В ГОЛОВУ'), ('overhand', '2. РУБЯЩИЙ СВЕРХУ'), ('body', '3. СИЛОВОЙ В КОРПУС')]
DURATIONS = [550, 120, 540]


def panel(name, title):
    image = Image.new('RGB', (500, 560), '#201b20')
    image.paste(Image.open(ROOT / f'panels/{name}.png'), (0, 45))
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
    draw.text((12, 14), title, font=font, fill='#f5dbc3')
    draw.text((12, 532), 'IDLE → КОНТАКТ  |  2 РИСУНКА', font=font, fill='#f5dbc3')
    return image


def export():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    idle = [panel('idle', title) for _, title in OPTIONS]
    contacts = [panel(name, title) for name, title in OPTIONS]
    board_idle = Image.new('RGB', (1500, 560))
    board_contact = board_idle.copy()
    for i in range(3):
        board_idle.paste(idle[i], (i * 500, 0))
        board_contact.paste(contacts[i], (i * 500, 0))
    palette_source = Image.new('RGB', (1500, 1120))
    palette_source.paste(board_idle); palette_source.paste(board_contact, (0, 560))
    palette = palette_source.quantize(colors=256)
    report = []
    for name, a, b in [('comparison', board_idle, board_contact)] + [(name, idle[i], contacts[i]) for i, (name, _) in enumerate(OPTIONS)]:
        quantized = [im.quantize(palette=palette, dither=Image.Dither.NONE) for im in [a, b, a]]
        for suffix, speed in [('', 1), ('-slow', 4)]:
            path = PUBLIC / f'{name}{suffix}.gif'
            quantized[0].save(path, save_all=True, append_images=quantized[1:], duration=[d * speed for d in DURATIONS], loop=0, optimize=False, disposal=1)
            with Image.open(path) as gif:
                decoded = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                timings = [frame.info['duration'] for frame in ImageSequence.Iterator(gif)]
                assert timings == [d * speed for d in DURATIONS]
                assert len(set(frame.tobytes() for frame in decoded)) == 2
                assert decoded[0].tobytes() == decoded[-1].tobytes()
                assert gif.info['loop'] == 0
            report.append({'file': path.name, 'durationsMs': timings, 'uniqueDrawings': 2, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    palette_source.save(PUBLIC / 'contact-sheet.png')
    with Image.open(PUBLIC / 'comparison.gif') as gif:
        gif.seek(1); gif.convert('RGB').save(ROOT / 'decoded-contact.png')
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(f'{len(report)} GIFs decoded: exactly two drawings, identical idle return, shared palette')


if __name__ == '__main__':
    export()
