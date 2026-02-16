import XCTest
import SwiftTreeSitter
import TreeSitterHew

final class TreeSitterHewTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_hew())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Hew grammar")
    }
}
