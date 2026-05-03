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

    // MARK: - Highlighting Spike

    /// Proves the full highlighting pipeline: parse -> query -> capture -> token mapping.
    /// This is the core of what the iOS app needs to replace regex-based highlighting.
    func testHighlightingPipeline() throws {
        let language = Language(language: tree_sitter_hew())

        // 1. Parse a sample Hew actor definition
        let parser = Parser()
        try parser.setLanguage(language)

        let source = """
        // A chat room actor
        actor ChatRoom {
            let name: string;
            var members: Vec<ActorRef>;

            receive fn join(self, who: ActorRef) {
                self.members.push(who);
                spawn logger(self.name, "joined", 42);
            }
        }
        """

        guard let tree = parser.parse(source) else {
            XCTFail("Failed to parse source")
            return
        }

        // 2. Load the highlights query from the resource bundle
        let bundle = Bundle(for: type(of: self))

        // SPM resource bundles use Bundle.module in production code, but in tests
        // we need to find the TreeSitterHew resource bundle
        let queryURL: URL
        if let bundlePath = bundle.path(forResource: "TreeSitterHew_TreeSitterHew", ofType: "bundle"),
           let resourceBundle = Bundle(path: bundlePath),
           let url = resourceBundle.url(forResource: "highlights", withExtension: "scm", subdirectory: "queries") {
            queryURL = url
        } else {
            // Fallback: load directly from the source tree (works during development)
            queryURL = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent() // TreeSitterHewTests/
                .deletingLastPathComponent() // swift/
                .deletingLastPathComponent() // bindings/
                .deletingLastPathComponent() // tree-sitter-hew/
                .appendingPathComponent("queries/highlights.scm")
        }

        let queryData = try Data(contentsOf: queryURL)
        let query = try Query(language: language, data: queryData)

        // 3. Run the query against the parse tree
        guard let rootNode = tree.rootNode else {
            XCTFail("No root node")
            return
        }

        let cursor = query.execute(node: rootNode, in: tree)

        // 4. Collect captures and map to token types
        //
        // SwiftTreeSitter parses in UTF-16 encoding. Node.range returns an NSRange
        // in UTF-16 code units, which maps directly to NSString indices.
        struct HighlightToken {
            let name: String       // e.g. "keyword", "type", "function"
            let text: String
            let utf16Start: Int
            let utf16Length: Int
        }

        var tokens: [HighlightToken] = []
        let nsSource = source as NSString

        for match in cursor {
            for capture in match.captures {
                guard let name = capture.name else { continue }
                let range = capture.node.range  // NSRange in UTF-16 code units

                let text: String
                if range.location + range.length <= nsSource.length {
                    text = nsSource.substring(with: range)
                } else {
                    text = "<out of range>"
                }

                tokens.append(HighlightToken(name: name, text: text, utf16Start: range.location, utf16Length: range.length))
            }
        }

        // 5. Print token list for spike visibility
        print("\n--- Highlight Tokens (\(tokens.count) total) ---")
        for token in tokens {
            print("  [\(token.utf16Start)..\(token.utf16Start + token.utf16Length)] @\(token.name) \"\(token.text)\"")
        }
        print("--- End Tokens ---\n")

        // 6. Verify we got the expected token types
        let tokenNames = Set(tokens.map(\.name))

        // Print all unique capture names for debugging
        print("Unique capture names: \(tokenNames.sorted())")

        XCTAssertTrue(tokenNames.contains("comment"), "Should find comments")
        XCTAssertTrue(tokenNames.contains("keyword") || tokenNames.contains("keyword.type"),
                      "Should find keywords")
        XCTAssertTrue(tokenNames.contains("type") || tokenNames.contains("type.builtin"),
                      "Should find types")
        XCTAssertTrue(tokenNames.contains("function.method"),
                      "Should find function declarations")
        XCTAssertTrue(tokenNames.contains("string"), "Should find strings")
        XCTAssertTrue(tokenNames.contains("number"), "Should find numbers")
        XCTAssertTrue(tokenNames.contains("variable.parameter"), "Should find parameters")
        XCTAssertTrue(tokenNames.contains("variable.builtin"), "Should find self")

        // Verify specific keyword tokens
        let keywordTexts = tokens.filter { $0.name.hasPrefix("keyword") }.map(\.text)
        XCTAssertTrue(keywordTexts.contains("actor"), "Should highlight 'actor' as keyword")
        XCTAssertTrue(keywordTexts.contains("let"), "Should highlight 'let' as keyword")
        XCTAssertTrue(keywordTexts.contains("receive"), "Should highlight 'receive' as keyword")
        XCTAssertTrue(keywordTexts.contains("fn"), "Should highlight 'fn' as keyword")
        XCTAssertTrue(keywordTexts.contains("spawn"), "Should highlight 'spawn' as keyword")

        let typeTexts = tokens.filter { $0.name.hasPrefix("type") }.map(\.text)
        XCTAssertTrue(typeTexts.contains("string"), "Should highlight 'string' as type")
        XCTAssertTrue(typeTexts.contains("ChatRoom"), "Should highlight 'ChatRoom' as type")

        let numberTexts = tokens.filter { $0.name.hasPrefix("number") }.map(\.text)
        XCTAssertTrue(numberTexts.contains("42"), "Should highlight '42' as number")

        let stringTexts = tokens.filter { $0.name == "string" }.map(\.text)
        XCTAssertTrue(stringTexts.contains(where: { $0.contains("joined") }),
                      "Should highlight string containing 'joined'")

        let functionTexts = tokens.filter { $0.name == "function.method" }.map(\.text)
        XCTAssertTrue(functionTexts.contains("join"), "Should highlight 'join' as function.method")

        // Token count sanity: a 10-line file should produce many tokens
        XCTAssertGreaterThan(tokens.count, 30, "Should produce substantial token count")
    }

    /// Measures parse + query performance. Target: <5ms per parse for a ~200-line file.
    func testParsePerformance() throws {
        let language = Language(language: tree_sitter_hew())
        let parser = Parser()
        try parser.setLanguage(language)

        // Generate a ~200-line Hew file
        var lines: [String] = ["// Performance test file"]
        for i in 0..<20 {
            lines.append("""

            actor Worker\(i) {
                let id: i32
                var count: u64
                let name: string

                receive fn process(self, data: bytes, tag: i32) {
                    let result = self.transform(data)
                    if result.is_ok() {
                        self.count += 1
                        spawn logger("processed", self.id, 3.14)
                    } else {
                        return Err("failed")
                    }
                }
            }
            """)
        }
        let source = lines.joined(separator: "\n")
        let lineCount = source.components(separatedBy: "\n").count
        print("Performance test source: \(lineCount) lines, \(source.utf8.count) bytes")

        // Load query
        let queryURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("queries/highlights.scm")
        let queryData = try Data(contentsOf: queryURL)
        let query = try Query(language: language, data: queryData)

        // Warm up
        for _ in 0..<5 {
            guard let tree = parser.parse(source) else { continue }
            guard let root = tree.rootNode else { continue }
            let cursor = query.execute(node: root, in: tree)
            var count = 0
            for match in cursor {
                count += match.captures.count
            }
            _ = count
        }

        // Benchmark: 100 iterations of parse + highlight query
        let iterations = 100
        let start = CFAbsoluteTimeGetCurrent()

        for _ in 0..<iterations {
            guard let tree = parser.parse(source) else { continue }
            guard let root = tree.rootNode else { continue }
            let cursor = query.execute(node: root, in: tree)
            var count = 0
            for match in cursor {
                count += match.captures.count
            }
            _ = count
        }

        let elapsed = CFAbsoluteTimeGetCurrent() - start
        let perIteration = (elapsed / Double(iterations)) * 1000.0  // ms

        print(String(format: "Parse + highlight query: %.2f ms avg over %d iterations (%d lines)",
                     perIteration, iterations, lineCount))

        // Target: under 5ms per parse+query in release builds.
        // Debug builds are ~2x slower; allow 15ms to avoid flaky test failures.
        XCTAssertLessThan(perIteration, 15.0,
                          "Parse + highlight should complete in <15ms (debug), got \(String(format: "%.2f", perIteration))ms")
    }
}
