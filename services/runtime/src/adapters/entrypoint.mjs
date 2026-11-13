import {realpathSync} from 'node:fs';

export function isMainModule(moduleUrl, argument = process.argv[1]) {
  if (!argument) return false;
  try {
    // Node may resolve the module through a different spelling of a linked path.
    return realpathSync(new URL(moduleUrl)) === realpathSync(argument);
  } catch {return false;}
}
