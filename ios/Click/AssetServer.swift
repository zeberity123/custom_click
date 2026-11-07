import Foundation
import Network

// Loopback HTTP preserves standard module/worker/fetch behavior in WKWebView.
// No LAN listener, external dependencies, or downloaded application code.
final class AssetServer {
    private let queue = DispatchQueue(label: "Click.Assets")
    private var listener: NWListener?
    private let token = UUID().uuidString
    private let root: URL
    init(root: URL) { self.root = root }
    func start(completion: @escaping (Result<URL, Error>) -> Void) throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        let listener = try NWListener(using: parameters)
        self.listener = listener
        var completed = false
        listener.stateUpdateHandler = { state in
            switch state {
            case .ready:
                guard !completed, let port = listener.port else { return }; completed = true
                let url = URL(string: "http://127.0.0.1:\(port.rawValue)/\(self.token)/index.html")!
                DispatchQueue.main.async { completion(.success(url)) }
            case .failed(let error):
                guard !completed else { return }; completed = true
                DispatchQueue.main.async { completion(.failure(error)) }
            default: break
            }
        }
        listener.newConnectionHandler = { [weak self] connection in
            guard let self else { connection.cancel(); return }
            connection.start(queue: self.queue)
            self.receive(connection, accumulated: Data())
        }
        listener.start(queue: queue)
    }
    private func receive(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, done, error in
            guard let self, error == nil else { connection.cancel(); return }
            var bytes = accumulated; bytes.append(data ?? Data())
            guard bytes.count <= 32768 else { connection.cancel(); return }
            if let request = String(data: bytes, encoding: .utf8), request.contains("\r\n\r\n") {
                self.respond(connection, request: request)
            } else if done { connection.cancel() }
            else { self.receive(connection, accumulated: bytes) }
        }
    }
    private func respond(_ connection: NWConnection, request: String) {
        let fields = request.components(separatedBy: "\r\n")[0].split(separator: " ")
        var body = Data(), status = "404 Not Found", mime = "text/plain"
        if fields.count == 3, fields[0] == "GET",
           let target = String(fields[1]).split(separator: "?", maxSplits: 1).first,
           let decoded = String(target).removingPercentEncoding,
           decoded.hasPrefix("/\(token)/") {
            let relative = String(decoded.dropFirst(token.count + 2))
            let file = root.appendingPathComponent(relative).standardizedFileURL
            if file.path.hasPrefix(root.standardizedFileURL.path + "/"), let bytes = try? Data(contentsOf: file) {
                body = bytes; status = "200 OK"
                mime = ["html":"text/html; charset=utf-8", "js":"application/javascript; charset=utf-8", "css":"text/css; charset=utf-8", "json":"application/json", "wav":"audio/wav", "png":"image/png", "svg":"image/svg+xml"][file.pathExtension] ?? "application/octet-stream"
            }
        }
        var response = Data("HTTP/1.1 \(status)\r\nContent-Type: \(mime)\r\nContent-Length: \(body.count)\r\nCache-Control: no-store\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n\r\n".utf8)
        response.append(body)
        connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
    }
    deinit { listener?.cancel() }
}
