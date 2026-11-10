#!/usr/bin/env python3
"""Package only public static files; validate data first. No JS build step needed."""
import hashlib, json, shutil, sys
from pathlib import Path
from validator import validate_directory
ROOT=Path(__file__).resolve().parents[1]
def main():
    report=validate_directory(ROOT/'data/puzzles')
    if report['rejected'] or not report['validated']:print(json.dumps(report,ensure_ascii=False));return 1
    out=ROOT/'dist'
    if out.exists():shutil.rmtree(out)
    out.mkdir()
    for name in ['index.html','manifest.webmanifest','service-worker.js']:shutil.copy2(ROOT/name,out/name)
    for name in ['css','js','assets','data']:shutil.copytree(ROOT/name,out/name)
    (out/'.nojekyll').touch()
    digest=hashlib.sha256()
    for p in sorted(out.rglob('*')):
        if p.is_file():digest.update(p.relative_to(out).as_posix().encode());digest.update(p.read_bytes())
    worker=out/'service-worker.js';worker.write_text(worker.read_text().replace("sitqvana-v1",f'sitqvana-{digest.hexdigest()[:12]}'))
    print(f'Built {out}; {report["validated"]} validated puzzles; cache {digest.hexdigest()[:12]}')
    return 0
if __name__=='__main__':sys.exit(main())
