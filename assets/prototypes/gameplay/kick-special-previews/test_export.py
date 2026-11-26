import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('kick_special_export', Path(__file__).with_name('export.py'))
preview = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preview)


class ChoreographyTests(unittest.TestCase):
    def test_double_has_two_contacts_with_different_legs(self):
        self.assertEqual(preview.state('double-piston', 559)['hero'], 'idle')
        self.assertEqual(preview.state('double-piston', 639)['hero'], 'lead-up')
        first = preview.state('double-piston', 640)
        second = preview.state('double-piston', 920)
        self.assertEqual(first['hero'], 'lead-hit')
        self.assertEqual(second['hero'], 'rear-hit')
        self.assertEqual(first['spark'], 0)
        self.assertEqual(second['spark'], 0)
        self.assertEqual(preview.state('double-piston', 760)['spark'], -1)
        self.assertEqual(preview.state('double-piston', 1120)['hero'], 'idle')
        self.assertGreater(second['wx'], first['wx'])
        self.assertEqual(first['x'], second['x'])
        self.assertNotEqual(preview.state('double-piston', 1280)['worker'], 'down')

    def test_slide_travels_low_then_recovers_without_a_returning_hit(self):
        self.assertEqual(preview.state('heel-slide', 560)['hero'], 'crouch')
        states = [preview.state('heel-slide', t) for t in range(640, 1120, 40)]
        self.assertEqual({s['hero'] for s in states}, {'slide'})
        positions = [s['x'] for s in states]
        self.assertEqual(positions, sorted(positions))
        self.assertGreater(positions[-1] - positions[0], 200)
        self.assertEqual(preview.state('heel-slide', 839)['worker'], 'worker')
        self.assertEqual(preview.state('heel-slide', 840)['spark'], 0)
        self.assertEqual(preview.state('heel-slide', 1200)['worker'], 'down')
        self.assertEqual(preview.state('heel-slide', 1120)['hero'], 'crouch')
        self.assertEqual(preview.state('heel-slide', 1280)['hero'], 'idle')
        self.assertEqual(preview.state('heel-slide', 1280)['spark'], -1)

    def test_loops_explicitly_reset_after_reaction_hold(self):
        for name in preview.NAMES:
            self.assertEqual(preview.state(name, 0), preview.state(name, 2399))
            self.assertNotEqual(preview.state(name, 2079), preview.state(name, 2080))

    def test_invalid_preview_requests_are_rejected(self):
        for name, time in [('unknown', 0), ('heel-slide', -1), ('double-piston', 2400)]:
            with self.assertRaises(ValueError):
                preview.state(name, time)

    def test_new_low_pose_retains_ground_and_safe_margins(self):
        sprites, _, registration = preview.load_sprites()
        im, anchor, _ = sprites['slide']
        left, top, right, bottom = registration['opaque_bounds']
        self.assertEqual(im.size, (640, 600))
        self.assertGreater(left, 4)
        self.assertLess(right, 636)
        self.assertLessEqual(abs(bottom - anchor[1]), 2)
        self.assertLess(bottom - top, 300)
        self.assertEqual(im.getchannel('A').getextrema(), (0, 255))


if __name__ == '__main__':
    unittest.main()
