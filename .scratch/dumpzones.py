from PIL import Image
im = Image.open('.scratch/ref-mh.jpg').convert('RGB')
px = im.load()

def dump(x0, x1, y0, y1, label):
    print('===', label)
    for y in range(y0, y1):
        row = []
        for x in range(x0, x1):
            r, g, b = px[x, y]
            row.append('%02X%02X%02X' % (r, g, b) if not (r > 250 and g > 250 and b > 250) else '..')
        print(y, ' '.join(row))
    print()

# ring zone
dump(18, 48, 574, 602, 'row1 ring x18-48')
# pink right edge
dump(76, 100, 580, 596, 'row1 pink edge x76-100')
# heart zone
dump(184, 226, 576, 604, 'row1 heart x184-226')