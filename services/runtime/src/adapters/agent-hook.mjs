import {createHash} from 'node:crypto';
import {EVENTS} from '../core/codex-state.mjs';

export const HOOK_PROVIDERS = ['claude-code', 'deepseek', 'custom', 'chatgpt', 'claude-desktop'];
export const CLAUDE_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
  'PostToolUseFailure', 'PermissionRequest', 'Stop', 'StopFailure', 'SessionEnd'];

export function sanitizeAgentHook(data, provider, event, at = Date.now()) {
  const supported = provider === 'claude-code' ? CLAUDE_EVENTS : EVENTS;
  if (!HOOK_PROVIDERS.includes(provider) || !supported.includes(event) ||
      !data || data.hook_event_name !== event || typeof data.session_id !== 'string' ||
      !data.session_id || data.session_id.length > 512) throw Error('Invalid hook');
  // This integration reports main conversations, not nested tool/subagent activity.
  if (provider === 'claude-code' && data.agent_id) throw Error('Nested agent ignored');
  // A failed tool returns to the agent; a failed turn must not look like success.
  const mapped = event === 'PostToolUseFailure' ? 'PostToolUse' : event === 'StopFailure' ? 'Interrupt' : event;
  return {event: mapped, session: createHash('sha256').update(provider + '\0' + data.session_id).digest('hex'), at};
}

export async function forwardAgentHook(data, provider, event, {
  endpoint = 'http://127.0.0.1:10731/api/codex-event', at = Date.now(),
} = {}) {
  const url = new URL(endpoint);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw Error('Local endpoint required');
  const response = await fetch(url, {method: 'POST', redirect: 'error', signal: AbortSignal.timeout(600),
    headers: {'Content-Type': 'application/json', 'X-Band-Codex': '1'},
    body: JSON.stringify(sanitizeAgentHook(data, provider, event, at))});
  if (!response.ok) throw Error('Monitor unavailable');
}
