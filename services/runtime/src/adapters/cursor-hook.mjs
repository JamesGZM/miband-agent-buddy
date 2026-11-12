import {sanitizeAgentHook} from './agent-hook.mjs';

const events = {
  beforeSubmitPrompt: 'UserPromptSubmit',
  preToolUse: 'PreToolUse',
  postToolUse: 'PostToolUse',
  postToolUseFailure: 'PostToolUse',
  sessionStart: 'SessionStart',
  sessionEnd: 'SessionEnd',
};

export function cursorHookResponse(event) {
  if (event === 'beforeSubmitPrompt') return {continue: true};
  // Buddy never vetoes a tool; Cursor requires a valid permission response here.
  if (event === 'preToolUse') return {permission: 'allow'};
  return {};
}

export function sanitizeCursorHook(data, event, at = Date.now()) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.is_background_agent === true ||
      (data.hook_event_name !== undefined && data.hook_event_name !== event)) throw Error('Invalid Cursor hook');
  const mapped = event === 'stop' ? data.status === 'completed' ? 'Stop' : 'Interrupt' : events[event];
  if (!mapped) throw Error('Unsupported Cursor event');
  // Retain the existing local adapter's custom namespace and conversation identity.
  return sanitizeAgentHook({hook_event_name: mapped, session_id: data.conversation_id || data.session_id}, 'custom', mapped, at);
}
