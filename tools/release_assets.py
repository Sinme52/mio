#!/usr/bin/env python3
"""Re-render the medium drafts in assets_src/ at release quality (xhigh) with the gpt-image-2.5 skill.

Usage: python3 tools/release_assets.py [name ...]   (no names = every asset in asset_prompts.json)
Results go to assets_release/<name>.png; review them, then run with --apply to copy them over
assets_src/ (PNG, WebP and the sidecar JSON) before running process_assets.py / make_store_assets.py.
"""
import json, shutil, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from gen_assets import ROOT, SRC, SCRIPT

OUT = ROOT / "assets_release"

def release(name):
    cmd = [sys.executable, SCRIPT, "release", "--image", str(SRC / f"{name}.png"),
           "--name", name, "--out-dir", str(OUT)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    ok = r.returncode == 0
    print(("OK  " if ok else "ERR ") + name + ("" if ok else " " + r.stderr.strip()[-400:]), flush=True)
    return ok

def apply(names):
    from PIL import Image
    for n in names:
        src = OUT / f"{n}.png"
        if not src.exists():
            print("missing", n); continue
        shutil.copy(src, SRC / f"{n}.png")
        shutil.copy(OUT / f"{n}.json", SRC / f"{n}.json")
        Image.open(src).save(SRC / f"{n}.webp", quality=95, method=6)
        print("applied", n)

def main():
    args = [a for a in sys.argv[1:] if a != "--apply"]
    names = args or [a["name"] for a in json.loads((ROOT / "tools/asset_prompts.json").read_text())["assets"]]
    if "--apply" in sys.argv:
        return apply(names)
    OUT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=6) as ex:
        res = list(ex.map(release, names))
    print(f"done {sum(res)}/{len(names)}")

if __name__ == "__main__":
    main()
