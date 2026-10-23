package main

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	"gopkg.in/yaml.v3"
)

// Keep the file format separate from runtime config so existing call sites use
// validated endpoints and a parsed duration.
type fileConfig struct {
	Logicle struct {
		URL        string `yaml:"url"`
		Credential string `yaml:"credential"`
	} `yaml:"logicle"`
	MCP struct {
		URL         string `yaml:"url"`
		BearerToken string `yaml:"bearer_token"`
	} `yaml:"mcp"`
	Timeout string `yaml:"timeout"`
}

func loadConfig(path string) (config, error) {
	file, err := os.Open(path)
	if err != nil {
		return config{}, errors.New("cannot open YAML configuration file; use -config to select its path")
	}
	defer file.Close()
	const maxConfigSize = 64 << 10
	data, err := io.ReadAll(io.LimitReader(file, maxConfigSize+1))
	if err != nil || len(data) > maxConfigSize {
		return config{}, errors.New("cannot read configuration file or file exceeds 64 KiB")
	}
	settings := fileConfig{Timeout: "2m"}
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&settings); err != nil {
		// YAML diagnostics can contain scalar values, including credentials.
		return config{}, errors.New("invalid YAML configuration; check syntax, duplicate keys, and supported fields")
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return config{}, errors.New("configuration must contain exactly one YAML document")
	}
	timeout, err := time.ParseDuration(settings.Timeout)
	if err != nil {
		return config{}, errors.New("timeout must be a positive duration such as 30s or 2m")
	}
	c := config{
		logicleURL: settings.Logicle.URL,
		credential: settings.Logicle.Credential,
		mcpURL:     settings.MCP.URL,
		mcpToken:   settings.MCP.BearerToken,
		timeout:    timeout,
	}
	if err := c.validate(); err != nil {
		return config{}, fmt.Errorf("invalid configuration: %w", err)
	}
	return c, nil
}
