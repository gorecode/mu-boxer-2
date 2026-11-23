from pathlib import Path
import hashlib
import json
import unittest
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parent
project = root.parents[4]


class SharedHookParts(unittest.TestCase):
    def test_approved_left_and_right_endpoints_stay_identical(self):
        approved = json.loads((root.parent / 'correction-v3/left-approved.json').read_text())['sha256']
        self.assertEqual(len(approved), 12)
        for path, digest in approved.items():
            self.assertEqual(hashlib.sha256((project / path.replace('head-hook-v2/', 'head-hook-v5/')).read_bytes()).hexdigest(), digest)
        for pose in ('idle', 'contact'):
            name = 'idle' if pose == 'idle' else 'right-contact'
            self.assertEqual((root.parent / f'frames/{name}.png').read_bytes(), (root / f'masters/{pose}.png').read_bytes())
        for suffix in ('', '-slow'):
            a = project / f'scene-lab/public/previews/head-hook-v4/right-0{suffix}.gif'
            b = project / f'scene-lab/public/previews/head-hook-v5/right-0{suffix}.gif'
            self.assertEqual(a.read_bytes(), b.read_bytes())

    def test_preparation_reuses_idle_pixels_instead_of_redrawing(self):
        idle = Image.open(root / 'masters/idle.png').convert('RGBA')
        early = Image.open(root.parent / 'frames/right-early.png').convert('RGBA')
        count = 0
        for y in range(243):
            for x in range(3, 500):
                if idle.getpixel((x, y))[3] >= 240:
                    self.assertEqual(early.getpixel((x - 3, y + 1)), idle.getpixel((x, y)))
                    count += 1
        self.assertGreater(count, 15000)
        self.assertEqual(early.crop((0, 245, 500, 530)).tobytes(), idle.crop((0, 245, 500, 530)).tobytes())

    def test_release_reuses_contact_cloth_and_lower_body(self):
        contact = Image.open(root / 'masters/contact.png').convert('RGBA')
        late = Image.open(root.parent / 'frames/right-late.png').convert('RGBA')
        count = 0
        for y in range(200, 234):
            for x in range(130, 215):
                if contact.getpixel((x, y))[3] >= 240:
                    self.assertEqual(late.getpixel((x - 4, y + 1)), contact.getpixel((x, y)))
                    count += 1
        self.assertGreater(count, 2000)
        self.assertEqual(late.crop((0, 245, 500, 530)).tobytes(), contact.crop((0, 245, 500, 530)).tobytes())
        for y in range(106, 176):
            self.assertGreater(sum(late.getpixel((x, y))[3] > 240 for x in range(270, 308)), 6)

    def test_source_layers_are_nonempty_and_late_joints_match_projection(self):
        rig = json.loads((root / 'rig.json').read_text())
        contact = Image.open(root / 'masters/contact.png').convert('RGBA')
        for name in ('plate', 'upper', 'fore'):
            im = Image.open(root / f'{name}.png').convert('RGBA')
            self.assertEqual(im.size, (500, 530))
            self.assertGreater(sum(im.getchannel('A').histogram()[240:]), 500)
            if name != 'plate':
                samples = [(x, y) for y in range(90, 180) for x in range(140, 360)
                           if im.getpixel((x, y))[3] >= 252 and contact.getpixel((x, y))[3] >= 252]
                self.assertGreater(len(samples), 1000)
                for x, y in samples:
                    self.assertLessEqual(max(abs(a - b) for a, b in zip(im.getpixel((x, y))[:3], contact.getpixel((x, y))[:3])), 1)
        shoulder, elbow, wrist = (rig['late'][n] for n in ('shoulder', 'elbow', 'wrist'))
        for a, b, expected in ((shoulder, elbow, rig['late']['lengths'][0]), (elbow, wrist, rig['late']['lengths'][1])):
            self.assertAlmostEqual(sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5, expected)

    def test_all_three_right_poses_keep_original_face_pixels(self):
        rig = json.loads((root / 'rig.json').read_text())
        head = Image.open(root.parent / 'correction-v2/head-source.png').convert('RGBA')
        pixels = [(x, y) for y in range(110) for x in range(190, 290) if head.getpixel((x, y))[3] >= 240]
        self.assertGreater(len(pixels), 4000)
        for pose, (dx, dy) in rig['headOffsets'].items():
            frame = Image.open(root.parent / f'frames/right-{pose}.png').convert('RGBA')
            for x, y in pixels:
                actual = frame.getpixel((x + dx, y + dy))
                self.assertLessEqual(max(abs(a - b) for a, b in zip(actual[:3], head.getpixel((x, y))[:3])), 1)
                self.assertGreaterEqual(actual[3], 240)

    def test_gif_timing_and_loop_still_match_approved_schedule(self):
        for i, times in enumerate(([550, 120, 540], [470, 80, 120, 20, 520], [470, 40, 40, 120, 20, 520])):
            with Image.open(project / f'scene-lab/public/previews/head-hook-v5/right-{i}.gif') as im:
                self.assertEqual(im.info['loop'], 0)
                decoded = [(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(im)]
            self.assertEqual([t for _, t in decoded], times)
            self.assertEqual(len({f.tobytes() for f, _ in decoded}), i + 2)
            self.assertEqual(decoded[0][0].tobytes(), decoded[-1][0].tobytes())


if __name__ == '__main__':
    unittest.main()
