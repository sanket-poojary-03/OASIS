"""Shrinks Rocketbox colour textures for the web: 1024 px JPEG, or a 512 px PNG where the alpha channel is used (hair, lashes)."""
import pathlib
import sys

from PIL import Image

SIZE = 1024
ALPHA_SIZE = 512


def main(src: str, out: str) -> None:
    dest = pathlib.Path(out)
    dest.mkdir(parents=True, exist_ok=True)
    for tga in pathlib.Path(src).rglob("*_color.tga"):
        img = Image.open(tga)
        cut = img.getchannel("A").getextrema()[0] < 250 if img.mode == "RGBA" else False
        if cut:
            img.resize((ALPHA_SIZE, ALPHA_SIZE), Image.LANCZOS).save(dest / f"{tga.stem}.png", optimize=True)
        else:
            img.resize((SIZE, SIZE), Image.LANCZOS).convert("RGB").save(dest / f"{tga.stem}.jpg", quality=85, optimize=True)
        print(tga.stem, img.mode, "alpha" if cut else "opaque")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
