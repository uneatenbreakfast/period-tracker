from PIL import Image
ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_8eb710dae97f.png').convert('RGB')
print('--- ref nav zone')
for p in [(60, 1300), (200, 1300), (300, 1300), (540, 1300), (60, 1275), (120, 1284), (270, 1284), (420, 1284), (120, 1280), (270, 1280), (420, 1280)]:
    print('ref', p, ref.getpixel(p), ' exp', p, exp.getpixel(p))
print('--- ref status icons right zone')
for p in [(408, 28), (440, 28), (470, 28), (500, 28), (420, 22), (450, 20), (510, 24), (517, 24)]:
    print('ref', p, ref.getpixel(p), ' exp', p, exp.getpixel(p))
print('--- ref header icons')
for p in [(20, 90), (30, 90), (80, 90), (365, 90), (380, 90), (420, 90), (435, 90)]:
    print('ref', p, ref.getpixel(p), ' exp', p, exp.getpixel(p))
print('--- ref dots: does status bar have dot row?')
for y in range(44, 110, 8):
    row = [x for x in range(16, 370) if ref.getpixel((x, y))[0] < 220]
    print(y, row[:25])