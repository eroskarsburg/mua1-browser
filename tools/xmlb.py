import struct
def parse(d):
    magic,ver,stroff=struct.unpack_from('<III',d,0)
    if magic!=0x11b1: raise ValueError('bad xmlb magic')
    def s(o):
        e=d.index(b'\0',o); return d[o:e].decode('latin1')
    def node(o):
        name,nxt,child,na=struct.unpack_from('<IiiI',d,o)
        n={'tag':s(name),'attrs':{},'children':[]}
        p=o+16
        for _ in range(na):
            a,v=struct.unpack_from('<II',d,p); p+=8; n['attrs'][s(a)]=s(v)
        c=child
        while c!=-1:
            ch,nx=node_sib(c); n['children'].append(ch); c=nx
        return n
    def node_sib(o):
        nxt=struct.unpack_from('<i',d,o+4)[0]; return node(o),nxt
    return node(8)
def to_xml(n,ind=0):
    a=''.join(f' {k}="{v}"' for k,v in n['attrs'].items()); pad='  '*ind
    if not n['children']: return f'{pad}<{n["tag"]}{a}/>\n'
    return f'{pad}<{n["tag"]}{a}>\n'+''.join(to_xml(c,ind+1) for c in n['children'])+f'{pad}</{n["tag"]}>\n'
if __name__=='__main__':
    import sys,glob,os
    ok=bad=0
    for f in glob.glob('out/raw/**/*.xmlb',recursive=True):
        try: parse(open(f,'rb').read()); ok+=1
        except Exception as e:
            bad+=1
            if bad<5: print(f,e)
    print('ok',ok,'bad',bad)
    print(to_xml(parse(open('out/raw/data/charinfo.xmlb','rb').read()))[:700])
