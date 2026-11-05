import struct, zlib
M32=0xffffffff
def decrypt(buf, comp_size):
    s=(comp_size+0x55)&0xffff
    if s&0x8000: s_ext=s|0xffff0000
    else: s_ext=s
    seed=(((s_ext<<16)&M32)|s_ext)&M32
    seed=(seed^0x3b9a1d9)&0x0fffffff
    n=len(buf)//4
    out=bytearray(buf)
    import numpy as np
    arr=np.frombuffer(bytes(buf[:n*4]),dtype='<u4').copy()
    ks=np.empty(n,dtype='<u4')
    for i in range(n):
        seed=(seed*0x3fd+1)&0x0fffffff
        ks[i]=seed
    arr^=ks
    out[:n*4]=arr.tobytes()
    return bytes(out)
def read_blocks(path):
    f=open(path,'rb')
    h=f.read(0x1c)
    magic,ver,flags,count,c1,d2,c2,mx=struct.unpack('<IHHIIIII',h)
    assert magic==0xb19aca6e,hex(magic)
    def blk(csz):
        raw=f.read(csz)
        if flags&0x10: raw=decrypt(raw,csz)
        if flags&1: raw=zlib.decompress(raw)
        return raw
    ents=blk(c1); names=blk(c2)
    return dict(flags=flags,count=count,max=mx,ents=ents,names=names,datastart=0x1c+c1+c2,d2=d2)
if __name__=='__main__':
    import sys
    r=read_blocks(sys.argv[1])
    print({k:v for k,v in r.items() if k not in('ents','names')}, len(r['ents']), len(r['names']))
    print(r['names'][:200])
    for i in range(min(r['count'],4)):
        print(struct.unpack_from('<IIIIQIIQ',r['ents'],i*40))

def entries(r):
    out=[]
    for i in range(r['count']):
        ts,noff,_,doff,csz,x,size=struct.unpack_from('<QIIQIIQ',r['ents'],i*40)
        nm=r['names'][noff:r['names'].index(b'\0',noff)].decode('latin1')
        out.append(dict(ts=ts,name=nm,off=doff,csz=csz,x=x,size=size))
    return out
def extract(path,r,e,base=None):
    base=r['datastart'] if base is None else base
    with open(path,'rb') as f:
        f.seek(base+e['off']); raw=f.read(e['csz'])
    if r['flags']&0x10: raw=decrypt(raw,e['csz'])
    if r['flags']&1:
        try: raw=zlib.decompress(raw)
        except Exception as ex: return ('ERR',str(ex),raw[:16])
    return raw
