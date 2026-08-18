from PIL import Image
import numpy as np
ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_b2bd5b07d0f3.png').convert('RGB')
ra = np.array(ref.resize((540, 1320)))
ea = np.array(exp.resize((540, 1320)))
d = (np.abs(ra.astype(int) - ea.astype(int)).sum(axis=2)) > 90
regions = {
    'status':   (0, 0, 540, 40),
    'header':   (0, 40, 540, 110),
    'tabs':     (0, 110, 540, 210),
    'stats':    (0, 220, 540, 390),
    'panel':    (0, 406, 540, 482),
    'row1':     (0, 482, 540, 612),
    'bar1':     (20, 575, 400, 598),
    'row2':     (0, 612, 540, 750),
    'bar2':     (20, 710, 440, 733),
    'row3':     (0, 750, 540, 882),
    'bar3':     (20, 845, 370, 868),
    'row4':     (0, 882, 540, 1020),
    'bar4':     (20, 980, 410, 1003),
    'row5':     (0, 1020, 540, 1152),
    'bar5':     (20, 1115, 400, 1138),
    'row6zone': (0, 1152, 540, 1275),
    'nav':      (0, 1272, 540, 1320),
}
for name, (x0, y0, x1, y1) in regions.items():
    sub = d[y0:y1, x0:x1]
    print(f'{name:10s} diff%={sub.mean()*100:.2f}')
for name, y in [('bar1', 575), ('bar2', 710), ('bar3', 845), ('bar4', 980), ('bar5', 1115)]:
    row_d = d[y:y+24, :]
    cols = np.where(row_d.any(axis=0))[0]
    runs = []
    if len(cols):
        start = prev = cols[0]
        for c in cols[1:]:
            if c > prev + 2:
                runs.append((int(start), int(prev)))
                start = c
            prev = c
        runs.append((int(start), int(prev)))
    print(name, 'diff runs:', runs)