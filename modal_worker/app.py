import json
import os
import re
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


def _r2_client():
    import boto3

    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def _write_status(s3, job_id: str, data: dict) -> None:
    s3.put_object(
        Bucket=os.environ["R2_BUCKET_NAME"],
        Key=f"tmp/jobs/{job_id}.json",
        Body=json.dumps(data),
        ContentType="application/json",
        CacheControl="no-store",
    )


def _seed_convex(convex_url: str, title: str, artist: str, slug: str, bpm, tracks: list) -> None:
    import requests as req

    args = {
        "title": title,
        "artist": artist,
        "slug": slug,
        "isPublic": True,
        "tracks": tracks,
    }
    if bpm is not None:
        args["bpm"] = bpm

    res = req.post(
        f"{convex_url}/api/mutation",
        json={"path": "songs:seed", "args": args, "format": "json"},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("status") == "error":
        raise RuntimeError(f"Convex error: {data.get('errorMessage', data)}")


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
) -> None:
    import requests as req

    s3 = _r2_client()
    bucket = os.environ["R2_BUCKET_NAME"]
    convex_url = os.environ["CONVEX_URL"]

    try:
        _write_status(s3, job_id, {"status": "running", "progress": 0, "phase": "Descargando audio..."})

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

            _write_status(s3, job_id, {"status": "running", "progress": 5, "phase": "Separando pistas con Demucs..."})

            cmd = ["demucs", "--mp3", "--two-stems=vocals", "-n", "htdemucs_ft", "-o", out_dir, audio_path]
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)

            output_lines: list[str] = []
            for line in proc.stdout:
                line = line.rstrip()
                output_lines.append(line)
                print(line, flush=True)
                m = re.match(r"\s*(\d+)%", line)
                if m:
                    pct = max(5, min(95, int(m.group(1))))
                    _write_status(s3, job_id, {"status": "running", "progress": pct, "phase": "Separando pistas con Demucs..."})

            proc.wait()
            if proc.returncode != 0:
                tail = "\n".join(output_lines[-20:])
                raise RuntimeError(f"Demucs salió con código {proc.returncode}\n{tail}")

            _write_status(s3, job_id, {"status": "running", "progress": 95, "phase": "Subiendo pistas a R2..."})

            stems_dir = os.path.join(out_dir, "htdemucs_ft", job_id)
            with open(os.path.join(stems_dir, "vocals.mp3"), "rb") as f:
                s3.put_object(Bucket=bucket, Key=f"songs/{slug}/Voz.mp3", Body=f.read(), ContentType="audio/mpeg")
            with open(os.path.join(stems_dir, "no_vocals.mp3"), "rb") as f:
                s3.put_object(Bucket=bucket, Key=f"songs/{slug}/Instrumental.mp3", Body=f.read(), ContentType="audio/mpeg")

        _write_status(s3, job_id, {"status": "running", "progress": 98, "phase": "Guardando en Convex..."})

        _seed_convex(
            convex_url,
            title=title,
            artist=artist,
            slug=slug,
            bpm=bpm,
            tracks=[
                {"id": "instrumental", "label": "Instrumental", "file": f"songs/{slug}/Instrumental.mp3", "defaultVolume": 0.5},
                {"id": "voz", "label": "Voz", "file": f"songs/{slug}/Voz.mp3", "defaultVolume": 0.5},
            ],
        )

        # Clean up temp audio from R2
        try:
            s3.delete_object(Bucket=bucket, Key=f"tmp/{job_id}.mp3")
        except Exception:
            pass

        _write_status(s3, job_id, {"status": "done", "id": slug})

    except Exception as e:
        try:
            _write_status(s3, job_id, {"status": "error", "message": str(e)})
        except Exception:
            pass
        raise


class SubmitRequest(BaseModel):
    audioUrl: str
    jobId: str
    slug: str
    title: str
    artist: str
    bpm: int | None = None


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
    )
    return {"jobId": item.jobId}
