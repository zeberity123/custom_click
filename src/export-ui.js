import { t } from './i18n.js';
import { exportDuration } from './export-renderer.js';

export function setupExport(getConfig) {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#export-dialog');
  let worker, busy = false, message = '', progress = 0, request = 0;
  function refresh() {
    $('#export-status').textContent = message ? t(message,{progress}) : '';
    $('#export-progress').hidden = !busy;
    $('#export-progress').value = progress;
    for (const id of ['save-export','export-length','export-unit']) $('#'+id).disabled = busy;
  }
  function stop() {
    request++; worker?.terminate(); worker = null; busy = false;
    window.NativeClick?.cancelExport?.();
    message = 'Export cancelled.'; refresh();
  }
  $('#open-export').addEventListener('click', () => { message = ''; refresh(); dialog.showModal(); });
  for (const id of ['close-export','cancel-export']) $('#'+id).addEventListener('click', () => { if (busy) stop(); dialog.close(); });
  dialog.addEventListener('cancel', () => { if (busy) stop(); });
  window.addEventListener('native-export', event => {
    busy = false;
    message = event.detail.saved ? 'MP3 saved.' : event.detail.cancelled ? 'Export cancelled.' : 'exportFailed';
    refresh();
  });
  async function save(blob, token, bpm) {
    const filename = `Click-${bpm}bpm.mp3`;
    if (window.NativeClick) {
      if (!window.NativeClick.beginExport?.()) throw new Error('exportFailed');
      // Small bridge chunks avoid a large base64 string on the Android UI thread.
      for (let offset = 0; offset < blob.size; offset += 32768) {
        if (token !== request) return;
        const chunk = new Uint8Array(await blob.slice(offset,offset+32768).arrayBuffer());
        if (token !== request) return;
        if (!window.NativeClick.appendExport(btoa(String.fromCharCode(...chunk)))) throw new Error('exportFailed');
        if (offset % (32768 * 16) === 0) await new Promise(resolve => setTimeout(resolve,0));
      }
      if (token !== request) return;
      if (!window.NativeClick.finishExport(filename)) throw new Error('exportFailed');
    } else if (window.DesktopClick) {
      const result = await window.DesktopClick.saveMp3(await blob.arrayBuffer(),filename);
      if (token !== request) return;
      if (result.error) throw new Error('exportFailed');
      busy = false; message = result.saved ? 'MP3 saved.' : 'Export cancelled.'; refresh(); return;
    } else {
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url),60000);
      busy = false;
    }
    message = 'Choose where to save the MP3.'; refresh();
  }
  $('#export-form').addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const config = structuredClone(getConfig()), length = Number($('#export-length').value), unit = $('#export-unit').value;
    try { exportDuration(config,length,unit); }
    catch (error) { message = error.message; refresh(); return; }
    const token = ++request;
    busy = true; progress = 0; message = 'Exporting… {progress}%'; refresh();
    function fail() { if (token !== request) return; worker?.terminate(); worker = null; window.NativeClick?.cancelExport?.(); busy = false; message = 'exportFailed'; refresh(); }
    try {
      worker = new Worker('./export-worker.js');
      worker.onerror = fail;
      worker.onmessage = async ({data}) => {
        if (token !== request) return;
        if (data.error) { fail(); return; }
        if (data.progress != null) { progress = data.progress; refresh(); }
        if (data.blob) {
          worker.terminate(); worker = null;
          try { await save(data.blob,token,config.bpm); } catch { fail(); }
        }
      };
      worker.postMessage({config,length,unit});
    } catch { fail(); }
  });
  return refresh;
}
