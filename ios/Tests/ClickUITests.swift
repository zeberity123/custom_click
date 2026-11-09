import XCTest
import UIKit

final class ClickUITests: XCTestCase {
    func testPlaybackAndDialogs() throws {
        continueAfterFailure = false
        let app = XCUIApplication();app.launch()
        let start = app.buttons["Start"].firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 30),app.debugDescription)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true AND hittable == true"), object: start)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        // There are no factory presets: store the current tempo, then step away from it.
        let tempoField = app.textFields["Tempo in beats per minute"].firstMatch
        let presetTempo = try XCTUnwrap(tempoField.value as? String)
        app.buttons["Add current BPM as a preset"].firstMatch.tap()
        app.buttons[(Int(presetTempo) ?? 0) > 10 ? "Decrease tempo" : "Increase tempo"].firstMatch.tap()
        XCTAssertNotEqual(tempoField.value as? String, presetTempo)
        start.tap()
        let stop = app.buttons["Stop"].firstMatch
        XCTAssertTrue(stop.waitForExistence(timeout: 10),app.debugDescription)
        // A preset while playing goes through the native tempo queue and keeps playback running.
        // aria-pressed presets are exposed by WebKit as toggles (XCUI switches).
        app.switches.matching(NSPredicate(format: "label ENDSWITH %@", ": \(presetTempo) BPM")).firstMatch.tap()
        let switched = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", presetTempo), object: tempoField)
        XCTAssertEqual(XCTWaiter.wait(for: [switched], timeout: 10), .completed, app.debugDescription)
        XCTAssertTrue(stop.exists)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(stop.waitForExistence(timeout: 10),app.debugDescription)
        stop.tap()
        // No resume: Stop rewinds, and the button returns to Start.
        XCTAssertTrue(app.buttons["Start"].firstMatch.waitForExistence(timeout: 10),app.debugDescription)
        XCTAssertFalse(app.buttons["Resume"].firstMatch.exists)
        app.buttons["Update"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Open GitHub releases"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Close update"].firstMatch.tap()
        app.buttons["Export MP3"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Save MP3"].firstMatch.waitForExistence(timeout: 5))
        app.buttons["Cancel"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Save MP3"].firstMatch.waitForNonExistence(timeout: 10),app.debugDescription)
        app.buttons["Export MP3"].firstMatch.tap()
        app.buttons["Save MP3"].firstMatch.tap()
        let saved = app.staticTexts.matching(NSPredicate(format:"label BEGINSWITH 'MP3 saved:'")).firstMatch
        XCTAssertTrue(saved.waitForExistence(timeout: 60),app.debugDescription)
        XCTAssertTrue(saved.label.contains("Click → Exports"))
        // Save twice: both files must survive, without silently replacing the first export.
        app.buttons["Save MP3"].firstMatch.tap()
        let second = app.staticTexts.matching(NSPredicate(format:"label CONTAINS '(2).mp3'")).firstMatch
        XCTAssertTrue(second.waitForExistence(timeout: 60),app.debugDescription)
        app.buttons["Close export"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Save MP3"].firstMatch.waitForNonExistence(timeout: 10),app.debugDescription)
        let screenshot = XCTAttachment(screenshot: app.screenshot());screenshot.lifetime = .keepAlways;add(screenshot)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Start"].firstMatch.waitForExistence(timeout: 15),app.debugDescription)
        XCTAssertTrue(app.buttons["Tap tempo"].firstMatch.exists || app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Tap tempo'")).firstMatch.exists, app.debugDescription)
        let landscape = XCTAttachment(screenshot: app.screenshot());landscape.lifetime = .keepAlways;add(landscape)
        XCUIDevice.shared.orientation = .portrait
    }

    func testTempoTouchesDoNotZoom() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let increase = app.buttons["Increase tempo"].firstMatch
        let decrease = app.buttons["Decrease tempo"].firstMatch
        XCTAssertTrue(increase.waitForExistence(timeout:30))
        let tempo = app.textFields["Tempo in beats per minute"].firstMatch
        let initial = try XCTUnwrap(Int(tempo.value as? String ?? ""))
        let frame = increase.frame
        increase.doubleTap()
        XCTAssertEqual(Int(tempo.value as? String ?? ""), min(250, initial + 2))
        XCTAssertEqual(increase.frame.width,frame.width,accuracy:1)
        XCTAssertEqual(increase.frame.minX,frame.minX,accuracy:1)
        decrease.press(forDuration:1.05)
        let held = try XCTUnwrap(Int(tempo.value as? String ?? ""))
        XCTAssertLessThanOrEqual(held,min(250,initial + 2) - 21)
        XCTAssertEqual(decrease.frame.width,frame.width,accuracy:1)
        // Repeated taps on non-button content must not zoom either.
        app.staticTexts["TEMPO"].firstMatch.doubleTap()
        XCTAssertEqual(increase.frame.width,frame.width,accuracy:1)
        XCTAssertEqual(increase.frame.minX,frame.minX,accuracy:1)
    }

    func testBpmPresets() throws {
        continueAfterFailure = false
        let app = XCUIApplication(); app.launch()
        let tempo = app.textFields["Tempo in beats per minute"].firstMatch
        XCTAssertTrue(tempo.waitForExistence(timeout:30))
        let value = try XCTUnwrap(tempo.value as? String)
        // aria-pressed presets are exposed by WebKit as toggles (XCUI switches).
        let preset = app.switches.matching(NSPredicate(format: "label ENDSWITH %@", ": \(value) BPM")).firstMatch
        app.buttons["Add current BPM as a preset"].firstMatch.tap()
        XCTAssertTrue(preset.waitForExistence(timeout:10), app.debugDescription)
        preset.tap()
        XCTAssertEqual(tempo.value as? String, value)
        app.buttons["Delete selected preset"].firstMatch.tap()
        XCTAssertTrue(preset.waitForNonExistence(timeout:5), app.debugDescription)
        app.buttons["Add current BPM as a preset"].firstMatch.tap()
        XCTAssertTrue(preset.waitForExistence(timeout:5), app.debugDescription)
        let shot = XCTAttachment(screenshot: app.screenshot()); shot.lifetime = .keepAlways; add(shot)
        // The page gets a new localhost origin on every launch; presets must still come back.
        app.terminate(); app.launch()
        XCTAssertTrue(preset.waitForExistence(timeout:30), "Presets were lost after relaunch. \(app.debugDescription)")
    }
}
