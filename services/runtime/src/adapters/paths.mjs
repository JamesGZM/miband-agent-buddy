import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const transportPath = path.join(root, 'native/transport/target/debug/buddy-transport' + (process.platform === 'win32' ? '.exe' : ''));
export const packagePath = path.join(root, 'dist/buddy.debug.rpk');
