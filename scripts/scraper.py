#!/usr/bin/env python3
"""Ambebi's observed public crossword API -> versioned local puzzle JSON.

Default output is private review data, deliberately excluded from static builds.
Collection is not a license to redistribute. --publish-dir requires a permission
record and a successful validation of every published file.
"""
import argparse, datetime as dt, hashlib, json, logging, re, shutil, time, unicodedata
import urllib.error, urllib.parse, urllib.request, urllib.robotparser
from pathlib import Path
from validator import validate

ROOT=Path(__file__).resolve().parents[1]
ORIGIN='https://www.ambebi.ge'
LIST_URL=ORIGIN+'/api/puzzle/crosswords/?page={page}&token=tkn'
TERMS_URL=ORIGIN+'/article/3006-masalebis-gamokveqnebis-pirobebi/'
AGENT='SitqvanaCrosswordResearch/1.0'

class Restricted(Exception):pass

class Client:
    def __init__(self,cache,delay=2.0,refresh=False):
        self.cache=Path(cache);self.cache.mkdir(parents=True,exist_ok=True);self.delay=max(1.5,delay);self.last=0;self.refresh=refresh;self.robot=None;self.robots_status=None
    def check_robots(self):
        try:
            text=self.get(ORIGIN+'/robots.txt',check=False).decode('utf-8','replace');self.robot=urllib.robotparser.RobotFileParser();self.robot.parse(text.splitlines());self.robots_status=200
            self.delay=max(self.delay,self.robot.crawl_delay(AGENT) or self.robot.crawl_delay('*') or 0)
        except urllib.error.HTTPError as e:
            if e.code in [404,410]:self.robots_status=e.code;logging.info('robots.txt returns %s (no rules published)',e.code)
            else:raise Restricted(f'robots.txt unavailable: HTTP {e.code}; collection stopped')
        except (urllib.error.URLError,TimeoutError) as e:raise Restricted(f'Cannot verify robots.txt: {e}')
    def get(self,url,check=True):
        parsed=urllib.parse.urlparse(url)
        if parsed.scheme!='https' or parsed.netloc!='www.ambebi.ge':raise Restricted('Refusing off-origin URL')
        if check and self.robot and not self.robot.can_fetch(AGENT,url):raise Restricted(f'robots.txt disallows {url}')
        dest=self.cache/(hashlib.sha256(url.encode()).hexdigest()+'.bin')
        if dest.exists() and not self.refresh:return dest.read_bytes()
        for attempt in range(4):
            time.sleep(max(0,self.delay-(time.monotonic()-self.last)))
            try:
                self.last=time.monotonic();logging.info('GET %s',url)
                request=urllib.request.Request(url,headers={'User-Agent':AGENT,'Accept':'application/json,text/plain,text/html'})
                with urllib.request.urlopen(request,timeout=25) as response:
                    if urllib.parse.urlparse(response.geturl()).netloc!='www.ambebi.ge':raise Restricted('Unexpected cross-origin redirect')
                    body=response.read(8_000_001)
                if len(body)>8_000_000:raise ValueError('Response exceeds size limit')
                if any(x in body[:20000].lower() for x in [b'verify you are human',b'cf-chl-',b'checking your browser']):raise Restricted('Human-verification page detected; stopped without bypass')
                dest.write_bytes(body);return body
            except urllib.error.HTTPError as e:
                if e.code in [401,403]:raise Restricted(f'Access restricted (HTTP {e.code}); stopped without retry')
                if e.code not in [429,500,502,503,504] or attempt==3:raise
                retry=e.headers.get('Retry-After','')
                wait=min(60,int(retry)) if retry.isdigit() else 2**(attempt+1)
                if retry.isdigit() and int(retry)>60:raise Restricted(f'Server requested {retry}s retry delay; resume later')
                logging.warning('HTTP %s, retry in %ss',e.code,wait);time.sleep(wait)
            except (urllib.error.URLError,TimeoutError):
                if attempt==3:raise
                time.sleep(2**(attempt+1))

def convert(raw,extracted_at=None):
    """Observed API has dimensions + entries[{position:{x,y},solution,...}]."""
    if not isinstance(raw,dict):raise ValueError('Source object must be a dictionary')
    if isinstance(raw.get('crossword'),dict):raw=raw['crossword']
    source_id=raw.get('id')
    if not str(source_id).isdigit():raise ValueError('Missing numeric source ID')
    dimensions=raw.get('dimensions');entries=raw.get('entries')
    if not isinstance(dimensions,dict) or not isinstance(entries,list):raise ValueError('Missing dimensions or entries; source format may have changed')
    rows,cols=dimensions.get('rows'),dimensions.get('cols')
    if type(rows)!=int or type(cols)!=int or not 2<=rows<=60 or not 2<=cols<=60:raise ValueError('Invalid source grid dimensions')
    used=set();clues=[]
    for e in entries:
        direction=e.get('direction');pos=e.get('position',{});answer=e.get('solution')
        if not isinstance(answer,str) or not answer:raise ValueError('Original answer missing')
        answer=unicodedata.normalize('NFC',answer).lower()
        # Do not remove punctuation or fill missing answers: invalid source is rejected.
        r,c=pos.get('y'),pos.get('x');number=e.get('number')
        if type(r)!=int or type(c)!=int:raise ValueError('Missing source coordinates')
        if direction not in ['across','down']:raise ValueError('Unknown source direction')
        for i in range(len(answer)):used.add((r+(i if direction=='down' else 0),c+(i if direction=='across' else 0)))
        clues.append(dict(id=f'{number}-{direction}',number=number,direction=direction,row=r,col=c,clue=e.get('clue'),answer=answer,length=e.get('length')))
    difficulty=raw.get('difficulty')
    inferred=difficulty not in ['easy','medium','hard']
    if inferred:difficulty='easy' if len(clues)<=15 else 'medium' if len(clues)<=35 else 'hard'
    puzzle=dict(schemaVersion=1,id=f'ambebi-{source_id}',title=raw.get('name') or f'კროსვორდი №{source_id}',source=dict(website='ambebi.ge',url=f'{ORIGIN}/puzzle/crosswords/{source_id}/',sourceId=str(source_id),type='external',license='permission-required',originalCreated=raw.get('created')),extractedAt=extracted_at or dt.datetime.now(dt.timezone.utc).isoformat(),difficulty=difficulty,difficultyEstimated=inferred,grid=dict(rows=rows,cols=cols,blocked=[[r,c] for r in range(rows) for c in range(cols) if (r,c) not in used]),clues=sorted(clues,key=lambda x:(x['direction']!='across',x['number'])))
    validate(puzzle);return puzzle

def fingerprint(p):
    return hashlib.sha256(json.dumps({'grid':p['grid'],'clues':p['clues']},ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def manifest(puzzles):
    return dict(schemaVersion=1,catalogVersion='ambebi-'+dt.date.today().isoformat(),calendarBasis='Asia/Tbilisi',puzzles=[dict(id=p['id'],title=p['title'],difficulty=p['difficulty'],category='კროსვორდები',rows=p['grid']['rows'],cols=p['grid']['cols'],clueCount=len(p['clues']),cellCount=p['grid']['rows']*p['grid']['cols']-len(p['grid']['blocked']),sourceType='external',estimatedMinutes={'easy':6,'medium':12,'hard':20}[p['difficulty']]) for p in puzzles])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'.private/ambebi')
    parser.add_argument('--delay',type=float,default=2.0);parser.add_argument('--refresh',action='store_true')
    parser.add_argument('--max-pages',type=int,default=1000);parser.add_argument('--seed-first-page',type=Path)
    parser.add_argument('--publish-dir',type=Path);parser.add_argument('--permission-file',type=Path)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    if args.publish_dir:
        if not args.permission_file or not args.permission_file.exists():parser.error('Publishing requires --permission-file containing the rights holder\'s written authorization')
        permission=json.loads(args.permission_file.read_text())
        if permission.get('source')!='ambebi.ge' or permission.get('redistributionAllowed') is not True or not permission.get('evidence'):parser.error('Permission record must identify source, redistributionAllowed=true, and evidence')
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',handlers=[logging.StreamHandler(),logging.FileHandler(args.output/'scrape.log')])
    client=Client(args.output/'cache',args.delay,args.refresh)
    if args.seed_first_page:
        # Resume a previously fetched listing, without fetching it again.
        (client.cache/(hashlib.sha256(LIST_URL.format(page=1).encode()).hexdigest()+'.bin')).write_bytes(args.seed_first_page.read_bytes())
    report=dict(checkedAt=dt.datetime.now(dt.timezone.utc).isoformat(),source=ORIGIN+'/puzzle/crosswords/',termsUrl=TERMS_URL,reusePermissionEstablished=bool(args.publish_dir),robotsStatus=None,listingPages=0,advertisedTotal=None,discovered=0,extracted=0,validated=0,duplicates=0,rejected=[],errors=[],published=0,originalAnswersObtained=False)
    seen_ids=set();seen_content=set();puzzles=[]
    try:
        client.check_robots();report['robotsStatus']=client.robots_status
        page=1;num_pages=1
        while page<=num_pages and page<=args.max_pages:
            data=json.loads(client.get(LIST_URL.format(page=page)));items=data.get('results');pagination=data.get('pagination',{})
            if not isinstance(items,list):raise ValueError('Unexpected listing format')
            report['listingPages']+=1;report['advertisedTotal']=pagination.get('count');num_pages=int(pagination.get('num_pages',1))
            if num_pages>1000:raise ValueError('Unexpected pagination count')
            for raw in items:
                source_id=str(raw.get('id',''));url=f'{ORIGIN}/puzzle/crosswords/{source_id}/'
                if source_id in seen_ids:report['duplicates']+=1;continue
                seen_ids.add(source_id);report['discovered']+=1
                try:
                    p=convert(raw);report['extracted']+=1;report['originalAnswersObtained']=True
                    digest=fingerprint(p)
                    if digest in seen_content:report['duplicates']+=1;continue
                    seen_content.add(digest);report['validated']+=1;puzzles.append(p)
                    dest=args.output/(p['id']+'.json');temp=dest.with_suffix('.tmp');temp.write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n');temp.replace(dest)
                except (ValueError,TypeError,KeyError,AttributeError) as e:report['rejected'].append(dict(sourceId=source_id,url=url,reason=str(e)))
            if not items:break
            page+=1
        report['collectionExhausted']=page>num_pages
        (args.output/'index.json').write_text(json.dumps(manifest(puzzles),ensure_ascii=False,indent=2)+'\n')
        if args.publish_dir:
            args.publish_dir.mkdir(parents=True,exist_ok=True)
            for p in puzzles:shutil.copy2(args.output/(p['id']+'.json'),args.publish_dir/(p['id']+'.json'))
            # Preserve originals; rebuild_index.py combines both collections.
            report['published']=len(puzzles)
    except (Restricted,ValueError,urllib.error.URLError,TimeoutError,OSError) as e:report['errors'].append(str(e));logging.error('%s',e)
    (args.output/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps(report,ensure_ascii=False,indent=2))
    return 1 if report['errors'] else 0
if __name__=='__main__':raise SystemExit(main())
