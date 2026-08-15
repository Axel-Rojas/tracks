#!/usr/bin/env python3
"""
Agrega una canción al proyecto: separa pistas con Demucs, sube a R2 y registra en Convex.

Uso:
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista"
    python scripts/add_song.py --youtube-url "https://youtu.be/..." --title "Nombre" --artist "Artista"
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista" --bpm 120
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista" --jobs 2

Requiere:
    pip install demucs yt-dlp boto3
    ffmpeg instalado en el PATH (winget install ffmpeg)

Variables de entorno (en .env.local o exportadas):
    CF_ACCOUNT_ID
    CF_R2_ACCESS_KEY_ID
    CF_R2_SECRET_ACCESS_KEY
    NEXT_PUBLIC_CONVEX_URL
"""

import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

# Forzar UTF-8 en stdout/stderr para evitar errores cp1252 en Windows
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

REPO_ROOT = Path(__file__).parent.parent
R2_BUCKET = 'tracks-app'

# Tope de jobs paralelos de Demucs en CPU. Cada job suma uso de RAM, así que
# más allá de 4 el cuello de botella suele ser memoria, no cores.
MAX_JOBS = 4


def default_jobs() -> int:
    """Jobs paralelos para Demucs según los cores disponibles (1 si no se puede detectar)."""
    return max(1, min(MAX_JOBS, (os.cpu_count() or 4) // 4))


def load_env():
    """Lee .env.local del repo y carga variables en el entorno si no están ya definidas."""
    env_file = REPO_ROOT / '.env.local'
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key not in os.environ:
            os.environ[key] = val


def require_env(*names: str):
    missing = [n for n in names if not os.environ.get(n)]
    if missing:
        print(f"ERROR: Faltan variables de entorno: {', '.join(missing)}")
        print("  Definílas en .env.local o exportálas antes de correr el script.")
        sys.exit(1)


def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[áàäâ]", "a", text)
    text = re.sub(r"[éèëê]", "e", text)
    text = re.sub(r"[íìïî]", "i", text)
    text = re.sub(r"[óòöô]", "o", text)
    text = re.sub(r"[úùüû]", "u", text)
    text = re.sub(r"[ñ]", "n", text)
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return text.strip("-")


def find_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    candidates = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
    ]
    local = os.environ.get("LOCALAPPDATA", "")
    if local:
        candidates.append(os.path.join(local, r"Microsoft\WinGet\Links\ffmpeg.exe"))
        candidates.append(os.path.join(local, r"Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-7.1-full_build\bin\ffmpeg.exe"))
    user = os.environ.get("USERPROFILE", "")
    if user:
        candidates.append(os.path.join(user, r"scoop\shims\ffmpeg.exe"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    print("ERROR: ffmpeg no encontrado.")
    print("  Instala ffmpeg con:  winget install ffmpeg")
    sys.exit(1)


def check_demucs():
    result = subprocess.run([sys.executable, "-c", "import demucs"], capture_output=True)
    if result.returncode != 0:
        print("ERROR: Demucs no está instalado.")
        print("  Instalalo con: pip install demucs")
        sys.exit(1)


def check_boto3():
    result = subprocess.run([sys.executable, "-c", "import boto3"], capture_output=True)
    if result.returncode != 0:
        print("ERROR: boto3 no está instalado.")
        print("  Instalalo con: pip install boto3")
        sys.exit(1)


def download_from_youtube(url: str, out_dir: Path) -> Path:
    try:
        import yt_dlp
    except ImportError:
        print("ERROR: yt-dlp no está instalado.")
        print("  Instalalo con: pip install yt-dlp")
        sys.exit(1)

    ffmpeg = find_ffmpeg()
    out_template = str(out_dir / "%(title)s.%(ext)s")
    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "ffmpeg_location": str(Path(ffmpeg).parent),
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "wav",
            "preferredquality": "0",
        }],
        "postprocessor_args": {"FFmpegExtractAudio": ["-ar", "44100", "-ac", "2"]},
    }
    print("\n>> Descargando audio desde YouTube...")
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ret = ydl.download([url])
    if ret != 0:
        print("ERROR: yt-dlp falló al descargar el audio.")
        sys.exit(1)

    wavs = list(out_dir.glob("*.wav"))
    if not wavs:
        print(f"ERROR: No se encontró el WAV descargado en {out_dir}")
        sys.exit(1)
    return wavs[0]


def sanitize_filename(p: Path) -> Path:
    safe = p.stem.encode("ascii", "ignore").decode("ascii").strip()
    safe = re.sub(r"[^\w\s-]", "", safe).strip() or "track"
    if safe == p.stem:
        return p
    dst = p.parent / (safe + p.suffix)
    p.rename(dst)
    return dst


def run_demucs(input_file: Path, out_dir: Path, jobs: int = 1) -> Path:
    ffmpeg = find_ffmpeg()
    ffmpeg_dir = str(Path(ffmpeg).parent)
    env = {
        **os.environ,
        "PATH": ffmpeg_dir + os.pathsep + os.environ.get("PATH", ""),
        "PYTHONIOENCODING": "utf-8",
    }

    if input_file.suffix.lower() == ".wav":
        wav_file = sanitize_filename(input_file)
    else:
        wav_file = out_dir / (input_file.stem + ".wav")
        print("\n>> Convirtiendo a WAV...")
        conv = subprocess.run(
            [ffmpeg, "-i", str(input_file), "-ar", "44100", "-ac", "2", str(wav_file), "-y"],
            capture_output=True, text=True,
        )
        if conv.returncode != 0:
            print(f"ERROR: ffmpeg fallo al convertir el archivo.\n{conv.stderr}")
            sys.exit(1)
        wav_file = sanitize_filename(wav_file)

    print(f"\n>> Separando pistas con Demucs ({jobs} job{'s' if jobs > 1 else ''}, puede tardar varios minutos)...")
    result = subprocess.run(
        [sys.executable, "-m", "demucs", "--two-stems=vocals", "--mp3",
         "-j", str(jobs), "--out", str(out_dir), str(wav_file)],
        text=True, env=env,
    )
    if result.returncode != 0:
        print("ERROR: Demucs fallo.")
        sys.exit(1)

    stem_base = wav_file.stem
    stem_dir = out_dir / "htdemucs_2stems" / stem_base
    if not stem_dir.exists():
        model_dirs = list(out_dir.glob("htdemucs*"))
        if not model_dirs:
            print(f"ERROR: No se encontró output de Demucs en {out_dir}")
            sys.exit(1)
        candidates = list(model_dirs[0].iterdir())
        if not candidates:
            print(f"ERROR: Directorio de stems vacío en {model_dirs[0]}")
            sys.exit(1)
        stem_dir = candidates[0]

    return stem_dir


def upload_to_r2(local_path: Path, key: str):
    import boto3
    account_id = os.environ['CF_ACCOUNT_ID']
    s3 = boto3.client(
        's3',
        region_name='auto',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=os.environ['CF_R2_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['CF_R2_SECRET_ACCESS_KEY'],
    )
    print(f"  ↑  Subiendo {key}...")
    s3.upload_file(
        str(local_path), R2_BUCKET, key,
        ExtraArgs={
            'ContentType': 'audio/mpeg',
            'CacheControl': 'public, max-age=31536000, immutable',
        },
    )
    print(f"  ✓  {key}")


def register_in_convex(song_id: str, title: str, artist: str, bpm: int | None):
    convex_url = os.environ['NEXT_PUBLIC_CONVEX_URL'].rstrip('/')
    tracks = [
        {"id": "instrumental", "label": "Instrumental", "file": f"songs/{song_id}/no_vocals.mp3", "defaultVolume": 0.5},
        {"id": "voz",           "label": "Voz",           "file": f"songs/{song_id}/vocals.mp3",   "defaultVolume": 0.5},
    ]
    args = {
        "slug": song_id,
        "title": title,
        "artist": artist,
        "isPublic": True,
        "tracks": tracks,
    }
    if bpm is not None:
        args["bpm"] = bpm

    body = json.dumps({"path": "songs:seed", "args": args, "format": "json"}).encode()
    req = urllib.request.Request(
        f"{convex_url}/api/mutation",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            if result.get("status") == "error":
                print(f"ERROR Convex: {result.get('errorMessage', result)}")
                sys.exit(1)
            print(f"  ✓  Registrada en Convex con slug: {song_id}")
    except urllib.error.HTTPError as e:
        body_err = e.read().decode(errors='replace')
        print(f"ERROR al registrar en Convex: {e.code} {body_err}")
        sys.exit(1)


def main():
    load_env()

    parser = argparse.ArgumentParser(description="Agrega una canción separando sus pistas con Demucs.")
    parser.add_argument("input", nargs="?", default=None, help="Archivo de audio de entrada (MP3 o WAV)")
    parser.add_argument("--youtube-url", default=None, help="URL de YouTube para descargar el audio")
    parser.add_argument("--title", required=True, help="Título de la canción")
    parser.add_argument("--artist", required=True, help="Artista")
    parser.add_argument("--bpm", type=int, default=None, help="BPM (opcional)")
    parser.add_argument("--id", dest="song_id", default=None, help="ID/slug de R2 (default: slug del título)")
    parser.add_argument("--jobs", "-j", type=int, default=None,
                        help=f"Jobs paralelos de Demucs en CPU (default: {default_jobs()} en esta máquina). "
                             "Más jobs = más rápido pero más RAM; bajalo a 1-2 si te quedás sin memoria.")
    args = parser.parse_args()

    jobs = args.jobs if args.jobs and args.jobs > 0 else default_jobs()

    if not args.input and not args.youtube_url:
        print("ERROR: Debés proveer un archivo de entrada o --youtube-url.")
        sys.exit(1)

    require_env("CF_ACCOUNT_ID", "CF_R2_ACCESS_KEY_ID", "CF_R2_SECRET_ACCESS_KEY", "NEXT_PUBLIC_CONVEX_URL")
    check_demucs()
    check_boto3()

    song_id = args.song_id or slugify(args.title)
    if not song_id:
        print("ERROR: No se pudo generar un ID válido del título. Usá --id.")
        sys.exit(1)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        if args.youtube_url:
            input_file = download_from_youtube(args.youtube_url, tmp_path)
        else:
            input_file = Path(args.input).resolve()
            if not input_file.exists():
                print(f"ERROR: No se encontró el archivo: {input_file}")
                sys.exit(1)

        stem_dir = run_demucs(input_file, tmp_path, jobs)

        vocals_src = stem_dir / "vocals.mp3"
        no_vocals_src = stem_dir / "no_vocals.mp3"
        if not vocals_src.exists() or not no_vocals_src.exists():
            print(f"ERROR: No se encontraron los stems en {stem_dir}")
            print(f"  Contenido: {list(stem_dir.iterdir())}")
            sys.exit(1)

        print("\n>> Subiendo pistas a R2...")
        upload_to_r2(no_vocals_src, f"songs/{song_id}/no_vocals.mp3")
        upload_to_r2(vocals_src,    f"songs/{song_id}/vocals.mp3")

    print("\n>> Registrando en Convex...")
    register_in_convex(song_id, args.title, args.artist, args.bpm)

    print(f"\n✓ Canción lista:")
    print(f"  Título:  {args.title} — {args.artist}")
    print(f"  R2 key:  songs/{song_id}/")
    if args.bpm:
        print(f"  BPM:     {args.bpm}")


if __name__ == "__main__":
    main()
