import UIKit
import WebKit
import AVFoundation
import MediaPlayer

final class ClickViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandlerWithReply, UIDocumentPickerDelegate {
    private var web: WKWebView!
    private var server: AssetServer!
    private var origin: URL?
    private var audio = ClickAudio()
    private var timer: Timer?
    private var playing = false
    private var config: [String: Any] = [:]
    private var exportURL: URL?
    private var exportHandle: FileHandle?
    private var exportBytes = 0
    private var exportReply: ((Any?, String?) -> Void)?
    private var outputActive = false
    private var lastAudioUse = Date.distantPast
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 13/255, green: 23/255, blue: 24/255, alpha: 1)
        let content = WKUserContentController()
        content.addScriptMessageHandler(self, contentWorld: .page, name: "click")
        var saved: [String: String] = [:]
        for key in ["click-studio-settings-v1", "click-language"] {
            if let value = UserDefaults.standard.string(forKey: key) { saved[key] = value }
        }
        let data = try! JSONSerialization.data(withJSONObject: saved)
        let encoded = String(data: data, encoding: .utf8)!
        let bootstrap = """
        window.IOSClick = {call:(command,payload={})=>window.webkit.messageHandlers.click.postMessage({command,payload})};
        try { for(const [key,value] of Object.entries(\(encoded))) if(localStorage.getItem(key)===null) localStorage.setItem(key,value); } catch {}
        """
        content.addUserScript(WKUserScript(source: bootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let settings = WKWebViewConfiguration(); settings.userContentController = content
        settings.allowsInlineMediaPlayback = true
        web = WKWebView(frame: .zero, configuration: settings)
        web.isOpaque = false; web.backgroundColor = view.backgroundColor
        web.scrollView.backgroundColor = view.backgroundColor
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.navigationDelegate = self
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor)
        ])
        guard let root = Bundle.main.resourceURL?.appendingPathComponent("web") else { return }
        server = AssetServer(root: root)
        do { try server.start { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let url): self.origin = url; self.web.load(URLRequest(url: url))
            case .failure(let error): self.showError(error)
            }
        } } catch { showError(error) }
        timer = Timer.scheduledTimer(withTimeInterval: 1/30, repeats: true) { [weak self] _ in self?.poll() }
        NotificationCenter.default.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(becameActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(mediaReset), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        let remote = MPRemoteCommandCenter.shared()
        remote.playCommand.addTarget { [weak self] _ in self?.remoteCommand("start"); return .success }
        remote.pauseCommand.addTarget { [weak self] _ in self?.remoteCommand("pause"); return .success }
        remote.togglePlayPauseCommand.addTarget { [weak self] _ in
            DispatchQueue.main.async { guard let self else { return }; self.remoteCommand(self.playing ? "pause" : "start") };return .success
        }
    }
    private func ensureAudio() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
        try session.setPreferredSampleRate(48000)
        try session.setPreferredIOBufferDuration(256/48000)
        try session.setActive(true)
        try audio.prepare()
        outputActive = true; lastAudioUse = Date()
    }
    private func state() -> [String: Any] {
        var state = audio.snapshot() as? [String: Any] ?? [:]
        state["config"] = config; state["playing"] = playing
        return state
    }
    private func emit(_ type: String, _ value: Any) {
        guard UIApplication.shared.applicationState == .active,
              let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.dispatchEvent(new CustomEvent('\(type)',{detail:\(json)}))", completionHandler: nil)
    }
    private func poll() {
        let events = audio.drainEvents()
        if !events.isEmpty { emit("ios-clicks", events) }
        if outputActive && !playing && Date().timeIntervalSince(lastAudioUse) > 1 {
            audio.stopOutput(); outputActive = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
    }
    private func command(_ command: String, high: Bool = false) throws {
        if command == "start" || command == "preview" || !outputActive { try ensureAudio() }
        guard audio.command(command, high: high) else { throw NSError(domain: "Click", code: 2) }
        if command != "preview" { playing = command == "start" }
        lastAudioUse = Date()
        UIApplication.shared.isIdleTimerDisabled = playing
        MPNowPlayingInfoCenter.default().nowPlayingInfo = playing ? [MPMediaItemPropertyTitle: "Click — Metronome", MPNowPlayingInfoPropertyPlaybackRate: 1.0, MPNowPlayingInfoPropertyIsLiveStream: true] : nil
        var status = state()
        // The audio thread applies queued commands on its next render buffer.
        if command == "reset" { status["currentBpm"] = config["bpm"] ?? 126 }
        emit("native-state", status)
    }
    private func remoteCommand(_ value: String) {
        DispatchQueue.main.async { [weak self] in
            do { try self?.command(value) } catch { self?.emitFailure(error) }
        }
    }
    @objc private func interrupted(_ notification: Notification) {
        guard (notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.began.rawValue else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            _ = self.audio.command("pause", high: false); self.playing = false
            UIApplication.shared.isIdleTimerDisabled = false; MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            self.emit("native-state", self.state())
        }
    }
    @objc private func routeChanged(_ notification: Notification) {
        let reason = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        if reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue { remoteCommand("pause") }
    }
    @objc private func mediaReset() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.audio.stopOutput();self.audio = ClickAudio();self.outputActive = false;self.playing = false
            UIApplication.shared.isIdleTimerDisabled = false; MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
            self.emit("native-state", self.state())
        }
    }
    @objc private func becameActive() { emit("native-state", state()) }
    private func emitFailure(_ error: Error) {
        playing = false; UIApplication.shared.isIdleTimerDisabled = false
        var state = state(); state["error"] = error.localizedDescription; emit("native-state", state)
    }
    private func showError(_ error: Error) {
        let alert = UIAlertController(title: "Click", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default)); present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        decisionHandler(url?.host == "127.0.0.1" && url?.port == origin?.port && url?.scheme == "http" ? .allow : .cancel)
    }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler reply: @escaping (Any?, String?) -> Void) {
        guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.host == "127.0.0.1",
              message.frameInfo.securityOrigin.port == origin?.port,
              let body = message.body as? [String: Any], let method = body["command"] as? String else { reply(nil,"Invalid request");return }
        let payload = body["payload"] as? [String: Any] ?? [:]
        do {
            switch method {
            case "ready": try ensureAudio(); reply(state(),nil)
            case "configure":
                try ensureAudio()
                guard let next = payload["config"] as? [String: Any], audio.configure(next) else { reply(nil,"Invalid settings");return }
                config = next; reply(true,nil)
            case "command": try command(payload["type"] as? String ?? "pause", high: payload["high"] as? Bool ?? false); reply(state(),nil)
            case "saveSettings":
                if let settings = payload["settings"], let bytes = try? JSONSerialization.data(withJSONObject: settings), bytes.count < 10000 {
                    UserDefaults.standard.set(String(data: bytes, encoding: .utf8), forKey: "click-studio-settings-v1")
                }; reply(true,nil)
            case "language":
                if let language = payload["language"] as? String, ["en","ko","ja"].contains(language) { UserDefaults.standard.set(language,forKey:"click-language") }; reply(true,nil)
            case "releasePage": UIApplication.shared.open(URL(string:"https://github.com/zeberity123/custom_click/releases")!); reply(true,nil)
            case "beginExport":
                guard exportReply == nil else { reply(false,nil);return }
                cancelExport()
                let url = FileManager.default.temporaryDirectory.appendingPathComponent("Click-\(UUID().uuidString).mp3")
                FileManager.default.createFile(atPath:url.path,contents:nil);exportURL = url
                exportHandle = try FileHandle(forWritingTo:url); reply(true,nil)
            case "appendExport":
                guard let handle = exportHandle, let base64 = payload["data"] as? String, base64.count <= 45000, let bytes = Data(base64Encoded:base64), exportBytes + bytes.count <= 90000000 else { cancelExport();reply(false,nil);return }
                try handle.write(contentsOf:bytes); exportBytes += bytes.count;reply(true,nil)
            case "cancelExport": cancelExport();reply(true,nil)
            case "finishExport":
                guard let url = exportURL, exportBytes > 0, presentedViewController == nil else { reply(nil,"Could not save MP3");return }
                try exportHandle?.close(); exportHandle = nil
                let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString,isDirectory:true)
                try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
                let name = payload["filename"] as? String ?? "Click.mp3"
                let safeName = name.range(of:"^Click-[0-9]{1,3}bpm\\.mp3$",options:.regularExpression) == nil ? "Click.mp3" : name
                let destination = folder.appendingPathComponent(safeName)
                try FileManager.default.moveItem(at:url,to:destination);exportURL = destination;exportReply = reply
                let picker = UIDocumentPickerViewController(forExporting:[destination],asCopy:true)
                picker.delegate = self;present(picker,animated:true)
            default: reply(nil,"Unknown request")
            }
        } catch { reply(nil,error.localizedDescription) }
    }
    private func cancelExport() {
        try? exportHandle?.close();exportHandle = nil
        if let url = exportURL { try? FileManager.default.removeItem(at:url) }
        exportURL = nil; exportBytes = 0
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { finishExportReply(!urls.isEmpty) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { finishExportReply(false) }
    private func finishExportReply(_ saved: Bool) {
        let reply = exportReply;exportReply = nil;cancelExport();reply?(["saved":saved],nil)
    }
}
