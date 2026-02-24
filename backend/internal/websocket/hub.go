package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	userID string
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan broadcastMsg
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
	jwtSecret  string
}

type broadcastMsg struct {
	userID string
	data   []byte
}

func NewHub(jwtSecret string) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan broadcastMsg, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		jwtSecret:  jwtSecret,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("WS client connected: user=%s", client.userID)
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("WS client disconnected: user=%s", client.userID)
		case msg := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				if client.userID == msg.userID {
					select {
					case client.send <- msg.data:
					default:
						h.mu.RUnlock()
						h.mu.Lock()
						delete(h.clients, client)
						close(client.send)
						h.mu.Unlock()
						h.mu.RLock()
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) Broadcast(userID string, event interface{}) {
	data, err := json.Marshal(event)
	if err != nil {
		log.Printf("WS broadcast marshal error: %v", err)
		return
	}
	h.broadcast <- broadcastMsg{userID: userID, data: data}
}

func (h *Hub) HandleWS(w http.ResponseWriter, r *http.Request) {
	tokenStr := r.URL.Query().Get("token")
	if tokenStr == "" {
		if cookie, err := r.Cookie("js_token"); err == nil {
			tokenStr = cookie.Value
		}
	}
	if tokenStr == "" {
		if auth := r.Header.Get("Authorization"); auth != "" {
			tokenStr = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if tokenStr == "" {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		return []byte(h.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		http.Error(w, "invalid token", http.StatusUnauthorized)
		return
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		http.Error(w, "invalid claims", http.StatusUnauthorized)
		return
	}
	userID, _ := claims["sub"].(string)
	if userID == "" {
		http.Error(w, "invalid user", http.StatusUnauthorized)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WS upgrade error: %v", err)
		return
	}
	client := &Client{hub: h, conn: conn, send: make(chan []byte, 256), userID: userID}
	h.register <- client
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			break
		}
	}
}
