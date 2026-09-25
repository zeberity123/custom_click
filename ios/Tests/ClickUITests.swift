import XCTest

final class ClickUITests: XCTestCase {
    func testPlaybackAndDialogs() throws {
        let app = XCUIApplication();app.launch()
        let start = app.buttons["Start"].firstMatch
        XCTAssertTrue(start.waitForExistence(timeout: 30),app.debugDescription)
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
        XCTAssertTrue(app.navigationBars.firstMatch.waitForExistence(timeout: 60),app.debugDescription)
        // The web dialog remains behind the native Files picker on iPad.
        app.navigationBars.buttons["Cancel"].firstMatch.tap()
        XCTAssertTrue(app.navigationBars.firstMatch.waitForNonExistence(timeout: 10))
        app.buttons["Close export"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Save MP3"].firstMatch.waitForNonExistence(timeout: 10),app.debugDescription)
        let screenshot = XCTAttachment(screenshot: app.screenshot());screenshot.lifetime = .keepAlways;add(screenshot)
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.buttons["Resume"].firstMatch.waitForExistence(timeout: 15),app.debugDescription)
        let landscape = XCTAttachment(screenshot: app.screenshot());landscape.lifetime = .keepAlways;add(landscape)
        XCUIDevice.shared.orientation = .portrait
    }
}
