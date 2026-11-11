import test from 'node:test';
import assert from 'node:assert/strict';
import { initialPage, setupStage, welcomePage, onboardingCard, connectionGuide, readyCard } from '../../apps/desktop/ui/onboarding.js';
import { HOOK_SOURCES, SKILL_URL, setupRequest, integrationsPage } from '../../apps/desktop/ui/integrations.js';
import { initialState } from '../../apps/desktop/ui/state.js';
import { setLanguage } from '../../apps/desktop/ui/i18n.js';

function selectedState() {
  const state = initialState();
  state.loggedIn = true;
  state.preferences.selected = 0;
  state.devices = [{ index: 0, supported: true }];
  return state;
}

test('first open leads directly to account sign-in with a service-region choice', () => {
  setLanguage('zh-Hant');
  const state = initialState();
  state.region = 'sg';
  assert.equal(initialPage(state), 'welcome');
  assert.equal(setupStage(state), 'account');
  const html = welcomePage(state, '<button data-action="login">登入小米帳號</button>');
  assert.match(html, /label for="region"/);
  assert.match(html, /option value="sg" selected/);
  assert.match(html, /data-action="login"/);
  assert.doesNotMatch(html, /setup-list|0 \/ 4|data-action="install"|RPK|AstroBox/);
  assert.equal(connectionGuide(state), '', 'do not ask the user to pair before sign-in');
});

test('account sign-in advances to device choice and actionable pairing instructions', () => {
  setLanguage('zh-Hant');
  const state = initialState();
  state.loggedIn = true;
  assert.equal(initialPage(state), 'devices');
  assert.equal(setupStage(state), 'device');
  assert.match(onboardingCard(state), /選擇你的手環/);
  const guide = connectionGuide(state);
  assert.match(guide, /class="connection-guide panel" open/);
  assert.match(guide, /連接新手機/);
  assert.match(guide, /手環與 Mac 的配對提示/);
  state.devices = [{ index: 0, supported: false }];
  state.preferences.selected = 0;
  assert.equal(initialPage(state), 'devices', 'an unsupported selection must not skip device choice');
});

test('returning users never restart onboarding because connection or Hook counts reset', () => {
  const state = selectedState();
  for (const connection of ['disconnected', 'connecting', 'authenticated', 'retrying', 'error', 'waiting', 'standby', 'connected']) {
    state.runtime = { connection, agent: { eventCount: 0 } };
    assert.equal(initialPage(state), 'buddy', connection);
    assert.equal(onboardingCard(state), '', connection);
    assert.equal(readyCard(state), '', connection);
    assert.doesNotMatch(connectionGuide(state), /class="connection-guide panel" open/, connection);
  }
  state.runtime.ack = { appVersion: 'fixture' };
  assert.equal(readyCard(state), '', 'ready prompt is opt-in for the current setup session');
  state.runtime.agent.eventCount = 4;
  assert.equal(onboardingCard(state), '');
});

test('only confirmed absence offers installation, and transfer keeps the current flow', () => {
  setLanguage('zh-Hant');
  const state = selectedState();
  state.runtime = { connection: 'waiting', buddy: { installed: null, status: 'checking' } };
  assert.equal(setupStage(state), 'checking');
  assert.equal(onboardingCard(state), '', 'a missing ACK is not a missing installation');
  state.runtime.buddy = { installed: false, status: 'not_installed' };
  assert.equal(setupStage(state), 'install');
  assert.match(onboardingCard(state), /點按「安裝 Buddy」/);
  assert.doesNotMatch(onboardingCard(state), /data-action="install"/, 'the band management action remains the single install control');
  state.runtime.connection = 'installing';
  state.runtime.ack = { appVersion: 'old-version' };
  assert.equal(setupStage(state), 'installing');
  assert.equal(onboardingCard(state), '');
  assert.equal(readyCard(state, { show: true }), '');
  assert.doesNotMatch(connectionGuide(state), /class="connection-guide panel" open/);
});

test('Buddy confirmation offers optional AI setup without requiring a Hook event', () => {
  setLanguage('zh-Hant');
  const state = selectedState();
  state.runtime = { connection: 'connected', buddy: { installed: true }, ack: { appVersion: 'fixture' }, agent: { eventCount: 0 } };
  assert.equal(setupStage(state), 'ready');
  const html = readyCard(state, { show: true });
  assert.match(html, /Buddy 已就緒/);
  assert.match(html, /data-page="hooks"/);
  assert.match(html, /data-page="buddy"/);
  assert.doesNotMatch(html, /setup-list|4 \/ 4/);
  state.runtime.buddy.installed = false;
  assert.equal(readyCard(state, { show: true }), '', 'fresh absent inventory outweighs a stale ACK');
  state.runtime.buddy.installed = true;
  state.runtime.connection = 'disconnected';
  assert.equal(readyCard(state, { show: true }), '', 'disconnected old ACK must not announce setup complete');
  assert.equal(initialPage(state), 'buddy', 'a transient disconnect still must not restart setup');
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
