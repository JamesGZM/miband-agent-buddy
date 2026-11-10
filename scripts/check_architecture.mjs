import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['node_modules','target','upstream','vendor','dist','build','assets','capsule','generated','icons','pets']);
const roots = ['apps','services','packages','native/transport/src','scripts','tests'];

export function checkSource(file, source) {
  const errors = [];
  const report = message => errors.push(`${file}: ${message}`);
  const imports = [...source.matchAll(/\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?["']([^"']+)["']|\brequire\(\s*["']([^"']+)["']\s*\)/g)].map(m=>m[1] || m[2]);
  for (const specifier of imports) {
    const target = specifier.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file),specifier)) : specifier;
    if (file.startsWith('services/runtime/src/core/') &&
        !(target.startsWith('services/runtime/src/core/') || target.startsWith('packages/buddy-shared/'))) {
      report(`core imports platform/external module ${specifier}`);
    }
    if (file.startsWith('packages/') && !target.startsWith('packages/buddy-shared/')) report(`shared module imports ${specifier}`);
    if (file.startsWith('apps/desktop/ui/') && /^(node:|services\/|native\/|apps\/band\/)/.test(target)) report(`desktop UI imports ${specifier}`);
    if (file.startsWith('apps/band/src/controllers/') && /^@system[./]/.test(specifier)) report('controller imports a system API');
    if (target.startsWith('apps/') && file.startsWith('apps/') && target.split('/')[1] !== file.split('/')[1]) report(`cross-app import ${specifier}`);
    if (target.startsWith('../')) report(`import escapes workspace: ${specifier}`);
  }
  if (file.startsWith('apps/desktop/ui/') && !file.endsWith('/bridge.js') && /__TAURI__/.test(source)) report('Tauri access must go through bridge.js');
  if (/apps\/desktop\/src-tauri\/src\/(domain|protocol)\.rs$/.test(file) && /\btauri::|\bstd::(?:fs|process)|crate::(?:runtime|persistence|state|account|app|vault|net)\b/.test(source)) report('domain/wire models depend on platform effects');
  if (file.endsWith('/services.rs') && /\btauri::/.test(source)) report('application services depend on Tauri');
  if (file.startsWith('tests/') && /readFile/.test(source) && /\.(?:replace|replaceAll)\s*\(/.test(source)) report('tests must not rewrite production source');
  if (!file.startsWith('tests/') && /["'`](?:[^"'`\n]*\/)?(?:quickapp|tools|experiments|plugin|\.legacy)\//.test(source)) report('references a retired source directory');
  if (!file.startsWith('tests/') && /mac\/(?!buddy-runtime\.mjs|codex-hook\.mjs)[\w-]+\.mjs/.test(source)) report('references a retired Mac module');
  return errors;
}

async function walk(directory) {
  const found = [];
  for (const item of await fs.readdir(path.join(root,directory),{withFileTypes:true})) {
    if (excluded.has(item.name)) continue;
    const relative = path.posix.join(directory,item.name);
    if (item.isDirectory()) found.push(...await walk(relative));
    else if (/\.(?:m?js|rs|py|ux)$/.test(item.name)) found.push(relative);
  }
  return found;
}
export async function checkArchitecture() {
  const files = (await Promise.all(roots.map(walk))).flat().filter(f=>f !== 'scripts/check_architecture.mjs' && !f.startsWith('tests/architecture/'));
  const errors = [];
  for (const file of files) errors.push(...checkSource(file,await fs.readFile(path.join(root,file),'utf8')));
  return {files:files.length, errors};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await checkArchitecture();
  if (result.errors.length) {process.stderr.write(result.errors.join('\n')+'\n'); process.exitCode=1;}
  else process.stdout.write(`Architecture boundaries passed (${result.files} source files).\n`);
}
