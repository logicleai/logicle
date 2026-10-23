package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

func TestBridge(t *testing.T) {
	for _, sse := range []bool{false, true} {
		t.Run(fmt.Sprintf("sse=%v", sse), func(t *testing.T) {
			var called, initialized, deleted atomic.Bool
			mcp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer mcp-test" {
					t.Error("MCP bearer not forwarded")
				}
				if r.Method == http.MethodDelete {
					deleted.Store(true)
					w.WriteHeader(204)
					return
				}
				var req struct {
					ID     json.RawMessage `json:"id"`
					Method string          `json:"method"`
					Params map[string]any  `json:"params"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
					return
				}
				var result any
				switch req.Method {
				case "initialize":
					w.Header().Set("Mcp-Session-Id", "test-session")
					result = map[string]any{"protocolVersion": "2025-11-25", "capabilities": map[string]any{"tools": map[string]any{}}}
				case "notifications/initialized":
					initialized.Store(true)
					w.WriteHeader(202)
					return
				case "tools/list":
					if !initialized.Load() {
						t.Error("tools listed before initialization")
					}
					result = map[string]any{"tools": []any{map[string]any{"name": "echo", "inputSchema": map[string]any{"type": "object"}}}}
				case "tools/call":
					called.Store(true)
					if req.Params["name"] != "echo" || req.Params["arguments"].(map[string]any)["text"] != "hello" {
						t.Error("tool arguments changed")
					}
					if req.Params["_meta"].(map[string]any)["logicle/userId"] != "user-1" {
						t.Error("metadata lost")
					}
					result = map[string]any{"content": []any{map[string]any{"type": "text", "text": "hello"}}, "structuredContent": map[string]any{"ok": true}, "isError": false}
				default:
					t.Errorf("unexpected method %s", req.Method)
				}
				if req.Method != "initialize" && (r.Header.Get("Mcp-Session-Id") != "test-session" || r.Header.Get("MCP-Protocol-Version") != "2025-11-25") {
					t.Error("missing MCP session headers")
				}
				body, _ := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
				if sse {
					w.Header().Set("Content-Type", "text/event-stream")
					fmt.Fprintf(w, ": heartbeat\n\ndata: {\"jsonrpc\":\"2.0\",\"method\":\"notifications/message\"}\n\ndata: %s\n\n", body)
				} else {
					w.Header().Set("Content-Type", "application/json")
					_, _ = w.Write(body)
				}
			}))
			defer mcp.Close()
			done := make(chan error, 1)
			logicle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer sat-1.secret" || r.Header.Get("Sec-WebSocket-Protocol") != satelliteProtocol {
					t.Error("incorrect satellite handshake")
				}
				conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{satelliteProtocol}})
				if err != nil {
					done <- err
					return
				}
				defer conn.CloseNow()
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				var registration struct {
					Type  string           `json:"type"`
					Tools []map[string]any `json:"tools"`
				}
				if err := wsjson.Read(ctx, conn, &registration); err != nil {
					done <- err
					return
				}
				if registration.Type != "register" || len(registration.Tools) != 1 || registration.Tools[0]["name"] != "echo" || registration.Tools[0]["description"] != "" {
					t.Error("incorrect registration")
				}
				_ = wsjson.Write(ctx, conn, map[string]any{"type": "registered", "satelliteId": "sat-1"})
				for _, method := range []string{"echo", "unknown"} {
					_ = wsjson.Write(ctx, conn, map[string]any{"type": "tool-call", "id": method, "method": method, "params": map[string]any{"text": "hello"}, "_meta": map[string]any{"logicle/userId": "user-1"}})
					var reply map[string]any
					if err := wsjson.Read(ctx, conn, &reply); err != nil {
						done <- err
						return
					}
					if reply["type"] != "tool-result" || reply["id"] != method {
						t.Error("reply correlation lost")
					}
					if method == "echo" {
						if reply["structuredContent"].(map[string]any)["ok"] != true || reply["content"].([]any)[0].(map[string]any)["text"] != "hello" {
							t.Error("tool result changed")
						}
					} else if reply["isError"] != true {
						t.Error("unknown tool should return an error")
					}
				}
				done <- nil
				_ = conn.Close(websocket.StatusPolicyViolation, "Secret rotated")
			}))
			defer logicle.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			err := session(ctx, config{logicleURL: "ws" + strings.TrimPrefix(logicle.URL, "http"), credential: "sat-1.secret", mcpURL: mcp.URL, mcpToken: "mcp-test", timeout: time.Second})
			if !errors.Is(err, errAuthentication) {
				t.Fatalf("expected policy close, got %v", err)
			}
			if err := <-done; err != nil {
				t.Fatal(err)
			}
			if !called.Load() || !deleted.Load() {
				t.Fatal("missing tool call or session cleanup")
			}
		})
	}
}

func TestMCPFailures(t *testing.T) {
	for _, test := range []struct {
		name, body, contentType string
		status                  int
	}{
		{"auth", "sensitive upstream text", "application/json", 401},
		{"expired", "", "application/json", 404},
		{"wrong-id", `{"id":999,"result":{}}`, "application/json", 200},
		{"rpc-error", `{"id":1,"error":{"code":-32603,"message":"secret"}}`, "application/json", 200},
		{"invalid-json", "secret", "application/json", 200},
		{"incomplete-sse", "data: {}\n\n", "text/event-stream", 200},
	} {
		t.Run(test.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", test.contentType)
				w.WriteHeader(test.status)
				fmt.Fprint(w, test.body)
			}))
			defer server.Close()
			client := &mcpClient{url: server.URL, session: "session", http: newHTTPClient(time.Second)}
			_, err := client.request(context.Background(), "tools/call", nil, false)
			if err == nil || strings.Contains(err.Error(), "secret") || strings.Contains(err.Error(), "sensitive") {
				t.Fatalf("missing or unsafe error: %v", err)
			}
			if test.status == 404 && !errors.Is(err, errMCPSessionExpired) {
				t.Fatal("session expiry not detected")
			}
		})
	}
}

func TestRedirectDoesNotForwardCredentials(t *testing.T) {
	var reached atomic.Bool
	target := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { reached.Store(true) }))
	defer target.Close()
	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, target.URL, 307) }))
	defer source.Close()
	client := &mcpClient{url: source.URL, token: "secret", http: newHTTPClient(time.Second)}
	_, err := client.request(context.Background(), "initialize", nil, false)
	if err == nil || reached.Load() {
		t.Fatal("credential-bearing redirect was followed")
	}
}

func TestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := run(ctx, config{}); err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(250 * time.Millisecond):
		}
	}))
	defer server.Close()
	client := &mcpClient{url: server.URL, http: newHTTPClient(time.Second)}
	ctx, stop := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer stop()
	if _, err := client.request(ctx, "tools/call", nil, false); err == nil {
		t.Fatal("expected timeout")
	}
}

func TestValidateConfig(t *testing.T) {
	valid := config{logicleURL: "wss://example.test/api/rpc", credential: "id.secret", mcpURL: "https://example.test/mcp", timeout: time.Second}
	if err := valid.validate(); err != nil {
		t.Fatal(err)
	}
	for _, change := range []func(*config){
		func(c *config) { c.credential = "invalid" },
		func(c *config) { c.logicleURL = "https://example.test/api/rpc" },
		func(c *config) { c.mcpURL = "https://user:pass@example.test/mcp" },
		func(c *config) { c.mcpToken = "token\nheader" },
		func(c *config) { c.timeout = 0 },
	} {
		c := valid
		change(&c)
		if c.validate() == nil {
			t.Fatal("invalid configuration accepted")
		}
	}
}

func TestReconnectAndPagination(t *testing.T) {
	var sessions, connections atomic.Int32
	mcp := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodDelete {
			w.WriteHeader(204)
			return
		}
		var req struct {
			ID     json.RawMessage `json:"id"`
			Method string          `json:"method"`
			Params map[string]any  `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Error(err)
			return
		}
		var result any
		switch req.Method {
		case "initialize":
			sessions.Add(1)
			result = map[string]any{"protocolVersion": "2025-03-26"}
		case "notifications/initialized":
			w.WriteHeader(202)
			return
		case "tools/list":
			name := "first"
			page := map[string]any{}
			if req.Params["cursor"] == nil {
				page["nextCursor"] = "next"
			} else {
				name = "second"
			}
			page["tools"] = []any{map[string]any{"name": name, "inputSchema": map[string]any{"type": "object"}}}
			result = page
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": req.ID, "result": result})
	}))
	defer mcp.Close()
	logicle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{satelliteProtocol}})
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.CloseNow()
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		var registration struct {
			Tools []json.RawMessage `json:"tools"`
		}
		if err := wsjson.Read(ctx, conn, &registration); err != nil {
			t.Error(err)
			return
		}
		if len(registration.Tools) != 2 {
			t.Error("not all tool pages registered")
		}
		_ = wsjson.Write(ctx, conn, map[string]any{"type": "registered", "satelliteId": "sat-1"})
		if connections.Add(1) == 1 {
			return
		} // Simulate a dropped connection.
		_ = conn.Close(websocket.StatusPolicyViolation, "Stop test")
	}))
	defer logicle.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	err := run(ctx, config{logicleURL: "ws" + strings.TrimPrefix(logicle.URL, "http"), credential: "sat-1.secret", mcpURL: mcp.URL, timeout: time.Second})
	if !errors.Is(err, errAuthentication) || sessions.Load() != 2 || connections.Load() != 2 {
		t.Fatalf("reconnect failed: %v, sessions=%d, connections=%d", err, sessions.Load(), connections.Load())
	}
}
