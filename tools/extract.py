import sys, os, fnmatch
sys.path.insert(0, os.path.dirname(__file__))
from muabin import *
G=r'C:\Users\Eros\Desktop\_apps\_games\Marvel Ultimate Alliance'
def run(bins, pat='*', out='out/raw'):
    n=0
    for b in bins:
        p=os.path.join(G,b+'.bin'); r=read_blocks(p)
        with open(p,'rb') as f:
            for e in entries(r):
                if not fnmatch.fnmatch(e['name'],pat): continue
                f.seek(r['datastart']+e['off']); raw=f.read(e['csz'])
                if r['flags']&0x10: raw=decrypt(raw,e['csz'])
                if r['flags']&1: raw=zlib.decompress(raw)
                dst=os.path.join(out,b,e['name']); os.makedirs(os.path.dirname(dst),exist_ok=True)
                open(dst,'wb').write(raw); n+=1
    print('extracted',n)
if __name__=='__main__':
    run(sys.argv[1].split(','), sys.argv[2] if len(sys.argv)>2 else '*')
