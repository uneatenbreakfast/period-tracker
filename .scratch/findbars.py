from PIL import Image
import numpy as np

def find_bars(path, label):
    im = Image.open(path).convert('RGB')
    a = np.array(im).astype(int)
    H, W = a.shape[:2]
    seg = np.zeros(H, dtype=int)
    for y in range(0, H - 3, 2):
        strip = a[y:y+4]
        r, g, b = strip[:,:,0], strip[:,:,1], strip[:,:,2]
        rose = ((r>170)&(r>b+30)&(g<190)).sum()
        blue = ((b>200)&(b>r+5)&(b>g+5)).sum()
        peach = ((r>235)&(g>160)&(g<215)&(b<160)).sum()
        if rose >= 16 and rose >= blue:
            seg[y:y+4] = 1
        elif blue >= 16 and blue > rose:
            seg[y:y+4] = 2
    ybands = []
    inband = False
    for y in range(H):
        if seg[y] and not inband:
            y0 = y; inband = True
        elif not seg[y] and inband:
            ybands.append((y0, y-1)); inband = False
    if inband: ybands.append((y0, H-1))
    print(f"== {label}: {len(ybands)} bar bands")
    for (y0, y1) in ybands:
        strip = a[max(0,y0-2):y1+3]
        out = []
        for x in range(W):
            col = strip[:, x]
            r, g, b = col[:,0].mean(), col[:,1].mean(), col[:,2].mean()
            if b > 200 and b > r + 5 and b > g + 5: cls = 'B'
            elif r > 170 and r > b + 30 and g < 190: cls = 'R'
            elif r > 235 and 160 < g < 215 and b < 160: cls = 'P'
            elif min(r,g,b) < 235: cls = 't'
            else: cls = '.'
            out.append(cls)
        runs = []
        cur = out[0]; s = 0
        for i in range(1, W):
            if out[i] != cur:
                runs.append((cur, s, i-1)); cur = out[i]; s = i
        runs.append((cur, s, W-1))
        parts = ' '.join(f"{c}{a}-{b}" for c, a, b in runs if c != '.' and b - a >= 2)
        print(f"  y{y0}-{y1}: {parts}")

find_bars('.scratch/ref-mh.jpg', 'REF')
find_bars('.scratch/exp-fresh15.png', 'EXP(fresh)')