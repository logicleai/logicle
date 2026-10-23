package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

const maxPayload = 16 << 20

var errMCPSessionExpired = errors.New("MCP session expired")

type rpcReply struct {
	ID     json.RawMessage `json:"id"`
	Result json.RawMessage `json:"result"`
	Error  *struct {
		Code int `json:"code"`
	} `json:"error"`
	Method string `json:"method"`
}

type mcpClient struct {
	url, token, session, version string
	http                         *http.Client
	next                         atomic.Uint64
}

func (m *mcpClient) request(ctx context.Context, method string, params any, notify bool) (json.RawMessage, error) {
	id := m.next.Add(1)
	request := map[string]any{"jsonrpc": "2.0", "method": method}
	if params != nil {
		request["params"] = params
	}
	if !notify {
		request["id"] = id
	}
	body, err := json.Marshal(request)
	if err != nil {
		return nil, errors.New("cannot encode MCP request")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, m.url, bytes.NewReader(body))
	if err != nil {
		return nil, errors.New("invalid MCP request")
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if m.token != "" {
		req.Header.Set("Authorization", "Bearer "+m.token)
	}
	if m.session != "" {
		req.Header.Set("Mcp-Session-Id", m.session)
	}
	if m.version != "" {
		req.Header.Set("MCP-Protocol-Version", m.version)
	}
	resp, err := m.http.Do(req)
	if err != nil {
		return nil, errors.New("MCP connection failed or timed out")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound && m.session != "" {
		return nil, errMCPSessionExpired
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("MCP HTTP status %d", resp.StatusCode)
	}
	if notify {
		return nil, nil
	}
	if method == "initialize" {
		m.session = resp.Header.Get("Mcp-Session-Id")
	}
	contentType, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	var reply rpcReply
	switch contentType {
	case "application/json":
		data, err := io.ReadAll(io.LimitReader(resp.Body, maxPayload+1))
		if err != nil || len(data) > maxPayload {
			return nil, errors.New("invalid or oversized MCP response")
		}
		if json.Unmarshal(data, &reply) != nil {
			return nil, errors.New("invalid MCP JSON response")
		}
	case "text/event-stream":
		var err error
		reply, err = readSSE(resp.Body, strconv.FormatUint(id, 10))
		if err != nil {
			return nil, err
		}
	default:
		return nil, errors.New("unsupported MCP response content type")
	}
	if string(reply.ID) != strconv.FormatUint(id, 10) {
		return nil, errors.New("MCP response ID mismatch")
	}
	if reply.Error != nil {
		return nil, fmt.Errorf("MCP RPC error %d", reply.Error.Code)
	}
	if len(reply.Result) == 0 || string(reply.Result) == "null" {
		return nil, errors.New("missing MCP result")
	}
	return reply.Result, nil
}

// POST responses may contain SSE notifications before the matching JSON-RPC reply.
// Server-initiated requests are unsupported and rejected rather than silently hung.
func readSSE(reader io.Reader, id string) (rpcReply, error) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 4096), maxPayload)
	var data strings.Builder
	consume := func() (rpcReply, bool, error) {
		if data.Len() == 0 {
			return rpcReply{}, false, nil
		}
		var reply rpcReply
		err := json.Unmarshal([]byte(data.String()), &reply)
		data.Reset()
		if err != nil {
			return reply, false, errors.New("invalid MCP SSE JSON")
		}
		if reply.Method != "" && len(reply.ID) > 0 {
			return reply, false, errors.New("MCP server requests are unsupported")
		}
		return reply, string(reply.ID) == id, nil
	}
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			reply, found, err := consume()
			if err != nil || found {
				return reply, err
			}
		} else if strings.HasPrefix(line, "data:") {
			if data.Len() > 0 {
				data.WriteByte('\n')
			}
			data.WriteString(strings.TrimPrefix(strings.TrimPrefix(line, "data:"), " "))
			if data.Len() > maxPayload {
				return rpcReply{}, errors.New("MCP SSE event too large")
			}
		}
	}
	if scanner.Err() != nil {
		return rpcReply{}, errors.New("MCP SSE stream interrupted or too large")
	}
	return rpcReply{}, errors.New("MCP SSE stream ended without response")
}

func (m *mcpClient) initialize(ctx context.Context) error {
	result, err := m.request(ctx, "initialize", map[string]any{
		"protocolVersion": "2025-11-25", "capabilities": map[string]any{},
		"clientInfo": map[string]string{"name": "logicle-satellite-client", "version": "0.1.0"},
	}, false)
	if err != nil {
		return err
	}
	var info struct {
		ProtocolVersion string `json:"protocolVersion"`
	}
	if json.Unmarshal(result, &info) != nil {
		return errors.New("invalid MCP initialize result")
	}
	switch info.ProtocolVersion {
	case "2025-11-25", "2025-06-18", "2025-03-26":
		m.version = info.ProtocolVersion
	default:
		return errors.New("unsupported MCP protocol version")
	}
	_, err = m.request(ctx, "notifications/initialized", nil, true)
	return err
}

func (m *mcpClient) tools(ctx context.Context) ([]json.RawMessage, map[string]bool, error) {
	tools := make([]json.RawMessage, 0)
	names := make(map[string]bool)
	cursor := ""
	seen := make(map[string]bool)
	for {
		params := map[string]string{}
		if cursor != "" {
			params["cursor"] = cursor
		}
		result, err := m.request(ctx, "tools/list", params, false)
		if err != nil {
			return nil, nil, err
		}
		var page struct {
			Tools      []json.RawMessage `json:"tools"`
			NextCursor string            `json:"nextCursor"`
		}
		if json.Unmarshal(result, &page) != nil {
			return nil, nil, errors.New("invalid MCP tool list")
		}
		for _, tool := range page.Tools {
			var info struct {
				Name        string         `json:"name"`
				InputSchema map[string]any `json:"inputSchema"`
			}
			if json.Unmarshal(tool, &info) != nil || info.Name == "" || info.InputSchema["type"] != "object" || names[info.Name] {
				return nil, nil, errors.New("invalid or duplicate MCP tool definition")
			}
			names[info.Name] = true
			var definition map[string]any
			_ = json.Unmarshal(tool, &definition)
			if _, ok := definition["description"].(string); !ok {
				definition["description"] = ""
			}
			normalized, _ := json.Marshal(definition)
			tools = append(tools, normalized)
		}
		cursor = page.NextCursor
		if cursor == "" {
			return tools, names, nil
		}
		if seen[cursor] || len(tools) > 10000 {
			return nil, nil, errors.New("MCP tool pagination limit exceeded")
		}
		seen[cursor] = true
	}
}

func (m *mcpClient) close() {
	if m.session == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, m.url, nil)
	if err != nil {
		return
	}
	req.Header.Set("Mcp-Session-Id", m.session)
	req.Header.Set("MCP-Protocol-Version", m.version)
	if m.token != "" {
		req.Header.Set("Authorization", "Bearer "+m.token)
	}
	resp, err := m.http.Do(req)
	if err == nil {
		resp.Body.Close()
	}
}
