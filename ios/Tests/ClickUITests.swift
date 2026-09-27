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
        start.tap()
        let pause = app.buttons["Pause"].firstMatch
        XCTAssertTrue(pause.waitForExistence(timeout: 10),app.debugDescription)
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(pause.waitForExistence(timeout: 10),app.debugDescription)
        pause.tap()
        XCTAssertTrue(app.buttons["Resume"].firstMatch.waitForExistence(timeout: 10),app.debugDescription)
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
        XCTAssertTrue(app.buttons["Resume"].firstMatch.waitForExistence(timeout: 15),app.debugDescription)
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
        XCTAssertEqual(Int(tempo.value as? String ?? ""), min(300, initial + 2))
        XCTAssertEqual(increase.frame.width,frame.width,accuracy:1)
        XCTAssertEqual(increase.frame.minX,frame.minX,accuracy:1)
        decrease.press(forDuration:1.05)
        let held = try XCTUnwrap(Int(tempo.value as? String ?? ""))
        XCTAssertLessThanOrEqual(held,min(300,initial + 2) - 21)
        XCTAssertEqual(decrease.frame.width,frame.width,accuracy:1)
        // Repeated taps on non-button content must not zoom either.
        app.staticTexts["TEMPO"].firstMatch.doubleTap()
        XCTAssertEqual(increase.frame.width,frame.width,accuracy:1)
        XCTAssertEqual(increase.frame.minX,frame.minX,accuracy:1)
    }
}
