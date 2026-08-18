from PIL import Image
import numpy as np
from collections import Counter

ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_8eb710dae97f.png').convert('RGB')

def strip_classes(im, y0, y1, x0, x1, label):
    arr = np.array(im)[y0:y1, x0:x1].astype(int)
    h, w, _ = arr.shape
    # dominant color per column (mode over rows)
    colc = []
    for x in range(w):
        cnt = Counter(tuple(arr[y, x]) for y in range(h))
        colc.append(cnt.most_common(1)[0][0])
    # cluster colors by rounding to nearest 24
    def cls(c):
        return tuple((v // 24) * 24 for v in c)
    print(f'== {label} y{y0}-{y1}')
    # print column classes at reduced res (every 2px)
    line = []
    for x in range(w):
        c = cls(colc[x])
        if sum(c) > 720:
            line.append('W')
        elif c[0] > c[2] and c[0] > 150 and c[1] < 180:  # reddish
            line.append('R')
        elif c[2] > c[0] and c[2] > 150:  # bluish
            line.append('B')
        elif abs(c[0]-c[1]) < 12 and abs(c[1]-c[2]) < 12 and c[0] < 160:  # gray dark
            line.append('K')
        elif c[0] > 200 and c[1] > 200:  # light warm (track/remainder)
            line.append('L')
        else:
            line.append('?')
    print(''.join(line))
    # runs
    runs = []
    i = 0
    while i < w:
        j = i
        while j + 1 < w and line[j + 1] == line[i]:
            j += 1
        runs.append((line[i], x0 + i, x0 + j))
        i = j + 1
    print('runs:', runs)

bars = [('bar1', 570, 600), ('bar2', 705, 735), ('bar3', 840, 870),
        ('bar4', 975, 1005), ('bar5', 1110, 1140), ('bar6', 1245, 1275)]
for name, y0, y1 in bars:
    strip_classes(ref, y0, y1, 10, 430, 'REF ' + name)
    strip_classes(exp, y0, y1, 10, 430, 'EXP ' + name)