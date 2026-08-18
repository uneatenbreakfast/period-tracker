from PIL import Image
ref = Image.open('.scratch/ref-mh.jpg').convert('RGB')
exp = Image.open('/home/nelsonw/.hermes/cache/images/img_8eb710dae97f.png').convert('RGB')
pts = [(40, 586), (60, 586), (90, 586), (100, 586), (130, 586), (160, 586), (200, 586), (210, 590), (220, 586), (230, 586), (300, 586), (32, 588), (500, 540), (140, 586), (24, 584), (40, 584)]
print('x,y  ref        exp')
for p in pts:
    print(p, ref.getpixel(p), exp.getpixel(p))
print('--- bar2 (28d): blue 154-250, heart 223-244')
pts2 = [(40, 721), (60, 721), (90, 721), (160, 721), (200, 721), (230, 721), (250, 721), (300, 721)]
for p in pts2:
    print(p, ref.getpixel(p), exp.getpixel(p))
print('--- bar3 blue 84-180 hmm check (90,856) (120,856) (160,856) (175,856)')
pts3 = [(90, 856), (120, 856), (160, 856), (175, 856), (60, 856), (100, 856)]
for p in pts3:
    print(p, ref.getpixel(p), exp.getpixel(p))