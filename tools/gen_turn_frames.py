#!/usr/bin/env python3
"""Generate Mio's turn-around frames (dolphin rotating to face the viewer) with the gpt-image-2.5 skill.

Uses the side-view sprite as a reference image (images/edits) so the character stays the same.
Usage: python3 tools/gen_turn_frames.py [name ...]   -> assets_src/turn/<name>_<n>.png (+ .json)
"""
import importlib.util, json, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from gen_assets import ROOT, SCRIPT

spec = importlib.util.spec_from_file_location("gpt_image", SCRIPT)
gi = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gi)

OUT = ROOT / "assets_src" / "turn"
REF = ROOT / "assets_src" / "mio.webp"
CHARACTER = ("The same young bottlenose dolphin character as in the reference image: identical slate-blue to pale grey "
             "glossy skin, cream belly, the delicate aquamarine luminous swirl marking on its flank, same proportions, "
             "same painterly game-sprite rendering and soft top lighting. ")
TAIL = (" Body level and horizontal, dorsal fin pointing straight up. Isolated game sprite on a fully transparent "
        "background, no water, no bubbles, no shadow, whole body visible with generous margin.")
FRAMES = {
    "turn30": ("1536x1024", "It is starting to turn toward the viewer: rotated about 30 degrees around its vertical axis, "
               "still facing mostly to the right, head coming slightly toward the camera, body a little foreshortened, "
               "the far-side pectoral fin just visible below the belly."),
    "turn60": ("1024x1024", "It is turning toward the viewer: a three-quarter front view rotated about 60 degrees around its "
               "vertical axis, head toward the camera and slightly to the right, body strongly foreshortened behind the "
               "head, both pectoral fins visible, tail flukes partly visible behind the body."),
    "front": ("1024x1024", "Seen exactly head-on from the front, facing straight at the camera, perfectly symmetrical, "
              "beak pointing at the viewer with a gentle smile, both pectoral fins spread to the sides, dorsal fin on top, "
              "the body and tail hidden behind the head."),
}

def make(name):
    size, pose = FRAMES[name]
    prompt = CHARACTER + pose + TAIL
    key = gi.load_api_key()
    fields = [("model", gi.DEFAULT_MODEL), ("prompt", prompt), ("quality", "medium"), ("size", size),
              ("output_format", "png"), ("background", "transparent"), ("n", "2")]
    files = [("image[]", REF.name, REF.read_bytes(), "image/webp")]
    body, ctype = gi._multipart(fields, files)
    try:
        payload, rid, elapsed = gi._post(f"{gi.base_url()}/images/edits", body, ctype, key)
    except gi.SkillError as e:
        print("ERR", name, e, flush=True)
        return False
    meta = {"kind": "turn-frame", "prompt": prompt, "reference": str(REF.relative_to(ROOT)), "model": gi.DEFAULT_MODEL,
            "quality": "medium", "size": size, "background": "transparent", "request_id": rid,
            "elapsed_sec": round(elapsed, 1), "usage": payload.get("usage")}
    saved = gi.save_results(payload, OUT, name, "png", meta)
    print("OK ", name, [p.name for p in saved], f"{elapsed:.0f}s", flush=True)
    return True

if __name__ == "__main__":
    names = sys.argv[1:] or list(FRAMES)
    OUT.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as ex:
        print("done", sum(ex.map(make, names)), "/", len(names))
