from pathlib import Path
import json
import unittest
from PIL import Image

root = Path(__file__).resolve().parent


class RepairedHookAssets(unittest.TestCase):
    def test_all_six_poses_keep_original_head_pixels_and_lower_body(self):
        records = json.loads((root / 'registration.json').read_text())
        self.assertEqual({r['name'] for r in records}, {
            f'{hand}-{pose}' for hand in ('left', 'right')
            for pose in ('early', 'late', 'contact')
        })
        head = Image.open(root / 'head-source.png').convert('RGBA')
        idle = Image.open(root / 'before/idle.png').convert('RGBA')
        pixels = [(x, y) for y in range(110) for x in range(190, 290)
                  if head.getpixel((x, y))[3] >= 240]
        self.assertGreater(len(pixels), 4000)
        for x, y in pixels:
            self.assertLessEqual(max(abs(a - b) for a, b in zip(
                head.getpixel((x, y))[:3], idle.getpixel((x, y))[:3])), 1)
        for r in records:
            with self.subTest(pose=r['name']):
                frame = Image.open(root.parent / f"frames/{r['name']}.png").convert('RGBA')
                before = Image.open(root / f"before/{r['name']}.png").convert('RGBA')
                self.assertEqual(frame.size, (500, 530))
                dx, dy = r['headOffset']
                for x, y in pixels:
                    self.assertEqual(frame.getpixel((x + dx, y + dy)), head.getpixel((x, y)))
                for y in range(dy + 45):
                    for x in range(100, 320):
                        if y < dy or head.getpixel((x - dx, y - dy))[3] <= 24:
                            self.assertLessEqual(frame.getpixel((x, y))[3], 24)
                self.assertEqual(frame.crop((0, 245, 500, 530)).tobytes(),
                                 before.crop((0, 245, 500, 530)).tobytes())
                self.assertNotEqual(frame.crop((100, 115, 260, 245)).tobytes(),
                                    before.crop((100, 115, 260, 245)).tobytes())

    def test_shirt_repair_inputs_have_three_nonempty_transparent_panels(self):
        for hand in ('left', 'right'):
            im = Image.open(root / f'{hand}-shirt.png').convert('RGBA')
            self.assertEqual(im.width % 3, 0)
            for i in range(3):
                alpha = im.crop((i * im.width // 3, 0, (i + 1) * im.width // 3, im.height)).getchannel('A')
                histogram = alpha.histogram()
                self.assertGreater(sum(histogram[240:]), 30000)
                self.assertGreater(histogram[0], 30000)


if __name__ == '__main__':
    unittest.main()
