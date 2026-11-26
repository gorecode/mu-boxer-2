import importlib.util
from pathlib import Path
import tempfile
import unittest
from PIL import Image, ImageChops, ImageSequence

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('body_turn_export', ROOT / 'export.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class BodyTurnPreviewTests(unittest.TestCase):
    def test_registration_rejects_empty_wrong_ratio_partial_and_clipped_sources(self):
        for image, offset in [(Image.new('RGBA', (500, 550)), [0, 0]),
                              (Image.new('RGBA', (500, 500)), [0, 0]),
                              (Image.new('RGBA', (500, 550), 'red'), [0, 0]),
                              (Image.open(ROOT / 'inputs/a-shoulder.png'), [400, 0])]:
            with self.subTest(size=image.size, offset=offset), self.assertRaises(ValueError):
                preview.register(image, offset)
        partial = Image.new('RGBA', (500, 550))
        partial.paste((255, 0, 0, 255), (100, 100, 200, 200))
        with self.assertRaises(ValueError):
            preview.register(partial, [0, 0])

    def test_contacts_are_registered_full_figures_and_do_not_pin_head_or_torso(self):
        idle = preview.base.idle_frame()
        for name in preview.IDS:
            with self.subTest(name=name):
                frame = Image.open(ROOT / 'frames' / f'{name}.png').convert('RGBA')
                self.assertEqual(frame.size, idle.size)
                self.assertEqual(frame.getpixel((0, 0))[3], 0)
                bounds = frame.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
                self.assertIsNotNone(bounds)
                self.assertGreater(bounds[1], 10)
                self.assertGreater(bounds[3], 510)
                self.assertLess(bounds[3], 535)
                for region in [(185, 25, 290, 135), (120, 140, 270, 260)]:
                    difference = ImageChops.difference(frame.crop(region), idle.crop(region))
                    self.assertGreater(sum(difference.convert('RGB').convert('L').getdata()), 5000)
                front_sole = frame.getchannel('A').crop((250, 500, 350, 535)).point(lambda a: 255 if a > 24 else 0).getbbox()
                self.assertIsNotNone(front_sole)
                self.assertLessEqual(abs(front_sole[3] + 500 - 515), 12)

    def test_all_delivered_gifs_have_exact_timings_closed_loop_and_real_contact(self):
        for name in preview.IDS + ['comparison']:
            for suffix, factor in [('', 1), ('-slow', 4)]:
                with self.subTest(name=name, factor=factor):
                    with Image.open(preview.PUBLIC / f'{name}{suffix}.gif') as gif:
                        self.assertEqual(gif.size, (1260 if name == 'comparison' else 420, 620))
                        self.assertEqual(gif.info['loop'], 0)
                        states = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                        timing = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                    self.assertEqual(timing, [d * factor for d in preview.DURATIONS])
                    self.assertEqual(states[0].tobytes(), states[2].tobytes())
                    self.assertNotEqual(states[0].crop((0, 72, 420, 590)).tobytes(), states[1].crop((0, 72, 420, 590)).tobytes())

    def test_encoder_rejects_bad_sequence_and_unsupported_speed(self):
        frame = Image.new('RGB', (420, 620), 'black')
        palette = preview.base.palette_for([frame])
        with tempfile.TemporaryDirectory() as directory:
            for frames, speed in [([frame], 1), ([frame] * 3, 0), ([frame] * 3, 2)]:
                with self.subTest(count=len(frames), speed=speed), self.assertRaises(ValueError):
                    preview.encode(Path(directory) / 'bad.gif', frames, palette, speed)


if __name__ == '__main__':
    unittest.main()
