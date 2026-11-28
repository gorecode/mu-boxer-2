import importlib.util
import json
from pathlib import Path
import sys
import unittest

from PIL import Image, ImageSequence

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('worker_preview', Path(__file__).with_name('export.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class PreviewTests(unittest.TestCase):
    def test_shove_leaves_guard_and_pushes_only_after_contact_hold(self):
        self.assertEqual(preview.state('shaft-shove', 399)['worker'], 'worker-0')
        self.assertEqual(preview.state('shaft-shove', 400)['worker'], 'worker-5')
        self.assertEqual(preview.state('shaft-shove', 639)['worker'], 'worker-5')
        contact = preview.state('shaft-shove', 640)
        self.assertEqual((contact['worker'], contact['boxer'], contact['spark']), ('shove', 'boxer-6', 0))
        self.assertEqual(contact['bx'], preview.state('shaft-shove', 720)['bx'])
        self.assertEqual(preview.state('shaft-shove', 800)['worker'], 'worker-5')
        self.assertEqual(preview.state('shaft-shove', 880)['worker'], 'worker-0')
        self.assertEqual(preview.state('shaft-shove', 1000)['bx'], contact['bx'] - 200)
        states = [preview.state('shaft-shove', t) for t in range(640, 1001, 40)]
        self.assertEqual({s['wx'] for s in states}, {contact['wx']})
        self.assertEqual([s['bx'] for s in states], sorted((s['bx'] for s in states), reverse=True))
        self.assertNotIn('boxer-11', {s['boxer'] for s in states})

    def test_low_high_has_two_separate_contacts_and_a_readable_guard_switch(self):
        low = preview.state('low-high', 880)
        high = preview.state('low-high', 1400)
        self.assertEqual((low['worker'], low['boxer'], low['spark']), ('worker-9', 'boxer-25', 0))
        self.assertEqual((high['worker'], high['boxer'], high['spark']), ('worker-8', 'boxer-4', 0))
        self.assertTrue(low['blocked'] and high['blocked'])
        self.assertEqual(preview.state('low-high', 1040)['spark'], -1)
        self.assertEqual(preview.state('low-high', 1120)['worker'], 'worker-3')
        self.assertEqual(preview.state('low-high', 1239)['boxer'], 'boxer-25')
        self.assertEqual(preview.state('low-high', 1240)['boxer'], 'boxer-4')
        self.assertEqual(preview.state('low-high', 1560)['spark'], -1)
        self.assertEqual(preview.state('low-high', 1720)['worker'], 'worker-0')
        self.assertEqual(high['bx'], low['bx'])

    def test_loop_reset_and_invalid_requests(self):
        for name in preview.NAMES:
            self.assertEqual(preview.state(name, 0), preview.state(name, preview.LENGTH - 1))
        for name, t in [('missing', 0), ('low-high', -1), ('shaft-shove', preview.LENGTH)]:
            with self.assertRaises(ValueError):
                preview.state(name, t)

    def test_candidate_has_transparency_safe_margins_and_ground_registration(self):
        sprites, _, registration = preview.load_sprites()
        im, anchor, scale = sprites['shove']
        left, top, right, bottom = registration['opaque_bounds']
        self.assertEqual(im.size, (500, 550))
        self.assertEqual(im.getchannel('A').getextrema(), (0, 255))
        self.assertGreater(left, 4)
        self.assertGreater(top, 4)
        self.assertLess(right, im.width - 4)
        self.assertLess(bottom, im.height - 4)
        self.assertLessEqual(abs(bottom - anchor[1]), 2)
        self.assertEqual(scale, 1.22)

    def test_decoded_deliverables_keep_durations_palette_and_original_source_hashes(self):
        report = json.loads((preview.ROOT / 'verification.json').read_text())
        self.assertEqual(len(report['gifs']), 6)
        palettes = []
        for filename, record in report['gifs'].items():
            path = preview.PUBLIC / filename
            with Image.open(path) as gif:
                palettes.append(gif.getpalette())
                self.assertEqual(gif.info['loop'], 0)
                frames = [(f.convert('RGB').copy(), f.info['duration']) for f in ImageSequence.Iterator(gif)]
            speed = 4 if '-slow' in filename else 1
            self.assertEqual(sum(ms for _, ms in frames), 2800 * speed)
            self.assertGreater(len({f.tobytes() for f, _ in frames}), 10)
            self.assertEqual(frames[0][0].tobytes(), frames[-1][0].tobytes())
            self.assertEqual(preview.sha(path), record['sha256'])
        self.assertTrue(palettes[0])
        self.assertTrue(all(p == palettes[0] for p in palettes))
        self.assertGreater(len(report['sources']), 10)
        for record in report['sources'].values():
            self.assertEqual(preview.sha(preview.PROJECT / record['path']), record['sha256'])


if __name__ == '__main__':
    unittest.main()
