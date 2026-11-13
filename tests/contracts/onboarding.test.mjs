import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { initialPage, setupStage, welcomePage, onboardingCard, connectionGuide, readyCard } from '../../apps/desktop/ui/onboarding.js';
import { setupRequest, integrationCopy, integrationsPage } from '../../apps/desktop/ui/integrations.js';
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

test('generic integration copies the whole integration guide by application identity without paths', () => {
  setLanguage('zh-Hant');
  const config = {application:{name:'MiBand Agent Buddy',id:'io.github.jamesgzm.miband-agent-buddy'},
    command:'/synthetic/Buddy.app/Contents/MacOS/buddy', cliArgs:['--buddy-cli'], guidePath:'/synthetic/runtime/integration-guide.md',
    guide:readFileSync(new URL('../../services/runtime/integration-guide.md',import.meta.url),'utf8')};
  const request = setupRequest(config);
  assert.match(request, /使用者全域的持續自動狀態回報/);
  assert.match(request, /跨專案、新主對話及後續輪次/);
  assert.match(request, /選擇支援的自動觸發機制/);
  assert.match(request, /不要只測通 CLI 就結束/);
  assert.match(request, /不得自行改成專案級接入/);
  assert.match(request, /單次上報成功不代表自動接入完成/);
  assert.match(request, /自動接入未完成/);
  assert.match(request, /Automatic trigger/);
  assert.match(request, /Delivery channel/);
  assert.match(request, /later ordinary user turn without a notification instruction/);
  assert.match(request, /current session as not yet loaded/);
  assert.match(request, /不要假設安裝目錄或掃描家目錄/);
  assert.match(request, /不需要下載原始碼或安裝額外環境/);
  assert.ok(!request.includes(config.guidePath));
  assert.ok(!request.includes(config.command));
  assert.ok(request.includes('--buddy-cli'));
  assert.ok(request.includes(config.guide));
  assert.ok(request.endsWith(config.guide));
  assert.doesNotMatch(request,/https?:\/\/|\/Applications\/|\/Contents\/|\.app\b|\/synthetic\//i);
  assert.equal(integrationCopy('request',config),request);
  assert.equal(integrationCopy('unknown',config),null);
  assert.doesNotMatch(request,/MCP|report_activity|buddy_status/);
  assert.doesNotMatch(request,/離線|离线|offline/i);
  assert.equal(integrationCopy('request',undefined),null);
  const page = integrationsPage({eventCount:0},String,config);
  assert.match(page,/等待第一個事件/);
  assert.match(page,/不同專案的新對話/);
  assert.match(page,/不另外要求上報/);
  assert.doesNotMatch(page,/在目標專案|為目前對話建立/);
  assert.match(page,/複製接入說明/);
  assert.match(page,/查看接入說明/);
  assert.doesNotMatch(page,/Custom harness|DeepSeek harness|選擇你的 AI 工具|data-copy-provider|MCP/);
  assert.match(integrationsPage({eventCount:2,lastEventAt:Date.now()},String,config),/已收到活動事件/);
  assert.match(integrationsPage({},String),/data-copy-integration="request" disabled/);
});

test('all setup-request languages require global automatic reporting with bounded observation', () => {
  const config = {application:{name:'MiBand Agent Buddy'},guide:'Synthetic guide'};
  try {
    for (const [language, scope, mechanism, delivery] of [
      ['zh-Hant', /使用者全域/, /自動觸發機制/, /非阻塞觀察機制/],
      ['zh-Hans', /用户全局/, /自动触发机制/, /非阻塞观察机制/],
      ['en', /user-wide/, /supported automatic trigger/, /nonblocking observation/],
    ]) {
      setLanguage(language);
      const request = setupRequest(config);
      assert.match(request, scope);
      assert.match(request, mechanism);
      assert.match(request, delivery);
      assert.ok(request.endsWith(config.guide));
    }
  } finally {setLanguage('zh-Hant');}
});
