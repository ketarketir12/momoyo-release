"""Uji pemasang dan server MOMOYO Live. Dijalankan setelah tools/build.py.

Di Windows (CI) uji ini memakai exe asli, Python bawaan paket, registri, dan shortcut.
Di Linux (uji lokal, butuh mono) bagian khusus Windows dilewati.
Catatan: pemasang berjenis winexe, jadi hasil uji hanya memakai kode keluar dan isi folder,
bukan teks di konsol.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
SETUP = DIST / f'MOMOYO-Live-Setup-{VERSION}-win-x64.exe'
WINDOWS = sys.platform == 'win32'
KEY = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\MOMOYO Live'
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
results = []


def check(name, condition, detail=''):
    results.append((name, bool(condition)))
    print(('LULUS  ' if condition else 'GAGAL  ') + name + (f'  [{detail}]' if detail and not condition else ''))


def run(exe, *args):
    command = ([] if WINDOWS else ['mono']) + [str(exe), *args]
    return subprocess.run(command, capture_output=True, text=True, timeout=180).returncode


def health():
    try:
        with OPENER.open('http://127.0.0.1:8766/api/health', timeout=1) as response:
            return json.load(response)
    except Exception:
        return None


def wait_health(present, seconds=15):
    end = time.time() + seconds
    while time.time() < end:
        if bool(health()) == present:
            return True
        time.sleep(.3)
    return False


def registry_version():
    if not WINDOWS:
        return None
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY) as key:
            return winreg.QueryValueEx(key, 'DisplayVersion')[0]
    except OSError:
        return None


def main():
    if not SETUP.exists():
        sys.exit(f'{SETUP} belum ada. Jalankan tools/build.py dulu.')
    if health():
        sys.exit('Port 8766 sedang dipakai MOMOYO lain. Hentikan dulu sebelum menguji.')
    temp = Path(tempfile.mkdtemp(prefix='momoyo-test-')).resolve()  # path panjang, bukan RUNNER~1
    target = temp / 'MOMOYO'
    menu = temp / 'menu'
    flags = [f'/dir:{target}', f'/startmenu:{menu}', '/nolaunch']
    server = None
    try:
        # 1. pasang bersih
        check('pasang bersih: kode keluar 0', run(SETUP, '/S', *flags) == 0)
        for name in ('launcher.py', 'server.py', '.momoyo-install', 'MOMOYO.ico', 'Uninstall MOMOYO Live.exe',
                     'python/python.exe', 'python/pythonw.exe', 'index.html'):
            check(f'pasang bersih: ada {name}', (target / name).exists())
        check('pasang bersih: VERSION.txt memuat versi', VERSION in (target / 'VERSION.txt').read_text(encoding='utf-8'))
        check('pasang bersih: GITHUB-REPO.txt terisi', '/' in (target / 'GITHUB-REPO.txt').read_text(encoding='utf-8'))
        if WINDOWS:
            check('Windows: shortcut MOMOYO Live', (menu / 'MOMOYO Live.lnk').exists())
            check('Windows: shortcut Tutup MOMOYO Live', (menu / 'Tutup MOMOYO Live.lnk').exists())
            check('Windows: registri DisplayVersion', registry_version() == VERSION, str(registry_version()))

        # 2. upgrade mempertahankan data dan membuang sisa pembaruan otomatis
        (target / 'data').mkdir(exist_ok=True)
        (target / 'data' / 'giveaway-state.json').write_text('{"p":1}', encoding='utf-8')
        (target / 'active.json').write_text('{"directory":"1.0.0-abcdef12","version":"1.0.0"}', encoding='utf-8')
        (target / 'versions').mkdir(exist_ok=True)
        check('upgrade: kode keluar 0', run(SETUP, '/S', *flags) == 0)
        check('upgrade: data tetap', (target / 'data' / 'giveaway-state.json').read_text(encoding='utf-8') == '{"p":1}')
        check('upgrade: active.json dibuang', not (target / 'active.json').exists())
        check('upgrade: versions dibuang', not (target / 'versions').exists())

        # 3. versi terpasang lebih baru: pemasang menolak, /force meloloskan
        (target / 'active.json').write_text('{"directory":"99.0.0-abcdef12","version":"99.0.0"}', encoding='utf-8')
        check('downgrade ditolak (kode keluar != 0)', run(SETUP, '/S', *flags) != 0)
        check('downgrade ditolak: active.json tetap', (target / 'active.json').exists())
        check('downgrade dengan /force berhasil', run(SETUP, '/S', '/force', *flags) == 0)

        # 4. server dari folder pemasangan dihentikan saat upgrade
        python = target / 'python' / 'python.exe' if WINDOWS else Path(sys.executable)
        env = dict(os.environ, MOMOYO_HOME=str(target), MOMOYO_DATA=str(target / 'data'))
        server = subprocess.Popen([str(python), '-u', str(target / 'server.py')], cwd=target, env=env,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        check('server: berjalan dan melapor versi', wait_health(True) and health().get('version') == VERSION,
              str(health()))
        info = health() or {}
        check('server: operatorActive false saat belum ada panel', info.get('operatorActive') is False)
        check('upgrade saat server berjalan: kode keluar 0', run(SETUP, '/S', *flags) == 0)
        check('upgrade menghentikan server', wait_health(False))
        server.wait(timeout=10)
        server = None

        # 5. uninstall: pagar pengaman, simpan data, pasang ulang, hapus data
        other = temp / 'lain'
        other.mkdir()
        (other / 'a.txt').write_text('x', encoding='utf-8')
        check('uninstall menolak folder tanpa penanda', run(target / 'Uninstall MOMOYO Live.exe', '/S', f'/dir:{other}') != 0
              and (other / 'a.txt').exists())
        check('pasang menolak folder asing', run(SETUP, '/S', f'/dir:{other}', f'/startmenu:{menu}') != 0
              and (other / 'a.txt').exists())
        check('uninstall simpan data: kode keluar 0',
              run(target / 'Uninstall MOMOYO Live.exe', '/S', '/keepdata', f'/dir:{target}', f'/startmenu:{menu}') == 0)
        time.sleep(1)
        left = sorted(p.name for p in target.iterdir()) if target.exists() else []
        check('uninstall simpan data: hanya data tersisa', set(left) <= {'data', 'giveaway-state.json', 'podium-state.json', 'launcher.log'}, str(left))
        check('uninstall simpan data: data ada', (target / 'data' / 'giveaway-state.json').exists())
        if WINDOWS:
            check('Windows: registri dihapus', registry_version() is None)
            check('Windows: shortcut dihapus', not (menu / 'MOMOYO Live.lnk').exists())
        check('pasang ulang di atas sisa data: kode keluar 0', run(SETUP, '/S', *flags) == 0)
        check('pasang ulang: data tetap', (target / 'data' / 'giveaway-state.json').exists())
        check('uninstall hapus data: kode keluar 0',
              run(target / 'Uninstall MOMOYO Live.exe', '/S', '/deletedata', f'/dir:{target}', f'/startmenu:{menu}') == 0)
        time.sleep(1)
        check('uninstall hapus data: folder hilang', not target.exists())
    finally:
        if server and server.poll() is None:
            server.kill()
        shutil.rmtree(temp, ignore_errors=True)
    failed = [name for name, ok in results if not ok]
    print(f'\n{len(results) - len(failed)} lulus, {len(failed)} gagal')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
