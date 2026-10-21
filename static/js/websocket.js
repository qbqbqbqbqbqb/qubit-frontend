export class VTuberWebSocket {
    constructor(url, onMessageCallback, onPhaseChangeCallback, onLogCallback) {
        this.url = url;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000;
        this.manualRetry = false;

        this.onMessage = onMessageCallback;
        this.onPhaseChange = onPhaseChangeCallback;
        this.onLog = onLogCallback;
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            this.reconnectAttempts = 0;
            this.onLog('', false, true);
            this.onPhaseChange('ready');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.onMessage(data);
            } catch (e) {
                console.error("Failed parsing WS message", e);
            }
        };

        this.ws.onclose = () => {
            this.onPhaseChange('disconnected');
            if (this.manualRetry) {
                this.manualRetry = false;
                this.connect();
                return;
            }
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
            this.onLog(`Reconnecting in ${Math.round(delay / 1000)}s...`, false, false);
            this.reconnectAttempts++;
            setTimeout(() => this.connect(), delay);
        };

        this.ws.onerror = () => {
            // Let onclose handle reconnect logic — onerror always precedes onclose.
        };
    }

    send(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(obj));
            if (obj.action && ['initialize', 'start', 'pause', 'resume', 'terminate'].includes(obj.action)) {
                this.onLog(`Sent: ${obj.action}`, false);
            }
        } else {
            this.onLog('Not connected to backend.', true);
        }
    }

    forceReconnect() {
        this.manualRetry = true;
        this.reconnectAttempts = 0;
        this.onLog('Reconnecting...', false);
        if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
            this.ws.close();
            // onclose will fire and call connect() via the manualRetry flag
        } else {
            // Already closed or never opened — connect directly
            this.manualRetry = false;
            this.connect();
        }
    }
}