import json
import unittest
from PIL import Image, ImageSequence
from export import ROOT, PUBLIC, PROJECT, NAMES, DURATIONS, sha


class PreviewChecks(unittest.TestCase):
    def test_original_art_unchanged(self):
        records = json.loads((ROOT / 'registration.json').read_text())
        self.assertEqual(len(records['source_hashes']), 4)
        for path, expected in records['source_hashes'].items():
            self.assertEqual(sha(PROJECT / path), expected)

    def test_registered_art(self):
        drawings = []
        for name in NAMES:
            image = Image.open(ROOT / f'frames/{name}.png').convert('RGBA')
            self.assertEqual(image.size, (500, 550))
            self.assertEqual(image.getchannel('A').getextrema(), (0, 255))
            bounds = image.getchannel('A').point(lambda a: 255 if a >= 128 else 0).getbbox()
            self.assertIsNotNone(bounds)
            self.assertGreater(bounds[0], 5)
            self.assertGreater(bounds[1], 5)
            self.assertLess(bounds[2], 495)
            self.assertEqual(bounds[3], 524)
            self.assertGreater(bounds[2] - bounds[0], 230)
            drawings.append(image.tobytes())
        self.assertEqual(len(set(drawings)), 3)

    def test_gif_timeline_and_return(self):
        names = [*NAMES, 'comparison']
        for name in names:
            for suffix, speed in [('', 1), ('-slow', 4)]:
                with self.subTest(name=name, speed=speed):
                    with Image.open(PUBLIC / f'{name}{suffix}.gif') as gif:
                        self.assertEqual(gif.info['loop'], 0)
                        frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                        times = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                    self.assertEqual(times, [t * speed for t in DURATIONS])
                    self.assertEqual(len(frames), 5)
                    self.assertEqual(frames[0].tobytes(), frames[4].tobytes())
                    self.assertEqual(frames[1].tobytes(), frames[3].tobytes())
                    self.assertEqual(len({f.tobytes() for f in frames}), 3)
                    self.assertEqual(frames[2].size, (1500 if name == 'comparison' else 500, 636))

    def test_comparison_matches_decoded_individuals(self):
        with Image.open(PUBLIC / 'comparison.gif') as comparison:
            comparison.seek(2)
            contact = comparison.convert('RGB')
        for i, name in enumerate(NAMES):
            with Image.open(PUBLIC / f'{name}.gif') as gif:
                gif.seek(2)
                expected = gif.convert('RGB')
            self.assertEqual(contact.crop((i * 500, 0, (i + 1) * 500, 636)).tobytes(), expected.tobytes())


if __name__ == '__main__':
    unittest.main()
