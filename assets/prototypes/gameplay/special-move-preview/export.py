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
    approved = json.loads((ROOT / 'approved-dash.json').read_text())
    for name, digest in approved['gifs'].items():
        assert hashlib.sha256((PUBLIC / name).read_bytes()).hexdigest() == digest
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
            canonical = json.dumps(timeline, sort_keys=True, separators=(',', ':'), ensure_ascii=False)
            assert hashlib.sha256(canonical.encode()).hexdigest() == approved['timelineSha256']
            assert [hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames] == approved['nativeRgbSha256']
            assert at[600]['key'] == at[620]['key'] == 'jab-hybrid/jab-0.webp'
            assert not at[620]['active'] and at[640]['active']
            assert all(frame['key'] == 'boxer-2.webp' and frame['hand'] == 'jab' for frame in timeline if 640 <= frame['t'] < 960)
            assert at[960]['key'] == at[980]['key'] == 'cross-hybrid/cross-0.webp'
            assert not at[960]['active'] and not at[980]['active']
            assert all(frame['key'] == 'boxer-3.webp' and frame['hand'] == 'right-straight' for frame in timeline if 1000 <= frame['t'] < 1300)
            assert at[640]['x'] == 400 and at[900]['x'] == 650
            assert at[1240]['x'] == 867 and at[1240]['wx'] == 1130
            assert at[1220]['active'] and not at[1240]['active']
            assert at[880]['contact'] == 0 and at[900]['contact'] == 1
            assert at[940]['contact'] == 1 and at[960]['contact'] == 0
            assert at[980]['contact'] == 0 and at[1000]['contact'] == 2
            assert at[1100]['contact'] == 2 and at[1120]['contact'] == 0
            assert sum(frame['impact'] for frame in timeline) * 20 == 180
            assert {frame['contact'] for frame in timeline if frame['contact']} == {1, 2}
            push = [frame for frame in timeline if 900 <= frame['t'] <= 1240]
            for frame in push:
                follow = 27 * max(0, min(1, (frame['t'] - 960) / 40))
                assert abs(frame['wx'] - frame['x'] - (290 - follow)) < 1e-6
            assert all(b['x'] > a['x'] and b['wx'] > a['wx'] for a, b in zip(push, push[1:]))
        if name == 'pullback-hook':
            assert at[740]['x'] < at[0]['x'] < at[960]['x']
            assert at[640]['x'] == 620 and at[740]['x'] == 540
            assert at[960]['x'] == 700 and at[1120]['x'] == 800
            assert at[1040]['x'] == 700 < at[1080]['x'] < at[1120]['x']
            assert at[760]['worker'] == 'worker-2.webp' and at[780]['worker'] == 'worker-1.webp'
            assert all(frame['lift'] == 0 and frame['key'] != 'boxer-7.webp' for frame in timeline)
            assert [at[t]['key'] for t in [640, 680, 700, 720]] == [f'walk/walk-{i}.webp' for i in [3, 2, 1, 0]]
            assert at[620]['key'] == 'boxer-0.webp' and at[740]['key'] == 'walk/walk-0.webp'
            back = [frame for frame in timeline if 640 <= frame['t'] <= 740]
            forward = [frame for frame in timeline if 740 <= frame['t'] <= 960]
            assert all(b['x'] < a['x'] for a, b in zip(back, back[1:]))
            assert all(b['x'] > a['x'] for a, b in zip(forward, forward[1:]))
            assert not any(frame['active'] or frame['contact'] for frame in timeline if frame['t'] < 940)
            assert not at[940]['contact'] and at[960]['contact'] == 1
            assert at[1020]['contact'] == 1 and at[1040]['contact'] == 0
            assert at[1100]['contact'] == 0 and at[1120]['contact'] == 2
            assert at[1220]['contact'] == 2 and at[1240]['contact'] == 0
            assert at[960]['key'] == 'boxer-3.webp' and at[960]['hand'] == 'right-straight'
            assert at[1120]['key'] == 'boxer-12.webp' and at[1120]['hand'] == 'left-hook'
            assert at[1060]['key'] == 'cross-hybrid/cross-0.webp'
            assert sum(frame['impact'] for frame in timeline) * 20 == 200
        originals[name] = frames
    sheet = Image.new('RGB', (1200, 134 * len(IDS)))
    selected = [30, 36, 40, 48, 56, 65]
    for row, name in enumerate(IDS):
        for col, index in enumerate(selected):
            thumb = originals[name][index].resize((200, 134), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (col * 200, row * 134))
    with Image.open(PUBLIC / 'dash-straight.gif') as gif:
        palette = gif.copy()
    report = []
    decoded_sheet = Image.new('RGB', (1600, 534 * len(IDS)))
    for row, name in enumerate(IDS):
        frames = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in originals[name]]
        normal_signature = None
        for suffix, speed in [('', 1), ('-slow', 4)]:
            path = PUBLIC / f'{name}{suffix}.gif'
            if name != 'dash-straight':
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
    for name, digest in approved['gifs'].items():
        assert hashlib.sha256((PUBLIC / name).read_bytes()).hexdigest() == digest
    print('Verified approved dash bytes/timeline/130 native frames unchanged; grounded 80px/100ms backstep, two-hit order, contact boundaries and decoded slow frames')


if __name__ == '__main__':
    main()
