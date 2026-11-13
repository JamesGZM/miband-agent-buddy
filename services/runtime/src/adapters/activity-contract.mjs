import {createHash} from 'node:crypto';

export const ACTIVITY_STATES = ['thinking', 'working', 'needs_user', 'completed', 'cancelled', 'failed'];
const keys = ['source', 'session', 'run', 'seq', 'state'];
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

export function validateActivity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key)) ||
      !identifier.test(value.source || '') || !identifier.test(value.session || '') ||
      typeof value.source !== 'string' || typeof value.session !== 'string' ||
      value.source.trim() !== value.source || value.session.trim() !== value.session ||
      !Number.isSafeInteger(value.run) || value.run < 1 ||
      !Number.isSafeInteger(value.seq) || value.seq < 1 || !ACTIVITY_STATES.includes(value.state)) {
    throw Error('invalid_activity');
  }
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

export function sanitizeActivity(value) {
  const activity = validateActivity(value);
  return {session: createHash('sha256').update('buddy-activity\0' + activity.source + '\0' + activity.session).digest('hex'),
    run: activity.run, seq: activity.seq, state: activity.state};
}
