# The still against the live room (black picture, set on): evidence

Bar: a strong edge more than 0.5 CSS px out in more than 2 % of edge samples (an edge the still lacks counts as out); any 8 × 8 CSS px block over 2.0 ΔE00. Crops are `<still>-<framing>-<tier>-<n>.png` here: still | live | difference × 8, four times the page's size, at the worst spot. The cause is told by where the worst spot is (the power lamp, a lamp and whether the page's edge cuts it, the cabinet's top, the set's sides from a nearer eye, the tier), not by eye.

## The hybrid in the tree (grids + image; made from the top tier)

| still | framing | tier | edges >0.5 px % | ΔE mean | p95 | p99 | max | over the bar: cause at the worst spot |
|---|---|---|---|---|---|---|---|---|
| hybrid | 1440×900@2 | high | 5.0 | 0.54 | 1.31 | 3.18 | 13.4 | colour: lamp bloom; edges: lamp bloom |
| hybrid | 1440×900@2 | low | 33.1 | 0.86 | 2.56 | 4.40 | 13.4 | colour: lamp bloom; edges: low-tier aliasing |
| hybrid | 1920×1080@1 | high | 9.0 | 0.63 | 1.64 | 4.39 | 17.4 | colour: lamp cut by page edge; edges: lamp bloom |
| hybrid | 1920×1080@1 | low | 49.5 | 0.99 | 3.03 | 5.89 | 17.0 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| hybrid | 2560×1080@1 | high | 10.4 | 0.71 | 1.97 | 5.41 | 12.4 | colour: lamp bloom; edges: lamp bloom |
| hybrid | 2560×1080@1 | low | 37.5 | 1.27 | 3.98 | 7.79 | 16.4 | colour: lamp bloom; edges: lamp bloom |
| hybrid | 1280×720@2 | high | 2.9 | 0.60 | 1.57 | 4.23 | 16.7 | colour: lamp cut by page edge; edges: lamp bloom |
| hybrid | 1280×720@2 | low | 30.7 | 0.98 | 2.98 | 5.71 | 16.4 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| hybrid | 1000×950@1 | high | 6.1 | 0.47 | 1.05 | 3.16 | 9.4 | colour: LED halo; edges: lamp cut by page edge |
| hybrid | 1000×950@1 | low | 21.5 | 0.65 | 2.16 | 3.81 | 7.9 | colour: sheen; edges: low-tier aliasing |
| hybrid | 1200×500@1 | high | 62.1 | 0.50 | 1.31 | 3.12 | 22.4 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| hybrid | 1200×500@1 | low | 74.6 | 0.65 | 2.17 | 3.92 | 22.9 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| hybrid | 500×450@1 | high | 1.6 | 0.30 | 0.68 | 0.95 | 1.6 | within the bar |
| hybrid | 500×450@1 | low | 10.3 | 0.30 | 0.68 | 0.95 | 1.6 | edges: low-tier aliasing |
| hybrid | 1024×768@2 touch | high | 2.8 | 0.54 | 1.22 | 2.64 | 13.6 | colour: LED halo; edges: lamp cut by page edge |
| hybrid | 1024×768@2 touch | low | 21.8 | 0.87 | 2.66 | 4.68 | 15.8 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 768×1024@2 touch | high | 5.1 | 0.48 | 1.22 | 2.97 | 7.8 | colour: LED halo; edges: other |
| hybrid | 768×1024@2 touch | low | 18.3 | 0.56 | 1.74 | 4.39 | 12.1 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 390×844@3 touch | high | 12.3 | 0.56 | 1.29 | 3.70 | 8.7 | colour: LED halo; edges: other |
| hybrid | 390×844@3 touch | low | 23.9 | 0.62 | 1.55 | 3.38 | 7.4 | colour: sheen; edges: low-tier aliasing |
| hybrid | 360×640@3 touch | high | 5.2 | 0.54 | 1.24 | 4.72 | 8.2 | colour: LED halo; edges: other |
| hybrid | 360×640@3 touch | low | 10.0 | 0.59 | 1.50 | 4.03 | 7.4 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 320×568@2 touch | high | 5.1 | 0.58 | 1.34 | 5.28 | 9.2 | colour: LED halo; edges: other |
| hybrid | 320×568@2 touch | low | 22.7 | 0.67 | 2.01 | 5.30 | 17.9 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 412×915@2.625 touch | high | 5.0 | 0.53 | 1.19 | 3.17 | 8.4 | colour: LED halo; edges: other |
| hybrid | 412×915@2.625 touch | low | 10.3 | 0.61 | 1.38 | 3.31 | 7.2 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 844×390@3 touch | high | 40.5 | 0.41 | 1.02 | 2.00 | 6.9 | colour: other; edges: silhouette at near eye |
| hybrid | 844×390@3 touch | low | 52.1 | 0.56 | 1.90 | 2.99 | 6.8 | colour: low-tier bake; edges: low-tier aliasing |
| hybrid | 667×375@2 touch | high | 10.7 | 0.50 | 1.30 | 3.66 | 10.5 | colour: lamp cut by page edge; edges: silhouette at near eye |
| hybrid | 667×375@2 touch | low | 19.2 | 0.70 | 2.21 | 3.78 | 11.5 | colour: lamp cut by page edge; edges: low-tier aliasing |
| hybrid | 700×1000@1 | high | 5.5 | 0.48 | 1.06 | 3.24 | 26.3 | colour: LED halo; edges: other |
| hybrid | 700×1000@1 | low | 10.5 | 0.55 | 1.48 | 3.66 | 22.6 | colour: LED halo; edges: low-tier aliasing |
| hybrid | 390×664@3 touch | high | 16.9 | 0.52 | 1.15 | 3.36 | 9.7 | colour: LED halo; edges: other |
| hybrid | 390×664@3 touch | low | 20.2 | 0.57 | 1.72 | 3.69 | 8.0 | colour: LED halo; edges: low-tier aliasing |

Causes at the worst spots, counted over these rows: colour: LED halo × 16, edges: low-tier aliasing × 13, colour: lamp cut by page edge × 8, edges: other × 7, edges: lamp cut by page edge × 6, edges: lamp bloom × 5, colour: lamp bloom × 4, colour: sheen × 2, edges: silhouette at near eye × 2, colour: other × 1, colour: low-tier bake × 1

## The hybrid fitted to the lowest tier's room (scratch build, `pnpm build:still --tier low`), against the low room

| still | framing | tier | edges >0.5 px % | ΔE mean | p95 | p99 | max | over the bar: cause at the worst spot |
|---|---|---|---|---|---|---|---|---|
| lowfit | 1440×900@2 | low | 20.4 | 0.55 | 1.36 | 2.89 | 12.8 | colour: lamp bloom; edges: low-tier aliasing |
| lowfit | 1024×768@2 touch | low | 18.0 | 0.59 | 1.52 | 3.33 | 15.4 | colour: LED halo; edges: low-tier aliasing |
| lowfit | 390×844@3 touch | low | 24.3 | 0.51 | 1.32 | 3.42 | 9.1 | colour: LED halo; edges: low-tier aliasing |
| lowfit-crisp | 1440×900@2 | low | 20.6 | 0.55 | 1.36 | 2.93 | 12.8 | colour: lamp bloom; edges: low-tier aliasing |
| lowfit-crisp | 1024×768@2 touch | low | 18.0 | 0.59 | 1.52 | 3.33 | 15.4 | colour: LED halo; edges: low-tier aliasing |
| lowfit-crisp | 390×844@3 touch | low | 24.4 | 0.51 | 1.32 | 3.42 | 9.1 | colour: LED halo; edges: low-tier aliasing |

(`lowfit-crisp` is the same with `shape-rendering: crispEdges` on the SVG parts: no difference, since nearly every outline is a CSS clip path, which no browser draws without antialiasing.)

## Real frames as the still (scratch): each class's own live frame through AVIF q95

`(own frame)`: at its own viewport and tier, the ceiling. `(a high/low frame)`: against the other tier's live frame. `(the … frame)`: the class's frame as a neighbour's still, scaled and moved so the game's picture lands where that window has it, its edge repeated past its page.

| still | framing | tier | edges >0.5 px % | ΔE mean | p95 | p99 | max | over the bar: cause at the worst spot |
|---|---|---|---|---|---|---|---|---|
| frame | 1440×900@2 (own frame) | high | 0.0 | 0.41 | 0.89 | 1.11 | 1.6 | within the bar |
| frame | 1440×900@2 (a high frame) | low | 28.5 | 0.92 | 2.59 | 4.13 | 13.3 | colour: LED halo; edges: low-tier aliasing |
| frame | 1920×1080@1 (the 1440×900@2 frame) | high | 1.9 | 0.69 | 1.64 | 4.77 | 22.7 | colour: lamp cut by page edge |
| frame | 1280×720@2 (the 1440×900@2 frame) | high | 0.2 | 0.66 | 1.57 | 4.76 | 22.6 | colour: lamp cut by page edge |
| frame | 2560×1080@1 (the 1440×900@2 frame) | high | 10.8 | 4.18 | 21.53 | 76.89 | 82.7 | colour: lamp bloom; edges: lamp bloom |
| frame | 1000×950@1 (the 1440×900@2 frame) | high | 1.4 | 0.63 | 1.57 | 4.45 | 10.8 | colour: LED halo |
| frame | 1200×500@1 (the 1440×900@2 frame) | high | 89.0 | 0.94 | 2.60 | 8.59 | 30.8 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| frame | 500×450@1 (the 1440×900@2 frame) | high | 18.0 | 0.43 | 0.86 | 1.40 | 4.2 | colour: other; edges: silhouette at near eye |
| frame | 700×1000@1 (the 1440×900@2 frame) | high | 57.1 | 0.67 | 1.57 | 5.63 | 30.6 | colour: LED halo; edges: other |
| frame | 1440×900@2 (own frame) | low | 0.0 | 0.38 | 0.85 | 1.03 | 1.3 | within the bar |
| frame | 1440×900@2 (a low frame) | high | 36.8 | 0.89 | 2.56 | 4.09 | 13.1 | colour: LED halo; edges: other |
| frame | 1920×1080@1 (the 1440×900@2 frame) | low | 36.1 | 0.71 | 1.91 | 5.27 | 31.4 | colour: lamp cut by page edge; edges: lamp bloom |
| frame | 1280×720@2 (the 1440×900@2 frame) | low | 15.0 | 0.70 | 1.90 | 5.31 | 31.1 | colour: lamp cut by page edge; edges: lamp bloom |
| frame | 2560×1080@1 (the 1440×900@2 frame) | low | 34.9 | 4.21 | 19.26 | 78.40 | 81.2 | colour: lamp bloom; edges: lamp bloom |
| frame | 1000×950@1 (the 1440×900@2 frame) | low | 17.3 | 0.68 | 2.01 | 4.91 | 12.4 | colour: LED halo; edges: low-tier aliasing |
| frame | 1200×500@1 (the 1440×900@2 frame) | low | 89.5 | 1.03 | 3.36 | 7.89 | 30.2 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| frame | 500×450@1 (the 1440×900@2 frame) | low | 3.8 | 0.41 | 0.79 | 0.99 | 2.0 | colour: low-tier bake; edges: low-tier aliasing |
| frame | 700×1000@1 (the 1440×900@2 frame) | low | 57.7 | 0.59 | 1.45 | 3.18 | 27.9 | colour: LED halo; edges: low-tier aliasing |
| frame | 390×844@3 touch (own frame) | high | 0.0 | 0.38 | 0.74 | 0.92 | 1.2 | within the bar |
| frame | 390×844@3 touch (a high frame) | low | 7.2 | 0.59 | 1.31 | 1.92 | 11.8 | colour: LED halo; edges: low-tier aliasing |
| frame | 412×915@2.625 touch (the 390×844@3 touch frame) | high | 0.1 | 0.42 | 0.81 | 1.05 | 5.9 | colour: LED halo |
| frame | 360×640@3 touch (the 390×844@3 touch frame) | high | 0.2 | 0.43 | 0.86 | 1.39 | 4.4 | colour: LED halo |
| frame | 320×568@2 touch (the 390×844@3 touch frame) | high | 9.6 | 0.43 | 0.89 | 1.16 | 4.3 | colour: LED halo; edges: other |
| frame | 390×664@3 touch (the 390×844@3 touch frame) | high | 0.7 | 0.58 | 1.17 | 5.01 | 12.5 | colour: LED halo |
| frame | 390×844@3 touch (own frame) | low | 0.0 | 0.36 | 0.75 | 0.95 | 1.1 | within the bar |
| frame | 390×844@3 touch (a low frame) | high | 9.8 | 0.54 | 1.13 | 2.05 | 11.8 | colour: LED halo; edges: other |
| frame | 412×915@2.625 touch (the 390×844@3 touch frame) | low | 2.7 | 0.41 | 0.85 | 1.44 | 7.1 | colour: LED halo; edges: low-tier aliasing |
| frame | 360×640@3 touch (the 390×844@3 touch frame) | low | 1.9 | 0.45 | 0.86 | 1.73 | 8.9 | colour: LED halo |
| frame | 320×568@2 touch (the 390×844@3 touch frame) | low | 14.8 | 0.47 | 0.91 | 1.45 | 19.4 | colour: LED halo; edges: low-tier aliasing |
| frame | 390×664@3 touch (the 390×844@3 touch frame) | low | 0.1 | 0.42 | 0.84 | 1.09 | 6.1 | colour: LED halo |
| frame | 768×1024@2 touch (own frame) | high | 0.0 | 0.39 | 0.80 | 1.07 | 1.4 | within the bar |
| frame | 768×1024@2 touch (a high frame) | low | 7.6 | 0.57 | 1.48 | 3.87 | 11.7 | colour: LED halo; edges: low-tier aliasing |
| frame | 1024×768@2 touch (the 768×1024@2 touch frame) | high | 44.1 | 4.23 | 11.97 | 38.62 | 52.7 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| frame | 768×1024@2 touch (own frame) | low | 0.0 | 0.37 | 0.79 | 1.03 | 1.2 | within the bar |
| frame | 768×1024@2 touch (a low frame) | high | 16.2 | 0.57 | 1.55 | 4.11 | 12.0 | colour: LED halo; edges: other |
| frame | 1024×768@2 touch (the 768×1024@2 touch frame) | low | 61.8 | 4.34 | 13.46 | 38.05 | 53.5 | colour: lamp cut by page edge; edges: lamp cut by page edge |
| frame | 844×390@3 touch (own frame) | high | 0.0 | 0.42 | 0.81 | 1.03 | 1.3 | within the bar |
| frame | 844×390@3 touch (a high frame) | low | 15.3 | 0.60 | 1.56 | 2.67 | 3.7 | colour: low-tier bake; edges: low-tier aliasing |
| frame | 667×375@2 touch (the 844×390@3 touch frame) | high | 83.8 | 1.42 | 5.52 | 9.99 | 29.6 | colour: lamp cut by page edge; edges: silhouette at near eye |
| frame | 844×390@3 touch (own frame) | low | 0.0 | 0.40 | 0.78 | 0.96 | 1.3 | within the bar |
| frame | 844×390@3 touch (a low frame) | high | 12.8 | 0.58 | 1.55 | 2.72 | 3.9 | colour: other; edges: silhouette at near eye |
| frame | 667×375@2 touch (the 844×390@3 touch frame) | low | 87.1 | 1.48 | 5.61 | 10.51 | 31.2 | colour: lamp cut by page edge; edges: low-tier aliasing |

Causes at the worst spots, counted over these rows: colour: LED halo × 18, edges: low-tier aliasing × 10, colour: lamp cut by page edge × 10, edges: other × 5, edges: lamp bloom × 4, edges: lamp cut by page edge × 4, edges: silhouette at near eye × 3, colour: lamp bloom × 2, colour: other × 2, colour: low-tier bake × 2

### What a picture of the frame costs

| class frame | tier | pixels | decoded MB | chosen AVIF | qualities tried |
|---|---|---|---|---|---|
| 1440×900@2 | high | 2880×1800 | 19.8 | q95: 178.9 kB | q50: 17.1 kB, p99 1.42, max 1.91; q60: 21.9 kB, p99 1.45, max 2.20; q70: 27.3 kB, p99 1.36, max 1.80; q80: 37.6 kB, p99 1.31, max 1.77; q90: 64.3 kB, p99 1.21, max 1.65; q95: 178.9 kB, p99 1.11, max 1.59 |
| 1440×900@2 | low | 2880×1800 | 19.8 | q95: 211.1 kB | q50: 16.5 kB, p99 1.36, max 1.83; q60: 20.9 kB, p99 1.46, max 2.29; q70: 26.2 kB, p99 1.32, max 1.81; q80: 38.3 kB, p99 1.28, max 1.72; q90: 74.1 kB, p99 1.16, max 1.59; q95: 211.1 kB, p99 1.03, max 1.33 |
| 390×844@3 touch | high | 1170×2532 | 11.3 | q95: 84.3 kB | q50: 6.0 kB, p99 1.10, max 1.63; q60: 7.6 kB, p99 1.29, max 1.63; q70: 9.7 kB, p99 1.07, max 1.62; q80: 14.2 kB, p99 1.06, max 1.38; q90: 27.8 kB, p99 0.98, max 1.23; q95: 84.3 kB, p99 0.92, max 1.20 |
| 390×844@3 touch | low | 1170×2532 | 11.3 | q95: 168.7 kB | q50: 5.8 kB, p99 1.15, max 1.66; q60: 7.5 kB, p99 1.33, max 1.54; q70: 9.3 kB, p99 1.11, max 1.65; q80: 14.6 kB, p99 1.07, max 1.54; q90: 34.5 kB, p99 1.05, max 1.43; q95: 168.7 kB, p99 0.95, max 1.11 |
| 768×1024@2 touch | high | 1536×2048 | 12.0 | q95: 87.8 kB | q50: 6.8 kB, p99 1.39, max 1.97; q60: 8.6 kB, p99 1.50, max 1.78; q70: 10.6 kB, p99 1.31, max 1.98; q80: 15.5 kB, p99 1.25, max 2.00; q90: 25.9 kB, p99 1.18, max 1.56; q95: 87.8 kB, p99 1.07, max 1.40 |
| 768×1024@2 touch | low | 1536×2048 | 12.0 | q95: 90.0 kB | q50: 6.3 kB, p99 1.30, max 1.73; q60: 8.0 kB, p99 1.48, max 1.71; q70: 9.7 kB, p99 1.18, max 1.96; q80: 13.8 kB, p99 1.17, max 1.97; q90: 28.6 kB, p99 1.09, max 1.50; q95: 90.0 kB, p99 1.03, max 1.21 |
| 844×390@3 touch | high | 2532×1170 | 11.3 | q95: 67.6 kB | q50: 5.2 kB, p99 1.23, max 1.79; q60: 6.7 kB, p99 1.38, max 1.64; q70: 8.3 kB, p99 1.19, max 1.60; q80: 12.0 kB, p99 1.14, max 1.53; q90: 23.5 kB, p99 1.09, max 1.37; q95: 67.6 kB, p99 1.03, max 1.29 |
| 844×390@3 touch | low | 2532×1170 | 11.3 | q95: 136.5 kB | q50: 5.2 kB, p99 1.26, max 1.67; q60: 6.5 kB, p99 1.45, max 1.56; q70: 8.1 kB, p99 1.21, max 1.67; q80: 12.3 kB, p99 1.15, max 1.67; q90: 29.1 kB, p99 1.09, max 1.48; q95: 136.5 kB, p99 0.96, max 1.31 |


No lossy quality reaches p99 ≤ 0.5 against the frame it was made from: at q95 the page's mean is already 0.36–0.42 (8-bit YCbCr rounding of colours this dark, and the finish's half-level grain, which does not compress). Exact costs megabytes:

| frame | AVIF lossless | WebP lossless | PNG | AVIF q95 | WebP q95 |
|---|---|---|---|---|---|
| 1440×900@2 high | 2,179 kB, ΔE 0 | 2,020 kB, p99 0.23 | 2,561 kB | 179 kB, mean 0.41 p99 1.11 max 1.59 | 96 kB, mean 0.46 p99 1.35 max 2.21 |
| 390×844@3 high | 1,066 kB, ΔE 0 | 936 kB, p99 0.08 | 864 kB | 84 kB, mean 0.38 p99 0.92 max 1.20 | 43 kB, mean 0.44 p99 1.30 max 1.68 |

## Fidelity against bytes

| picture | bytes | where it holds | ΔE mean | p99 | max | edges >0.5 px % |
|---|---|---|---|---|---|---|
| hybrid, as in the tree | page 10.4 kB + image 27.4 kB AVIF (12.0 kB on a phone) | every window, top and middle tier | 0.30–0.71 | 0.95–5.41 | 1.6–26.3 | 1.6–62 |
| real frame, AVIF q95 | 68–179 kB a window | only the exact window and tier it was shot at | 0.36–0.42 | 0.92–1.11 | 1.1–1.6 | 0 |
| real frame, lossless | 0.9–2.2 MB a window | only the exact window and tier | 0 | 0 | 0 | 0 |
| real frame (q95) of 390×844@3 on other portrait phones | 84 kB | 412×915, 360×640, 320×568 | 0.42–0.43 | 1.05–1.39 | 4.3–5.9 (LED) | 0.1–9.6 |
| the same with the URL bar showing (390×664) | 84 kB | | 0.58 | 5.01 | 12.5 (LED) | 0.7 |
| real frame (q95) of 1440×900@2 on other desktop windows | 179 kB | 1920×1080, 1280×720, 1000×950 | 0.63–0.69 | 4.45–4.77 | 10.8–22.7 | 0.2–1.9 |
| the same on a window with another eye or more of the room | 179 kB | 1200×500, 700×1000, 2560×1080 | 0.67–4.18 | 5.63–76.9 | 30.6–82.7 | 10.8–89 |

## The lowest tier: why it is the worst, with numbers

Live frame against live frame, same window (ΔE mean / p99; edges over 0.5 px by the lighter measure of the earlier tables):

| window | high → medium | medium → low | high → low | buffers (high, medium, low) |
|---|---|---|---|---|
| 1440×900@2 | 0.32 / 2.44 | 0.71 / 4.00 | 0.72 / 4.12 | 2190×1369, 1600×1000, 1200×750 |
| 1024×768@2 touch | 0.35 / 3.48 | 0.72 / 4.31 | 0.67 / 3.41 | 2000×1500, 1460×1095, 1095×821 |
| 390×844@3 touch | 0.07 / 0.40 | 0.36 / 1.89 | 0.36 / 1.94 | 780×1688, 780×1688, 585×1266 |

- The coarser bake's density is not it: the middle tier bakes at the same half density as the lowest, and on the phone, where its buffer is the top tier's, it is the top tier's picture (0.07).
- What the lowest tier alone has (no multisampling at a ratio of 1.5 and 0.9 MP, its 512 px shadow maps and second sample set, one bloom tap a level) is together 0.36–0.72 of mean and 1.9–4.3 at the 99th block. The page cannot switch these one by one (no URL switch for samples, bloom width or the bake's samples), so they are not told apart further here.
- A hybrid fitted to the low room closes the tones (mean 0.86 → 0.55, 0.87 → 0.59, 0.62 → 0.51 at the three windows) but not the edges (18–24 % out): the low room's edges are on its own grid of 1.2–1.9 device px, without antialiasing, scaled up; the page's vectors and clip paths are antialiased at device resolution and cannot be drawn otherwise.
- What the page can know at first paint: a phone (coarse pointer, under 600 CSS px) starts on the middle tier, anything else on the top one. Not knowable without making a WebGL context: a software renderer (starts on low). Not knowable at all before the room runs: a GPU the room's own pre-show frame measurement finds slow (`quality.ts` › `fittingQuality`), which may start on any lower scale or tier.

## Each cause still over the bar with a real frame, and whether a picture made ahead can match it

- **LED halo** (4–12 in a block between near-equal phone windows; threefold between two windows at the same scale): not a smooth function of the window. The finish takes highlights at a quarter of the buffer through a soft knee (`src/room/atmosphere/RoomAtmosphere.ts` 64–68, 363) and blurs their mips (99–108, 143–147); the lens is a few buffer pixels (`src/room/tv/PowerLed.ts` 23, 48), so its bloom depends on where it falls on that quarter grid, which moves with every change of window size. No picture made ahead matches it; exact only on the live side (or by repeating the finish's extraction for the lens in the script).
- **Lamp bloom and a lamp cut by the page's edge** (10–31 in a block on neighbouring desktop windows): the same passes: the bloom is of the pixels on the page, a fixed number of buffer pixels wide, so it changes with the window's size, its pixel ratio and how much of the lamp is on the page. A function of the window, but of the frame's own content: a picture of one window is wrong in the next.
- **Silhouette and parallax from another eye** (edges 57–89 % out, blocks to 31, when a class frame is used in a window whose camera stands elsewhere): geometry, not the finish: `tvViewpoint` moves the eye and the lens with the window (`src/room/tv/tvFraming.ts`). A flat picture cannot follow it; the hybrid's outlines do, but for the set's rounded sides.
- **Vignette and grain**: the vignette is of the page (`RoomAtmosphere.ts` 150), smooth and known, so a scaled picture carries the wrong one but a script can lay the right one (the hybrid does); the grain is of the buffer's pixels (164), half a level, exact only at the same buffer size.
- **Low-tier aliasing and tones against a top-tier picture** (edges 7–29 %, blocks to 13): the tier is not knowable from the page (above).
- **Compression**: none over the bar at q95 (max 1.1–1.6); exactness costs 0.9–2.2 MB a window.
