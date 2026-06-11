"""
pipeline/street_decoder.py
StreetSafetyDecoder — replaces GroqCaptionDecoder for the Street Safety objective.

Key differences vs original GroqCaptionDecoder:
  - SYSTEM_PROMPT rewritten for danger prioritisation (not aesthetic description)
  - num_captions = 1 (no diversity needed, speed is critical)
  - temperature = 0.2 (deterministic — safety alerts must be consistent)
  - Output format: DANGER_LEVEL (RED/YELLOW/GREEN) + bilingual ALERT (FR + AR)
  - graph_coverage_score replaced by danger_priority_score
"""

import re
import networkx as nx
from groq import Groq


# ── Danger-relevant YOLO classes ──────────────────────────────────────────────
IMMEDIATE_DANGER = {"car", "truck", "bus", "motorcycle", "train"}
CAUTION_OBJECTS  = {"bicycle", "person", "dog", "stop sign", "traffic light",
                    "fire hydrant", "bench", "construction"}
GREEN_LIGHT_WORD = "traffic light"


class StreetSafetyDecoder:
    """
    Groq LLM decoder specialised for street safety alerts for blind/low-vision users.

    Pipeline changes vs v4 GroqCaptionDecoder:
      ① New SYSTEM_PROMPT — danger-priority rules, not aesthetic rules
      ② Bilingual output (French + Arabic) in a single Groq call
      ③ Single caption, temperature=0.2 (deterministic)
      ④ parse_response() extracts structured {danger_level, alert_fr, alert_ar}
      ⑤ danger_priority_score() replaces graph_coverage_score()
    """

    SYSTEM_PROMPT = """You are an AI safety assistant for blind and visually impaired people walking in streets.

You receive a structured scene analysis from computer vision models:
- OBJECTS: detected entities with confidence scores and proximity (CLOSE = within ~3 metres, FAR = further)
- SCENE GRAPH: spatial relationships between detected objects
- ACTIONS: detected movement/activities in the scene

Your ONLY job: produce a SHORT, URGENT safety alert — maximum 12 words per language.

DANGER PRIORITY (apply strictly in this order):
  🔴 RED — IMMEDIATE DANGER: vehicle CLOSE, red traffic light while crossing, sudden obstacle at feet
  🟡 YELLOW — CAUTION: cyclist nearby, crowd ahead, obstacle on path, road works, dog close
  🟢 GREEN — SAFE: path clear, green traffic light, no hazards detected

OUTPUT FORMAT (mandatory — do not add anything else):
DANGER_LEVEL: RED
ALERT_FR: <alert in French, max 12 words>
ALERT_AR: <alert in Arabic (Modern Standard), max 12 words>

RULES:
  - Always output exactly 3 lines: DANGER_LEVEL, ALERT_FR, ALERT_AR
  - CLOSE objects are more dangerous than FAR objects — always prioritise them
  - Vehicles (car, truck, bus, motorcycle) CLOSE = always RED
  - Be direct: "Voiture à gauche" not "Il semble y avoir une voiture"
  - Arabic must be Modern Standard Arabic (Fusha), not dialect
  - If unsure, output YELLOW
  - Never describe aesthetics, colors, or irrelevant scene details

EXAMPLES:
DANGER_LEVEL: RED
ALERT_FR: Voiture qui approche sur votre gauche.
ALERT_AR: سيارة تقترب من جهة يسارك.

DANGER_LEVEL: YELLOW
ALERT_FR: Vélo sur le trottoir, ralentissez.
ALERT_AR: دراجة على الرصيف، تباطأ.

DANGER_LEVEL: GREEN
ALERT_FR: Chemin libre, feu vert, traversez.
ALERT_AR: الطريق آمن، الضوء أخضر، تابع.
"""

    USER_TEMPLATE = (
        "OBJECTS (with proximity):\n{objects}\n\n"
        "SCENE GRAPH (subject → relation → object):\n{graph_triplets}\n\n"
        "ACTIONS:\n{actions}\n\n"
        "Generate a safety alert for a blind pedestrian."
    )

    def __init__(self, client: Groq, model: str):
        self.client = client
        self.model  = model

    # ── Graph serialisation (same as v4) ──────────────────────────────────────

    @staticmethod
    def format_graph_for_llm(G: nx.DiGraph, max_edges=10) -> str:
        if G is None or G.number_of_edges() == 0:
            return "  (no relations detected)"
        edges_sorted = sorted(G.edges(data=True),
                              key=lambda e: e[2].get("weight", 0), reverse=True)
        seen_pairs, lines = set(), []
        for u, v, data in edges_sorted:
            pair = frozenset([u, v])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            u_label = G.nodes[u].get("label", u)
            v_label = G.nodes[v].get("label", v)
            rel     = data.get("relation", "near").replace("_", " ")
            weight  = data.get("weight", 0.0)
            lines.append(f"  {u_label} → {rel} → {v_label}  (conf: {weight:.2f})")
            if len(lines) >= max_edges:
                break
        return "\n".join(lines) if lines else "  (no relations detected)"

    # ── User message builder ──────────────────────────────────────────────────

    def _build_user_message(self, objects: list, G: nx.DiGraph, actions: list) -> str:
        # Objects with proximity annotation
        objects_str = "\n".join(
            f"  • {obj['label']} (conf: {obj['confidence']:.2f}, proximity: {obj.get('proximity','?')})"
            for obj in objects
        ) or "  • (none detected)"

        graph_str = self.format_graph_for_llm(G)

        actions_str = "\n".join(
            f"  • {q.replace('a photo of ', '')}  (score: {s:.3f})"
            for q, s in actions[:5]
        ) or "  • (no actions inferred)"

        return self.USER_TEMPLATE.format(
            objects=objects_str,
            graph_triplets=graph_str,
            actions=actions_str,
        )

    # ── Response parser ───────────────────────────────────────────────────────

    @staticmethod
    def parse_response(raw: str) -> dict:
        """
        Parse LLM output into structured dict.
        Returns: {danger_level, alert_fr, alert_ar}
        Falls back gracefully if parsing fails.
        """
        lines = raw.strip().splitlines()
        result = {"danger_level": "YELLOW", "alert_fr": "", "alert_ar": ""}

        for line in lines:
            line = line.strip()
            if line.startswith("DANGER_LEVEL:"):
                level = line.split(":", 1)[1].strip().upper()
                if level in {"RED", "YELLOW", "GREEN"}:
                    result["danger_level"] = level
            elif line.startswith("ALERT_FR:"):
                result["alert_fr"] = line.split(":", 1)[1].strip()
            elif line.startswith("ALERT_AR:"):
                result["alert_ar"] = line.split(":", 1)[1].strip()

        # Fallback if LLM didn't follow format
        if not result["alert_fr"]:
            result["alert_fr"] = "Attention, vérifiez votre environnement."
        if not result["alert_ar"]:
            result["alert_ar"] = "تنبه، تحقق من محيطك."

        return result

    # ── Danger priority scorer (replaces graph_coverage_score) ───────────────

    @staticmethod
    def danger_priority_score(objects: list) -> tuple:
        """
        Determine danger level from detected objects + proximity.
        Returns (danger_level_str, reason_str)
        """
        close_labels = {obj["label"] for obj in objects if obj.get("proximity") == "CLOSE"}
        all_labels   = {obj["label"] for obj in objects}

        # RED: any vehicle CLOSE
        for label in close_labels:
            if label in IMMEDIATE_DANGER:
                return "RED", f"{label} CLOSE"

        # YELLOW: caution objects CLOSE, or vehicles FAR
        for label in close_labels:
            if label in CAUTION_OBJECTS:
                return "YELLOW", f"{label} CLOSE"
        for label in all_labels:
            if label in IMMEDIATE_DANGER:
                return "YELLOW", f"{label} detected (FAR)"

        return "GREEN", "no hazards"

    # ── Main generate method ──────────────────────────────────────────────────

    def generate(self, objects: list, G: nx.DiGraph, actions: list) -> dict:
        """
        Generate one bilingual safety alert via Groq.
        Returns: {danger_level, alert_fr, alert_ar, raw_response}
        """
        user_msg = self._build_user_message(objects, G, actions)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user",   "content": user_msg},
                ],
                max_tokens=150,
                temperature=0.2,
                top_p=0.9,
            )
            raw = response.choices[0].message.content or ""
        except Exception as e:
            print(f"  ⚠️  Groq API error: {e}")
            raw = "DANGER_LEVEL: YELLOW\nALERT_FR: Erreur d'analyse, soyez prudent.\nALERT_AR: خطأ في التحليل، كن حذراً."

        result            = self.parse_response(raw)
        result["raw"]     = raw

        # Cross-check: if vision models see a RED situation but LLM said GREEN, override
        vision_level, reason = self.danger_priority_score(objects)
        if vision_level == "RED" and result["danger_level"] != "RED":
            result["danger_level"] = "RED"
            result["alert_fr"]     = f"Danger immédiat : {reason} détecté."
            result["alert_ar"]     = f"خطر فوري: تم الكشف عن {reason}."

        return result

    def get_prompt_preview(self, objects, G, actions) -> str:
        return (
            f"[SYSTEM]\n{self.SYSTEM_PROMPT}\n\n"
            f"[USER]\n{self._build_user_message(objects, G, actions)}"
        )
