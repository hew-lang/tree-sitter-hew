package tree_sitter_hew_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_hew "github.com/tree-sitter/tree-sitter-hew/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_hew.Language())
	if language == nil {
		t.Errorf("Error loading Hew grammar")
	}
}
