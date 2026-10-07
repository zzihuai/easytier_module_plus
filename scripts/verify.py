#!/usr/bin/env python3
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ZIP = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'EasyTier-Magisk-v2.6.4-module-ui4.zip'
REQUIRED = [
    'module.prop', 'customize.sh', 'service.sh', 'action.sh', 'uninstall.sh',
    'common.sh', 'control.sh', 'easytier-core', 'easytier-cli',
    'easytier_core.sh', 'hotspot_iprule.sh',
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
    forbidden = [name for name in names if name in {
        'easytier-web', 'easytier_web.sh', 'disable_web', 'web.log',
        'config/web_port', 'config/config_server_port', 'config/config_server_protocol',
    } or name.startswith('config/web/')]
    if forbidden:
        raise SystemExit('removed Web files remain in zip: ' + ', '.join(sorted(forbidden)))
    mismatched = [
        name for name in names
        if (ROOT / 'module' / name).is_file()
        and z.read(name) != (ROOT / 'module' / name).read_bytes()
    ]
    if mismatched:
        raise SystemExit('zip contents differ from module source: ' + ', '.join(sorted(mismatched)))
    for name in ['easytier-core', 'easytier-cli', 'control.sh', 'service.sh']:
        mode = (z.getinfo(name).external_attr >> 16) & 0o777
        if mode != 0o755:
            raise SystemExit(f'{name} mode is {oct(mode)}, expected 0o755')

for path in sorted((ROOT / 'module').glob('*.sh')) + [ROOT / 'module/META-INF/com/google/android/update-binary']:
    subprocess.run(['sh', '-n', str(path)], check=True)

with tempfile.TemporaryDirectory(prefix='easytier-verify-') as temporary_directory:
    temporary_module = pathlib.Path(temporary_directory)
    shutil.copy2(ROOT / 'module/common.sh', temporary_module / 'common.sh')
    shutil.copy2(ROOT / 'module/control.sh', temporary_module / 'control.sh')
    (temporary_module / 'config').mkdir()
    (temporary_module / 'module.prop').write_text('version=test\n', encoding='utf-8')
    status = subprocess.run(
        ['sh', str(temporary_module / 'control.sh'), 'status'],
        text=True, capture_output=True, check=True,
    )
    if json.loads(status.stdout)['config_state'] != 'missing':
        raise SystemExit('isolated status smoke test did not report missing config')

print('OK')
