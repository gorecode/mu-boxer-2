import unittest
from PIL import Image, ImageDraw, ImageSequence
import export as preview


class FixedPoseTests(unittest.TestCase):
    def test_edit_mask_contains_arm_but_protects_actual_face_and_feet(self):
        mask = preview.edit_mask()
        self.assertIsNotNone(mask.getbbox())
        self.assertEqual(mask.getpixel((330, 100)), 255)
        self.assertEqual(mask.getpixel((250, 80)), 0)
        self.assertEqual(mask.getpixel((100, 500)), 0)
        face = preview.base.idle_frame().crop((220, 60, 275, 110))
        self.assertIsNotNone(face.getchannel('A').getbbox())
        self.assertGreater(sum(a > 200 for a in face.getchannel('A').getdata()), 1000)

    def test_composition_replaces_arm_while_preserving_head_and_legs(self):
        idle = preview.base.idle_frame()
        source = idle.copy()
        ImageDraw.Draw(source).rectangle((120, 20, 400, 520), fill='#20ff40')
        result = preview.compose_contact(source, idle)
        self.assertEqual(result.getpixel((330, 100)), (32, 255, 64, 255))
        self.assertEqual(result.crop((220, 60, 275, 110)).tobytes(), idle.crop((220, 60, 275, 110)).tobytes())
        self.assertEqual(result.crop((0, 260, 500, 550)).tobytes(), idle.crop((0, 260, 500, 550)).tobytes())

    def test_empty_or_incorrectly_framed_sources_are_rejected(self):
        idle = preview.base.idle_frame()
        for source in [Image.new('RGBA', (500, 550)), Image.new('RGBA', (200, 500), '#ff0000')]:
            with self.assertRaises(ValueError):
                preview.compose_contact(source, idle)

    def test_real_exported_contacts_keep_original_head_and_lower_body(self):
        idle = preview.base.idle_frame()
        for name in preview.IDS:
            frame = Image.open(preview.ROOT / 'frames' / f'{name}.png').convert('RGBA')
            self.assertEqual(frame.size, (500, 550))
            for box in [(220, 60, 275, 110), (0, 260, 500, 550)]:
                self.assertEqual(frame.crop(box).tobytes(), idle.crop(box).tobytes(), name)
            self.assertNotEqual(frame.tobytes(), idle.tobytes())
            self.assertEqual(frame.getpixel((0, 0))[3], 0)

    def test_decoded_gifs_keep_face_and_feet_still_and_return_at_both_speeds(self):
        for name in preview.IDS:
            for suffix, speed in [('', 1), ('-slow', 4)]:
                with Image.open(preview.PUBLIC / f'{name}{suffix}.gif') as gif:
                    frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                    durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                self.assertEqual(len(frames), 3)
                self.assertEqual(durations, [d * speed for d in preview.base.DURATIONS])
                self.assertNotEqual(frames[0].tobytes(), frames[1].tobytes())
                self.assertEqual(frames[0].tobytes(), frames[2].tobytes())
                for box in [(202, 121, 257, 171), (0, 330, 420, 590)]:
                    self.assertEqual(frames[0].crop(box).tobytes(), frames[1].crop(box).tobytes(), name)


if __name__ == '__main__':
    unittest.main()
