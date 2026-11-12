"""Stage verified GitHub Releases beside the current MOMOYO version."""
import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import urllib.request
import uuid
import zipfile
from pathlib import Path

ASSET = 'MOMOYO-Portable-Windows-x64.zip'
LIMIT = 150 * 1024 * 1024


def version(value):
    if not re.fullmatch(r'v?\d{1,5}\.\d{1,5}\.\d{1,5}', value):
        raise ValueError('Nomor versi tidak valid.')
    return tuple(map(int, value.lstrip('v').split('.')))


def write_json(path, value):
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value), encoding='utf-8')
    os.replace(temporary, path)


def latest(home, current):
    repo = (home / 'GITHUB-REPO.txt').read_text(encoding='utf-8').strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+', repo):
        raise ValueError('Isi GITHUB-REPO.txt dengan pemilik/nama-repo GitHub Releases publik.')
    request = urllib.request.Request(
        f'https://api.github.com/repos/{repo}/releases/latest',
        headers={'Accept': 'application/vnd.github+json', 'User-Agent': 'MOMOYO-Updater'})
    with urllib.request.urlopen(request, timeout=12) as response:
        release = json.load(response)
    tag = release['tag_name']
    if version(tag) <= version(current):
        return None
    asset = next((item for item in release['assets'] if item['name'] == ASSET), {})
    digest = asset.get('digest') or ''
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError(f'Aset {ASSET} dengan checksum SHA-256 belum tersedia.')
    return {'version': tag.lstrip('v'), 'sha256': digest[7:],
            'url': f'https://github.com/{repo}/releases/download/{tag}/{ASSET}',
            'notes': (release.get('body') or '')[:2000]}


def stage(home, release):
    versions = home / 'versions'
    versions.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=versions) as scratch:
        folder = Path(scratch)
        archive = folder / 'release.zip'
        checksum = hashlib.sha256()
        received = 0
        with urllib.request.urlopen(release['url'], timeout=20) as response, archive.open('wb') as stream:
            while chunk := response.read(128 * 1024):
                received += len(chunk)
                if received > LIMIT:
                    raise ValueError('Ukuran ZIP pembaruan melebihi batas.')
                checksum.update(chunk)
                stream.write(chunk)
        if checksum.hexdigest() != release['sha256']:
            raise ValueError('Checksum ZIP berbeda. Unduh ulang pembaruan.')
        package_root = None
        with zipfile.ZipFile(archive) as package:
            if sum(item.file_size for item in package.infolist()) > LIMIT * 2:
                raise ValueError('Isi ZIP pembaruan melebihi batas.')
            for item in package.infolist():
                parts = item.filename.rstrip('/').split('/')
                if (parts[0] not in ('MOMOYO', 'MOMOYO Live') or any(not re.fullmatch(r'[A-Za-z0-9_. -]+', part)
                        or part in ('.', '..') or part.endswith(('.', ' ')) for part in parts)
                        or stat.S_ISLNK(item.external_attr >> 16)):
                    raise ValueError('Struktur ZIP pembaruan tidak valid.')
                if package_root is not None and package_root != parts[0]:
                    raise ValueError('ZIP pembaruan memiliki beberapa folder utama.')
                package_root = parts[0]
                payload_index = 2 if package_root == 'MOMOYO Live' and len(parts) > 1 and parts[1] == 'app' else 1
                if len(parts) > payload_index and parts[payload_index].lower() in {
                    'giveaway-state.json', 'podium-state.json', 'data', 'versions', 'active.json'
                }:
                    raise ValueError('ZIP pembaruan berisi data sesi.')
            package.extractall(folder)
        if package_root is None:
            raise ValueError('ZIP pembaruan kosong.')
        payload = folder / package_root
        if package_root == 'MOMOYO Live':
            payload = payload / 'app'
        required = ('server.py', 'index.html', 'overlay.html', 'podium.html', 'python/python.exe', 'VERSION.txt')
        if not all((payload / name).is_file() for name in required):
            raise ValueError('Paket MOMOYO tidak lengkap.')
        if not re.search(r'\bv' + re.escape(release['version']) + r'\b',
                         (payload / 'VERSION.txt').read_text(encoding='utf-8')):
            raise ValueError('Versi di ZIP berbeda dari tag rilis.')
        directory = f"{release['version']}-{uuid.uuid4().hex[:8]}"
        shutil.copytree(payload, versions / directory)
    return {'directory': directory, 'version': release['version']}
