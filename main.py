"""
main.py
FastAPI backend for Street Safety — port 8742.

Endpoints:
  GET  /          → serves index.html (frontend)
  GET  /health    → pipeline ready check
  POST /analyze   → process image, return safety alert JSON
"""

import io
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from pipeline.loader import registry
from pipeline.street_pipeline import street_safety_pipeline


# ── Lifespan: load models once at startup ─────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    registry.load()
    yield
    # (cleanup if needed)


app = FastAPI(
    title="Street Safety API",
    description="Multimodal street safety alert system for blind/low-vision users.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS (allow frontend on any local origin during dev) ─────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Static files (frontend) ───────────────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/", include_in_schema=False)
async def serve_frontend():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health():
    return {
        "status": "ready" if registry.ready else "loading",
        "models": {
            "clip":         registry.clip_backbone is not None,
            "yolo":         registry.yolo_detector is not None,
            "scene_graph":  registry.scene_graph_builder is not None,
            "groq_decoder": registry.street_decoder is not None,
        }
    }


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Receive an image (JPEG/PNG), run the Street Safety pipeline,
    return a structured safety alert.

    Response:
    {
      "danger_level":       "RED" | "YELLOW" | "GREEN",
      "alert_fr":           str,
      "alert_ar":           str,
      "objects":            [{label, confidence, proximity}, ...],
      "relations":          [str, ...],
      "actions":            [[query, score], ...],
      "processing_time_ms": int
    }
    """
    if not registry.ready:
        raise HTTPException(status_code=503, detail="Models are still loading. Try again in a moment.")

    # Validate content type
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"Expected an image, got: {file.content_type}")

    # Read and decode image
    try:
        raw   = await file.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    # Run pipeline
    try:
        result = street_safety_pipeline(image)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {e}")

    return JSONResponse(content=result)


# ── Dev entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8742, reload=False)
