export class VTuberWebSocket {
    constructor(url, onMessageCallback, onPhaseChangeCallback, onLogCallback) {
        self.url = url;
        self.ws = null;
        self.reconnectAttempts = 0;
        self.maxReconnectDelay = 30000;
        self.manualRetry = false;
        
        self.onMessage = onMessageCallback;
        self.onPhaseChange = onPhaseChangeCallback;
        self.onLog = onLogCallback;
    }

    connect() {
        self.ws = new WebSocket(self.url);

        self.ws.onopen = () => {
            self.reconnectAttempts = 0;
            self.onLog('', false, true); // Clear retry button interface
            self.onPhaseChange('ready');
        };

        self.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                self.onMessage(data);
            } catch (e) {
                console.error("Failed parsing WS message", e);
            }
        };

        self.ws.onclose = () => {
            self.onPhaseChange('disconnected');
            if (self.manualRetry) {
                self.manualRetry = false;
                self.connect();
                return;
            }
            const delay = Math.min(1000 * Math.pow(2, self.reconnectAttempts), self.maxReconnectDelay);
            self.onLog(`Reconnecting in ${Math.round(delay / 1000)}s...`, false, false);
            self.reconnectAttempts++;
            setTimeout(() => self.connect(), delay);
        };
    }

    send(obj) {
        if (self.ws && self.ws.readyState === WebSocket.OPEN) {
            self.ws.send(JSON.stringify(obj));
            if (obj.action && ['initialize', 'start', 'pause', 'resume', 'terminate'].includes(obj.action)) {
                self.onLog(`Sent: ${obj.action}`, false);
            }
        } else {
            self.onLog('Not connected to backend.', true);
        }
    }

    forceReconnect() {
        self.manualRetry = true;
        self.reconnectAttempts = 0;
        self.onLog('Reconnecting...', false);
        if (self.ws) self.ws.close();
        else self.connect();
    }
}