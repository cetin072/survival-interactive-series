"""Deterministic local PNG derivative for a reviewed archive original (Pillow 12.3.0)."""
import argparse
import hashlib
import io
from pathlib import Path

from PIL import Image


def derive(source: bytes) -> bytes:
    if not source.startswith(b"\x89PNG\r\n\x1a\n") or len(source) > 20 * 1024 * 1024:
        raise ValueError("SOURCE_PNG_INVALID")
    with Image.open(io.BytesIO(source)) as original:
        original.verify()
    with Image.open(io.BytesIO(source)) as original:
        if original.width > 8192 or original.height > 8192:
            raise ValueError("SOURCE_DIMENSIONS_INVALID")
        rgb = original.convert("RGB")
    image = rgb.resize((512, 512), Image.Resampling.LANCZOS)
    image = image.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    result = output.getvalue()
    if len(result) > 200_000:
        raise ValueError("DERIVATIVE_TOO_LARGE")
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if Image.__version__ != "12.3.0":
        raise ValueError("PINNED_PILLOW_VERSION_REQUIRED")
    generated = derive(args.source.read_bytes())
    if args.check:
        committed = args.output.read_bytes()
        if generated != committed:
            with Image.open(io.BytesIO(generated)) as generated_image:
                generated_pixels = hashlib.sha256(generated_image.convert("RGB").tobytes()).hexdigest()
            with Image.open(io.BytesIO(committed)) as committed_image:
                committed_pixels = hashlib.sha256(committed_image.convert("RGB").tobytes()).hexdigest()
            print(f"generated_sha256={hashlib.sha256(generated).hexdigest()} "
                  f"committed_sha256={hashlib.sha256(committed).hexdigest()} "
                  f"generated_pixel_sha256={generated_pixels} committed_pixel_sha256={committed_pixels}")
            raise ValueError("DERIVATIVE_NOT_FROM_SOURCE")
    else:
        args.output.write_bytes(generated)
    print(f"sha256={hashlib.sha256(generated).hexdigest()} bytes={len(generated)}")


if __name__ == "__main__":
    main()
