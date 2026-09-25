# Click for iPad and iPhone

This experimental port targets iOS/iPadOS 18.0 and newer, including the iPad Pro 11-inch (3rd generation, M1). The same universal ARM64 IPA supports iPhone. The deployment target allows iPadOS 18.7.8; an exact-device compatibility claim requires installing and testing it on that device.

## Install from Windows with a free Apple ID

1. Follow [AltStore Classic's Windows installation guide](https://faq.altstore.io/altstore-classic/how-to-install-altstore-windows) to install AltServer and its Apple prerequisites, connect/trust the iPad, and install AltStore on it.
2. Follow that guide's device trust and **Settings → Privacy & Security → Developer Mode** steps.
3. Copy `Custom-Click-0.6.0-ios-unsigned.ipa` to Files on the iPad. Import it using AltStore's My Apps `+` button while AltServer is available. AltStore signs the IPA using your Apple ID and installs it. The unsigned IPA cannot be installed by simply tapping it in Files.
4. Open Click. For a free account, refresh the app through AltStore before its seven-day signing period expires. See [AltStore's refresh guide](https://faq.altstore.io/altstore-classic/your-altstore).

The same steps apply to iPhone. Keep the same Apple ID and app identity when installing later versions to preserve preferences. The in-app Update button opens GitHub releases; iOS updates need to be installed through the same sideloading tool, unlike the Windows/Android updater. This IPA is not a TestFlight or App Store build.

## Features

- Shared English/Korean/Japanese interface, a two-column iPad layout and a drawer on narrow iPhone/window sizes. Both orientations are supported. The native view reserves safe areas and keyboard space.
- Native AVAudioEngine playback with the original click samples. The audio render thread handles all divisions, rest patterns, accents, sample-clock timing, stereo pan and bar/second tempo automation. Its command/event queues do not lock or allocate on the render thread.
- Playback audio session and background-audio mode support playing under screen lock. Interruptions and headphone disconnection pause playback. Lock-screen play/pause controls and foreground screen-awake behavior are included.
- MP3 export runs in the bundled web worker and opens the iOS Files export picker. Keep Click visible while rendering an export.
- Settings and language survive relaunches through native preferences. No Apple credentials, provisioning profiles or signing keys are stored in this repository or required by the build workflow.

## Build and validate

On macOS with Xcode installed, run `bash ios/build.sh` from the repository root. The script generates `ios/Click.xcodeproj`, copies the shared web assets, tests the C++ audio engine, builds for physical ARM64 devices without code signing, and packages `ios/build/Custom-Click-0.6.0-ios-unsigned.ipa`.

The GitHub Actions **iPad and iPhone build** workflow runs this build and UI tests in iPad/iPhone simulators. The IPA and checksums are downloadable in the `Click-iOS-unsigned` artifact. `iOS-validation` contains build logs, simulator results and screenshots. The shared UI simulation can also run on Windows with `node scripts/test-ios-ui.mjs`.

For direct Xcode installation, run `python3 ios/generate-project.py`, open the generated project, select your signing team and connected device, then Run. Source lives under `ios/Click`; the generated project and copied web folder are ignored.

Device testing is still needed for iPadOS 18.7.8, screen-lock/background audio, Bluetooth timing, interruptions, free-account signing, and the Files export picker. A simulator passing is not a substitute for those checks.
