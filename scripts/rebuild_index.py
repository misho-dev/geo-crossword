#!/usr/bin/env python3
import argparse,json
from pathlib import Path
from validator import validate
def main():
    p=argparse.ArgumentParser();p.add_argument('directory',type=Path,nargs='?',default=Path(__file__).resolve().parents[1]/'data/puzzles');p.add_argument('--version',default='collection-v1');a=p.parse_args();entries=[];ids=set()
    for path in sorted(a.directory.glob('*.json')):
        if path.name=='index.json':continue
        puzzle=json.loads(path.read_text());info=validate(puzzle)
        if puzzle['id'] in ids:raise ValueError('Duplicate ID')
        ids.add(puzzle['id']);entries.append(dict(id=puzzle['id'],title=puzzle['title'],difficulty=puzzle['difficulty'],category=puzzle.get('category','კროსვორდები'),rows=info['rows'],cols=info['cols'],clueCount=info['clues'],cellCount=info['cells'],sourceType=puzzle['source'].get('type','external'),estimatedMinutes={'easy':6,'medium':12,'hard':20}[puzzle['difficulty']]))
    (a.directory/'index.json').write_text(json.dumps(dict(schemaVersion=1,catalogVersion=a.version,calendarBasis='Asia/Tbilisi',puzzles=entries),ensure_ascii=False,indent=2)+'\n');print(f'Indexed {len(entries)} puzzles')
if __name__=='__main__':main()
