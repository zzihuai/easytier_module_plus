#!/usr/bin/env python3
import json
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ZIP = ROOT / 'dist' / 'EasyTier-Magisk-v2.6.4-webui1.zip'
REQUIRED = [
    'module.prop', 'customize.sh', 'service.sh', 'action.sh', 'uninstall.sh',
    'common.sh', 'control.sh', 'easytier-core', 'easytier-cli', 'easytier-web',
    'easytier_core.sh', 'easytier_web.sh', 'hotspot_iprule.sh',
    'config/config.toml', 'config/command_args_sample',
    'webroot/index.html', 'webroot/style.css', 'webroot/app.js', 'webroot/kernelsu.js',
    'META-INF/com/google/android/update-binary',
    'META-INF/com/google/android/updater-script',
]

if not ZIP.exists():
    raise SystemExit(f'missing zip: {ZIP}')

with zipfile.ZipFile(ZIP) as z:
    bad = z.testzip()
    if bad is not None:
        raise SystemExit(f'bad zip entry: {bad}')
    names = set(z.namelist())
    missing = [x for x in REQUIRED if x not in names]
    if missing:
        raise SystemExit('missing zip entries: ' + ', '.join(missing))
    for name in ['easytier-core', 'easytier-cli', 'easytier-web', 'control.sh', 'service.sh']:
        mode = (z.getinfo(name).external_attr >> 16) & 0o777
        if mode != 0o755:
            raise SystemExit(f'{name} mode is {oct(mode)}, expected 0o755')

for path in sorted((ROOT / 'module').glob('*.sh')) + [ROOT / 'module/META-INF/com/google/android/update-binary']:
    subprocess.run(['sh', '-n', str(path)], check=True)

status = subprocess.run(['sh', str(ROOT / 'module/control.sh'), 'status'], cwd=ROOT, text=True, capture_output=True, check=True)
json.loads(status.stdout)

print('OK')
