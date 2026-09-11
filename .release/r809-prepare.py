import base64,gzip,hashlib,json,os,subprocess
from pathlib import Path
raw=''.join(Path('.release/r809-'+x+'.b64').read_text().strip() for x in ('a','b'))
assert hashlib.sha256(raw.encode()).hexdigest()=='64709a416a474febfd9a2fce11f4c35b404c586df3545ec61dd0dfd3f58096a7'
repairs=[[490,491,'G',''],[1483,1484,'E',''],[2726,2727,'U',''],[2811,2812,'h','J'],[3941,3942,'I',''],[5087,5088,'N',''],[5485,5486,'T',''],[10123,10125,'ws',''],[10578,10579,'U','']]
for i,j,old,new in reversed(repairs):
    assert raw[i:j]==old
    raw=raw[:i]+new+raw[j:]
assert hashlib.sha256(raw.encode()).hexdigest()=='71c4033d70d082a941c0a5f48e90c16fd90866efc42b4613cc198af7d5269ff6'
data=gzip.decompress(base64.b64decode(raw,validate=True))
assert hashlib.sha256(data).hexdigest()=='6f5e24f2c0a7345e259a44ebcadabe8fdd42dbff4b1f06717a371b4df14a592a'
bundle=json.loads(data);base=os.environ['EXPECTED_BASE'];assert bundle['base']==base
fixes=Path('.release/r809-fixes.py').read_text() if Path('.release/r809-fixes.py').exists() else ''
subprocess.run(['git','fetch','origin','main'],check=True)
assert subprocess.check_output(['git','rev-parse','origin/main'],text=True).strip()==base,'main moved'
subprocess.run(['git','read-tree','--reset','-u',base],check=True)
sha=lambda x:hashlib.sha256(x.encode()).hexdigest()
for f in bundle['files']:
    p=Path(f['path']);assert not p.is_absolute() and '..' not in p.parts
    if f['before'] is None:
        assert not p.exists(),str(p)+' already exists';out=f['content']
    else:
        out=p.read_bytes().decode('utf-8');assert sha(out)==f['before'],str(p)+' baseline mismatch'
        for a,b,t in reversed(f['edits']):out=out[:a]+t+out[b:]
    assert sha(out)==f['after'],str(p)+' result mismatch'
    p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(out.encode('utf-8'))
if fixes:exec(compile(fixes,'r809-fixes.py','exec'))
subprocess.run(['git','add','-A'],check=True)
subprocess.run(['git','diff','--cached','--check'],check=True)
Path('/tmp/report-manifest.json').write_text(json.dumps(bundle,ensure_ascii=False))
print('Verified',len(bundle['files']),'files on',base)
