import tempfile
import unittest
from pathlib import Path
from PIL import Image
import export as preview


class RegistrationTests(unittest.TestCase):
    def test_empty_and_tiny_images_are_rejected(self):
        for image in [Image.new('RGBA', (300, 500)), Image.new('RGBA', (40, 90), '#ff0000')]:
            with self.assertRaisesRegex(ValueError, 'silhouette'):
                preview.register(image)

    def test_registration_retains_aspect_and_fixes_ground(self):
        image = Image.new('RGBA', (300, 500))
        image.paste('#ff0000', (50, 20, 250, 420))
        frame, record = preview.register(image)
        self.assertEqual(frame.size, (500, 550))
        self.assertEqual(record['scale'], 493 / 400)
        self.assertEqual(frame.getbbox()[3], 523)
        self.assertEqual(frame.getbbox()[2] - frame.getbbox()[0], round(200 * 493 / 400))

    def test_oversized_registration_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'width'):
            preview.register(Image.new('RGBA', (900, 400), '#ff0000'))

    def test_raised_hand_does_not_shrink_the_body_and_bad_landmarks_fail(self):
        image = Image.new('RGBA', (200, 500), '#ff0000')
        frame, record = preview.register(image, height=450, head_top=50)
        self.assertEqual(record['scale'], 1)
        self.assertEqual(record['y'] + 50, 73)
        self.assertEqual(frame.getbbox()[3], 523)
        for landmark in [-1, 500]:
            with self.assertRaisesRegex(ValueError, 'landmark'):
                preview.register(image, head_top=landmark)
        with self.assertRaisesRegex(ValueError, 'clipped'):
            preview.register(image, head_top=200)

    def test_saved_gifs_preserve_contact_and_return_at_both_speeds(self):
        idle = Image.new('RGB', preview.SIZES, '#201820')
        contact = Image.new('RGB', preview.SIZES, '#f0c0a0')
        palette = preview.palette_for([idle, contact])
        with tempfile.TemporaryDirectory() as directory:
            for speed in [1, 4]:
                result = preview.encode(Path(directory) / f'{speed}.gif', [idle, contact, idle], palette, speed)
                self.assertEqual(result[0].tobytes(), result[2].tobytes())
                self.assertNotEqual(result[0].tobytes(), result[1].tobytes())

    def test_generated_contacts_have_clear_alpha_and_planted_feet(self):
        idle = preview.idle_frame()
        for name in preview.IDS:
            source = Image.open(preview.ROOT / 'inputs' / f'{name}.png')
            self.assertEqual(source.mode, 'RGBA')
            self.assertEqual(source.getpixel((0, 0))[3], 0)
            contact, _ = preview.register(source)
            self.assertEqual(contact.getbbox()[3], idle.getbbox()[3])
            feet = contact.getchannel('A').crop((0, 495, 500, 525))
            self.assertIsNotNone(feet.getbbox())
            for x in [0, 499]:
                self.assertIsNone(contact.getchannel('A').crop((x, 0, x + 1, 550)).getbbox())


if __name__ == '__main__':
    unittest.main()
