import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {createHash} from 'node:crypto';

// Called during process composition; stale metadata never advertises an unrelated RPK.
export function readBandPackage(packagePath) {
  try {
    const metadata = JSON.parse(readFileSync(join(dirname(packagePath), 'buddy-package.json'), 'utf8'));
    if (typeof metadata.versionName !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(metadata.versionName) ||
        !Number.isInteger(metadata.versionCode) || metadata.versionCode < 1 || metadata.versionCode > 4294967295 ||
        typeof metadata.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(metadata.sha256)) return null;
    const bytes = readFileSync(packagePath);
    if (bytes.length >= 16 * 1024 * 1024 || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) return null;
    return {versionName: metadata.versionName, versionCode: metadata.versionCode, sizeBytes: bytes.length};
  } catch {return null;}
}
