"""Deterministic local PNG derivative for a reviewed archive original (Pillow 12.3.0)."""
import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


def encode_quantized_png(rgb: Image.Image, colors: int) -> bytes:
    image = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    return output.getvalue()


def derive(source: bytes) -> bytes:
    if not source.startswith(b"\x89PNG\r\n\x1a\n") or len(source) > 20 * 1024 * 1024:
        raise ValueError("SOURCE_PNG_INVALID")
    with Image.open(io.BytesIO(source)) as original:
        original.verify()
    with Image.open(io.BytesIO(source)) as original:
        if original.width > 8192 or original.height > 8192:
            raise ValueError("SOURCE_DIMENSIONS_INVALID")
        rgb = original.convert("RGB")
    resized = rgb.resize((512, 512), Image.Resampling.LANCZOS)
    result = encode_quantized_png(resized, 256)
    if len(result) <= 200_000:
        return result
    result = encode_quantized_png(resized, 128)
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
        record = json.loads(args.output.with_suffix('.json').read_text(encoding='utf-8'))
        if (record.get('source_sha256') != hashlib.sha256(args.source.read_bytes()).hexdigest()
                or record.get('derivative_sha256') != hashlib.sha256(committed).hexdigest()
                or record.get('derivative_bytes') != len(committed)
                or record.get('derivative_version') != 'site-png-512-v1'):
            raise ValueError('DERIVATIVE_PROVENANCE_MISMATCH')
        if generated != committed:
            with Image.open(io.BytesIO(generated)) as generated_image:
                generated_pixels = hashlib.sha256(generated_image.convert("RGB").tobytes()).hexdigest()
            with Image.open(io.BytesIO(committed)) as committed_image:
                if (committed_image.width != record.get('derivative_width')
                        or committed_image.height != record.get('derivative_height')):
                    raise ValueError('DERIVATIVE_DIMENSIONS_MISMATCH')
                committed_pixels = hashlib.sha256(committed_image.convert("RGB").tobytes()).hexdigest()
            if generated_pixels != committed_pixels:
                raise ValueError("DERIVATIVE_NOT_FROM_SOURCE")
            print(f"pixel_sha256={committed_pixels} encoding=PLATFORM_DIFFERENT")
    else:
        args.output.write_bytes(generated)
    print(f"sha256={hashlib.sha256(generated).hexdigest()} bytes={len(generated)}")


if __name__ == "__main__":
    main()
