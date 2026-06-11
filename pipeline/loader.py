"""
pipeline/loader.py
Loads all models once at startup and exposes a global ModelRegistry.
Called by FastAPI lifespan event — never re-initialised per request.
"""

import os
from dotenv import load_dotenv

import clip
import torch
from groq import Groq
from ultralytics import YOLO

from pipeline.core import (
    DEVICE,
    CLIPVisionBackbone,
    YOLOObjectDetector,
    SAMSegmentationModule,
    SceneGraphBuilder,
    ActionInferenceModule,
    MultimodalFusionModule,
    StreetLexicalContext,
)
from pipeline.street_decoder import StreetSafetyDecoder

load_dotenv()


class ModelRegistry:
    """Holds all loaded models. Instantiated once at FastAPI startup."""

    def __init__(self):
        self.clip_backbone    = None
        self.yolo_detector    = None
        self.sam_module       = None
        self.scene_graph_builder = None
        self.action_module    = None
        self.fusion_module    = None
        self.lexical_context  = None
        self.street_decoder   = None
        self.ready            = False

    def load(self):
        print(f"\n🚀 Loading Street Safety models on device: {DEVICE}")

        # ── CLIP ──────────────────────────────────────────────────────────────
        print("  Loading CLIP ViT-B/32...")
        clip_model, clip_preprocess = clip.load("ViT-B/32", device=DEVICE)
        clip_model.eval()
        self.clip_backbone = CLIPVisionBackbone(clip_model, clip_preprocess, DEVICE)
        print("  ✅ CLIP ready")

        # ── YOLOv8 ────────────────────────────────────────────────────────────
        print("  Loading YOLOv8n...")
        yolo_model = YOLO("yolov8n.pt")
        self.yolo_detector = YOLOObjectDetector(yolo_model)
        print("  ✅ YOLOv8 ready")

        # ── SAM (disabled) ────────────────────────────────────────────────────
        self.sam_module = SAMSegmentationModule()
        print("  ✅ SAM disabled (Street Safety mode — latency optimisation)")

        # ── Scene Graph Builder ───────────────────────────────────────────────
        print("  Initialising Scene Graph Builder (GNN)...")
        self.scene_graph_builder = SceneGraphBuilder(self.clip_backbone)
        print("  ✅ Scene Graph Builder ready")

        # ── Action Inference ──────────────────────────────────────────────────
        self.action_module = ActionInferenceModule(self.clip_backbone)
        print("  ✅ Action Inference ready")

        # ── Cross-Modal Fusion ────────────────────────────────────────────────
        self.fusion_module = MultimodalFusionModule(self.clip_backbone)
        print("  ✅ Cross-Modal Fusion ready")

        # ── Lexical Context ───────────────────────────────────────────────────
        self.lexical_context = StreetLexicalContext()
        print("  ✅ Street Lexical Context ready")

        # ── Groq / Street Safety Decoder ─────────────────────────────────────
        groq_api_key = os.getenv("GROQ_API_KEY")
        groq_model   = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
        if not groq_api_key:
            raise ValueError("GROQ_API_KEY not found in .env file")

        groq_client = Groq(api_key=groq_api_key)
        self.street_decoder = StreetSafetyDecoder(groq_client, groq_model)
        print(f"  ✅ Street Safety Decoder ready (model: {groq_model})")

        self.ready = True
        print("\n✅ All models loaded. Street Safety pipeline ready.\n")


# Global singleton — shared across all FastAPI requests
registry = ModelRegistry()
