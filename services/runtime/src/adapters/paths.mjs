import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../../../', import.meta.url));
export const transportPath = root + 'native/transport/target/debug/buddy-transport';
export const packagePath = root + 'dist/buddy.debug.rpk';
