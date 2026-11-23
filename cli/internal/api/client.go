// Package api talks to a hop server.
package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Client calls the JSON API of one server.
type Client struct {
	BaseURL   string
	Token     string
	UserAgent string
	HTTP      *http.Client
}

// New makes a client for the server at baseURL.
func New(baseURL, token, version string) *Client {
	return &Client{
		BaseURL:   strings.TrimSuffix(baseURL, "/"),
		Token:     token,
		UserAgent: "hop-cli/" + version,
		HTTP:      &http.Client{Timeout: 60 * time.Second},
	}
}

// Error is an answer the server refused, with its error code ("slug_taken", "forbidden"...).
type Error struct {
	Status int
	Code   string
	Fields []string
}

func (e *Error) Error() string { return fmt.Sprintf("%s (HTTP %d)", e.Code, e.Status) }

// Query builds a query string, skipping empty values.
type Query map[string]string

func (q Query) encode() string {
	v := url.Values{}
	for k, s := range q {
		if s != "" {
			v.Set(k, s)
		}
	}
	if len(v) == 0 {
		return ""
	}
	return "?" + v.Encode()
}

// Raw sends a request and returns the answer as it is. Statuses of 400 and above become an *Error.
func (c *Client) Raw(ctx context.Context, method, path string, q Query, body any) ([]byte, http.Header, error) {
	var reader io.Reader
	if body != nil {
		switch b := body.(type) {
		case []byte:
			reader = bytes.NewReader(b)
		default:
			data, err := json.Marshal(body)
			if err != nil {
				return nil, nil, err
			}
			reader = bytes.NewReader(data)
		}
	}
	req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path+q.encode(), reader)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("User-Agent", c.UserAgent)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, nil, err
	}
	defer res.Body.Close()
	data, err := io.ReadAll(res.Body)
	if err != nil {
		return nil, nil, err
	}
	if res.StatusCode >= 400 {
		apiErr := &Error{Status: res.StatusCode, Code: fmt.Sprintf("http_%d", res.StatusCode)}
		var parsed struct {
			Error  string   `json:"error"`
			Fields []string `json:"fields"`
		}
		if json.Unmarshal(data, &parsed) == nil && parsed.Error != "" {
			apiErr.Code, apiErr.Fields = parsed.Error, parsed.Fields
		}
		return data, res.Header, apiErr
	}
	return data, res.Header, nil
}

// Do sends a request and decodes the JSON answer into out (which may be nil).
func (c *Client) Do(ctx context.Context, method, path string, q Query, body, out any) error {
	data, _, err := c.Raw(ctx, method, path, q, body)
	if err != nil {
		return err
	}
	if out == nil || len(data) == 0 {
		return nil
	}
	if raw, ok := out.(*json.RawMessage); ok {
		*raw = data
		return nil
	}
	return json.Unmarshal(data, out)
}

// Get is Do with GET.
func (c *Client) Get(ctx context.Context, path string, q Query, out any) error {
	return c.Do(ctx, http.MethodGet, path, q, nil, out)
}
