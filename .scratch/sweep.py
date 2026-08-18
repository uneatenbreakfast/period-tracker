from PIL import Image
import numpy as np

def sweep(path, label):
    im = Image.open(path).convert('RGB')
    a = np.array(im).astype(int)
    H, W = a.shape[:2]
    # ink = any channel < 235
    ink = (a.min(axis=2) < 235)
    print(f'== {label} {W}x{H}')
    # y bands of ink
    ys = np.where(ink.sum(axis=1) > 2)[0]
    bands = []
    if len(ys):
        start = prev = ys[0]
        for y in ys[1:]:
            if y > prev + 3:
                bands.append((int(start), int(prev)))
                start = y
            prev = y
        bands.append((int(start), int(prev)))
    for y0, y1 in bands:
        xs = np.where(ink[y0:y1 + 1].any(axis=0))[0]
        # dominant hues in band
        sub = a[y0:y1 + 1]
        dark = (sub.max(axis=2) < 140)  # ink text
        rose = (sub[:, :, 0] > 170) & (sub[:, :, 1] < 190) & (sub[:, :, 2] < 190) & (sub[:, :, 0] > sub[:, :, 2] + 30)
        blue = (sub[:, :, 2] > 160) & (sub[:, :, 2] > sub[:, :, 0] + 20) & (sub[:, :, 1] > 160)
        peach = (sub[:, :, 0] > 200) & (sub[:, :, 1] > 110) & (sub[:, :, 1] < 200) & (sub[:, :, 2] < 160) & (sub[:, :, 0] > sub[:, :, 1] + 30)
        def ranges(mask):
            cols = np.where(mask.any(axis=0))[0]
            runs = []
            for c in cols:
                if runs and c - runs[-1][1] <= 2:
                    runs[-1][1] = c
                else:
                    runs.append([int(c), int(c)])
            return [(a, b) for a, b in runs]
        print(f'  y{y0}-{y1} x{xs[0]}-{xs[-1]}  text:{ranges(dark)}  rose:{ranges(rose)}  blue:{ranges(blue)}  peach:{ranges(peach)}')

sweep('.scratch/ref-mh.jpg', 'REF')
sweep('/home/nelsonw/.hermes/cache/images/img_8eb710dae97f.png', 'EXP')