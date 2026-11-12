const PROJECT = 'https://github.com/JamesGZM/miband-agent-buddy';
const LATEST = 'https://api.github.com/repos/JamesGZM/miband-agent-buddy/releases/latest';
const TAG = 'v(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)';
const ASSET = '(?:MiBand-Agent-Buddy-macos-(?:arm64|x64)\\.(?:zip|dmg)(?:\\.sha256)?|SHA256SUMS-(?:arm64|x64))';
const DOWNLOAD = new RegExp('^/buddy/releases/download/(' + TAG + ')/(' + ASSET + ')$');
const MAX_BYTES = 300 * 1024 * 1024;

function error(status) {
  return new Response('Update service unavailable', {status, headers:{'Cache-Control':'no-store'}});
}
function trustedOrigin(value) {
  const url = new URL(value);
  if(url.protocol!=='https:' || url.port && url.port!=='443' || url.username || url.password)return false;
  if(url.hostname==='api.github.com')return url.href===LATEST;
  if(url.hostname==='github.com')return url.pathname.startsWith('/JamesGZM/miband-agent-buddy/releases/download/');
  return ['release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(url.hostname);
}
async function origin(fetcher, target, method, range) {
  let url = target;
  for(let redirects=0;redirects<=5;redirects++) {
    if(!trustedOrigin(url))throw Error('Invalid origin');
    const headers = {'User-Agent':'MiBand-Agent-Buddy-Updates','Accept-Encoding':'identity'};
    if(target===LATEST)headers.Accept='application/vnd.github+json';
    if(range)headers.Range=range;
    const response = await fetcher(url, {method,headers,redirect:'manual',
      signal:AbortSignal.timeout(target===LATEST?15000:300000),
      // Metadata is cached only after validation below. Do not cache failures.
      ...(target===LATEST?{}:{cf:{cacheEverything:true,cacheTtlByStatus:{'200-299':3600,'300-599':0}}})});
    if([301,302,303,307,308].includes(response.status)) {
      const location=response.headers.get('Location');
      await response.body?.cancel();
      if(!location)throw Error('Missing redirect');
      url=new URL(location,url).href;
    } else return response;
  }
  throw Error('Redirect limit');
}
async function releaseBody(response) {
  const reader=response.body.getReader(),chunks=[];
  let bytes=0;
  try {
    for(;;) {
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>2*1024*1024)throw Error('Metadata too large');
      chunks.push(value);
    }
  } catch(e) {await reader.cancel();throw e;}
  const body=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}
  return JSON.parse(new TextDecoder().decode(body));
}
function release(value) {
  if(!value || !new RegExp('^'+TAG+'$').test(value.tag_name) || value.draft!==false ||
      value.prerelease!==false || !Array.isArray(value.assets) || value.assets.length>100)throw Error('Invalid release');
  const assets=[],seen=new Set();
  for(const asset of value.assets) {
    if(!new RegExp('^'+ASSET+'$').test(asset.name))continue;
    if(seen.has(asset.name) || asset.browser_download_url!==`${PROJECT}/releases/download/${value.tag_name}/${asset.name}` ||
        !Number.isSafeInteger(asset.size) || asset.size<=0 || asset.size>MAX_BYTES)throw Error('Invalid asset');
    seen.add(asset.name);
    assets.push({name:asset.name,browser_download_url:asset.browser_download_url,size:asset.size,
      digest:typeof asset.digest==='string'&&/^sha256:[a-fA-F0-9]{64}$/.test(asset.digest)?asset.digest:null});
  }
  return {tag_name:value.tag_name,draft:false,prerelease:false,assets};
}

export async function handleUpdate(request, {fetcher=fetch,cache,context}={}) {
  const url=new URL(request.url);
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(url.search || /%/.test(url.pathname))return error(400);
  const latest=url.pathname==='/buddy/releases/latest',download=url.pathname.match(DOWNLOAD);
  if(!latest&&!download)return new Response('Not found',{status:404});
  try {
    if(latest) {
      const key=new Request(url.href,{method:'GET'});
      const cached=await cache?.match(key);
      if(cached)return request.method==='HEAD'?new Response(null,cached):cached;
      const upstream=await origin(fetcher,LATEST,'GET');
      if(!upstream.ok)return error([403,404,429].includes(upstream.status)?upstream.status:502);
      const data=release(await releaseBody(upstream));
      const response=Response.json(data,{headers:{'Cache-Control':'public, max-age=600'}});
      if(cache&&context)context.waitUntil(cache.put(key,response.clone()).catch(()=>{}));
      return request.method==='HEAD'?new Response(null,response):response;
    }
    const range=request.headers.get('Range');
    if(range&&!/^bytes=(?:[0-9]+-[0-9]*|-[0-9]+)$/.test(range))return error(416);
    const upstream=await origin(fetcher,`${PROJECT}/releases/download/${download[1]}/${download[2]}`,request.method,range);
    if(![200,206].includes(upstream.status))return error(upstream.status===404?404:upstream.status===416?416:502);
    const length=upstream.headers.get('Content-Length');
    if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>MAX_BYTES)){await upstream.body?.cancel();return error(502);}
    const headers=new Headers({'Cache-Control':'public, max-age=3600','Content-Type':download[2].endsWith('.zip')?'application/zip':'application/octet-stream',
      'Content-Disposition':`attachment; filename="${download[2]}"`});
    for(const name of ['Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {
      const value=upstream.headers.get(name);if(value!==null)headers.set(name,value);
    }
    // Stream installers through fetch's cache; never clone/buffer a large body in JS.
    return new Response(request.method==='HEAD'?null:upstream.body,{status:upstream.status,headers});
  } catch {return error(502);}
}

export default {
  fetch(request,env,ctx) {
    return handleUpdate(request,{cache:caches.default,context:ctx});
  },
};
