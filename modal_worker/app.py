import os
import subprocess
import tempfile

import modal
from pydantic import BaseModel

app = modal.App("practica-piano")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install(
        "torch", "torchaudio",
        index_url="https://download.pytorch.org/whl/cu121",
    )
    .pip_install("demucs", "boto3", "requests", "yt-dlp", "fastapi[standard]")
    .run_commands("python -c \"from demucs.pretrained import get_model; get_model('htdemucs_ft')\"")
)


# Pistas que produce cada modo, en el orden en que las ve el player: archivo que
# escribe Demucs, key en R2, id y label de la pista. Separar en 4 no cuesta más
# tiempo de GPU: htdemucs siempre calcula las 4 fuentes y --two-stems solo las
# mezcla al final.
STEM_LAYOUTS = {
    2: [
        ("no_vocals.mp3", "Instrumental.mp3", "instrumental", "Instrumental"),
        ("vocals.mp3", "Voz.mp3", "voz", "Voz"),
    ],
    4: [
        ("drums.mp3", "drums.mp3", "bateria", "Batería"),
        ("bass.mp3", "bass.mp3", "bajo", "Bajo"),
        ("other.mp3", "other.mp3", "otros", "Otros"),
        ("vocals.mp3", "vocals.mp3", "voz", "Voz"),
    ],
}


def _r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _convex_mutation(convex_url: str, path: str, args: dict, timeout: int = 30):
    import requests as req

    res = req.post(
        f"{convex_url}/api/mutation",
        json={"path": path, "args": args, "format": "json"},
        headers={"Content-Type": "application/json"},
        timeout=timeout,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("status") == "error":
        raise RuntimeError(f"Convex error: {data.get('errorMessage', data)}")
    return data.get("value")


def _job(convex_url: str, job_id: str, status: str, phase: str = None, message: str = None) -> None:
    """Mueve el job de Convex, que es lo que mira el studio.

    Best effort a propósito: perder un cambio de estado no puede voltear una corrida
    de seis minutos que por lo demás va bien. Si se pierden todos, el barrido de
    convex/jobs.ts cierra el job igual.
    """
    args = {"jobId": job_id, "status": status}
    if phase is not None:
        args["phase"] = phase
    if message is not None:
        args["message"] = message

    try:
        _convex_mutation(convex_url, "jobs:update", args, timeout=15)
    except Exception as e:
        print(f"jobs:update ({status}) falló: {e}", flush=True)


def _seed_convex(convex_url: str, title: str, artist: str, slug: str, bpm, tracks: list, job_id: str) -> dict:
    """Registra la canción y devuelve el veredicto de Convex.

    {"action": "created" | "replaced" | "skipped", "trackCount": int, "orphanFiles": [...]}.
    Convex reemplaza solo si esta corrida trae más pistas que las guardadas, así que
    "skipped" significa que las pistas que acabamos de subir no las usa nadie.

    Va con `jobId` porque songs:seed cierra el job en la misma transacción en la que
    decide el veredicto: si el "done" lo mandara el worker aparte quedaría una ventana
    donde la canción ya está publicada y el job colgado porque murió el container.
    """
    args = {
        "title": title,
        "artist": artist,
        "slug": slug,
        "isPublic": True,
        "tracks": tracks,
        "jobId": job_id,
    }
    if bpm is not None:
        args["bpm"] = bpm

    # Convex se deploya aparte del worker: si todavía corre la versión vieja de
    # songs:seed devuelve un id o null, no el veredicto. Sin dict no hay limpieza
    # ni chequeo de "skipped", que es exactamente el comportamiento anterior.
    value = _convex_mutation(convex_url, "songs:seed", args)
    return value if isinstance(value, dict) else {}


def _delete_keys(s3, bucket: str, keys: list) -> None:
    """Borra de R2 las pistas que ya no referencia ninguna canción. Best effort:
    un borrado fallido deja basura en el bucket, no rompe el job."""
    for key in keys:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
            print(f"R2: borrado {key}", flush=True)
        except Exception as e:
            print(f"R2: no se pudo borrar {key}: {e}", flush=True)


@app.function(
    image=image,
    gpu="T4",
    timeout=600,
    secrets=[
        modal.Secret.from_name("practica-piano-r2"),
        modal.Secret.from_name("practica-piano-convex"),
    ],
)
def process_song(
    audio_url: str,
    job_id: str,
    slug: str,
    title: str,
    artist: str,
    bpm,
    stems: int = 2,
) -> None:
    import requests as req

    s3 = _r2_client()
    bucket = os.environ["R2_BUCKET_NAME"]
    convex_url = os.environ["CONVEX_URL"]

    # Todo adentro del try, incluido el layout: cualquier salida por excepción tiene
    # que cerrar el job o el studio muestra una corrida fantasma hasta que la barra
    # el cron.
    try:
        layout = STEM_LAYOUTS.get(stems)
        if layout is None:
            raise ValueError(f"stems inválido: {stems} (esperado {sorted(STEM_LAYOUTS)})")

        _job(convex_url, job_id, "running", phase="Descargando audio...")

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, f"{job_id}.mp3")
            out_dir = os.path.join(tmpdir, "out")
            os.makedirs(out_dir)

            if "youtube.com" in audio_url or "youtu.be" in audio_url:
                # No cookies here: the YouTube flow is local-only (scripts/add_song.py
                # reads the Firefox session). From a datacenter IP this download will
                # likely be blocked — in prod, upload the audio to R2 instead.
                yt_cmd = ["yt-dlp", "-x", "--audio-format", "mp3", "-o", audio_path, audio_url]
                result = subprocess.run(yt_cmd, capture_output=True, text=True)
                if result.returncode != 0:
                    raise RuntimeError(f"yt-dlp falló (código {result.returncode}):\n{result.stderr[-2000:]}")
            else:
                r = req.get(audio_url, timeout=120)
                r.raise_for_status()
                with open(audio_path, "wb") as f:
                    f.write(r.content)

            _job(convex_url, job_id, "running", phase=f"Separando en {stems} pistas con Demucs...")

            cmd = ["demucs", "--mp3", *(["--two-stems=vocals"] if stems == 2 else []),
                   "-n", "htdemucs_ft", "-o", out_dir, audio_path]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

            # El pipe se sigue leyendo aunque el porcentaje ya no se reporte: si el
            # buffer se llena, Demucs se bloquea escribiendo y la corrida se cuelga.
            # Las líneas quedan en los logs de Modal y en el tail del error.
            output_lines: list[str] = []
            for line in proc.stdout:
                line = line.rstrip()
                output_lines.append(line)
                print(line, flush=True)

            proc.wait()
            if proc.returncode != 0:
                tail = "\n".join(output_lines[-20:])
                raise RuntimeError(f"Demucs salió con código {proc.returncode}\n{tail}")

            _job(convex_url, job_id, "running", phase="Subiendo pistas a R2...")

            stems_dir = os.path.join(out_dir, "htdemucs_ft", job_id)
            for src_name, r2_name, _, _ in layout:
                with open(os.path.join(stems_dir, src_name), "rb") as f:
                    s3.put_object(
                        Bucket=bucket,
                        Key=f"songs/{slug}/{r2_name}",
                        Body=f.read(),
                        ContentType="audio/mpeg",
                    )

        # Cierra el job además de registrar la canción (ver el docstring).
        seeded = _seed_convex(
            convex_url,
            title=title,
            artist=artist,
            slug=slug,
            bpm=bpm,
            tracks=[
                {"id": track_id, "label": label, "file": f"songs/{slug}/{r2_name}", "defaultVolume": 0.5}
                for _, r2_name, track_id, label in layout
            ],
            job_id=job_id,
        )

        # Convex es la fuente de verdad de qué pistas quedaron: lo que ya no referencia
        # se borra de R2. Son las viejas cuando reemplazó (2 -> 4) y las que subimos
        # recién cuando descartó la corrida.
        _delete_keys(s3, bucket, seeded.get("orphanFiles") or [])

        # Clean up temp audio from R2
        try:
            s3.delete_object(Bucket=bucket, Key=f"tmp/{job_id}.mp3")
        except Exception:
            pass

        if seeded.get("action") == "skipped":
            # jobs:start corta estos casos antes de arrancar; llegar acá significa que
            # otra corrida guardó primero. No es un fallo del proceso, pero tampoco
            # cambió nada: se reporta como error para no mostrar un "listo" que miente.
            # El job ya lo cerró songs:seed con este mismo motivo.
            raise RuntimeError(
                f"No se reemplazó nada: '{slug}' ya tiene {seeded.get('trackCount')} pistas "
                f"y esta corrida traía {len(layout)}."
            )

    except Exception as e:
        # Si songs:seed ya lo cerró, jobs:update lo ignora: ese mensaje es más preciso.
        _job(convex_url, job_id, "error", message=str(e))
        raise


class SubmitRequest(BaseModel):
    audioUrl: str
    jobId: str
    slug: str
    title: str
    artist: str
    bpm: int | None = None
    stems: int = 2


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def submit(item: SubmitRequest) -> dict:
    process_song.spawn(
        audio_url=item.audioUrl,
        job_id=item.jobId,
        slug=item.slug,
        title=item.title,
        artist=item.artist,
        bpm=item.bpm,
        stems=item.stems,
    )
    return {"jobId": item.jobId}
