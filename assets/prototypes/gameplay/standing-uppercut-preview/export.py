from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
ART = PROJECT / 'scene-lab/public/art/fight'
PUBLIC = PROJECT / 'scene-lab/public/previews/standing-uppercut'
IDS = ['a-lead', 'b-rear', 'c-shovel']
TITLES = ['А · КОРОТКИЙ ЛЕВОЙ', 'Б · ВЫСОКИЙ КЛАССИЧЕСКИЙ', 'В · ДИАГОНАЛЬНЫЙ']
SIZES = (420, 620)
DURATIONS = [600, 160, 840]
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def register(image, height=493, head_top=None):
    image = image.convert('RGBA')
    box = image.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box or box[3] - box[1] < 100:
        raise ValueError('Missing full-body alpha silhouette')
    body = image.crop(box)
    head_top = box[1] if head_top is None else head_top
    if head_top < box[1] or head_top >= box[3] - 100:
        raise ValueError('Head landmark outside full-body silhouette')
    scale = height / (box[3] - head_top)
    size = (round(body.width * scale), round(body.height * scale))
    if size[0] > 430:
        raise ValueError('Contact exceeds preview registration width')
    body = body.resize(size, Image.Resampling.LANCZOS)
    target = Image.new('RGBA', (500, 550))
    x, y = round(228 - 23.5 - body.width / 2), 523 - body.height
    if x < 2 or y < 2 or x + body.width > 498:
        raise ValueError('Registered sprite would be clipped')
    target.alpha_composite(body, (x, y))
    return target, {'source_bbox': box, 'head_top': head_top, 'scale': scale, 'x': x, 'y': y,
                    'anchorX': 228, 'anchorY': 525, 'height': height}


def idle_frame():
    source = Image.open(ART / 'boxer-0.webp').convert('RGBA')
    frame = Image.new('RGBA', (500, 550))
    frame.alpha_composite(source, (64, 30))
    return frame


def panel(sprite, index, contact):
    image = Image.open(ART / 'arena.webp').convert('RGB').resize((1102, 620))
    image = image.crop((340, 0, 760, 620))
    image = Image.blend(image, Image.new('RGB', SIZES, '#1d141b'), .38).convert('RGBA')
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 420, 71), fill='#21191f')
    draw.text((15, 13), TITLES[index], font=ImageFont.truetype(FONT, 17), fill='#f2d1b6')
    draw.text((15, 43), 'АППЕРКОТ ИЗ СТОЙКИ · ЭСКИЗ', font=ImageFont.truetype(FONT, 12), fill='#bca7a4')
    draw.ellipse((73, 575, 347, 594), fill='#120c16a0')
    image.alpha_composite(sprite, (-18, 61))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 596, 420, 620), fill='#21191f')
    draw.text((15, 601), 'КОНТАКТ · 160 мс' if contact else 'ИСХОДНАЯ СТОЙКА',
              font=ImageFont.truetype(FONT, 12), fill='#ffdf9c' if contact else '#bca7a4')
    return image.convert('RGB')


def palette_for(frames):
    atlas = Image.new('RGB', (420 * len(frames), 620))
    for i, frame in enumerate(frames):
        atlas.paste(frame, (420 * i, 0))
    return atlas.quantize(colors=256, method=Image.Quantize.MEDIANCUT)


def encode(path, frames, palette, multiplier):
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(path, save_all=True, append_images=indexed[1:],
                    duration=[d * multiplier for d in DURATIONS], loop=0, disposal=2, optimize=False)
    with Image.open(path) as decoded:
        states = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(decoded)]
        durations = []
        for frame in ImageSequence.Iterator(decoded):
            durations.append(frame.info['duration'])
    assert len(states) == 3 and durations == [d * multiplier for d in DURATIONS]
    assert states[0].tobytes() == states[-1].tobytes()
    assert states[0].tobytes() != states[1].tobytes()
    return states


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    (ROOT / 'frames').mkdir(exist_ok=True)
    idle = idle_frame()
    idle.save(ROOT / 'frames/idle.png')
    contacts, registration = [], {}
    for name in IDS:
        path = ROOT / 'inputs' / f'{name}.png'
        frame, record = register(Image.open(path), head_top=44 if name == 'b-rear' else None)
        frame.save(ROOT / 'frames' / f'{name}.png')
        contacts.append(frame)
        registration[name] = dict(record, source_sha256=sha(path))
    panels = [[panel(idle, i, False), panel(contacts[i], i, True), panel(idle, i, False)] for i in range(3)]
    palette = palette_for([frame for sequence in panels for frame in sequence[:2]])
    comparisons = [Image.new('RGB', (1260, 620)) for _ in range(3)]
    decoded_sheet = Image.new('RGB', (1260, 1240))
    records = {}
    for i, name in enumerate(IDS):
        decoded = encode(PUBLIC / f'{name}.gif', panels[i], palette, 1)
        encode(PUBLIC / f'{name}-slow.gif', panels[i], palette, 4)
        for j in range(3):
            comparisons[j].paste(panels[i][j], (420 * i, 0))
        decoded_sheet.paste(decoded[0], (420 * i, 0))
        decoded_sheet.paste(decoded[1], (420 * i, 620))
        records[name] = {'gif_sha256': sha(PUBLIC / f'{name}.gif'), 'duration_ms': DURATIONS,
                         'registration': registration[name]}
    encode(PUBLIC / 'comparison.gif', comparisons, palette, 1)
    encode(PUBLIC / 'comparison-slow.gif', comparisons, palette, 4)
    decoded_sheet.save(PUBLIC / 'decoded-sheet.png')
    decoded_sheet.save(ROOT / 'decoded-sheet.png')
    report = {'idle_sha256': sha(ART / 'boxer-0.webp'), 'variants': records}
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Rendered three standing contacts, 8 GIFs and decoded comparison sheet')


if __name__ == '__main__':
    main()
