/**
 * WebSocket client for realtime updates from the Go backend.
 * Replaces Appwrite's client.subscribe().
 */
import { getEnv } from './env-config';

export interface WSEvent {
    type: 'create' | 'update' | 'delete';
    collection: string;
    document: Record<string, unknown>;
    userId: string;
}

type Listener = (event: WSEvent) => void;

class WebSocketClient {
    private ws: WebSocket | null = null;
    private listeners = new Set<Listener>();
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private reconnectDelay = 1000;
    private maxReconnectDelay = 30000;
    private isIntentionalClose = false;

    connect() {
        if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
            return;
        }

        const wsUrl = getEnv('NEXT_PUBLIC_WS_URL') || 'ws://localhost:8080';
        const url = `${wsUrl}/api/ws`;

        try {
            this.ws = new WebSocket(url);
            this.isIntentionalClose = false;

            this.ws.onopen = () => {
                this.reconnectDelay = 1000;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data: WSEvent = JSON.parse(event.data);
                    this.listeners.forEach((listener) => {
                        try {
                            listener(data);
                        } catch (err) {
                            console.error('WS listener error:', err);
                        }
                    });
                } catch {
                    // ignore non-JSON messages
                }
            };

            this.ws.onclose = () => {
                this.ws = null;
                if (!this.isIntentionalClose) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = () => {
                // onclose will fire after onerror
            };
        } catch {
            this.scheduleReconnect();
        }
    }

    disconnect() {
        this.isIntentionalClose = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        // Auto-connect when first listener is added
        if (this.listeners.size === 1) {
            this.connect();
        }
        // Return unsubscribe function
        return () => {
            this.listeners.delete(listener);
            if (this.listeners.size === 0) {
                this.disconnect();
            }
        };
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
            this.connect();
        }, this.reconnectDelay);
    }
}

export const wsClient = new WebSocketClient();
