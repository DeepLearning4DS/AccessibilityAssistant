"""
pipeline/street_pipeline.py
street_safety_pipeline() — adapted from notebook v4 pipeline().

Key differences:
  - SAM skipped (disabled in SAMSegmentationModule)
  - Returns structured safety alert (danger_level, alert_fr, alert_ar)
  - No matplotlib output (API mode)
  - Proximity scores included in all object dicts
  - Processing time measured and returned
"""

import time
from PIL import Image
from pipeline.loader import registry


def street_safety_pipeline(pil_image: Image.Image) -> dict:
    """
    Run the full Street Safety pipeline on a PIL image.

    Steps:
      1. YOLOv8 object detection + proximity scoring
      2. SAM segmentation (disabled — returns raw crops)
      3. GNN scene graph construction
      4. Action inference (CLIP × street verbs)
      5. Cross-modal attention fusion
      6. Groq Street Safety Decoder → bilingual alert

    Returns:
      {
        danger_level:    "RED" | "YELLOW" | "GREEN",
        alert_fr:        str,
        alert_ar:        str,
        objects:         list[dict],
        relations:       list[str],
        actions:         list[tuple],
        processing_time_ms: int,
      }
    """
    t_start = time.time()
    r       = registry  # shorthand

    # ── 1. Object Detection + Proximity ──────────────────────────────────────
    objects       = r.yolo_detector.detect(pil_image)
    object_labels = [obj["label"] for obj in objects]

    # ── 2. SAM (disabled — returns raw crops for GNN node features) ──────────
    seg_results = r.sam_module.segment_objects(pil_image, objects)

    # ── 3. Scene Graph ────────────────────────────────────────────────────────
    sg_result = r.scene_graph_builder.build(pil_image, objects, seg_results)
    G         = sg_result["nx_graph"]
    relations = r.scene_graph_builder.get_relation_descriptions(G)

    # ── 4. Action Inference ───────────────────────────────────────────────────
    actions = r.action_module.infer(pil_image, objects)

    # ── 5. Cross-Modal Fusion ─────────────────────────────────────────────────
    # (result not directly used in alert, but enriches the graph embeddings
    #  and validates the full pipeline runs end-to-end)
    _ = r.fusion_module.fuse(pil_image, objects, sg_result)

    # ── 6. Street Safety Decoder (Groq) ───────────────────────────────────────
    alert = r.street_decoder.generate(objects, G, actions)

    processing_time_ms = int((time.time() - t_start) * 1000)

    return {
        "danger_level":        alert["danger_level"],
        "alert_fr":            alert["alert_fr"],
        "alert_ar":            alert["alert_ar"],
        "objects":             [
            {
                "label":      obj["label"],
                "confidence": round(obj["confidence"], 2),
                "proximity":  obj.get("proximity", "?"),
            }
            for obj in objects
        ],
        "relations":           relations[:5],
        "actions":             [(q, round(s, 3)) for q, s in actions[:3]],
        "processing_time_ms":  processing_time_ms,
    }
