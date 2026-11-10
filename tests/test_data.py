import copy, json, sys, tempfile, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from validator import validate,validate_directory
from scraper import convert,fingerprint,manifest,Client,Restricted
ROOT=Path(__file__).resolve().parents[1]

class DataTests(unittest.TestCase):
    def setUp(self):
        self.p=json.loads((ROOT/'data/puzzles/original-002.json').read_text())
        self.raw={'id':999,'name':'ორიგინალური სატესტო ბადე','dimensions':{'rows':self.p['grid']['rows'],'cols':self.p['grid']['cols']},'entries':[{'number':c['number'],'clue':c['clue'],'direction':c['direction'],'position':{'x':c['col'],'y':c['row']},'length':len(c['answer']),'solution':c['answer']} for c in self.p['clues']]}
    def test_shipped_collection(self):
        report=validate_directory(ROOT/'data/puzzles');self.assertEqual(report['validated'],20);self.assertEqual(report['rejected'],[])
    def test_source_adapter_preserves_positions_answers_numbering(self):
        p=convert(self.raw);self.assertEqual(p['clues'],self.p['clues']);self.assertEqual(p['grid'],self.p['grid']);self.assertEqual(p['source']['sourceId'],'999')
    def test_source_detail_wrapper(self):self.assertEqual(convert({'crossword':self.raw})['id'],'ambebi-999')
    def test_source_missing_answer(self):
        self.raw['entries'][0].pop('solution')
        with self.assertRaises(ValueError):convert(self.raw)
    def test_source_invalid_length(self):
        self.raw['entries'][0]['length']=999
        with self.assertRaisesRegex(ValueError,'length'):convert(self.raw)
    def test_source_invalid_direction(self):
        self.raw['entries'][0]['direction']='diagonal'
        with self.assertRaises(ValueError):convert(self.raw)
    def test_source_dedup_fingerprint_ignores_id_and_date(self):
        a=convert(self.raw);self.raw['id']=1000;b=convert(self.raw);self.assertEqual(fingerprint(a),fingerprint(b))
    def test_conflicting_intersection(self):
        p=self.p;p['clues'][0]['answer']='ჰ'*len(p['clues'][0]['answer'])
        with self.assertRaisesRegex(ValueError,'intersection'):validate(p)
    def test_blocked_answer(self):
        c=self.p['clues'][0];self.p['grid']['blocked'].append([c['row'],c['col']])
        with self.assertRaisesRegex(ValueError,'blocked'):validate(self.p)
    def test_duplicate_clue(self):
        self.p['clues'].append(copy.deepcopy(self.p['clues'][0]))
        with self.assertRaisesRegex(ValueError,'duplicate'):validate(self.p)
    def test_invalid_numbering(self):
        self.p['clues'][0]['number']=900
        with self.assertRaisesRegex(ValueError,'numbering'):validate(self.p)
    def test_blank_required_cell(self):
        self.p['grid']['blocked'].pop()
        with self.assertRaisesRegex(ValueError,'empty required'):validate(self.p)
    def test_non_georgian_answer(self):
        self.p['clues'][0]['answer']='ABC'
        with self.assertRaisesRegex(ValueError,'Georgian'):validate(self.p)
    def test_manifest_counts(self):
        p=convert(self.raw);m=manifest([p]);self.assertEqual(m['puzzles'][0]['cellCount'],validate(p)['cells'])
    def test_cache_resume_does_not_request_network(self):
        import hashlib
        with tempfile.TemporaryDirectory() as d:
            c=Client(d);url='https://www.ambebi.ge/api/puzzle/crosswords/?page=1&token=tkn';Path(d,hashlib.sha256(url.encode()).hexdigest()+'.bin').write_bytes(b'{"cached":true}')
            self.assertEqual(c.get(url),b'{"cached":true}')
    def test_off_origin_requests_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(Restricted):Client(d).get('https://example.org/')
    def test_robots_disallow_checked_before_cache(self):
        import urllib.robotparser
        with tempfile.TemporaryDirectory() as d:
            c=Client(d);c.robot=urllib.robotparser.RobotFileParser();c.robot.parse(['User-agent: *','Disallow: /api/'])
            with self.assertRaises(Restricted):c.get('https://www.ambebi.ge/api/puzzle/crosswords/')

if __name__=='__main__':unittest.main()
