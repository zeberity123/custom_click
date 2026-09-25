const phrases = [
  ['STARTING TEMPO (BPM)','시작 템포 (BPM)','開始テンポ (BPM)'],
  ['Audio output is unavailable. Check your output device and try again.','오디오 출력 장치를 확인한 후 다시 시도하세요.','音声出力デバイスを確認して、もう一度お試しください。'],
  ['Android audio service did not start. Reopen the app and try again.','오디오 서비스가 시작되지 않았습니다. 앱을 다시 열어 주세요.','音声サービスが起動しませんでした。アプリを開き直してください。'],
  ['Could not load click samples.','클릭 사운드를 불러올 수 없습니다.','クリック音を読み込めません。'], ['Invalid click sample.','클릭 사운드 파일이 올바르지 않습니다.','クリック音のファイルが無効です。'],
  ['Audio focus lost. Tap Resume when you are ready.','다른 앱이 오디오를 사용하고 있습니다. 준비되면 재개를 누르세요.','他のアプリが音声を使用しています。準備ができたら再開を押してください。'], ['Audio output is in use. Try again.','오디오가 사용 중입니다. 다시 시도하세요.','音声が使用中です。もう一度お試しください。'], ['Invalid metronome settings.','메트로놈 설정이 올바르지 않습니다.','メトロノームの設定が無効です。'],
  ['Export MP3','MP3 내보내기','MP3 書き出し'], ['Language','언어','言語'],
  ['Rhythm & sound','리듬 및 사운드','リズムとサウンド'], ['Rhythm and sound','리듬 및 사운드','リズムとサウンド'],
  ['Close rhythm and sound','리듬 및 사운드 닫기','リズムとサウンドを閉じる'], ['Click home','Click 홈','Click ホーム'],
  ['TEMPO','템포','テンポ'], ['Tempo','템포','テンポ'], ['Metronome','메트로놈','メトロノーム'],
  ['Tempo in beats per minute','분당 박자 수 (BPM)','テンポ (BPM)'], ['Decrease tempo','템포 낮추기','テンポを下げる'], ['Increase tempo','템포 높이기','テンポを上げる'],
  ['BEATS PER MINUTE','분당 박자 수','拍／分'], ['Or feel it out','직접 박자를 탭하세요','タップで合わせる'], ['Tap tempo','탭 템포','タップテンポ'], ['Tap at least twice','두 번 이상 탭하세요','2回以上タップ'],
  ['BEAT PATTERN','박자 패턴','拍のパターン'], ['Click a beat to switch pitch','박자를 눌러 음높이 변경','拍を押して音の高さを変更'], ['Beat pitch controls','박자별 음높이 설정','拍ごとの音の高さ'],
  ['High','높음','高音'], ['Low','낮음','低音'], ['HIGH','높음','高音'], ['LOW','낮음','低音'],
  ['Reset to first beat','첫 박자로 초기화','最初の拍に戻す'], ['Reset to first beat (R)','첫 박자로 초기화 (R)','最初の拍に戻す (R)'],
  ['Start metronome','메트로놈 시작','メトロノーム開始'], ['Pause metronome','메트로놈 일시정지','メトロノーム一時停止'], ['Resume metronome','메트로놈 재생','メトロノーム再開'],
  ['IN THE POCKET','재생 중','再生中'], ['PAUSED','일시정지','一時停止'], ['LET’S MAKE SOME TIME','시작할 준비 완료','準備完了'],
  ['RHYTHM','리듬','リズム'], ['Time signature','박자표','拍子'], ['4 / 4 — Common time','4 / 4 — 보통박자','4 / 4 — 基本拍子'], ['3 / 4 — Waltz','3 / 4 — 왈츠','3 / 4 — ワルツ'], ['2 / 4 — March','2 / 4 — 행진곡','2 / 4 — 行進曲'],
  ['6 / 8 — Compound','6 / 8 — 겹박자','6 / 8 — 複合拍子'], ['9 / 8 — Compound','9 / 8 — 겹박자','9 / 8 — 複合拍子'], ['12 / 8 — Compound','12 / 8 — 겹박자','12 / 8 — 複合拍子'], ['5 / 4 — Asymmetric','5 / 4 — 혼합박자','5 / 4 — 変拍子'], ['7 / 8 — Asymmetric','7 / 8 — 혼합박자','7 / 8 — 変拍子'],
  ['Custom signature','사용자 지정 박자','拍子を指定'], ['Beats','박 수','拍数'], ['Notes','음표','音符'], ['Note','음표','音符'], ['Click division','클릭 분할','クリック分割'],
  ['Whole note','온음표','全音符'], ['Half note','2분음표','2分音符'], ['Quarter note','4분음표','4分音符'], ['Eighth note','8분음표','8分音符'], ['Sixteenth note','16분음표','16分音符'], ['Triplet','셋잇단음표','3連符'], ['16ths','16분음표','16分音符'],
  ['Triplet · 1 & 3','셋잇단음표 · 1, 3','3連符 · 1・3'], ['16ths · 1 & 4','16분음표 · 1, 4','16分音符 · 1・4'], ['1 & 3 only','1, 3만','1・3のみ'], ['1 & 4 only','1, 4만','1・4のみ'],
  ['Triplet: first and third only','셋잇단음표: 첫째와 셋째만','3連符：1・3音目のみ'], ['Sixteenths: first and fourth only','16분음표: 첫째와 넷째만','16分音符：1・4音目のみ'], ['Quarter-note beat patterns','4분음표 기준 패턴','4分音符単位のパターン'],
  ['Three evenly spaced hits per quarter note','4분음표마다 균등한 세 번의 클릭','4分音符を均等に3分割'], ['Triplet with a rest on the second note','두 번째 음을 쉬는 셋잇단음표','2音目を休む3連符'], ['Four sixteenth-note slots, with rests on the second and third','두 번째와 세 번째 음을 쉬는 16분음표','2・3音目を休む16分音符'],
  ['Each pattern spans one quarter-note beat. Hollow dots are rests.','각 패턴은 4분음표 한 박입니다. 빈 점은 쉼표입니다.','各パターンは4分音符1拍分です。白抜きの点は休符です。'],
  ['SOUND','사운드','サウンド'], ['Volume','볼륨','音量'], ['Stereo pan','스테레오 팬','ステレオパン'], ['Center','중앙','中央'], ['CENTER','중앙','中央'], ['L','왼쪽','左'], ['R','오른쪽','右'], ['Reset pan to center','팬을 중앙으로 초기화','パンを中央に戻す'],
  ['play / pause','재생 / 일시정지','再生 / 一時停止'], ['tap','탭','タップ'], ['tempo','템포','テンポ'],
  ['AUTOMATION','템포 자동 변경','テンポ自動変更'], ['Enable tempo automation','템포 자동 변경 켜기','テンポ自動変更を有効にする'], ['Change tempo','템포 변경','テンポ変更'], ['Tempo direction','템포 변경 방향','テンポ変更方向'], ['Add','증가','上げる'], ['Subtract','감소','下げる'], ['Every','간격','間隔'], ['Unit','단위','単位'], ['Bars','마디','小節'], ['Seconds','초','秒'],
  ['Starts at the tempo above. Pause holds progress; Reset starts over. Tempo stays within 10–300 BPM.','위 템포에서 시작합니다. 일시정지 시 진행이 유지되고, 초기화하면 처음부터 시작합니다. 범위: 10–300 BPM.','上のテンポから開始します。一時停止で進行を保持し、リセットで最初に戻ります。範囲：10–300 BPM。'],
  ['Close export','내보내기 닫기','書き出しを閉じる'], ['Export from bar one, including rhythm, volume, stereo pan, and enabled automation.','첫 마디부터 리듬, 볼륨, 스테레오 팬과 활성화된 템포 자동 변경을 포함하여 내보냅니다.','1小節目から、リズム・音量・パンと有効なテンポ自動変更を含めて書き出します。'],
  ['Length','길이','長さ'], ['Up to 60 minutes. MP3 · 192 kbps · stereo.','최대 60분. MP3 · 192 kbps · 스테레오.','最大60分。MP3 · 192 kbps · ステレオ。'], ['Cancel','취소','キャンセル'], ['Save MP3','MP3 저장','MP3 を保存'],
  ['Keep tapping…','계속 탭하세요…','タップを続けてください…'], ['Audio was interrupted. Press Resume to continue.','오디오가 중단되었습니다. 재개를 눌러 계속하세요.','音声が中断されました。再開を押してください。'],
  ['Automation off','자동 변경 꺼짐','自動変更オフ'], ['Current tempo: {bpm} BPM','현재 템포: {bpm} BPM','現在のテンポ：{bpm} BPM'],
  ['Automation: ON','템포 자동 변경: ON','テンポ自動変更: ON'], ['Automation: OFF','템포 자동 변경: OFF','テンポ自動変更: OFF'],
  ['Start tempo: {bpm} BPM','시작 템포: {bpm} BPM','開始テンポ：{bpm} BPM'],
  ['BAR {bar} · BEAT {beat}','{bar}마디 · {beat}박','{bar}小節 · {beat}拍'], ['{count} taps · {bpm} BPM','{count}회 탭 · {bpm} BPM','{count}回タップ · {bpm} BPM'],
  ['{pan}% left','왼쪽 {pan}%','左 {pan}%'], ['{pan}% right','오른쪽 {pan}%','右 {pan}%'], ['1 beat = {note}','1박 = {note}','1拍 = {note}'],
  ['Beat {beat}: {pitch} pitch. Click to switch.','{beat}박: {pitch}. 누르면 변경됩니다.','{beat}拍目：{pitch}。押すと切り替わります。'],
  ['Exporting… {progress}%','내보내는 중… {progress}%','書き出し中… {progress}%'], ['Choose where to save the MP3.','MP3를 저장할 위치를 선택하세요.','MP3 の保存先を選んでください。'], ['MP3 saved.','MP3를 저장했습니다.','MP3 を保存しました。'], ['Export cancelled.','내보내기를 취소했습니다.','書き出しをキャンセルしました。'],
  ['exportInvalid','1~10000 사이의 정수를 입력하세요.','1～10000の整数を入力してください。'], ['exportLimit','내보내기 길이는 60분 이하여야 합니다.','書き出しの長さは60分以内にしてください。'], ['exportFailed','MP3 내보내기에 실패했습니다. 다시 시도하세요.','MP3 の書き出しに失敗しました。もう一度お試しください。'], ['sampleError','클릭 사운드를 불러올 수 없습니다.','クリック音を読み込めません。'],
  ['Could not start audio: {error}','오디오를 시작할 수 없습니다: {error}','音声を開始できません：{error}'], ['Could not preview click: {error}','클릭을 미리 들을 수 없습니다: {error}','クリック音を試聴できません：{error}'],
];
const englishErrors = { exportInvalid:'Enter a whole number from 1 to 10000.', exportLimit:'The export must be 60 minutes or shorter.', exportFailed:'Could not export MP3. Please try again.', sampleError:'Could not load click samples.' };
const dictionary = new Map(phrases.map(([en,ko,ja]) => [en,{en:englishErrors[en] ?? en,ko,ja}]));
let language = 'en';
try { const saved = localStorage.getItem('click-language'); if (['en','ko','ja'].includes(saved)) language = saved; } catch {}
export function t(key, values = {}) { return (dictionary.get(key)?.[language] ?? key).replace(/\{(\w+)\}/g, (_,name) => values[name] ?? `{${name}}`); }
const staticText = [], staticAttributes = [];
export function initLanguage(onChange) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode, key = node.textContent.trim();
    if (dictionary.has(key) && !node.parentElement.closest('#play-label, #play-state, #pan-value, #division-name, #tap-hint, #tempo-caption, #automation-enabled, kbd')) staticText.push({node,key,prefix:node.textContent.match(/^\s*/)[0],suffix:node.textContent.match(/\s*$/)[0]});
  }
  document.querySelectorAll('[aria-label],[title]').forEach(node => { for (const attr of ['aria-label','title']) { const key = node.getAttribute(attr); if (dictionary.has(key)) staticAttributes.push({node,attr,key}); } });
  const select = document.querySelector('#language');
  function apply() {
    document.documentElement.lang = language; select.value = language;
    window.NativeClick?.setLanguage?.(language);
    for (const {node,key,prefix,suffix} of staticText) node.textContent = prefix + t(key) + suffix;
    for (const {node,attr,key} of staticAttributes) node.setAttribute(attr,t(key));
    document.title = `Click — ${t('Metronome')}`;
    onChange();
  }
  select.addEventListener('change', () => { language = select.value; try { localStorage.setItem('click-language',language); } catch {} apply(); });
  apply();
}
