import os
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.requests import Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
from png_state import avatar_state

png_router = APIRouter(prefix="/png")
templates = Jinja2Templates(directory="templates")

# Resolve models folder relative to this file so it works on any OS
PNG_FOLDER = Path(__file__).parent / "png_models"
PNG_FOLDER.mkdir(exist_ok=True)


@png_router.get("/", response_class=HTMLResponse)
async def get_png_overlay(request: Request):
    """OBS Browser Source - PNG Avatar template wrapper"""
    return templates.TemplateResponse(request=request, name="png_overlay.html")


@png_router.get("/images/{folder}/{filename}")
async def serve_image(folder: str, filename: str):
    file_path = PNG_FOLDER / folder / filename
    if file_path.exists():
        return FileResponse(file_path)
    return Response(status_code=404)


@png_router.get("/models")
async def list_png_models():
    try:
        models = [d.name for d in PNG_FOLDER.iterdir() if d.is_dir()]
        return {"models": sorted(models)}
    except Exception:
        return {"models": []}


EXPECTED_IMAGES = {"blink_idle.png", "blink_speaking.png", "open_idle.png", "open_speaking.png"}


@png_router.post("/models/upload")
async def upload_model(
    folder_name: str = Form(...),
    blink_idle: UploadFile = File(...),
    blink_speaking: UploadFile = File(...),
    open_idle: UploadFile = File(...),
    open_speaking: UploadFile = File(...),
):
    dest = PNG_FOLDER / folder_name
    dest.mkdir(parents=True, exist_ok=True)

    files = {
        "blink_idle.png": blink_idle,
        "blink_speaking.png": blink_speaking,
        "open_idle.png": open_idle,
        "open_speaking.png": open_speaking,
    }

    for filename, upload in files.items():
        data = await upload.read()
        (dest / filename).write_bytes(data)

    return {"status": "ok", "folder": folder_name}


@png_router.websocket("/ws")
async def png_websocket(websocket: WebSocket):
    await avatar_state.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        avatar_state.disconnect(websocket)


@png_router.post("/command")
async def png_command(cmd: dict):
    await avatar_state.broadcast_command(cmd)
    return {"status": "ok"}
