"""One-click operator launcher; starts the local relay without a console window."""
import ctypes
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from updater import write_json

URL = 'http://127.0.0.1:8766/'
LOCAL_HTTP = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def health():
    try:
        with LOCAL_HTTP.open(URL + 'api/health', timeout=.5) as response:
            info = json.load(response)
            return info if info.get('app') == 'momoyo-obs-v2' else None
    except Exception:
        return None

def ready(directory, expected=None):
    info = health()
    return bool(info and Path(info.get('root', '')).resolve() == directory
                and (expected is None or info.get('version') == expected))

class Cancelled(Exception):
    """Operator memilih tidak mengganti sesi MOMOYO yang sedang berjalan."""


def yes_no(message, warn=False):
    """Dialog Ya/Tidak; tombol bawaan = Tidak (aman)."""
    if os.environ.get('MOMOYO_ASSUME_YES') == '1':
        return True
    if os.environ.get('MOMOYO_ASSUME_NO') == '1':
        return False
    if sys.platform == 'win32':
        icon = 0x30 if warn else 0x20
        return ctypes.windll.user32.MessageBoxW(0, message, 'MOMOYO', 0x4 | icon | 0x100) == 6
    print(message)
    return False


def browser_path():
    """Cari Edge atau Chrome untuk membuka panel sebagai jendela aplikasi."""
    if sys.platform != 'win32':
        return None
    try:
        import winreg
        for name in ('msedge.exe', 'chrome.exe'):
            for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
                try:
                    with winreg.OpenKey(hive, r'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths' + '\\' + name) as key:
                        path = winreg.QueryValueEx(key, None)[0]
                        if path and Path(path).exists():
                            return path
                except OSError:
                    continue
    except Exception:
        pass
    for base in (os.environ.get('ProgramFiles(x86)'), os.environ.get('ProgramFiles'), os.environ.get('LocalAppData')):
        for relative in (r'Microsoft\Edge\Application\msedge.exe', r'Google\Chrome\Application\chrome.exe'):
            if base and (Path(base) / relative).exists():
                return str(Path(base) / relative)
    return None


def open_panel():
    """Buka panel operator sebagai jendela aplikasi; kembali ke tab browser bila Edge/Chrome tidak ditemukan."""
    executable = None if os.environ.get('MOMOYO_APP_WINDOW') == '0' else browser_path()
    if executable:
        try:
            subprocess.Popen([executable, '--app=' + URL, '--window-size=1366,900'],
                             stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=getattr(subprocess, 'DETACHED_PROCESS', 0))
            return
        except OSError:
            pass
    webbrowser.open(URL)


def overlay_connected():
    try:
        with LOCAL_HTTP.open(URL + 'api/overlay-status', timeout=.5) as response:
            obs = json.load(response).get('obs')
            return bool(obs and obs.get('age', 999) < 15)
    except Exception:
        return False


def confirm_exit():
    """Panel ditutup: tanya apakah MOMOYO dimatikan atau panel dibuka lagi."""
    info = health()
    if not info:
        return
    running = Path(info.get('root', '')).resolve()
    if running != ROOT and running.parent != ROOT / 'versions':
        return
    if info.get('operatorActive'):
        return
    live = overlay_connected()
    message = ('Jendela panel MOMOYO ditutup.\n\nMatikan MOMOYO sekarang?\n\n'
               'Ya: MOMOYO dimatikan.\nTidak: panel dibuka lagi.')
    if live:
        message += ('\n\nPERHATIAN: OBS masih memuat overlay MOMOYO. Jika sedang LIVE, '
                    'mematikan MOMOYO akan mengosongkan overlay di layar.')
    if yes_no(message, warn=live):
        stop()
    else:
        open_panel()


def ask_replace(info):
    where = info.get('root') or '(lokasi tidak diketahui)'
    version = info.get('version') or '?'
    message = ('MOMOYO versi ' + str(version) + ' sedang berjalan dari:\n' + str(where) + '\n\n'
               'Hentikan sesi itu dan buka MOMOYO dari paket ini?')
    if info.get('operatorActive'):
        message += ('\n\nPERHATIAN: Panel operator sedang terbuka di sesi tersebut. '
                    'Jika sedang LIVE, menghentikannya akan memutus kontrol dan overlay. '
                    'Lanjutkan hanya jika giveaway tidak sedang berlangsung.')
    if os.environ.get('MOMOYO_ASSUME_YES') == '1':
        return True
    if sys.platform == 'win32':
        # MB_YESNO | MB_ICONQUESTION (atau MB_ICONWARNING saat operator aktif) | MB_DEFBUTTON2
        icon = 0x30 if info.get('operatorActive') else 0x20
        return ctypes.windll.user32.MessageBoxW(0, message, 'MOMOYO', 0x4 | icon | 0x100) == 6
    print(message)
    return False


def sync_registry(version):
    """Samakan DisplayVersion di Pengaturan > Aplikasi dengan versi yang benar-benar aktif."""
    if sys.platform != 'win32' or not version:
        return
    try:
        import winreg
        key_path = r'Software\Microsoft\Windows\CurrentVersion\Uninstall\MOMOYO Live'
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path, 0,
                            winreg.KEY_READ | winreg.KEY_SET_VALUE) as key:
            location = winreg.QueryValueEx(key, 'InstallLocation')[0]
            if Path(location).resolve() == ROOT:
                winreg.SetValueEx(key, 'DisplayVersion', 0, winreg.REG_SZ, str(version))
    except Exception:
        pass


def notify(message, icon=0x40):
    if sys.platform == 'win32':
        ctypes.windll.user32.MessageBoxW(0, message, 'MOMOYO', icon)
    else:
        print(message)

def stop(allow_other_folder=False):
    info = health()
    if not info:
        return
    running = Path(info['root']).resolve()
    if not allow_other_folder and running != ROOT and running.parent != ROOT / 'versions':
        raise RuntimeError('MOMOYO dari folder lain memakai port 8766. Hentikan dari folder tersebut.')
    pid = int(info['pid'])
    if pid <= 0:
        raise RuntimeError('ID proses MOMOYO tidak valid.')
    os.kill(pid, signal.SIGTERM)
    for _ in range(25):
        if not health():
            return
        time.sleep(.2)
    raise RuntimeError('Server MOMOYO belum berhenti.')


def release_directory(directory):
    if not re.fullmatch(r'\d+\.\d+\.\d+-[a-f0-9]{8}', directory):
        raise ValueError('Folder versi tidak valid.')
    return ROOT / 'versions' / directory


def active_directory():
    pointer = ROOT / 'active.json'
    if not pointer.exists():
        return ROOT
    return release_directory(json.loads(pointer.read_text(encoding='utf-8'))['directory'])


def start(directory, expected=None, confirm_replace=False):
    if ready(directory, expected):
        return
    other = health()
    if other:
        if not confirm_replace:
            raise RuntimeError('Hentikan MOMOYO versi lain sebelum membuka paket ini.')
        if not ask_replace(other):
            raise Cancelled()
        stop(allow_other_folder=True)
    data = ROOT / 'data'
    data.mkdir(exist_ok=True)
    for name in ('giveaway-state.json', 'podium-state.json'):
        if (ROOT / name).exists() and not (data / name).exists():
            shutil.copy2(ROOT / name, data / name)
    executable = directory / 'python' / 'python.exe'
    if not executable.exists():
        executable = Path(sys.executable)
    env = dict(os.environ, MOMOYO_HOME=str(ROOT), MOMOYO_DATA=str(data))
    with (ROOT / 'launcher.log').open('a', encoding='utf-8') as log:
        process = subprocess.Popen([str(executable), '-u', str(directory / 'server.py')],
                                   cwd=directory, env=env, stdin=subprocess.DEVNULL,
                                   stdout=log, stderr=log,
                                   creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    for _ in range(40):
        if ready(directory, expected):
            return
        if process.poll() is not None:
            break
        time.sleep(.2)
    if process.poll() is None:
        process.terminate()
        process.wait(timeout=5)
    raise RuntimeError('Server versi ini gagal dijalankan. Periksa launcher.log.')


def apply_update():
    status = ROOT / 'update-status.json'
    previous = active_directory()
    staged = json.loads((ROOT / 'staged.json').read_text(encoding='utf-8'))
    target = release_directory(staged['directory'])
    time.sleep(.35)
    stop()
    try:
        start(target, staged['version'])
        write_json(ROOT / 'active.json', staged)
    except Exception:
        try:
            stop()
            start(previous)
            result = {'state': 'rollback', 'message': 'Pembaruan gagal. Versi sebelumnya kembali aktif.'}
        except Exception:
            result = {'state': 'error', 'message': 'Pembaruan gagal. Jalankan MOMOYO Live.cmd untuk mencoba versi sebelumnya.'}
        write_json(status, result)
        return
    sync_registry(staged['version'])
    write_json(status, {'state': 'installed', 'message': f"MOMOYO {staged['version']} aktif."})

def main():
    if '--apply-update' in sys.argv:
        try:
            apply_update()
        except Exception as error:
            write_json(ROOT / 'update-status.json', {'state': 'error', 'message': str(error)})
        return
    if '--confirm-exit' in sys.argv:
        confirm_exit()
        return
    if '--stop' in sys.argv:
        stop(allow_other_folder=True)
        notify('Server MOMOYO sudah dihentikan.')
        return
    try:
        start(active_directory(), confirm_replace=True)
    except Cancelled:
        return
    info = health()
    if info:
        sync_registry(info.get('version'))
    if '--no-open' not in sys.argv:
        open_panel()

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        if sys.platform == 'win32':
            ctypes.windll.user32.MessageBoxW(0, str(error), 'MOMOYO', 0x10)
        else:
            print(error, file=sys.stderr)
        sys.exit(1)




