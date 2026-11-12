"""Local OBS relay. Standard library only; bind to this computer only."""
import json
import os
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import updater

VERSION = '1.4.23'
HOME = Path(os.environ.get('MOMOYO_HOME', ROOT))
DATA_DIR = Path(os.environ.get('MOMOYO_DATA', ROOT))
DATA = DATA_DIR / 'giveaway-state.json'
PODIUM_DATA = DATA_DIR / 'podium-state.json'
update_lock = threading.Lock()
release = None
PODIUM_ASSETS = ('podium.html', 'podium.css', 'podium-view.js', 'podium-operator.js',
                 'podium-plaques-kv.png',
                 'vendor/open-props.min.css', 'vendor/motion.js', 'vendor/arrow-up.svg',
                 'vendor/arrow-down.svg', 'vendor/eye.svg', 'vendor/eye-off.svg',
                 'vendor/send.svg', 'vendor/eraser.svg')
lock = threading.Lock()
# Only ONE operator page may drive the overlay. A second tab would overwrite the
# shared frame every 100 ms and make OBS flip between two different states.
owner = {'id': None, 'seen': 0.0}
OWNER_TIMEOUT = 4.0
WATCHED = ('overlay.html', 'overlay.js', 'momoyo-theme.css', 'peach-stage.css', 'campaign-type.css')
ROULETTE_LITE_ASSET = '/roulette-lite-winner.png'

def build_id():
    try:
        return str(max((ROOT / name).stat().st_mtime_ns // 1000000 for name in WATCHED))
    except OSError:
        return '0'
state = None
frame = None
# Last view each kind of overlay page confirmed it rendered. Only a page inside OBS (window.obsstudio) counts as 'obs'.
overlay_acks = {'obs': None, 'browser': None}
httpd = None
EXIT_GRACE = float(os.environ.get('MOMOYO_EXIT_GRACE', '8'))
exit_watch = {'timer': None, 'helper': None}
exit_lock = threading.Lock()


def spawn_confirm_exit():
    """Tampilkan dialog konfirmasi (di luar browser) setelah jendela panel ditutup."""
    launcher = HOME / 'launcher.py'
    if not launcher.exists():
        return
    executable = Path(sys.executable)
    windowless = executable.with_name('pythonw.exe')
    if windowless.exists():
        executable = windowless
    exit_watch['helper'] = subprocess.Popen(
        [str(executable), str(launcher), '--confirm-exit'], cwd=HOME,
        env=dict(os.environ, MOMOYO_HOME=str(HOME)), stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def check_exit():
    with lock:
        back = owner['id'] is not None and time.monotonic() - owner['seen'] <= OWNER_TIMEOUT
    if back:
        return  # panel dimuat ulang atau dibuka lagi
    helper = exit_watch['helper']
    if helper is not None and helper.poll() is None:
        return
    try:
        spawn_confirm_exit()
    except OSError:
        pass


def arm_exit_watch():
    """Dipanggil saat panel operator ditutup. Beri jeda singkat agar muat ulang tidak memicu dialog."""
    if os.environ.get('MOMOYO_CONFIRM_EXIT') == '0':
        return
    with exit_lock:
        if exit_watch['timer'] is not None:
            exit_watch['timer'].cancel()
        timer = threading.Timer(EXIT_GRACE, check_exit)
        timer.daemon = True
        exit_watch['timer'] = timer
        timer.start()

podium = {'entries': [], 'visible': False}
celebration = None
try:
    podium = json.loads(PODIUM_DATA.read_text(encoding='utf-8'))
except (OSError, ValueError):
    pass
try:
    state = json.loads(DATA.read_text(encoding='utf-8'))
except (OSError, ValueError):
    pass

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_):
        pass

    def end_headers(self):
        # Never let OBS/Chrome reuse stale JS or CSS between versions.
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def json_response(self, value, status=200, extra=None):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        for key, header in (extra or {}).items():
            self.send_header(key, header)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host') != '127.0.0.1:8766':
            self.send_error(403)
            return
        if self.path == '/api/health':
            active = owner['id'] is not None and time.monotonic() - owner["seen"] <= OWNER_TIMEOUT
            self.json_response({'app': 'momoyo-obs-v2', 'version': VERSION, 'root': str(ROOT), 'pid': os.getpid(), 'operatorActive': active})
        elif self.path == '/api/update-status':
            try:
                status = json.loads((HOME / 'update-status.json').read_text(encoding='utf-8'))
            except (OSError, ValueError):
                status = {'state': 'idle'}
            self.json_response(status)
        elif self.path == '/api/overlay-status':
            now = time.monotonic()
            with lock:
                shown = {kind: ({'view': ack['view'], 'age': round(now - ack['seen'], 1)} if ack else None)
                         for kind, ack in overlay_acks.items()}
            self.json_response(shown)
        elif self.path == '/api/state':
            with lock:
                self.json_response(state)
        elif self.path == '/api/frame':
            with lock:
                self.json_response(frame, extra={'X-Build': build_id()})
        elif self.path == '/api/podium':
            with lock:
                self.json_response({**podium, 'celebration': celebration})
        elif self.path.split('?')[0] in tuple('/' + name for name in PODIUM_ASSETS) + (ROULETTE_LITE_ASSET, '/', '/index.html', '/campaign-type.css', '/Fredoka.ttf', '/peach-stage.css', '/peach-stage-v1.png', '/momoyo-theme.css', '/app.js', '/announcement.js', '/obs-bridge.js', '/overlay.html', '/overlay.js', '/control-center.js', '/setup-guide.png'):
            super().do_GET()
        else:
            self.send_error(404)

    def do_POST(self):
        global state, frame, podium, celebration
        if self.path in ('/api/releases/check', '/api/releases/download', '/api/releases/install'):
            if (self.headers.get('Host') != '127.0.0.1:8766'
                    or self.headers.get('Origin') != 'http://127.0.0.1:8766'
                    or self.headers.get('Content-Type') != 'application/json'):
                self.send_error(403)
                return
            self.handle_release()
            return
        if self.path == '/api/shutdown':
            if (self.headers.get('Host') != '127.0.0.1:8766'
                    or self.headers.get('Origin') != 'http://127.0.0.1:8766'
                    or self.headers.get('Content-Type') != 'application/json'):
                self.send_error(403)
                return
            self.json_response({'ok': True})
            if httpd is not None:
                threading.Thread(target=httpd.shutdown, daemon=True).start()
            return
        if self.path == '/api/overlay-ack':
            if (self.headers.get('Host') != '127.0.0.1:8766'
                    or self.headers.get('Origin') != 'http://127.0.0.1:8766'
                    or self.headers.get('Content-Type') != 'application/json'):
                self.send_error(403)
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2000:
                    raise ValueError('Request too large')
                ack = json.loads(self.rfile.read(size))
                view = ack['view']
                if not isinstance(view, str) or len(view) > 300 or type(ack['obs']) is not bool:
                    raise ValueError('Invalid acknowledgement')
                with lock:
                    overlay_acks['obs' if ack['obs'] else 'browser'] = {'view': view, 'seen': time.monotonic()}
                self.json_response({'ok': True})
            except (ValueError, KeyError, TypeError):
                self.send_error(400)
            return
        if (self.path != '/api/update' or self.headers.get('Host') != '127.0.0.1:8766'
                or self.headers.get('Origin') != 'http://127.0.0.1:8766'
                or self.headers.get('Content-Type') != 'application/json'):
            self.send_error(403)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 20_000_000:
                raise ValueError('Request too large')
            update = json.loads(self.rfile.read(size))
            client = update.get('client')
            if not isinstance(client, str) or not 8 <= len(client) <= 64:
                raise ValueError('Missing client id')
            with lock:
                if update.get('release') is True:
                    # Tab is closing or reloading: free the operator seat immediately.
                    if owner['id'] == client:
                        owner['id'] = None
                        arm_exit_watch()
                    self.json_response({'ok': True})
                    return
                now = time.monotonic()
                if not (owner['id'] in (None, client) or now - owner['seen'] > OWNER_TIMEOUT or update.get('takeover') is True):
                    self.json_response({'ok': False, 'owner': False}, 409)
                    return
                owner['id'], owner['seen'] = client, now
                if update.get('claim') is True:
                    self.json_response({'ok': True})
                    return
                if 'podium' in update:
                    incoming = update['podium']
                    entries = incoming['entries']
                    visible = incoming['visible']
                    design = incoming.get('design', podium.get('design', 'right'))
                    if design not in ('right', 'left', 'center'):
                        raise ValueError('Invalid podium design')
                    if type(visible) is not bool or not isinstance(entries, list) or len(entries) > 3:
                        raise ValueError('Invalid podium')
                    ids = set()
                    names = set()
                    for entry in entries:
                        entry_id, name = entry['id'], entry['name']
                        if (not isinstance(entry_id, str) or not 1 <= len(entry_id) <= 64
                                or not isinstance(name, str) or not 1 <= len(name.strip()) <= 64
                                or entry_id in ids or name.strip().casefold() in names):
                            raise ValueError('Invalid podium entry')
                        ids.add(entry_id)
                        names.add(name.strip().casefold())
                    saved = {'entries': entries, 'visible': visible, 'design': design}
                    promotion_id = update.get('celebratePromotion')
                    if promotion_id is not None and (not isinstance(promotion_id, str)
                                                     or not 1 <= len(promotion_id) <= 64):
                        raise ValueError('Invalid celebration ID')
                    old_leader = next(iter(podium['entries']), {}).get('id')
                    new_leader = next(iter(entries), {}).get('id')
                    promoted = visible and new_leader and old_leader and new_leader != old_leader
                    tmp = PODIUM_DATA.with_suffix('.tmp')
                    tmp.write_text(json.dumps(saved, ensure_ascii=False), encoding='utf-8')
                    os.replace(tmp, PODIUM_DATA)
                    podium = saved
                    if promotion_id and promoted:
                        celebration = {'id': promotion_id, 'winner': new_leader, 'at': time.time()}
                    elif not visible or not celebration or celebration['winner'] != new_leader:
                        celebration = None
                    self.json_response({'ok': True, 'design': podium['design']})
                    return
                if 'celebrate' in update:
                    event_id = update['celebrate']
                    if not isinstance(event_id, str) or not 1 <= len(event_id) <= 64:
                        raise ValueError('Invalid celebration ID')
                    if not podium['visible'] or not podium['entries']:
                        self.json_response({'ok': False}, 400)
                        return
                    if not celebration or celebration['id'] != event_id:
                        celebration = {'id': event_id, 'winner': podium['entries'][0]['id'], 'at': time.time()}
                    self.json_response({'ok': True})
                    return
                if 'state' in update:
                    incoming = update['state']
                    if not isinstance(incoming, dict) or not all(isinstance(incoming.get(k), list) for k in ('names', 'prizes', 'history')):
                        raise ValueError('Invalid state')
                    tmp = DATA.with_suffix('.tmp')
                    tmp.write_text(json.dumps(incoming, ensure_ascii=False), encoding='utf-8')
                    os.replace(tmp, DATA)
                    state = incoming
                frame = update['frame']
            self.json_response({'ok': True})
        except (ValueError, KeyError, TypeError, OSError):
            self.send_error(400)

    def handle_release(self):
        global release
        if not update_lock.acquire(blocking=False):
            self.json_response({'message': 'Pembaruan lain sedang diproses.'}, 409)
            return
        try:
            status_path = HOME / 'update-status.json'
            staged_path = HOME / 'staged.json'
            if status_path.exists() and json.loads(status_path.read_text(encoding='utf-8')).get('state') == 'installing':
                raise ValueError('Pemasangan sedang berjalan.')
            if self.path.endswith('/check'):
                release = updater.latest(HOME, VERSION)
                public = {k: release[k] for k in ('version', 'notes')} if release else None
                self.json_response({'release': public})
            elif self.path.endswith('/download'):
                if not release:
                    raise ValueError('Cek pembaruan terlebih dahulu.')
                staged = updater.stage(HOME, release)
                updater.write_json(staged_path, staged)
                self.json_response({'version': staged['version']})
            else:
                if not staged_path.exists():
                    raise ValueError('Unduh pembaruan terlebih dahulu.')
                staged = json.loads(staged_path.read_text(encoding='utf-8'))
                if updater.version(staged['version']) <= updater.version(VERSION):
                    raise ValueError('Versi unduhan sudah aktif atau lebih lama.')
                with lock:
                    if frame and frame.get('busy'):
                        raise ValueError('Tunggu sampai pengumuman selesai.')
                updater.write_json(status_path, {'state': 'installing'})
                try:
                    subprocess.Popen([sys.executable, str(HOME / 'launcher.py'), '--apply-update'],
                                     cwd=HOME, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                     stderr=subprocess.DEVNULL,
                                     creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
                except OSError:
                    updater.write_json(status_path, {'state': 'error', 'message': 'Launcher gagal dibuka.'})
                    raise
                self.json_response({'ok': True})
        except FileNotFoundError:
            self.json_response({'message': 'Isi GITHUB-REPO.txt dengan pemilik/nama-repo GitHub Releases publik.'}, 400)
        except (OSError, ValueError, KeyError) as error:
            self.json_response({'message': str(error)}, 400)
        finally:
            update_lock.release()


class ExclusiveServer(ThreadingHTTPServer):
    allow_reuse_address = False
    def server_bind(self):
        if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

def sync_registry():
    """Samakan versi di Pengaturan > Aplikasi dengan versi server yang berjalan (mis. setelah pembaruan satu tombol)."""
    if sys.platform != 'win32':
        return
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r'Software\Microsoft\Windows\CurrentVersion\Uninstall\MOMOYO Live', 0,
                            winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
            if Path(winreg.QueryValueEx(key, 'InstallLocation')[0]).resolve() == HOME.resolve():
                winreg.SetValueEx(key, 'DisplayVersion', 0, winreg.REG_SZ, VERSION)
    except Exception:
        pass


if __name__ == '__main__':
    print('MOMOYO OBS siap. Biarkan jendela ini tetap terbuka.\nOperator: http://127.0.0.1:8766/\nOBS: http://127.0.0.1:8766/overlay.html')
    httpd = ExclusiveServer(('127.0.0.1', 8766), Handler)
    sync_registry()
    httpd.serve_forever()







