import unittest
from PIL import Image, ImageSequence
import export as preview


class SourceArmTests(unittest.TestCase):
    def test_native_drawings_keep_head_and_feet_without_changing_size(self):
        idle = Image.open(preview.ROOT / 'frames/idle.png').convert('RGBA')
        self.assertIsNotNone(idle.crop((220,60,275,110)).getchannel('A').getbbox())
        for name in ['preparation', 'drive', *preview.IDS]:
            frame = Image.open(preview.ROOT / 'frames' / f'{name}.png').convert('RGBA')
            self.assertEqual(frame.size, (500,550))
            self.assertEqual(frame.getbbox()[3],idle.getbbox()[3])
            self.assertNotEqual(frame.tobytes(),idle.tobytes())
            for box in [(220,60,275,110),(0,260,500,550)]:
                self.assertEqual(frame.crop(box).tobytes(),idle.crop(box).tobytes(),name)
            self.assertEqual(frame.getpixel((0,0))[3],0)

    def test_both_extracted_source_segments_have_real_opaque_art(self):
        for name in ['upper','fore']:
            frame = Image.open(preview.ROOT / 'frames' / f'{name}.png').convert('RGBA')
            opaque = sum(a > 200 for a in frame.getchannel('A').getdata())
            self.assertGreater(opaque,1000,name)
            self.assertLess(opaque,10000,name)

    def test_gif_has_buildup_contact_and_full_return_with_fixed_face_and_feet(self):
        for name in preview.IDS:
            for suffix,speed in [('',1),('-slow',4)]:
                with Image.open(preview.PUBLIC / f'{name}{suffix}.gif') as gif:
                    frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
                    durations = [f.info['duration'] for f in ImageSequence.Iterator(gif)]
                self.assertEqual(len(frames),6)
                self.assertEqual(durations,[600*speed,40*speed,40*speed,120*speed,20*speed,700*speed])
                self.assertEqual(len({f.tobytes() for f in frames}),4)
                self.assertEqual(frames[0].tobytes(),frames[5].tobytes())
                self.assertEqual(frames[2].tobytes(),frames[4].tobytes())
                for frame in frames[1:]:
                    for box in [(202,121,257,171),(0,330,420,590)]:
                        self.assertEqual(frame.crop(box).tobytes(),frames[0].crop(box).tobytes(),name)

    def test_rejected_and_rebuilt_contacts_are_compared_at_the_same_scale(self):
        with Image.open(preview.PUBLIC / 'before-after.gif') as gif:
            frames = [f.convert('RGB').copy() for f in ImageSequence.Iterator(gif)]
        self.assertEqual(len(frames),6)
        self.assertEqual(frames[0].size,(840,620))
        self.assertEqual(frames[0].tobytes(),frames[-1].tobytes())
        self.assertNotEqual(frames[0].tobytes(),frames[3].tobytes())
        for x in [0,420]:
            box = (x+202,121,x+257,171)
            self.assertEqual(frames[0].crop(box).tobytes(),frames[3].crop(box).tobytes())


if __name__ == '__main__':
    unittest.main()
