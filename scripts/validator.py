#!/usr/bin/env python3
"""Strict standalone puzzle validator; standard library only."""
import argparse, json, re, sys, unicodedata
from pathlib import Path

def validate(p):
    def require(condition, message):
        if not condition: raise ValueError(message)
    require(isinstance(p,dict),'Puzzle must be an object')
    require(p.get('schemaVersion')==1,'Unsupported schemaVersion')
    require(re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}',p.get('id','')),'Invalid puzzle ID')
    require(isinstance(p.get('title'),str) and p['title'].strip(),'Missing title')
    require(p.get('difficulty') in ['easy','medium','hard'],'Invalid difficulty')
    source=p.get('source');require(isinstance(source,dict),'Missing source metadata')
    if source.get('type')!='original':
        require(isinstance(source.get('url'),str) and source['url'].startswith('https://'),'Missing source URL')
        require(isinstance(p.get('extractedAt'),str),'Missing extraction date')
    g=p.get('grid',{});rows=g.get('rows');cols=g.get('cols')
    require(type(rows)==int and type(cols)==int and 2<=rows<=60 and 2<=cols<=60,'Invalid grid dimensions')
    require(isinstance(g.get('blocked'),list),'Missing blocked cells')
    blocks=set()
    for v in g['blocked']:
        require(isinstance(v,list) and len(v)==2 and all(type(x)==int for x in v),'Malformed blocked cell')
        r,c=v;require(0<=r<rows and 0<=c<cols and (r,c) not in blocks,'Invalid or duplicate blocked cell');blocks.add((r,c))
    clues=p.get('clues');require(isinstance(clues,list) and 0<len(clues)<=500,'Missing clues')
    solution={};members={};ids=set();starts={};runs={}
    for cl in clues:
        require(isinstance(cl,dict),'Invalid clue')
        cid=cl.get('id');require(isinstance(cid,str) and cid and cid not in ids,'Missing or duplicate clue ID');ids.add(cid)
        direction=cl.get('direction');require(direction in ['across','down'],'Invalid direction')
        answer=cl.get('answer');require(isinstance(answer,str) and re.fullmatch('[ა-ჰ]{2,}',answer) and unicodedata.normalize('NFC',answer)==answer,'Missing or invalid Georgian answer')
        require('length' not in cl or cl['length']==len(answer),'Invalid answer length')
        require(isinstance(cl.get('clue'),str) and cl['clue'].strip(),'Empty clue')
        r,c=cl.get('row'),cl.get('col');require(type(r)==int and type(c)==int,'Invalid starting coordinates')
        number=cl.get('number');require(type(number)==int and number>0,'Invalid clue number')
        require((r,c) not in starts or starts[r,c]==number,'Inconsistent shared numbering');starts[r,c]=number
        dr=int(direction=='down');dc=1-dr;path=[]
        for i,letter in enumerate(answer):
            pos=(r+dr*i,c+dc*i);rr,cc=pos
            require(0<=rr<rows and 0<=cc<cols,'Answer exceeds grid boundary')
            require(pos not in blocks,'Answer crosses blocked cell')
            require(pos not in solution or solution[pos]==letter,'Conflicting intersection')
            require(direction not in members.get(pos,[]),'Overlapping same-direction entries')
            solution[pos]=letter;members.setdefault(pos,[]).append(direction);path.append(pos)
        runs[tuple(path)]=direction
    require(len(solution)+len(blocks)==rows*cols,'Unexpected empty required cells')
    require([starts[k] for k in sorted(starts)]==list(range(1,len(starts)+1)),'Nonsequential or inconsistent numbering')
    for r,c in solution:
        for dr,dc,direction in [(0,1,'across'),(1,0,'down')]:
            if (r-dr,c-dc) in solution:continue
            run=[];rr,cc=r,c
            while (rr,cc) in solution:run.append((rr,cc));rr+=dr;cc+=dc
            if len(run)>1:require(runs.get(tuple(run))==direction,'Open run without matching clue')
    visited=set();queue=[next(iter(solution))]
    while queue:
        pos=queue.pop()
        if pos in visited:continue
        visited.add(pos);r,c=pos
        queue.extend(n for n in [(r-1,c),(r+1,c),(r,c-1),(r,c+1)] if n in solution and n not in visited)
    require(len(visited)==len(solution),'Disconnected crossword')
    return {'id':p['id'],'cells':len(solution),'clues':len(clues),'rows':rows,'cols':cols}

def validate_directory(directory):
    report={'discovered':0,'validated':0,'rejected':[],'puzzles':[]};ids=set()
    for path in sorted(Path(directory).glob('*.json')):
        if path.name=='index.json':continue
        report['discovered']+=1;p={}
        try:
            p=json.loads(path.read_text());result=validate(p)
            if p['id'] in ids:raise ValueError('Duplicate puzzle ID')
            if path.stem!=p['id']:raise ValueError('Filename does not match ID')
            ids.add(p['id']);report['puzzles'].append(result);report['validated']+=1
        except (ValueError,TypeError,KeyError,AttributeError) as e:report['rejected'].append({'file':str(path),'url':p.get('source',{}).get('url') if isinstance(p,dict) else None,'reason':str(e)})
    index_path=Path(directory)/'index.json'
    if index_path.exists():
        try:
            manifest=json.loads(index_path.read_text());entries=manifest['puzzles'];listed=[x['id'] for x in entries]
            if set(listed)!=ids or len(set(listed))!=len(listed):raise ValueError('Manifest does not match validated files')
            for e in entries:
                actual=next(p for p in report['puzzles'] if p['id']==e['id'])
                for a,b in [('rows','rows'),('cols','cols'),('cellCount','cells'),('clueCount','clues')]:
                    if e.get(a)!=actual[b]:raise ValueError(f'Manifest metadata mismatch: {e["id"]} {a}')
        except (ValueError,KeyError,TypeError) as e:report['rejected'].append({'file':str(index_path),'reason':str(e)})
    return report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('directory');parser.add_argument('--report');args=parser.parse_args();report=validate_directory(args.directory)
    if args.report:Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False,indent=2));return 1 if report['rejected'] or not report['validated'] else 0
if __name__=='__main__':sys.exit(main())
