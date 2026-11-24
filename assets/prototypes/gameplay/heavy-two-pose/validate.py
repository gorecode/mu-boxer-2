from pathlib import Path
from PIL import Image, ImageSequence
import json
import hashlib
import unittest

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[3]
PUBLIC = PROJECT / 'scene-lab/public/previews/heavy-two-pose'


class TwoPosePreviewTests(unittest.TestCase):
    def test_original_idle_and_approved_hook_are_unchanged(self):
        for name, original in [('idle', 'idle'), ('hook', 'left-contact')]:
            source = Image.open(ROOT.parent / f'head-hook-preview/frames/{original}.png').convert('RGBA')
            result = Image.open(ROOT / f'frames/{name}.png').convert('RGBA')
            self.assertEqual(source.tobytes(), result.tobytes())

    def test_transparency_registration_and_unclipped_silhouettes(self):
        for name in ['idle', 'hook', 'overhand', 'body', 'right']:
            with self.subTest(name=name):
                frame = Image.open(ROOT / f'frames/{name}.png').convert('RGBA')
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

    def test_new_pose_faces_use_original_pixels(self):
        idle = Image.open(ROOT / 'frames/idle.png').convert('RGBA')
        for record in json.loads((ROOT / 'registration.json').read_text()):
            output = Image.open(ROOT / f"frames/{record['name']}.png").convert('RGBA')
            dx, dy = record['headOffset']
            count = 0
            for y in range(10, 75):
                for x in range(215, 270):
                    source = idle.getpixel((x, y))
                    if source[3] >= 240:
                        actual = output.getpixel((x + dx, y + dy))
                        self.assertTrue(all(abs(a - b) <= 1 for a, b in zip(source[:3], actual[:3])))
                        count += 1
            self.assertGreater(count, 2000)

    def test_gifs_have_only_idle_contact_idle_and_match_comparison(self):
        for suffix, multiplier in [('', 1), ('-slow', 4)]:
            with Image.open(PUBLIC / f'comparison{suffix}.gif') as comparison:
                compared = [f.convert('RGB').copy() for f in ImageSequence.Iterator(comparison)]
            for i, name in enumerate(['hook', 'overhand', 'body']):
                with Image.open(PUBLIC / f'{name}{suffix}.gif') as gif:
                    self.assertEqual(gif.info['loop'], 0)
                    frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                    times = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                self.assertEqual(times, [550 * multiplier, 120 * multiplier, 540 * multiplier])
                self.assertEqual(len(frames), 3)
                self.assertEqual(frames[0].tobytes(), frames[2].tobytes())
                self.assertNotEqual(frames[0].tobytes(), frames[1].tobytes())
                for frame, board in zip(frames, compared):
                    self.assertEqual(frame.tobytes(), board.crop((i * 500, 0, (i + 1) * 500, 560)).tobytes())

    def test_original_three_option_previews_are_unchanged(self):
        records = json.loads((ROOT / 'verification.json').read_text())
        self.assertEqual(len(records), 8)
        for record in records:
            self.assertEqual(hashlib.sha256((PUBLIC / record['file']).read_bytes()).hexdigest(), record['sha256'])

    def test_opposite_hand_pair_shares_timing_and_exact_right_panel(self):
        for suffix, speed in [('', 1), ('-slow', 4)]:
            with Image.open(PUBLIC / f'hook-pair{suffix}.gif') as gif:
                board = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                times = [frame.info['duration'] for frame in ImageSequence.Iterator(gif)]
                self.assertEqual(gif.info['loop'], 0)
            self.assertEqual(times, [550 * speed, 120 * speed, 540 * speed])
            self.assertEqual(board[0].tobytes(), board[2].tobytes())
            self.assertNotEqual(board[0].tobytes(), board[1].tobytes())
            with Image.open(PUBLIC / f'right-hook{suffix}.gif') as gif:
                right = [frame.convert('RGB').copy() for frame in ImageSequence.Iterator(gif)]
                self.assertEqual([frame.info['duration'] for frame in ImageSequence.Iterator(gif)], times)
            self.assertEqual(len(right), 3)
            for a, b in zip(board, right):
                self.assertEqual(a.crop((500, 0, 1000, 560)).tobytes(), b.tobytes())
            self.assertEqual(board[0].crop((0, 45, 500, 520)).tobytes(), board[0].crop((500, 45, 1000, 520)).tobytes())


if __name__ == '__main__':
    unittest.main()
