import { t } from './i18n.js';

export function setupUpdates(beforeInstall) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#update-dialog');
  if (window.IOSClick) {
    const refresh = () => {
      $('#update-status').textContent = t('Install iPad and iPhone updates using the same app you used to sideload Click.');
      $('#check-update').textContent = t('Open GitHub releases');
      for (const id of ['download-update','install-update','update-progress','update-install-note']) $('#'+id).hidden = true;
    };
    $('#open-update').addEventListener('click', () => { refresh(); dialog.showModal(); });
    $('#close-update').addEventListener('click', () => dialog.close());
    $('#check-update').addEventListener('click', () => window.IOSClick.call('releasePage'));
    return refresh;
  }
  let state = { status: 'idle' }, timer;
  const native = window.NativeClick;
  const desktop = window.DesktopClick;
  const supported = native?.updateState || desktop?.updateState;
  const messages = {
    checking: 'Checking GitHub for updates…', current: 'You have the latest version.',
    available: 'Version {version} is available.', downloading: 'Downloading update… {progress}%',
    ready: 'Update downloaded and verified.', installing: 'Opening update…',
    permission: 'Allow updates from Click in Android settings, then tap Install update again.',
    unsupported: 'Use the desktop or Android app to install updates.',
  };
  const errors = {
    network: 'Could not reach GitHub. Check your connection and try again.',
    rate: 'GitHub is temporarily limiting update checks. Try again later.',
    release: 'This release does not have a compatible, verified update file.',
    integrity: 'The download failed verification. Check for updates to try again.',
    signature: 'This APK cannot update the installed app. Its signing key or package version does not match.',
    install: 'Could not open the update. Check for updates to try again.',
  };
  function refresh() {
    $('#update-version').textContent = state.current ? t('Installed version: {version}', { version: state.current }) : '';
    const key = state.status === 'error' ? errors[state.error] || errors.network : messages[state.status];
    $('#update-status').textContent = key ? t(key, state) : '';
    $('#update-progress').hidden = state.status !== 'downloading';
    $('#update-progress').value = state.progress || 0;
    $('#update-install-note').hidden = !['available','ready','permission'].includes(state.status);
    $('#update-install-note').textContent = t(state.platform === 'android' ? 'Android will ask you to confirm installation. Your settings are kept.' : 'Click will close and restart to apply the update. Your settings are kept.');
    $('#download-update').hidden = state.status !== 'available';
    $('#install-update').hidden = !['ready','permission'].includes(state.status);
    $('#check-update').hidden = !['current','error','idle'].includes(state.status);
  }
  async function read() {
    if (!supported) { state = { status: 'unsupported' }; refresh(); return; }
    try { state = native ? JSON.parse(native.updateState()) : await desktop.updateState(); }
    catch { state = { ...state, status: 'error', error: 'network' }; }
    refresh();
  }
  async function action(command) {
    state = { ...state, status: command === 'check' ? 'checking' : command === 'download' ? 'downloading' : 'installing', progress: 0 }; refresh();
    try {
      if (command === 'install') await beforeInstall();
      if (native) native.updateAction(command);
      else await desktop.updateAction(command);
      await read();
    } catch { state = { ...state, status: 'error', error: command === 'install' ? 'install' : 'network' }; refresh(); }
  }
  $('#open-update').addEventListener('click', async () => {
    dialog.showModal(); await read();
    clearInterval(timer); timer = setInterval(read, 400);
    if (supported && ['idle','error','current'].includes(state.status)) void action('check');
  });
  $('#close-update').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => clearInterval(timer));
  $('#check-update').addEventListener('click', () => action('check'));
  $('#download-update').addEventListener('click', () => action('download'));
  $('#install-update').addEventListener('click', () => action('install'));
  return refresh;
}
