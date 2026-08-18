from PIL import Image
import numpy as np

ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_8eb710dae97f.png').convert('RGB')

# bar y-zones (from sweep): ref bars y574-599, 709-734, 844-869, 980-1004, 1114-1140
# exp bars y574-603, 709-738, 844-873, 979-1008, 1114-1143, 1249-1278
bars_ref = [(574,599),(709,734),(844,869),(980,1004),(1114,1140)]
bars_exp = [(574,603),(709,738),(844,873),(979,1008),(1114,1143),(1249,1278)]

def analyze(im, y0, y1, label):
    a = np.array(im).astype(int)
    strip = a[y0:y1]
    h, w = strip.shape[:2]
    out = []
    for x in range(w):
        col = strip[:, x]
        r, g, b = col[:,0].mean(), col[:,1].mean(), col[:,2].mean()
        if r < 150 and g < 150 and b < 150:
            cls = 'ink'
        elif b > 200 and b > r + 5 and b > g + 5:
            cls = 'blue'
        elif r > 170 and r > b + 30 and g < 190:
            cls = 'rose'
        elif r > 200 and g > b + 20:
            cls = 'peach'
        elif r > 235 and g > 235 and b > 235:
            cls = '.'
        elif min(r,g,b) < 235:
            cls = 'cream'   # track bg
        else:
            cls = '.'
        out.append(cls)
    # compress to runs
    runs = []
    cur = out[0]; start = 0
    for i in range(1, w):
        if out[i] != cur:
            runs.append((cur, start, i-1))
            cur = out[i]; start = i
    runs.append((cur, start, w-1))
    # merge: print only non-'.' runs with width>=2, drop cream runs longer than 6
    merged = []
    for cls, a0, a1 in runs:
        if cls == '.':
            continue
        if cls == 'cream' and a1 - a0 > 8:
            # keep track bounds separately
            if a1 - a0 > 40:
                continue
        merged.append(f"{cls}{a0}-{a1}")
    out_s = ' '.join(merged)
    # track: find leftmost and rightmost non-'.' pixel
    non = [x for x,c in enumerate(out) if c != '.']
    return f"{label}: track x{non[0]}-{non[-1]}  runs: {out_s}"

lines = []
for i, (y0,y1) in enumerate(bars_ref):
    lines.append(analyze(ref, y0, y1, f"REF bar{i+1}"))
for i, (y0,y1) in enumerate(bars_exp):
    lines.append(analyze(exp, y0, y1, f"EXP bar{i+1}"))
open('.scratch/bars_out.txt','w').write('\n'.join(lines))
print('\n'.join(lines))