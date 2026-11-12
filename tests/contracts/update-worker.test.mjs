import test from 'node:test';
import assert from 'node:assert/strict';
import {handleUpdate} from '../../services/update-worker/src/index.mjs';

const base='https://buddy-updates.ailaogong.men';
const asset='MiBand-Agent-Buddy-macos-arm64.zip';
const path='/buddy/releases/download/v0.8.0/'+asset;
const release=()=>({tag_name:'v0.8.0',draft:false,prerelease:false,assets:[{name:asset,size:42,digest:'sha256:'+'a'.repeat(64),
  browser_download_url:'https://github.com/JamesGZM/miband-agent-buddy/releases/download/v0.8.0/'+asset}],body:'not forwarded'});

test('update Worker returns bounded release metadata and caches only successful checks',async()=>{
  const entries=new Map(),jobs=[];let calls=0;
  const options={fetcher:async(url,init)=>{
    calls++;assert.equal(url,'https://api.github.com/repos/JamesGZM/miband-agent-buddy/releases/latest');
    assert.equal(init.redirect,'manual');assert.equal(init.headers.Authorization,undefined);
    assert.equal(init.cf,undefined);return Response.json(release());
  },cache:{match:async key=>entries.get(key.url)?.clone(),put:async(key,value)=>{entries.set(key.url,value);}},context:{waitUntil:job=>jobs.push(job)}};
  const response=await handleUpdate(new Request(base+'/buddy/releases/latest'),options);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'public, max-age=600');
  const data=await response.json();assert.equal(data.tag_name,'v0.8.0');assert.equal(data.body,undefined);
  await Promise.all(jobs);
  assert.equal((await handleUpdate(new Request(base+'/buddy/releases/latest'),options)).status,200);assert.equal(calls,1);
});

test('invalid, missing and rate-limited metadata is not cached',async()=>{
  for(const value of [{...release(),draft:true},{...release(),tag_name:'v0.8.0/evil'},
    {...release(),assets:[{...release().assets[0],browser_download_url:'https://evil.invalid/a'}]}]) {
    let puts=0;
    const response=await handleUpdate(new Request(base+'/buddy/releases/latest'),{fetcher:async()=>Response.json(value),
      cache:{match:async()=>null,put:async()=>{puts++;}},context:{waitUntil(){}}});
    assert.equal(response.status,502);assert.equal(puts,0);
  }
  for(const status of [403,404,429,500]) {
    const response=await handleUpdate(new Request(base+'/buddy/releases/latest'),{fetcher:async()=>new Response(null,{status})});
    assert.equal(response.status,status===500?502:status);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
});

test('installer proxy follows only fixed GitHub asset hosts and streams without reading the body',async()=>{
  let controller;const source=new ReadableStream({start(value){controller=value;}}),calls=[];
  const response=await handleUpdate(new Request(base+path),{fetcher:async(url,init)=>{
    calls.push(url);assert.equal(init.headers.Cookie,undefined);
    assert.equal(init.cf.cacheTtlByStatus['300-599'],0);
    return calls.length===1?new Response(null,{status:302,headers:{Location:'https://release-assets.githubusercontent.com/fixture'}}):
      new Response(source,{headers:{'Content-Length':'7'}});
  }});
  assert.equal(response.status,200);assert.equal(calls.length,2);
  controller.enqueue(new TextEncoder().encode('fixture'));controller.close();
  assert.equal(await response.text(),'fixture');
  assert.equal(response.headers.get('Content-Disposition'),`attachment; filename="${asset}"`);
});

test('installer proxy supports single ranges and HEAD without forwarding credentials',async()=>{
  for(const method of ['GET','HEAD']) {
    const response=await handleUpdate(new Request(base+path,{method,headers:{Range:'bytes=0-6',Cookie:'synthetic-private-text',Authorization:'synthetic-private-text'}}),{
      fetcher:async(url,init)=>{
        assert.equal(init.method,method);assert.equal(init.headers.Range,'bytes=0-6');
        assert.equal(init.headers.Cookie,undefined);assert.equal(init.headers.Authorization,undefined);
        return new Response(method==='HEAD'?null:'fixture',{status:206,headers:{'Content-Range':'bytes 0-6/42','Content-Length':'7'}});
      },
    });
    assert.equal(response.status,206);assert.equal(response.headers.get('Content-Range'),'bytes 0-6/42');
    if(method==='HEAD')assert.equal(await response.text(),'');
  }
});

test('invalid routes, query proxies, unsafe redirects and oversized bodies are rejected',async()=>{
  let calls=0;const fetcher=async()=>{calls++;throw Error('must not fetch');};
  for(const route of ['/','/index.yaml','/buddy/releases/download/v0.8.0/not-allowed.zip',path+'?url=https://evil.invalid',
    '/buddy/releases/download/v0.8.0/%2e%2e/a',path.replace('v0.8.0','v0.8.0-beta')]) {
    assert.ok((await handleUpdate(new Request(base+route),{fetcher})).status>=400);
  }
  assert.equal(calls,0);
  for(const location of ['http://github.com/a','https://evil.invalid/a','https://user@release-assets.githubusercontent.com/a','https://github.com/other/repo/releases/download/v1/a.zip']) {
    let redirects=0;
    const response=await handleUpdate(new Request(base+path),{fetcher:async()=>{redirects++;return new Response(null,{status:302,headers:{Location:location}});}});
    assert.equal(response.status,502);assert.equal(redirects,1);
  }
  assert.equal((await handleUpdate(new Request(base+path),{fetcher:async()=>new Response(null,{headers:{'Content-Length':String(301*1024*1024)}})})).status,502);
  assert.equal((await handleUpdate(new Request(base+path,{method:'POST'}),{fetcher})).status,405);
});
