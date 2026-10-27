#!/usr/bin/env python3
"""Generate the game's source images with the gpt-image-2.5 skill script.

Usage: python3 tools/gen_assets.py [name ...]   (no names = all missing assets)
Raw outputs go to assets_src/; run tools/process_assets.py afterwards.
"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets_src"
SCRIPT = os.environ.get("GPT_IMAGE_SCRIPT", str(Path.home() / ".claude/skills/synced"
    "/c2d1994f-cddb-4fad-821c-0d3c1f5845ef_e74ffed0-5491-4782-82a8-5e9f4c221cb9/gpt-image-2-5/scripts/gpt_image.py"))

def run(asset, style):
    out = SRC / f"{asset['name']}.png"
    cmd = [sys.executable, SCRIPT, "generate", "--prompt", asset["prompt"] + " " + style,
           "--size", asset["size"], "--name", asset["name"], "--out-dir", str(SRC)]
    if asset.get("bg"):
        cmd += ["--background", asset["bg"]]
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok = r.returncode == 0
    print(("OK  " if ok else "ERR ") + asset["name"] + ("" if ok else " " + r.stderr.strip()[-400:]), flush=True)
    return ok

def main():
    spec = json.loads((ROOT / "tools/asset_prompts.json").read_text())
    want = set(sys.argv[1:])
    todo = [a for a in spec["assets"]
            if (a["name"] in want) or (not want and not (SRC / f"{a['name']}.png").exists())]
    SRC.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=5) as ex:
        results = list(ex.map(lambda a: run(a, spec["style"]), todo))
    print(f"done {sum(results)}/{len(todo)}")

if __name__ == "__main__":
    main()
