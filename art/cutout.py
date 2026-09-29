"""Scale a painting to web size and lift its flat background off by flood fill from the border.

The same idea as src/client/cutout.ts: everything close to the border colour that is reachable
from the border turns transparent, fading over a band so the ink edge stays soft. The painting
needs a closed ink outline for the fill to stop at.

usage: python3 cutout.py <source> <out.png> <width> <height> [near] [far] [global]
  near/far: colour distance to the background; 8/30 for a white background (keeps white snow),
  22/70 for bone (as cutout.ts uses).
"""

import subprocess
import sys

src, out, W, H = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
near = float(sys.argv[5]) if len(sys.argv) > 5 else 8
far = float(sys.argv[6]) if len(sys.argv) > 6 else 30
# "global" also clears background-coloured pockets the fill cannot reach, like white inside
# mist or between legs; only for art with no background-coloured paint of its own.
everywhere = len(sys.argv) > 7 and sys.argv[7] == "global"

raw = subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-i", src, "-vf", f"scale={W}:{H}:flags=lanczos,format=rgb24", "-f", "rawvideo", "-"],
    capture_output=True, check=True,
).stdout
N = W * H
border = [x for x in range(W)] + [(H - 1) * W + x for x in range(W)] + [y * W for y in range(H)] + [y * W + W - 1 for y in range(H)]
bg = [sum(raw[3 * i + c] for i in border) / len(border) for c in range(3)]


def dist(i):
    return sum((raw[3 * i + c] - bg[c]) ** 2 for c in range(3)) ** 0.5


alpha = bytearray([255]) * N
seen = bytearray(N)
stack = list(border)
for i in stack:
    seen[i] = 1
while stack:
    i = stack.pop()
    d = dist(i)
    if d > far:
        continue
    alpha[i] = 0 if d <= near else int(255 * (d - near) / (far - near))
    x = i % W
    for j in ((i - 1) if x > 0 else -1, (i + 1) if x < W - 1 else -1, i - W, i + W):
        if 0 <= j < N and not seen[j]:
            seen[j] = 1
            stack.append(j)

if everywhere:
    for i in range(N):
        d = dist(i)
        if d <= near:
            alpha[i] = 0
        elif d < far:
            alpha[i] = min(alpha[i], int(255 * (d - near) / (far - near)))

rgba = bytearray(N * 4)
for i in range(N):
    rgba[4 * i : 4 * i + 3] = raw[3 * i : 3 * i + 3]
    rgba[4 * i + 3] = alpha[i]
subprocess.run(
    ["ffmpeg", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-i", "-", "-pix_fmt", "rgba", out],
    input=bytes(rgba), check=True,
)
print(f"{out}: {W}x{H}, background {[round(v) for v in bg]}, near {near}, far {far}")
