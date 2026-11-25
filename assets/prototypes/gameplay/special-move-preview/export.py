from pathlib import Path
from PIL import Image, ImageSequence
import hashlib
import json

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/special-move-preview'
IDS = ['dash-straight', 'pullback-hook']


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
        assert timeline[0]['x'] == timeline[-1]['x']
        assert timeline[0]['key'] == timeline[-1]['key'] == 'boxer-0.webp'
        assert all(frame['anchorY'] > 0 and frame['scale'] > 0 for frame in timeline)
        at = {frame['t']: frame for frame in timeline}
        assert at[1300]['key'] == 'boxer-0.webp'
        assert at[1300]['x'] == at[1740]['x']
        assert not any(frame['active'] or frame['contact'] for frame in timeline if frame['t'] >= 1300)
        assert all(not frame['contact'] or frame['active'] for frame in timeline)
        if name == 'dash-straight':
            assert at[600]['key'] == at[620]['key'] == 'jab-hybrid/jab-0.webp'
            assert not at[620]['active'] and at[640]['active']
            assert all(frame['key'] == 'boxer-2.webp' for frame in timeline if 640 <= frame['t'] < 1300)
            assert at[640]['x'] == 400 and at[900]['x'] == 650
            assert at[1240]['x'] == 840 and at[1240]['wx'] == 1130
            assert at[1220]['active'] and not at[1240]['active']
            assert sum(frame['impact'] for frame in timeline) * 20 == 60
            assert {frame['contact'] for frame in timeline if frame['contact']} == {1}
            push = [frame for frame in timeline if 900 <= frame['t'] <= 1240]
            assert all(abs(frame['wx'] - frame['x'] - 290) < 1e-6 for frame in push)
            assert all(b['x'] > a['x'] and b['wx'] > a['wx'] for a, b in zip(push, push[1:]))
        if name == 'pullback-hook':
            assert at[800]['x'] < at[0]['x'] < at[960]['x']
            assert at[800]['x'] == 430 and at[960]['x'] == 780
            assert at[760]['worker'] == 'worker-2.webp' and at[820]['worker'] == 'worker-1.webp'
            assert at[720]['lift'] == 55 and at[800]['lift'] == 0
            assert all(frame['key'] == 'boxer-7.webp' for frame in timeline if 640 <= frame['t'] < 800)
            assert not any(frame['active'] for frame in timeline if frame['lift'] > 0)
            assert at[800]['key'].startswith('walk/') and at[800]['lift'] == 0
            assert not at[940]['contact'] and at[960]['contact'] == 1
            assert at[1020]['contact'] == 1 and at[1040]['contact'] == 0
            assert at[1100]['contact'] == 0 and at[1120]['contact'] == 2
            assert at[1220]['contact'] == 2 and at[1240]['contact'] == 0
            assert at[960]['key'] == 'boxer-12.webp' and at[960]['hand'] == 'left-hook'
            assert at[1120]['key'] == 'boxer-3.webp' and at[1120]['hand'] == 'right-straight'
            assert at[1060]['key'] == 'cross-hybrid/cross-0.webp'
            assert sum(frame['impact'] for frame in timeline) * 20 == 200
        originals[name] = frames
    sheet = Image.new('RGB', (1200, 134 * len(IDS)))
    selected = [30, 36, 40, 48, 56, 65]
    for row, name in enumerate(IDS):
        for col, index in enumerate(selected):
            thumb = originals[name][index].resize((200, 134), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (col * 200, row * 134))
    palette_source = Image.new('RGB', (800 * len(IDS), 534 * 4))
    for col, name in enumerate(IDS):
        for row, index in enumerate([0, 45, 56, 66]):
            palette_source.paste(originals[name][index], (col * 800, row * 534))
    palette = palette_source.quantize(colors=256)
    report = []
    decoded_sheet = Image.new('RGB', (1600, 534 * len(IDS)))
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
                        if elapsed <= (900 if name == 'dash-straight' else 980) < elapsed + duration:
                            decoded_sheet.paste(frame, (0, row * 534))
                        if elapsed <= 1140 < elapsed + duration:
                            decoded_sheet.paste(frame, (800, row * 534))
                        elapsed += duration
            report.append({'file': path.name, 'durationMs': sum(durations), 'frames': len(decoded),
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    decoded_sheet.save(PUBLIC / 'decoded-sheet.png')
    sheet.save(PUBLIC / 'contact-sheet.png')
    (ROOT / 'verification.json').write_text(json.dumps(report, indent=2) + '\n')
    assert set(timelines) == set(IDS)
    assert not list(PUBLIC.glob('duck-body*.gif'))
    print('Verified four decoded GIFs: early active slide + push, back hop + two hands, contact boundaries, idle return and identical slow frames')


if __name__ == '__main__':
    main()
