from PIL import Image
import numpy as np

ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('.scratch/exp-fresh.png').convert('RGB')

bars_ref = [(574,599),(709,734),(844,869),(980,1004),(1114,1140)]
bars_exp = [(574,603),(709,738),(844,873),(979,1008),(1114,1143),(1249,1278)]

def analyze(im, y0, y1, label):
    a = np.array(im).astype(int)
    strip = a[y0:y1]
    h, w = strip.shape[:2]
    # per-column dominant class among colored classes only
    classes = []
    for x in range(w):
        col = strip[:, x]
        r, g, b = col[:,0].mean(), col[:,1].mean(), col[:,2].mean()
        peach = r > 235 and 160 < g < 215 and b < 160
        if b > 200 and b > r + 5 and b > g + 5:
            cls = 'blue'
        elif r > 170 and r > b + 30 and g < 190:
            cls = 'rose'
        elif peach:
            cls = 'peach'
        elif min(r,g,b) < 235:
            cls = 'track'
        else:
            cls = '.'
        classes.append(cls)
    runs = []
    cur = classes[0]; start = 0
    for i in range(1, w):
        if classes[i] != cur:
            runs.append((cur, start, i-1)); cur = classes[i]; start = i
    runs.append((cur, start, w-1))
    # non-dot runs, width>=2, skip long track runs (>30) but keep their bounds
    parts = []
    for cls, a0, a1 in runs:
        if cls == '.': continue
        if cls == 'track':
            if a1 - a0 > 30:
                parts.append(f"track@{a0}-{a1}")
                continue
        parts.append(f"{cls}{a0}-{a1}")
    return f"{label}: {' '.join(parts)}"

lines = []
for i,(y0,y1) in enumerate(bars_ref): lines.append(analyze(ref, y0, y1, f"REF bar{i+1}"))
for i,(y0,y1) in enumerate(bars_exp): lines.append(analyze(exp, y0, y1, f"EXP bar{i+1}"))
# also heart probe: peach anywhere on each exp bar
a = np.array(exp).astype(int)
for i,(y0,y1) in enumerate(bars_exp):
    strip = a[y0:y1]
    m = (strip[:,:,0]>235)&(strip[:,:,1]>160)&(strip[:,:,1]<215)&(strip[:,:,2]<160)
    xs = np.where(m.any(axis=0))[0]
    lines.append(f"EXP bar{i+1} peach x: {f'{xs.min()}-{xs.max()}' if len(xs) else 'NONE'}")
open('.scratch/cmp_out.txt','w').write('\n'.join(lines))
print('\n'.join(lines))