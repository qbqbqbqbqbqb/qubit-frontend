from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request
from png_routes import png_router 

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

app.include_router(png_router)


@app.get("/", response_class=HTMLResponse)
async def control_page(request: Request):
    return templates.TemplateResponse(request=request, name="control.html")