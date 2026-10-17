"""Run Lighthouse for one shard of lab/jobs.json. Usage: python3 lab/run.py <shard> <shards>.

Each cell runs `runs` times (lab/config.json) in a fresh headless Chrome. Writes out/<slug>-<device>-<n>.json
with scores, metrics, the LCP element and failing audits, plus the gzipped full report.
"""
import gzip, json, os, re, subprocess, sys, time

shard, shards = int(sys.argv[1]), int(sys.argv[2])
config = json.load(open('lab/config.json'))
jobs = [j for i, j in enumerate(json.load(open('lab/jobs.json'))) if i % shards == shard]
os.makedirs('out', exist_ok=True)
CATS = ['performance', 'accessibility', 'best-practices', 'seo']
METRICS = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index']


def summarize(job, n, lhr):
    rec = {**job, 'run': n, 'lighthouse': lhr['lighthouseVersion'], 'finalUrl': lhr['finalDisplayedUrl'],
           'runtimeError': (lhr.get('runtimeError') or {}).get('code'), 'runWarnings': lhr.get('runWarnings'),
           'benchmarkIndex': lhr['environment']['benchmarkIndex'],
           'scores': {c: None if lhr['categories'].get(c, {}).get('score') is None else round(lhr['categories'][c]['score'] * 100) for c in CATS},
           'metrics': {m: lhr['audits'].get(m, {}).get('numericValue') for m in METRICS}}
    lcp = json.dumps(lhr['audits'].get('largest-contentful-paint-element', {}).get('details') or lhr['audits'].get('lcp-breakdown-insight', {}).get('details') or {})
    m = re.search(r'"snippet": "(.*?)(?<!\\)"', lcp)
    rec['lcp'] = m.group(1)[:300] if m else None
    phases = re.findall(r'"subpart": "(\w+)", "label": "[^"]*", "duration": ([\d.]+)', lcp)
    rec['lcpPhases'] = {k: round(float(v)) for k, v in phases}
    rec['failing'] = []
    for c in CATS:
        for ref in lhr['categories'].get(c, {}).get('auditRefs', []):
            a = lhr['audits'].get(ref['id'])
            if ref['weight'] > 0 and a and a.get('score') is not None and a['score'] < 1:
                items = (a.get('details') or {}).get('items') or []
                rec['failing'].append({'cat': c, 'id': ref['id'], 'score': a['score'], 'display': a.get('displayValue'),
                                       'items': [(i.get('node') or {}).get('snippet') or i.get('url') for i in items[:6] if isinstance(i, dict)]})
    return rec


for job in jobs:
    slug = re.sub(r'[^a-z0-9]+', '_', job['id'], flags=re.I).strip('_')
    for n in range(1, config['runs'] + 1):
        path = f"out/{slug}-{job['device']}-{n}"
        cmd = ['lighthouse', job['url'], '--output=json', f'--output-path={path}.lhr.json', '--quiet',
               '--only-categories=' + ','.join(CATS), '--max-wait-for-load=45000',
               '--chrome-flags=--headless=new --no-sandbox --disable-gpu']
        if job['device'] == 'desktop':
            cmd.append('--preset=desktop')
        t = time.time()
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=240)
        try:
            lhr = json.load(open(f'{path}.lhr.json'))
            rec = summarize(job, n, lhr)
            with gzip.open(f'{path}.lhr.json.gz', 'wt') as f:
                json.dump(lhr, f)
            os.remove(f'{path}.lhr.json')
        except Exception as e:  # keep going; record the failure
            rec = {**job, 'run': n, 'error': f'{e} {proc.stderr[-1500:]}'}
        rec['seconds'] = round(time.time() - t, 1)
        json.dump(rec, open(f'{path}.json', 'w'), indent=1)
        print(job['id'], job['device'], n, rec.get('scores') or rec.get('error', '')[:200], flush=True)
