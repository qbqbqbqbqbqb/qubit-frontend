import json
from fastapi import WebSocket


class PngStateManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        self.current_folder: str | None = None
        self.is_speaking: bool = False
        self.is_blinking: bool = False

    def _resolve_url(self) -> str:
        if not self.current_folder:
            return ""
        eye_state = "blink" if self.is_blinking else "open"
        mouth_state = "speaking" if self.is_speaking else "idle"
        filename = f"{eye_state}_{mouth_state}.png"
        return f"/png/images/{self.current_folder}/{filename}"

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        await websocket.send_text(json.dumps({"url": self._resolve_url()}))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def _broadcast(self):
        payload = json.dumps({"url": self._resolve_url()})
        for ws in self.active_connections[:]:
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(ws)

    async def broadcast_command(self, cmd: dict):
        action = cmd.get("action")

        if action == "load_model":
            folder = cmd.get("folder")
            if folder:
                self.current_folder = folder
                self.is_speaking = False
                self.is_blinking = False

        elif action == "speak":
            self.is_speaking = True

        elif action == "idle":
            self.is_speaking = False

        elif action == "blink_start":
            self.is_blinking = True

        elif action == "blink_end":
            self.is_blinking = False

        await self._broadcast()


avatar_state = PngStateManager()
