# Custom Click

A Windows and Android metronome built around the actual high and low clicks in your Cubase recordings, with a #39c5bb teal theme and a matching beat-dot icon.

For another Windows PC, build the portable executable with `npm run package:portable`, then copy **release/portable/Custom-Click-0.5.2-win-x64.exe** and double-click it. No installer, Node.js, or separate sound files are needed on that PC. Published builds are available on [GitHub Releases](https://github.com/zeberity123/custom_click/releases). The executable extracts its bundled runtime into a temporary folder and saves preferences in your Windows user profile. The executable is unsigned.

## In-app updates

An experimental iPad/iPhone port is available on the `ios-port` branch. See [the iOS build and Windows sideloading guide](ios/README.md). Its unsigned IPA targets iOS/iPadOS 18 and newer and requires signing through a sideloading tool before installation.

Starting with 0.5.0, **Update** sits immediately to the left of **Export MP3**. Click it to check the latest published stable release on GitHub, then choose **Download update** and **Install update**. Network access occurs only when you request an update check or download. Metronome playback and MP3 export still work offline. Install 0.5.2 or newer manually once to add this button to older versions.

On Windows, the portable app closes, replaces its original EXE, and restarts from the same location, keeping shortcuts and saved settings. The previous EXE is retained with a `.previous` suffix. If the folder is not writable or the file is locked, the app restores the old executable and shows the location of the verified download. Development/unpacked builds launch the downloaded portable app instead of replacing their runtime.

On Android, Click checks the APK's hash, package identity, version code, and signing certificate before opening the system installer. Android may first ask you to allow installations from Click; return and tap **Install update** again. Android always controls the installation confirmation. Existing app data is preserved. The system installer flow needs physical-device validation; the host tests simulate permission and UI behavior.

For future GitHub releases, publish a stable `vMAJOR.MINOR.PATCH` tag with `Custom-Click-MAJOR.MINOR.PATCH-win-x64.exe` and `Custom-Click-MAJOR.MINOR.PATCH-android.apk` assets. Both must have GitHub's generated SHA-256 asset digest. Mark the release as latest after both uploads complete; drafts and prereleases are not update candidates. Increment Android's `versionCode` each time and keep the same application ID and signing key. The current test APK uses the existing debug signing key, which must be retained to update those installations. Never commit the signing key.

## Automation, MP3 export, and languages

Use the language selector at the top right to switch between English, Korean, and Japanese. Your choice is saved; Android playback notifications use it too.

Click **Automation: OFF** below stereo pan to switch it ON, choose Add or Subtract, set the BPM change, and choose the interval in completed bars or elapsed playback seconds. Automation starts OFF in a new session. The large tempo number and slider follow the current tempo; the smaller line shows the starting tempo. Editing the number, slider, or +/− controls sets a new starting tempo. Tempo stays between 10 and 300 BPM. Pause preserves progress. Reset or changing the tempo, rhythm, or automation settings restarts the automation; changing volume or pan preserves it. Automation also runs during Android background playback, retaining its state when you return to the running session.

**Export MP3** sits to the left of the language selector. Choose a whole-number length in bars or seconds. Export always starts at bar one and the starting tempo, with the current rhythm, accents, volume, pan, and enabled automation. The output is a stereo 48 kHz, 192 kbps MP3, up to 60 minutes long. Automation determines the duration of a bar-based export. Export runs offline without interrupting playback; Cancel stops rendering. Keep the app open while exporting. Windows and Android ask where to save the file. MP3 encoder padding can add a few milliseconds beyond the requested musical duration.

The MP3 encoder is the unmodified [lamejs 1.2.1](https://github.com/zhuker/lamejs), a JavaScript port of [LAME](https://lame.sourceforge.net/), loaded as a separate file. Its license, full source archive, and notices are bundled in `src/vendor/`.

## Android testing build

The Android port has **minimum SDK 31 (Android 12)** and **target/compile SDK 36 (Android 16)**, with no maximum SDK limit. It is intended to run on Android 12 and newer versions. The sideloadable test APK is **release/android/Custom-Click-0.5.2-android.apk** after building.

Copy that APK to your phone, open it, and allow installation from the app you use to open the file when Android asks. This is a debug-signed test build (`com.zeberity123.customclick.debug`), not a Play Store release. On Android 13+, allow notifications to get the playback notification and Pause control.

The Android interface shares the desktop assets and settings controls. Native `AudioTrack` playback runs on an audio thread in a foreground media service, including when switching apps or locking the screen. Playback pauses on audio-focus loss (for example, calls), disconnecting headphones, or dismissing the app from recents. The screen stays awake during visible playback. Volume uses the media volume stream; all sound files are bundled. Internet and package-install permissions support user-requested GitHub updates. App settings are saved on the phone.

Both desktop and mobile open directly on the tempo controls, without the introductory heading or reference-sample previews. Sound settings contain volume, stereo pan, and tempo automation. On mobile, Start/Pause and Reset stay at the bottom. The menu button shows the current time signature, click-division symbol and fraction, and volume percentage. Tap that button or the arrow handle beside Tap Tempo, or swipe right across the main panel, to open the right-side drawer. Swiping left also opens it. While the drawer is open, swipe right, tap outside, or use its close button to return. Android Back closes an open Update or Export MP3 dialog or the time signature drawer before leaving the app; closing an active export cancels it. Android 13+ registers its Back callback only while an overlay is open, leaving system navigation available on the main screen; Android 12 uses the legacy Back callback. The drawer contains rhythm settings, volume, stereo pan, and tempo automation. Android reserves status-bar, navigation-bar, cutout, and keyboard space around the entire WebView, following [Android's WebView inset guidance](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets).

**Validation:** the APK builds and passes Android lint with no errors; native rendered audio tests cover all divisions at 10, 176, and 300 BPM, rests, pause/reset, stereo panning, mute, and bar/second automation. Host UI tests cover all three languages, automation, MP3 encoding and the Android save bridge. The packaged Windows MP3 is decoded to verify automated duration and stereo output. No physical Android device or emulator was available; Android’s system file picker and notification language changes still need device confirmation. Check launch, click timing, lock-screen playback, notifications, interruptions and Bluetooth latency on a phone before relying on it for a performance. OS support configuration is not a claim of testing on every Android version.

### Build Android

Use JDK 17, Android SDK platform 36, SDK build-tools 35.0.0 and Gradle 8.13. The Windows helper downloads tools into ignored workspace folders; setup accepts the licenses for the SDK packages it installs. The default JDK path is `C:\Program Files\Java\jdk-17`.

```powershell
npm run android:setup
npm run test:android-engine
npm run test:android-ui
npm run android:build
```

Or open `android/` in Android Studio, select JDK 17 and install the listed SDK components, then build the debug variant. With an existing SDK, set `ANDROID_HOME` and `JAVA_HOME` and run `android/gradlew.bat -p android assembleDebug lintDebug`. The Gradle build copies the shared `src/` directory into APK assets automatically. Android source is under `android/app/src/main/java/`. No signing keys are committed; a production Android release needs a stable private signing key.

The icon source is `src/assets/icon.svg`. Run `python scripts/generate-icons.py` (Pillow required) to regenerate the desktop PNG/ICO and Android raster fallbacks; Android also has adaptive and monochrome vector icons.

To run from a fresh clone, follow the development setup below. You can then double-click **Launch Click.cmd** in this folder. After running `npm run package`, the Windows application is at **release/Click-win32-x64/Click.exe**. Keep the entire `Click-win32-x64` folder together when moving it to another PC; it runs without Node.js installed. Build outputs and dependencies are not committed to this repository.

## Controls

- Tempo: **10–300 BPM**, editable number, slider, or +/− buttons. Hold Shift when clicking +/− for steps of 10.
- Beats / Notes: set 1–12 beats and a note denominator of 2, 4, 8, or 16.
- Click division: whole, half, quarter, eighth, or sixteenth note, plus three quarter-note patterns: triplet (all three hits), triplet with only hits 1 and 3, and sixteenths with only hits 1 and 4. Hollow dots indicate rests. Choose one division or pattern at a time.
- Beat dots: one per numerator beat. Click to toggle high/low pitch; when paused, the selected sound is previewed. One dot stays lit until the next beat, including while paused; Reset lights the first dot. Subdivisions between beats use the low sample.
- Tap tempo: click **Tap tempo** or press **T** at least twice. Averages the most recent six taps; resets after 6.5 seconds without a tap.
- Volume and stereo panning: the Center label resets panning. Use headphones to hear left/right separation.
- Space: play/pause. R: reset to the beginning. Up/Down: adjust tempo; Shift for increments of 10. Shortcuts yield to input fields.
- Settings save locally between sessions. Playback never starts automatically.

BPM always means **quarter notes per minute**, including in compound meters. In 6/8, six dots mark the six eighth notes; there are three quarter-note units in the bar. Tap quarter notes to set this BPM. The selected click division is independent of the visual beat pulse. Long notes and quarter-note patterns continue across bar lines without being shortened. Changing the meter or division restarts the pattern at beat one. Pause retains the musical position; reset stops and returns to beat one.

Within each quarter note, the triplet plays at 0, 1/3, and 2/3; the sparse triplet plays at 0 and 2/3; the sparse sixteenths play at 0 and 3/4. Rests keep their full duration. These replace the former dotted switch; previously saved dotted settings now use their straight division, with other preferences preserved.

## Reference sound

The files `src/assets/click-high.wav` and `click-low.wav` are 120 ms mono samples copied directly from the supplied reference recording. The source is 48 kHz, 16-bit PCM with identical left/right channels. Neither waveform is synthesized, normalized, pitch-shifted, or faded. The high/low timbres are approximately 1,000/500 Hz. Their quiet tails are included in full.

The factory default is 126 BPM in 4/4 with eighth-note clicks. Later launches restore your saved tempo. The pattern uses high on each quarter and low between them, matching the reference rhythm. Source frame offsets and PCM hashes are in `src/assets/provenance.json`. The engine applies a master volume and headroom gain; equal-power center panning and your output device can also change playback loudness. The timbre is taken directly from the supplied audio, but listening confirmation on your hardware remains useful.

To re-extract the samples (Python, NumPy and SciPy required only for extraction):

```powershell
python scripts/extract_clicks.py 'C:\path\to\your\Media'
```

## Development

Use Node.js 22.12+ (tested with Node 24).

```powershell
npm install
npx install-electron --no
npm start
```

```powershell
npm test            # Musical timing, PCM hashes, pause/reset, tap tempo
npm run test:features # Automation, languages, MP3 encode/decode and save
npm run test:desktop # Actual Electron UI, audio startup, panning, persistence
npm run package     # Windows x64 app in release/
npm run package:portable # Single-file Windows x64 executable in release/portable/
npm run test:portable    # Test the standalone executable from a separate folder
npm run dev         # Browser preview at http://127.0.0.1:4173
```

Playback and MP3 export work offline. Only the Update flow connects to GitHub. The MP3 encoder is bundled locally; development and packaging tools use npm packages. Screenshots from desktop tests are written to `artifacts/`.

## Architecture and platform scope

`src/` is plain HTML/CSS/JavaScript and Web Audio. An AudioWorklet renders the sampled clicks using a fractional frame clock and 48 musical ticks per quarter note, independently of UI timers. Visual events use the audio output timestamp to follow playback. Pause fades the current sound over 5 ms. Gain/pan changes are smoothed. The Electron window keeps background throttling off and prevents idle app suspension while open; explicit system sleep still interrupts playback.

`desktop/main.cjs` supplies an isolated, sandboxed Electron window and a local asset protocol. There is no renderer access to Node.js and no third-party remote content. A narrow preload bridge passes MP3 bytes to the Windows Save dialog. The window can be resized to phone width.

This delivery contains **Windows x64 desktop** and an **Android 12+ testing APK**. Android uses native audio rather than background WebView timers. iOS and other desktop platforms still need their own ports, builds and device validation.

Implementation references: [AudioWorklet processing](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security), [Android audio focus](https://developer.android.com/media/optimize/audio-focus), [Android media services](https://developer.android.com/media/media3/session/background-playback), [Android Gradle compatibility](https://developer.android.com/build/releases/agp-8-13-0-release-notes).
