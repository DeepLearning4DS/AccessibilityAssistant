"""
pipeline/core.py
All model classes ported from advanced_image_captioning_v4.
Adapted for Street Safety: SAM disabled, proximity scoring added.
"""

import math
import re
from collections import Counter
from pathlib import Path

import clip
import networkx as nx
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from ultralytics import YOLO

# ── Device detection (MPS for Apple M-series, CUDA for Nvidia, else CPU) ──────
def _get_device():
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")

DEVICE = _get_device()

# ── PyTorch Geometric availability check ──────────────────────────────────────
try:
    from torch_geometric.nn import GCNConv
    PYG_AVAILABLE = True
except ImportError:
    PYG_AVAILABLE = False


# ══════════════════════════════════════════════════════════════════════════════
# 1. CLIP Vision Backbone
# ══════════════════════════════════════════════════════════════════════════════

class CLIPVisionBackbone:
    def __init__(self, model, preprocess, device):
        self.model      = model
        self.preprocess = preprocess
        self.device     = device

    @torch.no_grad()
    def encode_image(self, pil_image: Image.Image) -> torch.Tensor:
        tensor    = self.preprocess(pil_image).unsqueeze(0).to(self.device)
        embedding = self.model.encode_image(tensor)
        return embedding / embedding.norm(dim=-1, keepdim=True)

    @torch.no_grad()
    def encode_texts(self, texts: list) -> torch.Tensor:
        tokens     = clip.tokenize(texts, truncate=True).to(self.device)
        embeddings = self.model.encode_text(tokens)
        return embeddings / embeddings.norm(dim=-1, keepdim=True)

    @torch.no_grad()
    def image_text_similarity(self, image_emb: torch.Tensor, texts: list) -> np.ndarray:
        text_embs   = self.encode_texts(texts)
        similarities = (image_emb @ text_embs.T).squeeze(0)
        return similarities.cpu().float().numpy()

    @torch.no_grad()
    def encode_image_crop(self, pil_image: Image.Image, bbox: tuple) -> torch.Tensor:
        x1, y1, x2, y2 = [int(v) for v in bbox]
        crop = pil_image.crop((x1, y1, x2, y2))
        if crop.width < 10 or crop.height < 10:
            return torch.zeros(1, 512).to(self.device)
        return self.encode_image(crop)


# ══════════════════════════════════════════════════════════════════════════════
# 2. YOLO Object Detector + Proximity Scoring
# ══════════════════════════════════════════════════════════════════════════════

# YOLO COCO classes relevant to street safety
STREET_RELEVANT_CLASSES = {
    "person", "bicycle", "car", "motorcycle", "bus", "truck",
    "traffic light", "stop sign", "dog", "cat",
    "fire hydrant", "bench", "backpack", "handbag",
}

def compute_proximity(obj: dict) -> str:
    """
    Classify object proximity based on bbox vertical position.
    Bottom 40% of image = CLOSE (dangerous), top 60% = FAR.
    Returns: 'CLOSE' | 'FAR'
    """
    _, img_h    = obj["img_size"]
    _, y1, _, y2 = obj["bbox"]
    center_y    = (y1 + y2) / 2.0
    return "CLOSE" if center_y > img_h * 0.60 else "FAR"


class YOLOObjectDetector:
    def __init__(self, model, conf_threshold=0.30, iou_threshold=0.45):
        self.model          = model
        self.conf_threshold = conf_threshold
        self.iou_threshold  = iou_threshold

    def detect(self, pil_image: Image.Image) -> list:
        img_w, img_h = pil_image.size
        results      = self.model(
            pil_image,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            verbose=False
        )
        objects = []
        for r in results:
            for i, box in enumerate(r.boxes):
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf   = float(box.conf[0].cpu())
                cls_id = int(box.cls[0].cpu())
                label  = r.names[cls_id]
                cx     = (x1 + x2) / 2.0
                cy     = (y1 + y2) / 2.0
                area   = (x2 - x1) * (y2 - y1)
                objects.append({
                    "id":        i,
                    "label":     label,
                    "confidence": conf,
                    "bbox":      (x1, y1, x2, y2),
                    "center":    (cx, cy),
                    "area":      area,
                    "img_size":  (img_w, img_h),
                })

        objects = self._deduplicate(objects)

        # Assign readable node IDs + proximity score
        label_counts = Counter()
        for obj in objects:
            label_counts[obj["label"]] += 1
            obj["node_id"]   = f"{obj['label']}_{label_counts[obj['label']]}"
            obj["proximity"] = compute_proximity(obj)

        return objects

    def _deduplicate(self, objects: list, iou_threshold: float = 0.6) -> list:
        keep = []
        for obj in sorted(objects, key=lambda o: -o["confidence"]):
            dominated = False
            for kept in keep:
                if obj["label"] == kept["label"] and self._iou(obj, kept) > iou_threshold:
                    dominated = True
                    break
            if not dominated:
                keep.append(obj)
        return keep

    @staticmethod
    def _iou(a, b) -> float:
        ax1, ay1, ax2, ay2 = a["bbox"]
        bx1, by1, bx2, by2 = b["bbox"]
        ix1 = max(ax1, bx1); iy1 = max(ay1, by1)
        ix2 = min(ax2, bx2); iy2 = min(ay2, by2)
        inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
        union = a["area"] + b["area"] - inter
        return inter / union if union > 0 else 0.0


# ══════════════════════════════════════════════════════════════════════════════
# 3. SAM Module (disabled shell — keeps pipeline interface intact)
# ══════════════════════════════════════════════════════════════════════════════

class SAMSegmentationModule:
    """SAM disabled for Street Safety (latency). Returns raw crops."""

    def __init__(self):
        self.enabled = False

    def segment_objects(self, pil_image: Image.Image, objects: list) -> list:
        results = []
        for obj in objects:
            x1, y1, x2, y2 = [int(v) for v in obj["bbox"]]
            crop = pil_image.crop((x1, y1, x2, y2))
            results.append({"mask": None, "mask_score": 0.0, "masked_crop": crop})
        return results


# ══════════════════════════════════════════════════════════════════════════════
# 4. GNN Scene Graph Builder
# ══════════════════════════════════════════════════════════════════════════════

class GNNRelationEncoder(nn.Module):
    def __init__(self, in_dim=517, hidden=256, out_dim=64, dropout=0.1):
        super().__init__()
        if not PYG_AVAILABLE:
            raise ImportError("PyTorch Geometric required for GNNRelationEncoder")
        self.conv1   = GCNConv(in_dim, hidden)
        self.conv2   = GCNConv(hidden, out_dim)
        self.dropout = nn.Dropout(dropout)
        self.proj    = nn.Linear(out_dim, out_dim)
        self.out_dim = out_dim

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        x = self.conv1(x, edge_index).relu()
        x = self.dropout(x)
        x = self.conv2(x, edge_index).relu()
        return self.proj(x)


class SceneGraphBuilder:
    _SPATIAL_TEMPLATES = {
        "left_of":     lambda dx, dy, ov: dx < -0.15 and abs(dy) < 0.4,
        "right_of":    lambda dx, dy, ov: dx >  0.15 and abs(dy) < 0.4,
        "above":       lambda dx, dy, ov: dy < -0.15 and abs(dx) < 0.4,
        "below":       lambda dx, dy, ov: dy >  0.15 and abs(dx) < 0.4,
        "near":        lambda dx, dy, ov: math.hypot(dx, dy) < 0.30,
        "overlapping": lambda dx, dy, ov: ov > 0.10,
        "far_from":    lambda dx, dy, ov: math.hypot(dx, dy) > 0.60,
    }
    GNN_OUT_DIM = 64

    def __init__(self, clip_backbone: CLIPVisionBackbone, similarity_threshold=0.2):
        self.clip                 = clip_backbone
        self.similarity_threshold = similarity_threshold
        self.gnn                  = None
        if PYG_AVAILABLE:
            self.gnn = GNNRelationEncoder().to(DEVICE)
            self.gnn.eval()

    def _norm_center(self, obj):
        w, h   = obj["img_size"]
        cx, cy = obj["center"]
        return cx / w, cy / h

    def _iou(self, a, b) -> float:
        ax1,ay1,ax2,ay2 = a["bbox"]
        bx1,by1,bx2,by2 = b["bbox"]
        ix1=max(ax1,bx1); iy1=max(ay1,by1)
        ix2=min(ax2,bx2); iy2=min(ay2,by2)
        inter = max(0,ix2-ix1)*max(0,iy2-iy1)
        union = a["area"] + b["area"] - inter
        return inter/union if union > 0 else 0.0

    def _spatial_rel(self, a, b) -> str:
        nx_a, ny_a = self._norm_center(a)
        nx_b, ny_b = self._norm_center(b)
        dx = nx_b - nx_a; dy = ny_b - ny_a
        ov = self._iou(a, b)
        for rel in ["overlapping","near","left_of","right_of","above","below","far_from"]:
            if self._SPATIAL_TEMPLATES[rel](dx, dy, ov):
                return rel
        return "co-present"

    @torch.no_grad()
    def _clip_sim(self, pil_image, a, b) -> float:
        ea = self.clip.encode_image_crop(pil_image, a["bbox"])
        eb = self.clip.encode_image_crop(pil_image, b["bbox"])
        return float(np.clip((ea @ eb.T).item(), -1.0, 1.0))

    @torch.no_grad()
    def _build_node_features(self, pil_image, objects, seg_results) -> torch.Tensor:
        feats = []
        W, H  = pil_image.size
        for i, obj in enumerate(objects):
            if seg_results and seg_results[i]["mask"] is not None:
                crop = seg_results[i]["masked_crop"]
            else:
                x1,y1,x2,y2 = [int(v) for v in obj["bbox"]]
                crop = pil_image.crop((x1,y1,x2,y2))
            if crop.width < 4 or crop.height < 4:
                crop = pil_image

            clip_emb = self.clip.encode_image(crop).squeeze(0)
            x1,y1,x2,y2 = obj["bbox"]
            spatial = torch.tensor([
                obj["center"][0]/W, obj["center"][1]/H,
                (x2-x1)/W, (y2-y1)/H, obj["area"]/(W*H),
            ], dtype=torch.float32, device=DEVICE)
            feats.append(torch.cat([clip_emb.float(), spatial]))
        return torch.stack(feats)

    def build(self, pil_image, objects, seg_results=None) -> dict:
        G = nx.DiGraph()
        n = len(objects)
        if n == 0:
            return {
                "nx_graph": G,
                "gnn_embeddings": torch.zeros(1, self.GNN_OUT_DIM, device=DEVICE),
            }

        for obj in objects:
            G.add_node(obj["node_id"], label=obj["label"],
                       confidence=obj["confidence"],
                       center=obj["center"], area=obj["area"])

        edge_src, edge_dst = [], []
        for i in range(n):
            for j in range(n):
                if i == j:
                    continue
                a, b = objects[i], objects[j]
                rel  = self._spatial_rel(a, b)
                csim = self._clip_sim(pil_image, a, b)
                wt   = math.sqrt(a["confidence"] * b["confidence"] *
                                 max(csim + 1, 0.01) / 2)
                G.add_edge(a["node_id"], b["node_id"],
                           relation=rel, clip_similarity=round(csim,3),
                           weight=round(wt,3))
                edge_src.append(i); edge_dst.append(j)

        gnn_embs = torch.zeros(n, self.GNN_OUT_DIM, device=DEVICE)
        if self.gnn is not None:
            try:
                node_feats = self._build_node_features(pil_image, objects, seg_results)
                edge_index = (
                    torch.tensor([edge_src, edge_dst], dtype=torch.long, device=DEVICE)
                    if edge_src else torch.zeros(2, 0, dtype=torch.long, device=DEVICE)
                )
                with torch.no_grad():
                    gnn_embs = self.gnn(node_feats, edge_index)
            except Exception as e:
                print(f"  ⚠️  GNN forward pass failed: {e}")

        return {"nx_graph": G, "gnn_embeddings": gnn_embs}

    def get_relation_descriptions(self, G: nx.DiGraph, max_relations=8) -> list:
        edges = sorted(G.edges(data=True), key=lambda e: e[2].get("weight",0), reverse=True)
        seen, rels = set(), []
        for u, v, d in edges:
            pair = frozenset([u, v])
            if pair not in seen:
                seen.add(pair)
                ul = G.nodes[u]["label"]; vl = G.nodes[v]["label"]
                rels.append(f"{ul} {d['relation'].replace('_',' ')} {vl}")
        return rels[:max_relations]


# ══════════════════════════════════════════════════════════════════════════════
# 5. Action Inference Module
# ══════════════════════════════════════════════════════════════════════════════

# Street-relevant verbs for action inference (replaces full Flickr30K corpus)
STREET_VERBS = [
    "walk", "run", "cross", "stop", "stand", "drive", "ride",
    "cycle", "approach", "turn", "wait", "park", "signal", "pass",
]

class ActionInferenceModule:
    def __init__(self, clip_backbone: CLIPVisionBackbone):
        self.clip = clip_backbone

    @torch.no_grad()
    def infer(self, pil_image: Image.Image, objects: list, top_n=5) -> list:
        object_labels = list({obj["label"] for obj in objects})[:4]
        queries = [f"a photo of someone {v}" for v in STREET_VERBS]
        for obj in object_labels:
            for v in STREET_VERBS[:8]:
                queries.append(f"a {obj} {v}ing")

        image_emb  = self.clip.encode_image(pil_image)
        all_scores = []
        batch_size = 32
        for i in range(0, len(queries), batch_size):
            batch  = queries[i:i+batch_size]
            scores = self.clip.image_text_similarity(image_emb, batch)
            all_scores.extend(zip(batch, scores.tolist()))

        all_scores.sort(key=lambda x: -x[1])
        seen_verbs, top_actions = set(), []
        for q, s in all_scores:
            verb = q.split()[-1].rstrip("ing")
            if verb not in seen_verbs:
                seen_verbs.add(verb)
                top_actions.append((q, s))
            if len(top_actions) >= top_n:
                break
        return top_actions


# ══════════════════════════════════════════════════════════════════════════════
# 6. Cross-Modal Attention Fusion
# ══════════════════════════════════════════════════════════════════════════════

class CrossModalAttentionFusion(nn.Module):
    def __init__(self, embed_dim=128, num_heads=4):
        super().__init__()
        self.proj_clip_global = nn.Linear(512, embed_dim)
        self.proj_obj_labels  = nn.Linear(512, embed_dim)
        self.proj_gnn         = nn.Linear(64,  embed_dim)
        self.proj_lexical     = nn.Linear(512, embed_dim)
        self.attn = nn.MultiheadAttention(embed_dim, num_heads, batch_first=True)
        self.norm = nn.LayerNorm(embed_dim)

    def forward(self, clip_global, obj_labels, gnn_emb, lexical_emb) -> dict:
        t0 = self.proj_clip_global(clip_global.float())
        t1 = self.proj_obj_labels(obj_labels.float())
        t2 = self.proj_gnn(gnn_emb.float().mean(dim=0, keepdim=True))
        t3 = self.proj_lexical(lexical_emb.float())
        tokens   = torch.stack([t0, t1, t2, t3], dim=1)
        attended, attn_w = self.attn(tokens, tokens, tokens)
        out   = self.norm(attended + tokens)
        fused = out.mean(dim=1)
        return {"fused": fused, "attn_weights": attn_w}


class MultimodalFusionModule:
    def __init__(self, clip_backbone: CLIPVisionBackbone):
        self.clip     = clip_backbone
        self.attn_net = CrossModalAttentionFusion(embed_dim=128, num_heads=4).to(DEVICE)
        self.attn_net.eval()

    @torch.no_grad()
    def _embed_object_labels(self, objects):
        if not objects:
            return torch.zeros(1, 512, device=DEVICE)
        texts = [f"a {obj['label']}" for obj in objects]
        embs  = self.clip.encode_texts(list(set(texts)))
        return embs.mean(dim=0, keepdim=True)

    @torch.no_grad()
    def _embed_lexical(self, objects):
        obj_lbls = [obj["label"] for obj in objects[:4]]
        phrases  = [f"a scene with {n}" for n in obj_lbls] + ["urban street scene"]
        embs     = self.clip.encode_texts(phrases[:16])
        return embs.mean(dim=0, keepdim=True)

    @torch.no_grad()
    def fuse(self, pil_image, objects, scene_graph_result) -> dict:
        clip_global = self.clip.encode_image(pil_image)
        obj_emb     = self._embed_object_labels(objects)
        gnn_embs    = scene_graph_result.get(
            "gnn_embeddings", torch.zeros(1, 64, device=DEVICE)
        )
        lexical_emb = self._embed_lexical(objects)
        result = self.attn_net(clip_global, obj_emb, gnn_embs, lexical_emb)
        return {"fused_embedding": result["fused"], "attn_weights": result["attn_weights"]}


# ══════════════════════════════════════════════════════════════════════════════
# 7. Lexical Context (simplified — street-focused, no Flickr30K dataset needed)
# ══════════════════════════════════════════════════════════════════════════════

class StreetLexicalContext:
    """
    Lightweight replacement for Flickr30KLexicalAnalyzer.
    Uses street-domain corpus statistics — no external dataset required.
    """
    TOP_NOUNS = ["person", "car", "road", "sidewalk", "bicycle",
                 "traffic light", "crosswalk", "truck", "bus", "motorcycle"]
    TOP_VERBS = STREET_VERBS
    TOP_ADJS  = ["busy", "crowded", "moving", "parked", "fast",
                 "slow", "close", "oncoming", "pedestrian", "urban"]

    def get_context_summary(self, detected_labels: list) -> str:
        parts = []
        for label in detected_labels[:6]:
            prox_adj = "moving" if label in {"car","truck","bus","motorcycle","bicycle"} else "present"
            parts.append(f"{label} ({prox_adj})")
        return "; ".join(parts) if parts else "urban street scene"

    def get_top_verbs(self, n=10) -> list:
        return self.TOP_VERBS[:n]

    def get_top_adjectives(self, n=5) -> list:
        return self.TOP_ADJS[:n]
