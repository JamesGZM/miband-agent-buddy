import test from 'node:test';
import assert from 'node:assert/strict';
import { setupSteps, onboardingCard } from '../../apps/desktop/ui/onboarding.js';
import { HOOK_SOURCES, SKILL_URL, setupRequest, integrationsPage } from '../../apps/desktop/ui/integrations.js';
import { initialState } from '../../apps/desktop/ui/state.js';
import { setLanguage } from '../../apps/desktop/ui/i18n.js';

test('new-user setup follows actual account, connection, Buddy ACK and event evidence', () => {
  const state = initialState();
  assert.deepEqual(setupSteps(state).map(step => step.done), [false, false, false, false]);
  assert.match(onboardingCard(state), /data-page="account"/);
  state.loggedIn = true;
  state.preferences.selected = 0;
  state.devices = [{index: 0, supported: true}];
  state.runtime = {connection: 'waiting', agent: {eventCount: 0}};
  assert.deepEqual(setupSteps(state).map(step => step.done), [true, true, false, false]);
  state.runtime.ack = {appVersion: 'fixture'};
  state.runtime.agent.eventCount = 1;
  assert.equal(onboardingCard(state), '');
  state.runtime.connection = 'disconnected';
  assert.equal(setupSteps(state)[2].done, false, 'old ACK does not confirm a current connection');
});

test('every supported source produces a project-scoped skill request, never an auto-install command', () => {
  setLanguage('zh-Hant');
  for (const source of HOOK_SOURCES) {
    const request = setupRequest(source.id);
    assert.ok(request.includes(SKILL_URL));
    assert.ok(request.includes(source.name));
    assert.match(request, /專案級 Hooks/);
    assert.doesNotMatch(request, /curl|sudo|dangerously/);
  }
  assert.equal(setupRequest('invalid'), null);
  assert.match(integrationsPage({eventCount: 0}, String), /等待第一個事件/);
  assert.match(integrationsPage({eventCount: 2, lastEventAt: Date.now()}, String), /已收到 Hooks 事件/);
});
