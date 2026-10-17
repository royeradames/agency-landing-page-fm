"""Build and measure one variant from lab/variants.json. Usage: python3 lab/variant.py <index>

Variant: {name, repo, ref, patch?, routes: [...], devices?: [...], runs?: 5, env?: {...}}
The app is built and served on this runner (localhost:3000); Lighthouse measures each route.
"""
import json, os, subprocess, sys, time, urllib.request

v = json.load(open('lab/variants.json'))[int(sys.argv[1])]
lab = os.path.abspath('lab')
app = os.path.abspath('app-under-test')
env = {**os.environ, **v.get('env', {}), 'NEXT_TELEMETRY_DISABLED': '1'}
sh = lambda cmd, **kw: subprocess.run(cmd, shell=True, check=True, env=env, **kw)

sh(f"git clone -q https://github.com/royeradames/{v['repo']} {app} && git -C {app} checkout -q {v.get('ref', 'main')}")
if v.get('patch'):
    sh(f"git -C {app} apply {lab}/patches/{v['patch']}")
sh('npm ci --no-audit --no-fund --loglevel=error', cwd=app)
sh('npx next build', cwd=app)
server = subprocess.Popen('npx next start -p 3000', shell=True, cwd=app, env=env)
for _ in range(60):
    try:
        urllib.request.urlopen('http://localhost:3000/', timeout=2)
        break
    except Exception:
        time.sleep(1)

jobs = [{'id': f"{v['name']}:{r}", 'url': f'http://localhost:3000{r}', 'device': d}
        for r in v['routes'] for d in v.get('devices', ['mobile'])]
json.dump(jobs, open(f'{lab}/jobs.json', 'w'))
json.dump({'runs': v.get('runs', 5)}, open(f'{lab}/config.json', 'w'))
try:
    sh(f'python3 {lab}/run.py 0 1')
finally:
    server.terminate()
