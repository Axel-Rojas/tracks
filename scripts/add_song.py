#!/usr/bin/env python3
"""
Agrega una canción al proyecto separando sus pistas con Demucs.

Uso:
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista"
    python scripts/add_song.py --youtube-url "https://youtu.be/..." --title "Nombre" --artist "Artista"
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista" --bpm 120
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista" --id mi-id
    python scripts/add_song.py cancion.mp3 --title "Nombre" --artist "Artista" --overwrite

Requiere:
    pip install demucs yt-dlp
    ffmpeg instalado en el PATH (winget install ffmpeg)
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
from pathlib import Path

# Forzar UTF-8 en stdout/stderr para evitar errores cp1252 en Windows
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'buffer'):
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

REPO_ROOT = Path(__file__).parent.parent
SONGS_JSON = REPO_ROOT / "public" / "songs.json"
SONGS_DIR = REPO_ROOT / "public" / "songs"


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
    """Encuentra el ejecutable de ffmpeg — busca en PATH y ubicaciones comunes de Windows."""
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
    # Scoop
    user = os.environ.get("USERPROFILE", "")
    if user:
        candidates.append(os.path.join(user, r"scoop\shims\ffmpeg.exe"))
    for c in candidates:
        if os.path.isfile(c):
            return c
    print("ERROR: ffmpeg no encontrado.")
    print("  Instala ffmpeg con:  winget install ffmpeg")
    print("  Luego reinicia la terminal y vuelve a correr el servidor de dev.")
    sys.exit(1)


def check_demucs():
    result = subprocess.run(
        [sys.executable, "-c", "import demucs"],
        capture_output=True,
    )
    if result.returncode != 0:
        print("ERROR: Demucs no está instalado.")
        print("  Instalalo con: pip install demucs")
        sys.exit(1)


def download_from_youtube(url: str, out_dir: Path) -> Path:
    """Descarga audio de YouTube como WAV a 44100 Hz usando yt-dlp."""
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


def run_demucs(input_file: Path, out_dir: Path) -> Path:
    ffmpeg = find_ffmpeg()
    # Inyectar el directorio de ffmpeg en PATH para que Demucs también lo encuentre
    ffmpeg_dir = str(Path(ffmpeg).parent)
    env = {**os.environ, "PATH": ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")}

    if input_file.suffix.lower() == ".wav":
        # Ya es WAV (ej: descargado desde YouTube) — Demucs lo puede leer directamente
        wav_file = input_file
    else:
        # torchaudio en Python 3.13+ no puede cargar MP3 sin torchcodec.
        # Convertir a WAV con ffmpeg evita el problema.
        wav_file = out_dir / (input_file.stem + ".wav")
        print("\n>> Convirtiendo a WAV...")
        conv = subprocess.run(
            [ffmpeg, "-i", str(input_file), "-ar", "44100", "-ac", "2", str(wav_file), "-y"],
            capture_output=True,
            text=True,
        )
        if conv.returncode != 0:
            print(f"ERROR: ffmpeg fallo al convertir el archivo.\n{conv.stderr}")
            sys.exit(1)

    print("\n>> Separando pistas con Demucs (puede tardar varios minutos)...")
    result = subprocess.run(
        [
            sys.executable, "-m", "demucs",
            "--two-stems=vocals",
            "--mp3",
            "--out", str(out_dir),
            str(wav_file),
        ],
        text=True,
        env=env,
    )
    if result.returncode != 0:
        print("ERROR: Demucs fallo.")
        sys.exit(1)

    stem_base = wav_file.stem
    stem_dir = out_dir / "htdemucs_2stems" / stem_base

    # Fallback: buscar el primer subdirectorio si el nombre no coincide exactamente
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


def id_exists(song_id: str) -> bool:
    if not SONGS_JSON.exists():
        return False
    songs = json.loads(SONGS_JSON.read_text(encoding="utf-8"))
    return any(s["id"] == song_id for s in songs)


def prepend_to_songs_json(song_id: str, title: str, artist: str):
    songs = json.loads(SONGS_JSON.read_text(encoding="utf-8")) if SONGS_JSON.exists() else []
    # Remover entrada existente si se está sobreescribiendo
    songs = [s for s in songs if s["id"] != song_id]
    songs.insert(0, {"id": song_id, "title": title, "artist": artist})
    SONGS_JSON.write_text(json.dumps(songs, ensure_ascii=False, indent=2), encoding="utf-8")


def write_metadata(song_dir: Path, song_id: str, title: str, artist: str, bpm: int | None):
    metadata = {
        "id": song_id,
        "title": title,
        "artist": artist,
        "tracks": [
            {"id": "instrumental", "label": "Instrumental", "file": "Instrumental.mp3", "defaultVolume": 0.5},
            {"id": "voz", "label": "Voz", "file": "Voz.mp3", "defaultVolume": 0.5},
        ],
        "markers": [],
        "regions": [],
    }
    if bpm is not None:
        metadata["bpm"] = bpm

    (song_dir / "metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main():
    parser = argparse.ArgumentParser(description="Agrega una canción separando sus pistas con Demucs.")
    parser.add_argument("input", nargs="?", default=None, help="Archivo de audio de entrada (MP3 o WAV)")
    parser.add_argument("--youtube-url", default=None, help="URL de YouTube para descargar el audio")
    parser.add_argument("--title", required=True, help="Título de la canción")
    parser.add_argument("--artist", required=True, help="Artista")
    parser.add_argument("--bpm", type=int, default=None, help="BPM (opcional)")
    parser.add_argument("--id", dest="song_id", default=None, help="ID/slug manual (default: slug del título)")
    parser.add_argument("--overwrite", action="store_true", help="Sobreescribir si el ID ya existe")
    args = parser.parse_args()

    if not args.input and not args.youtube_url:
        print("ERROR: Debés proveer un archivo de entrada o --youtube-url.")
        sys.exit(1)

    song_id = args.song_id or slugify(args.title)
    if not song_id:
        print("ERROR: No se pudo generar un ID válido del título. Usá --id.")
        sys.exit(1)

    if id_exists(song_id) and not args.overwrite:
        print(f"ERROR: Ya existe una canción con id '{song_id}'.")
        print("  Usá --overwrite para reemplazarla, o --id para elegir otro ID.")
        sys.exit(1)

    check_demucs()

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        if args.youtube_url:
            input_file = download_from_youtube(args.youtube_url, tmp_path)
        else:
            input_file = Path(args.input).resolve()
            if not input_file.exists():
                print(f"ERROR: No se encontró el archivo: {input_file}")
                sys.exit(1)

        stem_dir = run_demucs(input_file, tmp_path)

        vocals_src = stem_dir / "vocals.mp3"
        no_vocals_src = stem_dir / "no_vocals.mp3"

        if not vocals_src.exists() or not no_vocals_src.exists():
            print(f"ERROR: No se encontraron los archivos de stems en {stem_dir}")
            print(f"  Contenido: {list(stem_dir.iterdir())}")
            sys.exit(1)

        song_dir = SONGS_DIR / song_id
        song_dir.mkdir(parents=True, exist_ok=True)

        shutil.copy2(vocals_src, song_dir / "Voz.mp3")
        shutil.copy2(no_vocals_src, song_dir / "Instrumental.mp3")

    write_metadata(song_dir, song_id, args.title, args.artist, args.bpm)
    prepend_to_songs_json(song_id, args.title, args.artist)

    print(f"\nOK Cancion agregada exitosamente:")
    print(f"  ID:         {song_id}")
    print(f"  Directorio: public/songs/{song_id}/")
    print(f"  Pistas:     Voz.mp3, Instrumental.mp3")
    if args.bpm:
        print(f"  BPM:        {args.bpm}")
    print(f"\nPróximos pasos:")
    print(f"  git add public/songs/{song_id} public/songs.json")
    print(f"  git commit -m 'feat: add {args.title} by {args.artist}'")


if __name__ == "__main__":
    main()
