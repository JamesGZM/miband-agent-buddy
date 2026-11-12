import test from 'node:test';
import {execFileSync} from 'node:child_process';

test('release notices preserve source, validate receipts and reject missing or escaped licenses', () => {
  execFileSync('python3', ['-B', '-c', String.raw`
import hashlib,json,os,sys,tempfile,zipfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from collect_licenses import collect, license_files, normal_packages

with tempfile.TemporaryDirectory(prefix='buddy-licenses-test-') as temporary:
    root=Path(temporary)
    package=root/'synthetic';package.mkdir()
    (package/'Cargo.toml').write_text('synthetic manifest')
    (package/'copying.rs').write_text('not license text')
    assert license_files(package)==[]
    try:license_files(package,'../outside')
    except ValueError:pass
    else:raise AssertionError('accepted escaped license')
    (package/'.cargo_vcs_info.json').write_text(json.dumps({'git':{'sha1':'fixture-revision'}}))
    os.utime(package/'Cargo.toml',(0,0))
    data=root/'texts';data.mkdir()
    text=data/'MIT.txt';text.write_text('Synthetic license text')
    p={'id':'fixture','name':'synthetic','version':'1.0.0','license':'MIT','authors':['Fixture author'],'source':'registry','manifest_path':str(package/'Cargo.toml')}
    receipt={'license':'MIT','revision':'fixture-revision','files':[{'path':'MIT.txt','sha256':hashlib.sha256(text.read_bytes()).hexdigest()}]}
    records=collect([p],root/'out',{'synthetic-1.0.0':receipt},data)
    assert str(root) not in json.dumps(records)
    target=root/'out/synthetic-1.0.0'
    assert (target/'MIT.txt').read_bytes()==text.read_bytes()
    with zipfile.ZipFile(target/records[0]['sourceArchive']) as z:
        assert z.read('synthetic-1.0.0/Cargo.toml')==b'synthetic manifest'
        assert z.getinfo('synthetic-1.0.0/Cargo.toml').date_time==(1980,1,1,0,0,0)
    for receipts,folder in [({},'missing'),({'synthetic-1.0.0':{**receipt,'revision':'different'}},'wrong-revision')]:
        try:collect([p],root/folder,receipts,data)
        except ValueError:pass
        else:raise AssertionError('accepted unreviewed supplemental license')
    text.write_text('changed')
    try:collect([p],root/'changed',{'synthetic-1.0.0':receipt},data)
    except ValueError:pass
    else:raise AssertionError('accepted changed license')
    (package/'LICENSE').write_text('Original fixture license')
    assert license_files(package)==[package/'LICENSE']

metadata={'packages':[{'id':i} for i in ['root','normal','build','dev']], 'resolve':{'root':'root','nodes':[
 {'id':'root','deps':[{'pkg':'normal','dep_kinds':[{'kind':None}]},{'pkg':'build','dep_kinds':[{'kind':'build'}]},{'pkg':'dev','dep_kinds':[{'kind':'dev'}]}]},
 {'id':'normal','deps':[]},{'id':'build','deps':[]},{'id':'dev','deps':[]}]}}
assert normal_packages(metadata)==[{'id':'normal'}]
`], {cwd: new URL('../../', import.meta.url), stdio: 'pipe'});
});

test('Windows WebView2 crates ship pinned upstream notices and corresponding source', () => {
  execFileSync('python3', ['-B', '-c', String.raw`
import hashlib,json,sys,tempfile,zipfile
from pathlib import Path
sys.path.insert(0, 'scripts')
from collect_licenses import collect, DATA

receipts=json.loads((DATA/'receipts.json').read_text())
sources=json.loads((DATA/'sources.json').read_text())
packages=[
    ('webview2-com','0.39.1','edc2caf886175ccaebe86078c9cfe1ae2a187328'),
    ('webview2-com-macros','0.8.1','dffa41a8a46d3f5565eefbff2de57d38d399f158'),
    ('webview2-com-sys','0.39.1','edc2caf886175ccaebe86078c9cfe1ae2a187328'),
]
with tempfile.TemporaryDirectory(prefix='buddy-webview2-licenses-') as temporary:
    root=Path(temporary)
    for name,version,revision in packages:
        key=name+'-'+version
        receipt=receipts[key]
        assert receipt['license']=='MIT' and receipt['revision']==revision
        for item in receipt['files']:
            assert any(source['file']==item['path'] and source['url']==item['source'] and source['gitBlob']==item['gitBlob'] for source in sources)
            assert item['source'].startswith('https://github.com/wravery/webview2-rs/blob/'+revision+'/')
            content=(DATA/item['path']).read_bytes()
            assert hashlib.sha1(b'blob '+str(len(content)).encode()+b'\0'+content).hexdigest()==item['gitBlob']
        package=root/key;package.mkdir()
        (package/'Cargo.toml').write_text('Synthetic WebView2 package fixture')
        (package/'.cargo_vcs_info.json').write_text(json.dumps({'git':{'sha1':revision}}))
        p={'name':name,'version':version,'license':'MIT','source':'registry','manifest_path':str(package/'Cargo.toml')}
        record=collect([p],root/(key+'-notices'),receipts)[0]
        target=root/(key+'-notices')/key
        assert record['supplement']==receipt
        for item in receipt['files']:
            assert (target/Path(item['path']).name).read_bytes()==(DATA/item['path']).read_bytes()
        with zipfile.ZipFile(target/record['sourceArchive']) as archive:
            assert archive.read(key+'/Cargo.toml')==b'Synthetic WebView2 package fixture'
`], {cwd: new URL('../../', import.meta.url), stdio: 'pipe'});
});
