from pathlib import Path
from PIL import Image, ImageSequence
import hashlib
import json
import unittest

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[3] / 'scene-lab/public/previews/right-hook-three'


class RightHookChoiceTests(unittest.TestCase):
    def test_original_idle_and_chosen_left_are_preserved(self):
        source = Image.open(ROOT.parent / 'head-hook-preview/frames/idle.png').convert('RGBA')
        self.assertEqual(source.tobytes(), Image.open(ROOT / 'frames/idle.png').convert('RGBA').tobytes())
        manifest = json.loads((ROOT.parent / 'head-hook-preview/correction-v3/left-approved.json').read_text())['sha256']
        project = ROOT.parents[3]
        self.assertGreater(len(manifest), 0)
        for path, digest in manifest.items():
            self.assertEqual(hashlib.sha256((project / path).read_bytes()).hexdigest(), digest)

    def test_three_distinct_unclipped_contacts_have_registered_feet(self):
        images = []
        for name in ['a', 'b', 'c']:
            frame = Image.open(ROOT / f'frames/{name}.png').convert('RGBA')
            images.append(frame.tobytes())
            self.assertEqual(frame.size, (500, 530))
            alpha = frame.getchannel('A').point(lambda a: 255 if a > 24 else 0)
            bounds = alpha.getbbox()
            self.assertIsNotNone(bounds)
            self.assertGreater(bounds[0], 0)
            self.assertLess(bounds[2], 500)
            self.assertLess(bounds[3], 530)
            foot = alpha.crop((300, 450, 370, 500)).getbbox()
            self.assertIsNotNone(foot)
            self.assertLessEqual(abs(300 + foot[2] - 1 - 344), 1)
            self.assertLessEqual(abs(450 + foot[3] - 1 - 485), 1)
        self.assertEqual(len(set(images)), 3)

    def test_original_face_pixels_in_each_new_pose(self):
        idle = Image.open(ROOT / 'frames/idle.png').convert('RGBA')
        records = json.loads((ROOT / 'registration.json').read_text())
        self.assertEqual(len(records), 3)
        for record in records:
            self.assertIsNotNone(record['headOffset'])
            dx, dy = record['headOffset']
            frame = Image.open(ROOT / f"frames/{record['name']}.png").convert('RGBA')
            count = 0
            for y in range(10, 75):
                for x in range(215, 270):
                    pixel = idle.getpixel((x, y))
                    if pixel[3] >= 240:
                        actual = frame.getpixel((x + dx, y + dy))
                        self.assertTrue(all(abs(a - b) <= 1 for a, b in zip(pixel[:3], actual[:3])))
                        count += 1
            self.assertGreater(count, 2000)

    def test_encoded_gifs_match_panels_and_return_to_identical_idle(self):
        for suffix, speed in [('', 1), ('-slow', 4)]:
            with Image.open(PUBLIC / f'comparison{suffix}.gif') as gif:
                board = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                self.assertEqual(gif.info['loop'], 0)
                self.assertEqual([f.info['duration'] for f in ImageSequence.Iterator(gif)], [550 * speed, 120 * speed, 540 * speed])
            self.assertEqual(len(board), 3)
            self.assertEqual(board[0].tobytes(), board[-1].tobytes())
            self.assertEqual(len(set(f.tobytes() for f in board)), 2)
            for i, name in enumerate(['a', 'b', 'c']):
                with Image.open(PUBLIC / f'{name}{suffix}.gif') as gif:
                    frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                    self.assertEqual(gif.info['loop'], 0)
                    self.assertEqual([f.info['duration'] for f in ImageSequence.Iterator(gif)], [550 * speed, 120 * speed, 540 * speed])
                self.assertEqual(len(frames), 3)
                self.assertEqual(len(set(f.tobytes() for f in frames)), 2)
                for image, all_panels in zip(frames, board):
                    self.assertEqual(image.tobytes(), all_panels.crop((i * 500, 0, (i + 1) * 500, 560)).tobytes())
                if i:
                    self.assertEqual(board[0].crop((0, 45, 500, 520)).tobytes(), frames[0].crop((0, 45, 500, 520)).tobytes())


if __name__ == '__main__':
    unittest.main()
