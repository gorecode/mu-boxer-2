from pathlib import Path
from PIL import Image, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/special-move-preview'
IDS = ['dash-straight', 'pullback-hook', 'duck-body']


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    timelines = json.loads((ROOT / 'timeline.json').read_text())
    originals = {}
    for item in json.loads((ROOT / 'source-manifest.json').read_text()):
        source = PROJECT / 'scene-lab/public/art/fight' / item['name']
        assert hashlib.sha256(source.read_bytes()).hexdigest() == item['sha256']
        with Image.open(source) as image:
            assert image.width > 100 and image.height > 100
    for name in IDS:
        paths = sorted((ROOT / 'rendered' / name).glob('*.png'))
        assert len(paths) == 130
        frames = [Image.open(path).convert('RGB') for path in paths]
        assert all(frame.size == (800, 534) for frame in frames)
        assert frames[0].tobytes() == frames[-1].tobytes()
        assert len({frame.tobytes() for frame in frames}) > 20
        timeline = timelines[name]
        assert all(frame['ground'] == 820 for frame in timeline)
        assert sum(frame['impact'] for frame in timeline) * 20 == 120
        assert timeline[0]['x'] == timeline[-1]['x']
        assert timeline[0]['key'] == timeline[-1]['key'] == 'boxer-0.webp'
        assert all(frame['anchorY'] > 0 and frame['scale'] > 0 for frame in timeline)
        at = {frame['t']: frame for frame in timeline}
        expected_contact = {'dash-straight': ('boxer-2.webp', 650),
                            'pullback-hook': ('boxer-12.webp', 780),
                            'duck-body': ('boxer-3.webp', 720)}[name]
        assert (at[1120]['key'], at[1120]['x']) == expected_contact
        assert not at[1100]['impact'] and at[1120]['impact']
        assert at[1220]['impact'] and not at[1240]['impact']
        assert at[1300]['key'] == 'boxer-0.webp'
        assert at[1300]['x'] == at[1740]['x'] == expected_contact[1]
        if name == 'pullback-hook':
            assert at[840]['x'] < at[0]['x'] < at[1120]['x']
            assert at[840]['worker'] == 'worker-2.webp'
        if name == 'duck-body':
            assert at[800]['key'] == at[960]['key'] == 'boxer-5.webp'
            assert at[800]['x'] < at[960]['x'] < at[1120]['x']
        originals[name] = frames
    sheet = Image.new('RGB', (1200, 402))
    selected = [0, 40, 50, 56, 62, 66]
    for row, name in enumerate(IDS):
        for col, index in enumerate(selected):
            thumb = originals[name][index].resize((200, 134), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (col * 200, row * 134))
    palette_source = Image.new('RGB', (800 * 3, 534 * 4))
    for col, name in enumerate(IDS):
        for row, index in enumerate([0, 45, 56, 66]):
            palette_source.paste(originals[name][index], (col * 800, row * 534))
    palette = palette_source.quantize(colors=256)
    report = []
    decoded_sheet = Image.new('RGB', (1600, 534 * 3))
    for row, name in enumerate(IDS):
        frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in originals[name]]
        normal_signature = None
        for suffix, speed in [('', 1), ('-slow', 4)]:
            path = PUBLIC / f'{name}{suffix}.gif'
            frames[0].save(path, save_all=True, append_images=frames[1:], duration=20 * speed,
                           loop=0, optimize=False, disposal=1)
            with Image.open(path) as gif:
                decoded = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                durations = [frame.info['duration'] for frame in ImageSequence.Iterator(gif)]
                assert sum(durations) == 2600 * speed
                assert gif.info['loop'] == 0 and gif.size == (800, 534)
                assert len(decoded) > 20
                assert decoded[0].tobytes() == decoded[-1].tobytes()
                assert all(duration % (20 * speed) == 0 for duration in durations)
                signature = [hashlib.sha256(frame.tobytes()).hexdigest() for frame in decoded]
                if suffix:
                    assert signature == normal_signature
                else:
                    normal_signature = signature
                if not suffix:
                    elapsed = 0
                    for frame, duration in zip(decoded, durations):
                        if elapsed <= 1000 < elapsed + duration:
                            decoded_sheet.paste(frame, (0, row * 534))
                        if elapsed <= 1140 < elapsed + duration:
                            decoded_sheet.paste(frame, (800, row * 534))
                        elapsed += duration
            report.append({'file': path.name, 'durationMs': sum(durations), 'frames': len(decoded),
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    decoded_sheet.save(PUBLIC / 'decoded-sheet.png')
    sheet.save(PUBLIC / 'contact-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print('Verified six decoded GIFs: sources, registration, motion boundaries, 120ms contact, idle return and identical slow frames')


if __name__ == '__main__':
    main()
