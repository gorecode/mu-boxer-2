from pathlib import Path
import hashlib
import json
import unittest
from PIL import Image, ImageSequence

root = Path(__file__).resolve().parent
project = root.parents[4]


class RightHookMechanics(unittest.TestCase):
    def test_approved_left_is_unchanged(self):
        approved = json.loads((root.parent / 'correction-v3/left-approved.json').read_text())['sha256']
        self.assertEqual(len(approved), 12)
        for path, digest in approved.items():
            with self.subTest(path=path):
                current = project / path.replace('head-hook-v2/', 'head-hook-v4/')
                self.assertEqual(hashlib.sha256(current.read_bytes()).hexdigest(), digest)

    def test_contact_reaches_further_without_moving_lower_body(self):
        before = Image.open(root / 'before/right-contact.png').convert('RGBA')
        after = Image.open(root.parent / 'frames/right-contact.png').convert('RGBA')
        def reach(im):
            pixels = [(x, y) for y in range(75, 170) for x in range(250, 450)
                      if im.getpixel((x, y))[3] > 24]
            self.assertGreater(len(pixels), 500)
            return max(x for x, _ in pixels)
        self.assertGreaterEqual(reach(after) - reach(before), 23)
        self.assertLessEqual(reach(after) - reach(before), 27)
        self.assertEqual(after.crop((0, 245, 500, 530)).tobytes(), before.crop((0, 245, 500, 530)).tobytes())
        records = json.loads((root.parent / 'correction-v2/registration.json').read_text())
        right = {r['name']: r for r in records if r['name'].startswith('right-')}
        self.assertEqual(len(right), 3)
        self.assertLessEqual(abs(right['right-contact']['headOffset'][0] - right['right-early']['headOffset'][0]), 12)

    def test_new_strip_has_three_nonempty_transparent_cells(self):
        im = Image.open(root / 'right-hook.png').convert('RGBA')
        self.assertEqual(im.width % 3, 0)
        for i in range(3):
            a = im.crop((i * im.width // 3, 0, (i + 1) * im.width // 3, im.height)).getchannel('A')
            self.assertGreater(sum(a.histogram()[240:]), 30000)
            self.assertGreater(a.histogram()[0], 30000)

    def test_right_gif_preserves_timing_idle_and_loop(self):
        versions = []
        for version in ('v3', 'v4'):
            with Image.open(project / f'scene-lab/public/previews/head-hook-{version}/right-2.gif') as im:
                self.assertEqual(im.info['loop'], 0)
                versions.append([(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(im)])
        before, after = versions
        self.assertEqual([t for _, t in after], [470, 40, 40, 120, 20, 520])
        self.assertEqual([t for _, t in after], [t for _, t in before])
        for i in (0, 5):
            self.assertEqual(before[i][0].tobytes(), after[i][0].tobytes())
        for i in (1, 2, 3, 4):
            self.assertNotEqual(before[i][0].tobytes(), after[i][0].tobytes())


if __name__ == '__main__':
    unittest.main()
