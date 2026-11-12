import test from 'node:test';
import assert from 'node:assert/strict';
import { buddyPackageView, bandOnlyError } from '../../apps/desktop/ui/band-package.js';
import { desktopUpdateView, updateErrorMessage } from '../../apps/desktop/ui/desktop-update.js';

test('band management distinguishes unknown, absent, update and current inventories', () => {
  const runtime = {connection:'standby'};
  assert.equal(buddyPackageView(runtime).status, 'unknown');
  assert.equal(buddyPackageView(runtime).installLabel, null, 'no ACK must not imply missing app');
  runtime.buddy = {status:'not_installed',installed:false,availableVersion:'0.5.4'};
  runtime.ack = {appVersion:'old cached ACK'};
  assert.equal(buddyPackageView(runtime).installedVersion, null);
  assert.equal(buddyPackageView(runtime).installLabel, '安裝 Buddy');
  runtime.buddy = {status:'update_available',installed:true,installedVersionCode:15,availableVersion:'0.5.4'};
  assert.equal(buddyPackageView(runtime).installLabel, '更新 Buddy');
  for (const status of ['current','newer','checking','unknown','error']) {
    runtime.buddy.status = status;
    assert.equal(buddyPackageView(runtime).installLabel, null);
  }
  runtime.buddy.status = 'checking';
  assert.equal(buddyPackageView(runtime).canCheck, false);
  runtime.connection = 'installing';
  assert.equal(buddyPackageView(runtime).status, 'installing');
  assert.equal(buddyPackageView(runtime).canReinstall, false);
  runtime.connection = 'disconnected';
  assert.equal(buddyPackageView(runtime).canCheck, false);
  assert.equal(buddyPackageView(runtime).installedVersion, null);
});

test('a verified package can retry pre-install failures while showing the failure reason',()=>{
  for(const error of ['install_location','storage_error','install_failed']){
    const view=desktopUpdateView({status:'ready',canInstall:true,error});
    assert.equal(view.canInstall,true);assert.equal(view.hasUpdate,true);
    assert.equal(view.label,updateErrorMessage(error));
  }
  assert.equal(desktopUpdateView({status:'error',canInstall:false,error:'package_invalid'}).canInstall,false);
});

test('only Buddy package errors are restricted to Band; connection errors remain visible', () => {
  for (const message of ['手環尚未安裝 Buddy，請前往手環頁安裝','請安裝並在手環打開 Buddy','Buddy 安裝失敗，請保持手環連線後重試','安裝逾時，請重連後檢查版本']) assert.equal(bandOnlyError(message), true);
  for (const message of [null,'請先連線手環','手環拒絕認證','Buddy 暫未回應，請稍後重試']) assert.equal(bandOnlyError(message), false);
});

test('desktop install is only offered for a verified installable package', () => {
  for (const status of ['available','downloading','ready']) assert.equal(desktopUpdateView({status}).hasUpdate, true);
  for (const status of ['idle','checking','current','unpublished','unavailable','error']) assert.equal(desktopUpdateView({status}).hasUpdate, false);
  assert.equal(desktopUpdateView().canInstall, false);
  assert.equal(desktopUpdateView({status:'available',canInstall:true}).canInstall, false);
  assert.equal(desktopUpdateView({status:'ready',canInstall:false}).canInstall, false);
  assert.equal(desktopUpdateView({status:'ready',canInstall:true}).canInstall, true);
  assert.equal(desktopUpdateView({status:'downloading',progress:40}).canCheck, false);
  assert.equal(desktopUpdateView({status:'downloading',progress:140}).progress, 100);
  assert.equal(desktopUpdateView({status:'unpublished'}).canDownload, false);
});
