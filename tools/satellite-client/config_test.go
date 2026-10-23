package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const validYAML = `logicle:
  url: "wss://logicle.example/api/rpc"
  credential: "sat-1.test-secret"
mcp:
  url: "https://product.example/mcp"
  bearer_token: 'token: with # punctuation'
`

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(body), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadConfig(t *testing.T) {
	// Old environment variables must have no influence on YAML configuration.
	t.Setenv("LOGICLE_SATELLITE_URL", "ws://old.example/api/rpc")
	t.Setenv("LOGICLE_SATELLITE_CREDENTIAL", "old.credential")
	t.Setenv("MCP_URL", "http://old.example/mcp")
	t.Setenv("MCP_BEARER_TOKEN", "old-token")
	for _, test := range []struct {
		name, body string
		timeout    time.Duration
	}{
		{"default-timeout", validYAML, 2 * time.Minute},
		{"explicit-timeout", validYAML + "timeout: 45s\n", 45 * time.Second},
	} {
		t.Run(test.name, func(t *testing.T) {
			c, err := loadConfig(writeConfig(t, test.body))
			if err != nil {
				t.Fatal(err)
			}
			if c.logicleURL != "wss://logicle.example/api/rpc" || c.credential != "sat-1.test-secret" ||
				c.mcpURL != "https://product.example/mcp" || c.mcpToken != "token: with # punctuation" || c.timeout != test.timeout {
				t.Fatal("configuration differs from YAML")
			}
		})
	}
	withoutToken := strings.ReplaceAll(validYAML, "  bearer_token: 'token: with # punctuation'\n", "")
	c, err := loadConfig(writeConfig(t, withoutToken))
	if err != nil || c.mcpToken != "" {
		t.Fatal("omitted token must stay empty even with legacy environment set")
	}
}

func TestLoadConfigRejectsInvalidFiles(t *testing.T) {
	for name, body := range map[string]string{
		"empty":                "",
		"malformed":            validYAML + "broken: [test-secret\n",
		"unknown-field":        validYAML + "unknown: test-secret\n",
		"nested-unknown-field": strings.ReplaceAll(validYAML, "  bearer_token:", "  wrong_token:"),
		"duplicate":            validYAML + "timeout: 1s\ntimeout: 2s\n",
		"extra-document":       validYAML + "---\n{}\n",
		"invalid-timeout":      validYAML + "timeout: test-secret\n",
		"zero-timeout":         validYAML + "timeout: 0s\n",
		"negative-timeout":     validYAML + "timeout: -1s\n",
		"missing-credential":   strings.ReplaceAll(validYAML, "  credential: \"sat-1.test-secret\"\n", ""),
		"invalid-url":          strings.ReplaceAll(validYAML, "https://product.example/mcp", "file:///test-secret"),
		"wrong-type":           strings.ReplaceAll(validYAML, "'token: with # punctuation'", "[test-secret]"),
		"oversized":            validYAML + "#" + strings.Repeat("x", 64<<10),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := loadConfig(writeConfig(t, body))
			if err == nil {
				t.Fatal("invalid configuration accepted")
			}
			if strings.Contains(err.Error(), "test-secret") || strings.Contains(err.Error(), "punctuation") {
				t.Fatal("configuration values leaked into error")
			}
		})
	}
	if _, err := loadConfig(filepath.Join(t.TempDir(), "missing.yaml")); err == nil {
		t.Fatal("missing file accepted")
	}
}
