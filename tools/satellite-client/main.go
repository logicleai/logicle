package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const satelliteProtocol = "logicle-satellite-v1"

type config struct {
	logicleURL, credential, mcpURL, mcpToken string
	timeout                                  time.Duration
}

func validateURL(raw string, schemes ...string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || u.Fragment != "" {
		return errors.New("invalid endpoint URL")
	}
	for _, scheme := range schemes {
		if u.Scheme == scheme {
			return nil
		}
	}
	return errors.New("unsupported endpoint scheme")
}

func (c config) validate() error {
	if err := validateURL(c.logicleURL, "ws", "wss"); err != nil {
		return fmt.Errorf("Logicle: %w", err)
	}
	if err := validateURL(c.mcpURL, "http", "https"); err != nil {
		return fmt.Errorf("MCP: %w", err)
	}
	id, secret, ok := strings.Cut(c.credential, ".")
	if !ok || id == "" || secret == "" || strings.ContainsAny(c.credential+c.mcpToken, "\r\n") {
		return errors.New("invalid satellite credential or Bearer token")
	}
	if c.timeout <= 0 {
		return errors.New("timeout must be positive")
	}
	return nil
}

// Redirects are rejected to keep both credentials bound to the configured endpoint.
func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{Timeout: timeout, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

func main() {
	log.SetFlags(log.LstdFlags | log.LUTC)
	configPath := flag.String("config", "config.yaml", "Path to the YAML configuration file")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Print("Configuration: unexpected positional arguments")
		os.Exit(1)
	}
	c, err := loadConfig(*configPath)
	if err != nil {
		log.Printf("Configuration: %v", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := run(ctx, c); err != nil {
		log.Printf("Stopped: %v", err)
		os.Exit(1)
	}
}

var errAuthentication = errors.New("Logicle rejected authentication or registration; check the credential and satellite status")

func run(ctx context.Context, c config) error {
	delay := time.Second
	for ctx.Err() == nil {
		started := time.Now()
		err := session(ctx, c)
		if ctx.Err() != nil {
			return nil
		}
		if errors.Is(err, errAuthentication) {
			return err
		}
		if time.Since(started) > time.Minute {
			delay = time.Second
		}
		log.Printf("%v; reconnecting in %s", err, delay)
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
		delay = min(delay*2, 30*time.Second)
	}
	return nil
}

func session(parent context.Context, c config) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	mcp := &mcpClient{url: c.mcpURL, token: c.mcpToken, http: newHTTPClient(c.timeout)}
	defer mcp.close()
	setup, endSetup := context.WithTimeout(ctx, c.timeout)
	defer endSetup()
	if err := mcp.initialize(setup); err != nil {
		return err
	}
	tools, names, err := mcp.tools(setup)
	if err != nil {
		return err
	}
	dialCtx, endDial := context.WithTimeout(ctx, 15*time.Second)
	conn, resp, err := websocket.Dial(dialCtx, c.logicleURL, &websocket.DialOptions{
		HTTPClient:   newHTTPClient(15 * time.Second),
		HTTPHeader:   http.Header{"Authorization": {"Bearer " + c.credential}},
		Subprotocols: []string{satelliteProtocol},
	})
	endDial()
	if err != nil {
		if resp != nil && (resp.StatusCode == 401 || resp.StatusCode == 403) {
			return errAuthentication
		}
		return errors.New("Logicle WebSocket connection failed")
	}
	defer conn.CloseNow()
	conn.SetReadLimit(maxPayload)
	if conn.Subprotocol() != satelliteProtocol {
		return errors.New("Logicle WebSocket protocol mismatch")
	}
	registrationCtx, endRegistration := context.WithTimeout(ctx, 15*time.Second)
	defer endRegistration()
	if err := wsjson.Write(registrationCtx, conn, map[string]any{"type": "register", "name": "MCP bridge", "tools": tools}); err != nil {
		return errors.New("cannot register satellite")
	}
	var registered struct {
		Type        string `json:"type"`
		SatelliteID string `json:"satelliteId"`
	}
	if err := wsjson.Read(registrationCtx, conn, &registered); err != nil {
		if websocket.CloseStatus(err) == websocket.StatusPolicyViolation {
			return errAuthentication
		}
		return errors.New("satellite registration failed")
	}
	id, _, _ := strings.Cut(c.credential, ".")
	if registered.Type != "registered" || registered.SatelliteID != id {
		return errors.New("unexpected satellite registration response")
	}
	log.Printf("Satellite connected; %d MCP tools available", len(tools))
	var workers sync.WaitGroup
	// Cancel first, then wait: in-flight HTTP requests must finish before replacing a session.
	defer func() { cancel(); workers.Wait() }()
	slots := make(chan struct{}, 8)
	var active sync.Map
	for {
		var msg struct {
			Type   string         `json:"type"`
			ID     string         `json:"id"`
			Method string         `json:"method"`
			Params map[string]any `json:"params"`
			Meta   map[string]any `json:"_meta"`
		}
		if err := wsjson.Read(ctx, conn, &msg); err != nil {
			if websocket.CloseStatus(err) == websocket.StatusPolicyViolation {
				return errAuthentication
			}
			return errors.New("Logicle WebSocket disconnected")
		}
		if msg.Type != "tool-call" || msg.ID == "" {
			return errors.New("invalid Logicle message")
		}
		if _, loaded := active.LoadOrStore(msg.ID, true); loaded {
			return errors.New("duplicate in-flight call ID")
		}
		select {
		case slots <- struct{}{}:
		default:
			active.Delete(msg.ID)
			if err := writeResult(ctx, conn, msg.ID, nil, errors.New("satellite busy; maximum concurrent calls reached")); err != nil {
				return err
			}
			continue
		}
		workers.Add(1)
		go func() {
			defer workers.Done()
			defer func() { <-slots; active.Delete(msg.ID) }()
			callCtx, done := context.WithTimeout(ctx, c.timeout)
			defer done()
			var result json.RawMessage
			var callErr error
			if !names[msg.Method] {
				callErr = errors.New("unknown MCP tool")
			} else {
				params := map[string]any{"name": msg.Method, "arguments": msg.Params}
				if msg.Params == nil {
					params["arguments"] = map[string]any{}
				}
				if msg.Meta != nil {
					params["_meta"] = msg.Meta
				}
				result, callErr = mcp.request(callCtx, "tools/call", params, false)
			}
			writeErr := writeResult(ctx, conn, msg.ID, result, callErr)
			if writeErr != nil || errors.Is(callErr, errMCPSessionExpired) {
				cancel()
			}
		}()
	}
}

func writeResult(ctx context.Context, conn *websocket.Conn, id string, raw json.RawMessage, callErr error) error {
	result := make(map[string]any)
	if callErr == nil {
		if json.Unmarshal(raw, &result) != nil || result == nil {
			callErr = errors.New("invalid MCP tool result")
		}
		if _, ok := result["content"].([]any); !ok {
			callErr = errors.New("MCP tool result missing content")
		}
	}
	if callErr != nil {
		result = map[string]any{"isError": true, "content": []any{map[string]string{"type": "text", "text": callErr.Error()}}}
	}
	result["type"] = "tool-result"
	result["id"] = id
	writeCtx, done := context.WithTimeout(ctx, 15*time.Second)
	defer done()
	return wsjson.Write(writeCtx, conn, result)
}
