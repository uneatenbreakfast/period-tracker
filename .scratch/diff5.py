from PIL import Image
import numpy as np
ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_e8994d27320c.png').convert('RGB')
ra = np.array(ref, dtype=int)
ea = np.array(exp, dtype=int)
H, W = ea.shape[:2]
diff = (np.abs(ra - ea).sum(axis=2) > 60)
def rate(y0, y1):
    d = diff[y0:y1]
    return round(100.0 * d.sum() / d.size, 2)
zones = [('status', 0, 40), ('header', 40, 110), ('tabs', 110, 210),
         ('stats', 210, 404), ('panel', 404, 484),
         ('bar1', 570, 640), ('bar2', 705, 775), ('bar3', 840, 910),
         ('bar4', 975, 1045), ('bar5', 1110, 1180), ('bar6', 1245, 1295),
         ('nav', 1295, 1320)]
for name, y0, y1 in zones:
    print(f'{name}: {rate(y0, y1)}%')
# bar1 diff runs
d = diff[575:600, :]
cols = np.where(d.any(axis=0))[0]
runs = []
for c in cols:
    if runs and c - runs[-1][1] <= 3:
        runs[-1][1] = c
    else:
        runs.append([c, c])
print('bar1 runs:', [(a, b) for a, b in runs])
d = diff[710:735, :]
cols = np.where(d.any(axis=0))[0]
runs = []
for c in cols:
    if runs and c - runs[-1][1] <= 3:
        runs[-1][1] = c
    else:
        runs.append([c, c])
print('bar2 runs:', [(a, b) for a, b in runs])