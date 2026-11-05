import numpy as np, struct, zlib
def _c565(c):
    r=((c>>11)&31)*255//31; g=((c>>5)&63)*255//63; b=(c&31)*255//31
    return np.stack([r,g,b],-1).astype(np.uint8)
def dxt(data,w,h,fmt):
    bx,by=max(1,(w+3)//4),max(1,(h+3)//4); bs=8 if fmt=='dxt1' else 16
    a=np.frombuffer(data[:bx*by*bs],dtype=np.uint8).reshape(by*bx,bs)
    o=8 if fmt=='dxt5' else 0
    c0=a[:,o].astype(np.uint32)|(a[:,o+1].astype(np.uint32)<<8); c1=a[:,o+2].astype(np.uint32)|(a[:,o+3].astype(np.uint32)<<8)
    p0,p1=_c565(c0).astype(np.int32),_c565(c1).astype(np.int32)
    pal=np.zeros((len(a),4,4),np.int32)   # color, alpha
    four=(c0>c1) | (fmt!='dxt1')
    pal[:,0,:3]=p0; pal[:,1,:3]=p1
    pal[:,2,:3]=np.where(four[:,None],(2*p0+p1)//3,(p0+p1)//2)
    pal[:,3,:3]=np.where(four[:,None],(p0+2*p1)//3,0)
    pal[:,:,3]=255; pal[~four,3,3]=0
    bits=a[:,o+4].astype(np.uint32)|(a[:,o+5].astype(np.uint32)<<8)|(a[:,o+6].astype(np.uint32)<<16)|(a[:,o+7].astype(np.uint32)<<24)
    idx=np.stack([(bits>>(2*i))&3 for i in range(16)],1)
    px=np.take_along_axis(pal,idx[:,:,None],1)[:,:,:] if False else pal[np.arange(len(a))[:,None],idx]   # (n,16,4)
    if fmt=='dxt5':
        a0=a[:,0].astype(np.int32); a1=a[:,1].astype(np.int32)
        al=np.zeros((len(a),8),np.int32); al[:,0]=a0; al[:,1]=a1
        for i in range(1,7):
            al[:,i+1]=np.where(a0>a1,((7-i)*a0+i*a1)//7,0)
        for i in range(1,5):
            al[:,i+1]=np.where(a0>a1,al[:,i+1],((5-i)*a0+i*a1)//5)
        al[:,6]=np.where(a0>a1,al[:,6],0); al[:,7]=np.where(a0>a1,al[:,7],255)
        ab=sum(a[:,2+i].astype(np.uint64)<<np.uint64(8*i) for i in range(6))
        ai=np.stack([((ab>>np.uint64(3*i))&np.uint64(7)).astype(np.int64) for i in range(16)],1)
        px[:,:,3]=al[np.arange(len(a))[:,None],ai]
    img=px.reshape(by,bx,4,4,4).transpose(0,2,1,3,4).reshape(by*4,bx*4,4)
    return img[:h,:w].astype(np.uint8)
def png(img):
    h,w,_=img.shape; raw=b''.join(b'\0'+img[y].tobytes() for y in range(h))
    def ch(t,d): c=struct.pack('>I',len(d))+t+d; return c+struct.pack('>I',zlib.crc32(t+d))
    return b'\x89PNG\r\n\x1a\n'+ch(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+ch(b'IDAT',zlib.compress(raw,6))+ch(b'IEND',b'')
def decode_igb_texture(g):
    o=[x for x in g.objects if x['name']=='igImage'][0]; v=[x[2] for x in o['v']]
    w,h,fmt,ds,ref=v[0],v[1],{14:'dxt1',16:'dxt5'}[v[9]],v[10],v[11]
    return dxt(g.mem(ref),w,h,fmt)
if __name__=='__main__':
    import sys; sys.path.insert(0,'tools'); from igb import IGB
    for name,out in [('comic/xml2_cov/bishop_cov','bishop'),('explosion_puff_a','puff'),('black_s','black')]:
        g=IGB(open(f'out/raw/textures/{name}.igb','rb').read()); im=decode_igb_texture(g)
        open(f'out/{out}.png','wb').write(png(im)); print(out,im.shape)
