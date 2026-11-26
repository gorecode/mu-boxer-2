from pathlib import Path
from PIL import Image, ImageChops, ImageSequence, ImageStat
import importlib.util
import json
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('color_export', ROOT / 'export.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class ColorMatchTests(unittest.TestCase):
    def setUp(self):
        self.source = Image.open(ROOT.parent / 'body-turn/frames/c-rising.png').convert('RGBA')
        self.contact = Image.open(ROOT / 'frames/contact.png').convert('RGBA')
        self.palette = json.loads((ROOT / 'palette.json').read_text())
        self.masks = [Image.open(ROOT / f'{r["name"]}-mask.png').getchannel('A') for r in self.palette['regions']]

    def test_pose_alpha_and_pixels_outside_clothing_are_preserved_exactly(self):
        self.assertEqual(self.source.size, (500, 550))
        self.assertEqual(self.source.getchannel('A').tobytes(), self.contact.getchannel('A').tobytes())
        mask = ImageChops.lighter(*self.masks)
        outside = [(a, b) for a, b, m in zip(self.source.getdata(), self.contact.getdata(), mask.getdata()) if m == 0]
        self.assertGreater(len(outside), 200000)
        self.assertTrue(all(a == b for a, b in outside))
        for region in [(170, 25, 280, 115), (255, 115, 335, 180), (75, 490, 135, 530), (255, 495, 350, 535)]:
            self.assertEqual(self.source.crop(region).tobytes(), self.contact.crop(region).tobytes())

    def test_both_clothing_regions_change_without_repainting_dark_ink(self):
        for region, mask in zip(self.palette['regions'], self.masks):
            with self.subTest(name=region['name']):
                changed = sum(a != b and m > 0 for a, b, m in zip(self.source.getdata(), self.contact.getdata(), mask.getdata()))
                self.assertGreater(changed, 1000)
        ink = [(a, b) for a, b in zip(self.source.getdata(), self.contact.getdata()) if a[3] > 0 and max(a[:3]) <= 24]
        self.assertGreater(len(ink), 100)
        self.assertTrue(all(a == b for a, b in ink))

    def test_actual_midtones_match_independent_original_idle_samples(self):
        idle = Image.open(ROOT.parent / 'body-turn/frames/idle.png').convert('RGBA')
        for region in self.palette['regions']:
            with self.subTest(name=region['name']):
                after = self.contact.crop(region['sample'])
                reference = idle.crop(region['reference'])
                def medians(image):
                    return ImageStat.Stat(image.convert('RGB'), image.getchannel('A').point(lambda a: 255 if a > 240 else 0)).median
                self.assertEqual(medians(after), medians(reference))
        shirt = self.palette['regions'][0]
        self.assertLess(sum(shirt['target']), sum(shirt['input']) - 40)

    def test_gifs_keep_selected_timing_loop_and_same_idle_in_comparison(self):
        for name in ['comparison', 'c-rising']:
            for suffix, speed in [('', 1), ('-slow', 4)]:
                with self.subTest(name=name, speed=speed):
                    with Image.open(preview.PUBLIC / f'{name}{suffix}.gif') as gif:
                        self.assertEqual(gif.info['loop'], 0)
                        states = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                        durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                    self.assertEqual(durations, [600 * speed, 140 * speed, 860 * speed])
                    self.assertEqual(states[0].tobytes(), states[-1].tobytes())
                    self.assertNotEqual(states[0].crop((0, 72, 420, 590)).tobytes(), states[1].crop((0, 72, 420, 590)).tobytes())
                    if name == 'comparison':
                        self.assertEqual(states[0].crop((0, 72, 420, 590)).tobytes(), states[0].crop((420, 72, 840, 590)).tobytes())


if __name__ == '__main__':
    unittest.main()
