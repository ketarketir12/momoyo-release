"""Bangun paket MOMOYO Live: ZIP portabel + pemasang (.exe).

Pemakaian:  python tools/build.py
Hasil di dist/. Rilis resmi harus dibangun di Windows (csc dari .NET Framework).
Build dengan Mono (mcs) hanya untuk uji lokal dan ditolak kecuali memakai --allow-mono,
karena Mono menawarkan overload yang tidak ada di .NET Framework Windows
(penyebab crash MissingMethodException pada v1.4.22 versi awal).
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / 'dist'
PACKAGE_ROOT = 'MOMOYO Live'
ZIP_NAME = 'MOMOYO-Portable-Windows-x64.zip'   # nama ini dibaca oleh updater; jangan diubah
SKIP_DIRS = {'__pycache__', 'data', 'versions'}
SKIP_FILES = {'launcher.log', 'active.json', 'staged.json', 'update-status.json'}


def fail(message):
    print('GAGAL:', message, file=sys.stderr)
    sys.exit(1)


def read_version():
    value = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'\d+\.\d+\.\d+', value):
        fail(f'VERSION tidak valid: {value!r}')
    return value


def check_versions(version):
    server = (ROOT / 'app' / 'server.py').read_text(encoding='utf-8')
    found = re.search(r"^VERSION = '([^']+)'", server, re.M)
    if not found or found.group(1) != version:
        fail(f"app/server.py VERSION ({found.group(1) if found else '?'}) tidak sama dengan VERSION ({version})")
    for relative in ('app/VERSION.txt', 'package/00 - Baca Dulu.txt'):
        if version not in (ROOT / relative).read_text(encoding='utf-8'):
            fail(f'{relative} belum menyebut versi {version}')
    if f'versi portabel {version}' not in (ROOT / 'app' / 'BACA-DULU.txt').read_text(encoding='utf-8'):
        fail(f'app/BACA-DULU.txt belum menyebut "versi portabel {version}"')


def files_under(base):
    for directory, directories, names in os.walk(base):
        directories[:] = sorted(d for d in directories if d not in SKIP_DIRS)
        for name in sorted(names):
            if name in SKIP_FILES or name.endswith(('.tmp', '.pyc')):
                continue
            path = Path(directory) / name
            yield path, path.relative_to(base).as_posix()


def build_zip():
    DIST.mkdir(exist_ok=True)
    target = DIST / ZIP_NAME
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, name in files_under(ROOT / 'package'):
            archive.write(path, f'{PACKAGE_ROOT}/{name}')
        for path, name in files_under(ROOT / 'app'):
            archive.write(path, f'{PACKAGE_ROOT}/app/{name}')
        for path, name in files_under(ROOT / 'runtime' / 'python'):
            archive.write(path, f'{PACKAGE_ROOT}/app/python/{name}')
    return target


def find_compiler(allow_mono):
    windir = os.environ.get('WINDIR')
    if windir:
        csc = Path(windir) / 'Microsoft.NET' / 'Framework64' / 'v4.0.30319' / 'csc.exe'
        if csc.exists():
            return str(csc), False
    mcs = shutil.which('mcs')
    if mcs:
        if not allow_mono:
            fail('Hanya Mono (mcs) yang ada. Build resmi harus di Windows. Pakai --allow-mono untuk uji lokal.')
        return mcs, True
    fail('Kompiler C# tidak ditemukan (butuh csc.exe dari .NET Framework 4 di Windows).')


def build_installer(version, archive, allow_mono):
    compiler, is_mono = find_compiler(allow_mono)
    work = DIST / 'build'
    work.mkdir(exist_ok=True)
    source = work / 'Setup.cs'
    source.write_text((ROOT / 'installer' / 'Setup.cs').read_text(encoding='utf-8').replace('@VERSION@', version),
                      encoding='utf-8')
    output = DIST / f'MOMOYO-Live-Setup-{version}-win-x64.exe'
    command = [compiler, '-target:winexe', '-platform:x64', f'-out:{output}',
               f"-win32icon:{ROOT / 'installer' / 'MOMOYO.ico'}",
               '-r:System.Windows.Forms.dll', '-r:System.IO.Compression.dll',
               f'-resource:{archive},MOMOYO.zip', f"-resource:{ROOT / 'installer' / 'MOMOYO.ico'},MOMOYO.ico",
               str(source)]
    print('Kompiler:', compiler, '(Mono!)' if is_mono else '')
    result = subprocess.run(command, capture_output=True, text=True)
    print(result.stdout + result.stderr)
    if result.returncode != 0 or not output.exists():
        fail('Kompilasi pemasang gagal.')
    return output


def write_checksums(paths):
    lines = [f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}' for p in paths]
    (DIST / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print('\n'.join(lines))


def main():
    allow_mono = '--allow-mono' in sys.argv
    version = read_version()
    check_versions(version)
    if not (ROOT / 'runtime' / 'python' / 'python.exe').exists():
        fail('runtime/python/python.exe tidak ada.')
    shutil.rmtree(DIST, ignore_errors=True)
    archive = build_zip()
    installer = build_installer(version, archive, allow_mono)
    write_checksums([archive, installer])
    print(f'Selesai: {version}')


if __name__ == '__main__':
    main()
