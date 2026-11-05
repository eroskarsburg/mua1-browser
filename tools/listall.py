import sys, os, collections, json
sys.path.insert(0, os.path.dirname(__file__))
from muabin import *
G=r'C:\Users\Eros\Desktop\_apps\_games\Marvel Ultimate Alliance'
idx={}
for fn in sorted(os.listdir(G)):
    if not fn.endswith('.bin'): continue
    r=read_blocks(os.path.join(G,fn)); es=entries(r)
    ext=collections.Counter(os.path.splitext(e['name'])[1].lower() for e in es)
    tot=sum(e['size'] for e in es); ctot=sum(e['csz'] for e in es)
    print(f"{fn:18} n={len(es):6} unc={tot/1e6:9.1f}MB comp={ctot/1e6:9.1f}MB flags={r['flags']:#x} ext={dict(ext.most_common(8))}")
    idx[fn]=[(e['name'],e['off'],e['csz'],e['size']) for e in es]
    print('    e.g.', [e['name'] for e in es[:4]])
os.makedirs('out',exist_ok=True)
json.dump(idx,open('out/index.json','w'))
