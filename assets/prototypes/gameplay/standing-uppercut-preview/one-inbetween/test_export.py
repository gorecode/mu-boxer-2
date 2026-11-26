from pathlib import Path
from PIL import Image, ImageChops, ImageStat, ImageSequence
import importlib.util
import json
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('inbetween_export', ROOT / 'export.py')
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class OneInbetweenTests(unittest.TestCase):
    def test_endpoints_are_exact_selected_pngs_and_one_new_drawing_is_added(self):
        for key, source in [('idle', ROOT.parent / 'body-turn/frames/idle.png'), ('contact', ROOT.parent / 'color-match/frames/contact.png')]:
            self.assertEqual((ROOT / 'frames' / f'{key}.png').read_bytes(), source.read_bytes())
        drawings = [Image.open(ROOT / 'frames' / f'{key}.png').convert('RGBA').tobytes() for key in ['idle', 'intermediate', 'contact']]
        self.assertEqual(len(set(drawings)), 3)
        self.assertEqual(preview.SCHEDULE.count('intermediate'), 2)
        self.assertEqual(sum(preview.DURATIONS), 1600)
        self.assertEqual(sum(preview.DURATIONS[:2]), 600)
        self.assertEqual(preview.DURATIONS[2], 140)

    def test_registration_preserves_full_body_and_head_position_is_between_keys(self):
        centers = []
        for key in ['idle', 'intermediate', 'contact']:
            im = Image.open(ROOT / 'frames' / f'{key}.png').convert('RGBA')
            self.assertEqual(im.size, (500, 550))
            alpha = im.getchannel('A').point(lambda a: 255 if a > 24 else 0)
            box = alpha.getbbox()
            self.assertIsNotNone(box)
            self.assertGreater(min(box[:2]), 2)
            self.assertLess(box[2], 498)
            self.assertTrue(510 < box[3] < 535)
            pixels = [(x, alpha.getpixel((x, y))) for y in range(25, 100) for x in range(150, 290)]
            total = sum(weight for _, weight in pixels)
            self.assertGreater(total, 1000)
            centers.append(sum(x * weight for x, weight in pixels) / total)
        self.assertGreater(centers[0], centers[1])
        self.assertGreater(centers[1], centers[2])

    def test_intermediate_palette_matches_original_without_changing_alpha_or_unmasked_pixels(self):
        raw = Image.open(ROOT / 'frames/intermediate-raw.png').convert('RGBA')
        final = Image.open(ROOT / 'frames/intermediate.png').convert('RGBA')
        idle = Image.open(ROOT.parent / 'body-turn/frames/idle.png').convert('RGBA')
        self.assertEqual(raw.getchannel('A').tobytes(), final.getchannel('A').tobytes())
        settings = json.loads((ROOT / 'color-settings.json').read_text())
        masks = []
        for region in settings['regions']:
            mask = Image.open(ROOT / f'{region["name"]}-mask.png').getchannel('A')
            masks.append(mask)
            self.assertGreater(sum(a != b and m > 0 for a, b, m in zip(raw.getdata(), final.getdata(), mask.getdata())), 1000)
            def median(im):
                return ImageStat.Stat(im.convert('RGB'), im.getchannel('A').point(lambda a: 255 if a > 240 else 0)).median
            self.assertEqual(median(final.crop(region['sample'])), median(idle.crop(region['reference'])))
        combined = ImageChops.lighter(*masks)
        outside = [(a, b) for a, b, m in zip(raw.getdata(), final.getdata(), combined.getdata()) if m == 0]
        self.assertGreater(len(outside), 200000)
        self.assertTrue(all(a == b for a, b in outside))

    def test_decoded_gifs_keep_contact_synced_three_art_states_and_fast_return(self):
        for name in ['comparison', 'uppercut']:
            for suffix, speed in [('', 1), ('-slow', 4)]:
                with self.subTest(name=name, speed=speed):
                    with Image.open(preview.PUBLIC / f'{name}{suffix}.gif') as gif:
                        self.assertEqual(gif.info['loop'], 0)
                        states = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                        durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                    self.assertEqual(durations, [d * speed for d in [560, 40, 140, 20, 840]])
                    self.assertEqual(states[0].tobytes(), states[4].tobytes())
                    self.assertEqual(states[1].tobytes(), states[3].tobytes())
                    x = 420 if name == 'comparison' else 0
                    arts = [f.crop((x, 72, x + 420, 590)).tobytes() for f in states]
                    self.assertEqual(len(set(arts)), 3)
                    if name == 'comparison':
                        self.assertEqual(states[2].crop((0, 72, 420, 590)).tobytes(), arts[2])
                        baseline = [f.crop((0, 72, 420, 590)).tobytes() for f in states]
                        self.assertEqual(len(set(baseline)), 2)

    def test_palette_configuration_rejects_empty_regions_and_empty_samples(self):
        settings = json.loads((ROOT / 'color-settings.json').read_text())
        settings['source'] = str(ROOT / 'frames/intermediate-raw.png')
        settings['reference'] = str(ROOT.parent / 'body-turn/frames/idle.png')
        with tempfile.TemporaryDirectory() as directory:
            for empty_regions, error in [(True, 'At least one clothing region required'), (False, 'Empty clothing sample')]:
                config = json.loads(json.dumps(settings))
                if empty_regions:
                    config['regions'] = []
                else:
                    config['regions'][0]['sample'] = [0, 0, 1, 1]
                path = Path(directory) / 'config.json'
                path.write_text(json.dumps(config))
                result = subprocess.run(['node', str(ROOT.parent / 'color-match/build.mjs'), str(path)], capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(error, result.stderr)
                self.assertFalse((Path(directory) / 'frames/intermediate.png').exists())

    def test_encoder_rejects_wrong_state_count_and_unsupported_speed(self):
        frame = Image.new('RGB', (420, 620))
        palette = preview.preview.base.palette_for([frame])
        with tempfile.TemporaryDirectory() as directory:
            for frames, speed in [([frame], 1), ([frame] * 5, 2)]:
                with self.assertRaises(ValueError):
                    preview.encode(Path(directory) / 'bad.gif', frames, palette, speed)


if __name__ == '__main__':
    unittest.main()
