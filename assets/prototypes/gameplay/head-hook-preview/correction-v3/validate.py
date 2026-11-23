from pathlib import Path
import hashlib
import json
import unittest
from PIL import Image, ImageChops, ImageSequence

root = Path(__file__).resolve().parent
project = root.parents[4]


class RightHookStyleRepair(unittest.TestCase):
    def test_approved_left_art_and_gifs_are_unchanged(self):
        approved = json.loads((root / 'left-approved.json').read_text())['sha256']
        self.assertEqual(len(approved), 12)
        for path, digest in approved.items():
            with self.subTest(path=path):
                current = project / path.replace('head-hook-v2/', 'head-hook-v3/')
                self.assertEqual(hashlib.sha256(current.read_bytes()).hexdigest(), digest)

    def test_three_right_style_cells_are_nonempty_and_transparent(self):
        im = Image.open(root / 'right-shirt.png').convert('RGBA')
        self.assertEqual(im.width % 3, 0)
        for i in range(3):
            a = im.crop((i * im.width // 3, 0, (i + 1) * im.width // 3, im.height)).getchannel('A')
            self.assertGreater(sum(a.histogram()[240:]), 30000)
            self.assertGreater(a.histogram()[0], 30000)

    def test_right_gif_changes_attack_art_without_changing_timing_or_idle(self):
        versions = []
        for version in ('v2', 'v3'):
            with Image.open(project / f'scene-lab/public/previews/head-hook-{version}/right-2.gif') as im:
                self.assertEqual(im.info['loop'], 0)
                versions.append([(f.convert('RGB').copy(), f.info['duration'])
                                 for f in ImageSequence.Iterator(im)])
        before, after = versions
        self.assertEqual([t for _, t in before], [470, 40, 40, 120, 20, 520])
        self.assertEqual([t for _, t in before], [t for _, t in after])
        for i in (0, 5):
            self.assertEqual(before[i][0].tobytes(), after[i][0].tobytes())
        for i in (1, 2, 3, 4):
            diff = ImageChops.difference(before[i][0], after[i][0]).crop((80, 70, 380, 270))
            self.assertIsNotNone(diff.getbbox())


if __name__ == '__main__':
    unittest.main()
