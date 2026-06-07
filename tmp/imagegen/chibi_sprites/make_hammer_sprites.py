from pathlib import Path
import math

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path("/Users/takumi/git/musical")
OUT = ROOT / "src/assets/generated/chibi_sprites"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 1024
S = 4
CANVAS = SIZE * S
INK = (58, 39, 42, 255)
WHITE = (255, 255, 255, 255)


def sc(v):
    return int(round(v * S))


def box(values):
    return tuple(sc(v) for v in values)


def pts(points):
    return [(sc(x), sc(y)) for x, y in points]


def line(d, points, fill, width, joint="curve"):
    d.line(pts(points), fill=fill, width=sc(width), joint=joint)


def rounded(d, xy, r, fill, outline=INK, width=7):
    d.rounded_rectangle(box(xy), radius=sc(r), fill=fill, outline=outline, width=sc(width))


def ellipse(d, xy, fill, outline=INK, width=7):
    d.ellipse(box(xy), fill=fill, outline=outline, width=sc(width))


def polygon(d, points, fill, outline=INK, width=7):
    d.polygon(pts(points), fill=fill)
    d.line(pts(points + [points[0]]), fill=outline, width=sc(width), joint="curve")


def star_points(cx, cy, r1, r2, n=5, rot=-90):
    out = []
    for i in range(n * 2):
        a = math.radians(rot + i * 180 / n)
        r = r1 if i % 2 == 0 else r2
        out.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return out


def star(d, cx, cy, r1, r2, fill, outline=INK, width=7, rot=-90):
    polygon(d, star_points(cx, cy, r1, r2, rot=rot), fill, outline, width)


def shine(d, cx, cy, r=14):
    line(d, [(cx - r, cy), (cx + r, cy)], WHITE, 4)
    line(d, [(cx, cy - r), (cx, cy + r)], WHITE, 4)


def draw_spark_burst(d, cx, cy, palette):
    burst = star_points(cx, cy, 126, 55, n=12, rot=-8)
    polygon(d, burst, palette["effect"], INK, 7)
    star(d, cx - 58, cy - 66, 34, 15, WHITE, INK, 4)
    star(d, cx + 72, cy - 84, 28, 13, (255, 246, 142, 255), INK, 4, rot=-70)
    for a in [212, 238, 270, 302, 328]:
        x1 = cx + math.cos(math.radians(a)) * 28
        y1 = cy + math.sin(math.radians(a)) * 22
        x2 = cx + math.cos(math.radians(a)) * 188
        y2 = cy + math.sin(math.radians(a)) * 116
        line(d, [(x1, y1), (x2, y2)], WHITE, 9)
        line(d, [(x1, y1), (x2, y2)], INK, 2)


def draw_motion(d, pose):
    if pose != "swing":
        return
    for off, alpha, w in [(0, 150, 15), (30, 95, 12), (58, 62, 9)]:
        d.arc(box((248 + off, 18 + off, 790, 572)), 188, 284, fill=(235, 242, 250, alpha), width=sc(w))
        d.arc(box((248 + off, 18 + off, 790, 572)), 188, 284, fill=(42, 50, 66, alpha), width=sc(2))


def handle(d, x1, y1, x2, y2, color, width=31):
    line(d, [(x1, y1), (x2, y2)], INK, width + 12)
    line(d, [(x1, y1), (x2, y2)], color, width)
    line(d, [(x1 + 8, y1 - 8), (x2 + 8, y2 - 8)], (255, 255, 255, 96), max(4, width // 5))


def weapon(d, kind, pose, palette):
    if pose == "raised":
        x1, y1, x2, y2 = 408, 252, 354, 164
        hx, hy, ang = 334, 134, -54
    elif pose == "swing":
        x1, y1, x2, y2 = 410, 302, 506, 166
        hx, hy, ang = 526, 128, -22
    else:
        x1, y1, x2, y2 = 406, 360, 610, 172
        hx, hy, ang = 642, 136, 6

    if kind == "star":
        handle(d, x1, y1, x2, y2, (255, 226, 118, 255), 30)
        star(d, hx, hy, 74, 34, (255, 210, 46, 255), INK, 9, ang)
        star(d, hx - 8, hy - 8, 39, 18, (255, 255, 245, 145), (255, 255, 255, 0), 1, ang)
    elif kind == "paw":
        handle(d, x1, y1, x2, y2, (207, 174, 235, 255), 34)
        ellipse(d, (hx - 76, hy - 48, hx + 76, hy + 76), (230, 210, 247, 255), INK, 9)
        ellipse(d, (hx - 26, hy + 1, hx + 26, hy + 51), (255, 247, 226, 255), INK, 5)
        for dx, dy in [(-46, -32), (-15, -52), (18, -51), (49, -30)]:
            ellipse(d, (hx + dx - 18, hy + dy - 17, hx + dx + 18, hy + dy + 17), (255, 247, 226, 255), INK, 5)
    elif kind == "anchor":
        handle(d, x1, y1, x2, y2, (139, 199, 240, 255), 30)
        rounded(d, (hx - 21, hy - 80, hx + 21, hy + 64), 12, (239, 250, 255, 255), INK, 8)
        ellipse(d, (hx - 45, hy - 104, hx + 45, hy - 14), (174, 222, 250, 255), INK, 8)
        line(d, [(hx - 86, hy + 30), (hx + 86, hy + 30)], (38, 78, 118, 255), 26)
        d.arc(box((hx - 92, hy - 6, hx + 92, hy + 126)), 20, 160, fill=(38, 78, 118, 255), width=sc(18))
    elif kind == "wood":
        handle(d, x1, y1, x2, y2, (160, 94, 44, 255), 34)
        rounded(d, (hx - 86, hy - 48, hx + 86, hy + 48), 24, (190, 115, 55, 255), INK, 9)
        line(d, [(hx - 42, hy - 40), (hx - 42, hy + 40)], (112, 70, 47, 220), 5)
        line(d, [(hx + 38, hy - 39), (hx + 38, hy + 39)], (255, 210, 137, 150), 5)
    elif kind == "magic":
        handle(d, x1, y1, x2, y2, (231, 176, 246, 255), 28)
        star(d, hx - 23, hy + 5, 58, 27, (255, 224, 111, 255), INK, 8, ang)
        ellipse(d, (hx + 6, hy - 66, hx + 88, hy + 16), (247, 213, 255, 255), INK, 8)
        ellipse(d, (hx + 32, hy - 72, hx + 111, hy + 4), (0, 0, 0, 0), (0, 0, 0, 0), 1)
    elif kind == "wrench":
        handle(d, x1, y1, x2, y2, (246, 136, 63, 255), 34)
        rounded(d, (hx - 92, hy - 42, hx + 92, hy + 42), 20, (238, 244, 250, 255), INK, 9)
        ellipse(d, (hx + 24, hy - 50, hx + 108, hy + 50), (126, 151, 177, 255), INK, 8)
        ellipse(d, (hx + 50, hy - 25, hx + 84, hy + 25), (0, 0, 0, 0), (0, 0, 0, 0), 1)
    elif kind == "rolling":
        handle(d, x1, y1, x2, y2, (248, 199, 136, 255), 30)
        rounded(d, (hx - 96, hy - 44, hx + 96, hy + 44), 25, (255, 219, 165, 255), INK, 8)
        rounded(d, (hx - 122, hy - 22, hx - 78, hy + 22), 14, (245, 164, 184, 255), INK, 6)
        rounded(d, (hx + 78, hy - 22, hx + 122, hy + 22), 14, (245, 164, 184, 255), INK, 6)
    elif kind == "drum":
        handle(d, x1, y1, x2, y2, (226, 44, 58, 255), 30)
        ellipse(d, (hx - 76, hy - 76, hx + 76, hy + 76), (250, 238, 208, 255), INK, 10)
        ellipse(d, (hx - 51, hy - 51, hx + 51, hy + 51), (216, 42, 55, 255), (255, 220, 91, 255), 9)


def limb(d, p1, p2, skin, sleeve=None, width=34):
    line(d, p1, INK, width + 12)
    line(d, p1, sleeve or skin, width)
    ellipse(d, (p2[0] - 18, p2[1] - 14, p2[0] + 18, p2[1] + 14), skin, INK, 5)


def legs(d, cfg, dx=0):
    skin = cfg["skin"]
    if cfg["bottom"] == "pants":
        rounded(d, (445 + dx, 636, 498 + dx, 842), 24, cfg["leg"], INK, 7)
        rounded(d, (526 + dx, 636, 579 + dx, 842), 24, cfg["leg"], INK, 7)
    else:
        rounded(d, (451 + dx, 642, 496 + dx, 780), 22, skin, INK, 6)
        rounded(d, (526 + dx, 642, 571 + dx, 780), 22, skin, INK, 6)
        if cfg.get("socks"):
            rounded(d, (448 + dx, 724, 499 + dx, 812), 16, cfg["socks"], INK, 5)
            rounded(d, (523 + dx, 724, 574 + dx, 812), 16, cfg["socks"], INK, 5)
    rounded(d, (406 + dx, 803, 500 + dx, 866), 25, cfg["shoe"], INK, 7)
    rounded(d, (526 + dx, 803, 620 + dx, 866), 25, cfg["shoe"], INK, 7)


def outfit(d, cfg, pose, dx=0):
    main, accent = cfg["main"], cfg["accent"]
    if cfg["bottom"] == "skirt":
        polygon(d, [(380 + dx, 528), (642 + dx, 528), (708 + dx, 666), (319 + dx, 666)], main, INK, 8)
        line(d, [(356 + dx, 624), (668 + dx, 624)], accent, 10)
    elif cfg["bottom"] == "shorts":
        rounded(d, (389 + dx, 528, 632 + dx, 664), 38, main, INK, 8)
        line(d, [(512 + dx, 544), (512 + dx, 660)], accent, 6)
    else:
        rounded(d, (386 + dx, 432, 638 + dx, 654), 50, main, INK, 8)
    rounded(d, (376 + dx, 365, 650 + dx, 548), 54, main, INK, 8)
    line(d, [(396 + dx, 454), (630 + dx, 454)], accent, 10)
    if cfg.get("cape"):
        polygon(d, [(362 + dx, 398), (512 + dx, 350), (662 + dx, 398), (630 + dx, 610), (394 + dx, 610)], cfg["cape"], INK, 6)
    if cfg.get("satchel"):
        line(d, [(380 + dx, 386), (648 + dx, 668)], (138, 92, 51, 255), 11)
        rounded(d, (612 + dx, 584, 726 + dx, 704), 22, (190, 132, 72, 255), INK, 6)
    if cfg.get("buttons"):
        for y in [405, 450, 496]:
            ellipse(d, (500 + dx, y, 524 + dx, y + 24), cfg["buttons"], INK, 4)


def head_back(d, cfg, pose, dx=0):
    hair = cfg["hair"]
    ellipse(d, (310 + dx, 126, 714 + dx, 482), hair, INK, 9)
    for p in [
        [(332 + dx, 362), (286 + dx, 492), (402 + dx, 438)],
        [(688 + dx, 352), (746 + dx, 490), (610 + dx, 430)],
        [(410 + dx, 434), (374 + dx, 548), (480 + dx, 472)],
        [(584 + dx, 426), (648 + dx, 540), (548 + dx, 470)],
    ]:
        polygon(d, p, hair, INK, 6)
    line(d, [(388 + dx, 194), (356 + dx, 306), (380 + dx, 428)], cfg["hair_hi"], 7)
    line(d, [(602 + dx, 190), (650 + dx, 312), (632 + dx, 420)], cfg["hair_hi"], 7)

    headgear = cfg.get("headgear")
    if headgear == "idol":
        polygon(d, [(628 + dx, 198), (690 + dx, 160), (712 + dx, 230), (646 + dx, 238)], (28, 49, 98, 255), INK, 5)
        star(d, 690 + dx, 177, 30, 14, (255, 211, 55, 255), INK, 5)
        star(d, 662 + dx, 252, 27, 13, (255, 211, 55, 255), INK, 5)
    elif headgear == "cat":
        polygon(d, [(334 + dx, 190), (394 + dx, 72), (464 + dx, 205)], cfg["main"], INK, 8)
        polygon(d, [(560 + dx, 198), (636 + dx, 74), (688 + dx, 212)], cfg["main"], INK, 8)
        polygon(d, [(374 + dx, 179), (398 + dx, 124), (430 + dx, 190)], (255, 202, 205, 255), None if False else INK, 4)
        polygon(d, [(602 + dx, 187), (632 + dx, 126), (656 + dx, 198)], (255, 202, 205, 255), INK, 4)
        line(d, [(650 + dx, 596), (725 + dx, 634), (690 + dx, 694)], cfg["main"], 31)
    elif headgear == "beret":
        ellipse(d, (326 + dx, 96, 696 + dx, 268), (255, 252, 244, 255), INK, 8)
        line(d, [(366 + dx, 236), (668 + dx, 236)], (38, 72, 124, 255), 13)
    elif headgear == "fox":
        ellipse(d, (610 + dx, 150, 740 + dx, 278), WHITE, INK, 6)
        polygon(d, [(622 + dx, 174), (642 + dx, 116), (668 + dx, 181)], (226, 42, 44, 255), INK, 4)
        polygon(d, [(718 + dx, 178), (688 + dx, 119), (676 + dx, 184)], (226, 42, 44, 255), INK, 4)
    elif headgear == "witch":
        polygon(d, [(282 + dx, 194), (510 + dx, 28), (628 + dx, 215)], (184, 120, 229, 255), INK, 8)
        ellipse(d, (280 + dx, 198, 736 + dx, 286), (194, 132, 235, 255), INK, 8)
        star(d, 572 + dx, 123, 24, 11, (255, 222, 94, 255), INK, 4)
    elif headgear == "space":
        rounded(d, (356 + dx, 158, 674 + dx, 300), 62, (237, 243, 250, 255), INK, 8)
        rounded(d, (428 + dx, 186, 600 + dx, 262), 28, (92, 131, 164, 255), INK, 6)
    elif headgear == "chef":
        for cx in [430, 490, 550, 610]:
            ellipse(d, (cx + dx - 52, 84, cx + dx + 52, 188), WHITE, INK, 6)
        rounded(d, (420 + dx, 170, 622 + dx, 244), 18, WHITE, INK, 7)
    elif headgear == "band":
        rounded(d, (392 + dx, 88, 640 + dx, 190), 34, (220, 42, 52, 255), INK, 8)
        line(d, [(400 + dx, 148), (632 + dx, 148)], (255, 218, 88, 255), 9)


def arms(d, cfg, pose, dx=0):
    sleeve = cfg["main"]
    skin = cfg["skin"]
    if pose == "raised":
        limb(d, [(408 + dx, 392), (386 + dx, 312), (408 + dx, 252)], (skin), sleeve, 32)
        limb(d, [(616 + dx, 392), (646 + dx, 322), (616 + dx, 282)], (skin), sleeve, 32)
    elif pose == "swing":
        limb(d, [(402 + dx, 410), (394 + dx, 350), (410 + dx, 302)], skin, sleeve, 31)
        limb(d, [(616 + dx, 408), (592 + dx, 478), (650 + dx, 548)], skin, sleeve, 31)
    else:
        limb(d, [(396 + dx, 416), (384 + dx, 382), (406 + dx, 360)], skin, sleeve, 32)
        limb(d, [(620 + dx, 414), (596 + dx, 492), (668 + dx, 580)], skin, sleeve, 32)


def make_sprite(cfg, pose):
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    dx = -12 if pose == "impact" else 0

    draw_motion(d, pose)
    if pose == "impact":
        draw_spark_burst(d, 704, 178, cfg)
    weapon(d, cfg["weapon"], pose, cfg)
    legs(d, cfg, dx)
    outfit(d, cfg, pose, dx)
    head_back(d, cfg, pose, dx)
    arms(d, cfg, pose, dx)
    for x, y in [(408 + dx, 252), (616 + dx, 282)] if pose == "raised" else []:
        ellipse(d, (x - 18, y - 14, x + 18, y + 14), cfg["skin"], INK, 5)
    img = img.filter(ImageFilter.UnsharpMask(radius=1.2 * S, percent=80, threshold=3))
    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


def collapsed_headgear(d, cfg, cx, cy):
    headgear = cfg.get("headgear")
    if headgear == "idol":
        polygon(d, [(cx + 72, cy - 112), (cx + 132, cy - 146), (cx + 152, cy - 80), (cx + 92, cy - 70)], (28, 49, 98, 255), INK, 5)
        star(d, cx + 136, cy - 140, 28, 13, (255, 211, 55, 255), INK, 5)
    elif headgear == "cat":
        polygon(d, [(cx - 120, cy - 68), (cx - 76, cy - 174), (cx - 20, cy - 78)], cfg["main"], INK, 8)
        polygon(d, [(cx + 66, cy - 82), (cx + 128, cy - 174), (cx + 146, cy - 54)], cfg["main"], INK, 8)
        polygon(d, [(cx - 91, cy - 78), (cx - 73, cy - 132), (cx - 44, cy - 82)], (255, 202, 205, 255), INK, 4)
        polygon(d, [(cx + 92, cy - 88), (cx + 124, cy - 135), (cx + 128, cy - 73)], (255, 202, 205, 255), INK, 4)
    elif headgear == "beret":
        ellipse(d, (cx - 132, cy - 168, cx + 164, cy - 62), (255, 252, 244, 255), INK, 8)
        line(d, [(cx - 90, cy - 80), (cx + 126, cy - 80)], (38, 72, 124, 255), 11)
    elif headgear == "fox":
        ellipse(d, (cx + 76, cy - 158, cx + 184, cy - 50), WHITE, INK, 6)
        polygon(d, [(cx + 86, cy - 140), (cx + 108, cy - 190), (cx + 128, cy - 136)], (226, 42, 44, 255), INK, 4)
        polygon(d, [(cx + 170, cy - 132), (cx + 142, cy - 188), (cx + 136, cy - 132)], (226, 42, 44, 255), INK, 4)
    elif headgear == "witch":
        polygon(d, [(cx - 154, cy - 104), (cx + 30, cy - 238), (cx + 124, cy - 91)], (184, 120, 229, 255), INK, 8)
        ellipse(d, (cx - 162, cy - 116, cx + 176, cy - 50), (194, 132, 235, 255), INK, 8)
        star(d, cx + 76, cy - 164, 22, 10, (255, 222, 94, 255), INK, 4)
    elif headgear == "space":
        rounded(d, (cx - 126, cy - 128, cx + 148, cy - 44), 42, (237, 243, 250, 255), INK, 8)
        rounded(d, (cx - 56, cy - 110, cx + 76, cy - 62), 18, (92, 131, 164, 255), INK, 6)
    elif headgear == "chef":
        for x in [-90, -38, 14, 66]:
            ellipse(d, (cx + x - 42, cy - 170, cx + x + 42, cy - 90), WHITE, INK, 6)
        rounded(d, (cx - 84, cy - 102, cx + 92, cy - 48), 16, WHITE, INK, 7)
    elif headgear == "band":
        rounded(d, (cx - 96, cy - 150, cx + 124, cy - 76), 28, (220, 42, 52, 255), INK, 8)
        line(d, [(cx - 88, cy - 107), (cx + 118, cy - 107)], (255, 218, 88, 255), 8)


def make_collapsed_sprite(cfg):
    img = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    skin = cfg["skin"]
    main = cfg["main"]
    accent = cfg["accent"]
    hair = cfg["hair"]

    # Tiny floating pause marks: visual sleepiness without text or injury.
    for cx, cy, r in [(245, 382, 18), (212, 438, 11), (790, 374, 13)]:
        ellipse(d, (cx - r, cy - r, cx + r, cy + r), (255, 255, 255, 210), INK, 4)

    # Dropped harmless hammer behind the character.
    weapon_y = 676
    handle(d, 636, weapon_y, 850, weapon_y - 24, (214, 168, 104, 255), 22)
    if cfg["weapon"] == "star":
        star(d, 888, weapon_y - 32, 52, 24, (255, 210, 46, 255), INK, 7, -88)
    elif cfg["weapon"] == "paw":
        ellipse(d, (850, weapon_y - 78, 946, weapon_y + 18), (230, 210, 247, 255), INK, 7)
        for dx, dy in [(-30, -52), (-8, -66), (17, -64), (40, -47)]:
            ellipse(d, (898 + dx - 11, weapon_y + dy - 10, 898 + dx + 11, weapon_y + dy + 10), (255, 247, 226, 255), INK, 4)
    elif cfg["weapon"] == "wood":
        rounded(d, (842, weapon_y - 62, 950, weapon_y + 8), 20, (190, 115, 55, 255), INK, 7)
    else:
        rounded(d, (842, weapon_y - 58, 960, weapon_y + 10), 20, cfg["effect"], INK, 7)

    # Body lying on its back, centered for small-icon readability.
    rounded(d, (392, 502, 664, 662), 58, main, INK, 9)
    line(d, [(420, 596), (642, 596)], accent, 10)
    if cfg.get("cape"):
        polygon(d, [(374, 548), (522, 466), (684, 546), (640, 708), (402, 698)], cfg["cape"], INK, 6)
    if cfg.get("satchel"):
        line(d, [(406, 505), (654, 660)], (138, 92, 51, 255), 10)
        rounded(d, (646, 610, 752, 692), 18, (190, 132, 72, 255), INK, 6)

    if cfg["bottom"] == "skirt":
        polygon(d, [(630, 490), (756, 542), (744, 684), (612, 678)], main, INK, 8)
        line(d, [(650, 642), (734, 646)], accent, 9)
    elif cfg["bottom"] == "shorts":
        rounded(d, (626, 522, 748, 632), 34, main, INK, 7)
        line(d, [(690, 528), (688, 628)], accent, 5)

    # Arms and legs splayed in a harmless exhausted pose.
    line(d, [(430, 530), (346, 456), (284, 484)], INK, 38)
    line(d, [(430, 530), (346, 456), (284, 484)], main, 26)
    ellipse(d, (262, 466, 306, 506), skin, INK, 5)
    line(d, [(614, 530), (708, 458), (780, 492)], INK, 38)
    line(d, [(614, 530), (708, 458), (780, 492)], main, 26)
    ellipse(d, (760, 472, 806, 514), skin, INK, 5)

    leg_color = cfg.get("leg", skin)
    line(d, [(662, 584), (810, 548), (880, 582)], INK, 42)
    line(d, [(662, 584), (810, 548), (880, 582)], leg_color, 28)
    rounded(d, (852, 552, 944, 606), 22, cfg["shoe"], INK, 7)
    line(d, [(656, 638), (804, 704), (874, 678)], INK, 42)
    line(d, [(656, 638), (804, 704), (874, 678)], leg_color, 28)
    rounded(d, (846, 642, 936, 696), 22, cfg["shoe"], INK, 7)

    # Face-up chibi head with readable "I'm done" expression.
    ellipse(d, (228, 340, 548, 660), skin, INK, 9)
    ellipse(d, (208, 292, 566, 492), hair, INK, 9)
    polygon(d, [(242, 438), (178, 604), (326, 514)], hair, INK, 6)
    polygon(d, [(518, 430), (616, 590), (430, 520)], hair, INK, 6)
    polygon(d, [(318, 444), (366, 500), (414, 444), (386, 530), (334, 530)], hair, INK, 5)
    line(d, [(286, 326), (260, 406), (286, 480)], cfg["hair_hi"], 6)
    line(d, [(468, 326), (506, 408), (488, 482)], cfg["hair_hi"], 6)
    collapsed_headgear(d, cfg, 386, 390)

    for eye_x in [330, 444]:
        line(d, [(eye_x - 24, 500), (eye_x + 24, 544)], INK, 8)
        line(d, [(eye_x + 24, 500), (eye_x - 24, 544)], INK, 8)
    ellipse(d, (276, 552, 326, 588), (255, 148, 164, 125), (255, 148, 164, 0), 1)
    ellipse(d, (454, 552, 504, 588), (255, 148, 164, 125), (255, 148, 164, 0), 1)
    d.arc(box((352, 562, 422, 612)), 8, 170, fill=(112, 55, 63, 255), width=sc(7))
    line(d, [(362, 594), (382, 584), (402, 596), (422, 586)], (112, 55, 63, 255), 5)
    for cx, cy in [(548, 442), (584, 410), (610, 456)]:
        ellipse(d, (cx - 9, cy - 9, cx + 9, cy + 9), (255, 255, 255, 235), INK, 3)

    img = img.filter(ImageFilter.UnsharpMask(radius=1.2 * S, percent=80, threshold=3))
    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


characters = [
    {
        "name": "chibi-star-idol", "weapon": "star", "hair": (139, 78, 43, 255), "hair_hi": (214, 139, 82, 210),
        "skin": (255, 215, 185, 255), "main": (255, 250, 236, 255), "accent": (32, 50, 98, 255),
        "bottom": "skirt", "shoe": (255, 255, 248, 255), "headgear": "idol", "effect": (255, 223, 78, 230), "buttons": (255, 209, 54, 255),
    },
    {
        "name": "chibi-cat-hoodie-boy", "weapon": "paw", "hair": (123, 73, 43, 255), "hair_hi": (211, 135, 76, 210),
        "skin": (255, 216, 187, 255), "main": (198, 162, 231, 255), "accent": (255, 246, 226, 255),
        "bottom": "shorts", "shoe": (181, 142, 222, 255), "headgear": "cat", "effect": (235, 213, 250, 230), "socks": (240, 225, 252, 255),
    },
    {
        "name": "chibi-sailor-explorer-girl", "weapon": "anchor", "hair": (145, 83, 45, 255), "hair_hi": (214, 139, 82, 210),
        "skin": (255, 218, 190, 255), "main": (178, 224, 251, 255), "accent": (34, 78, 128, 255),
        "bottom": "skirt", "shoe": (33, 56, 91, 255), "headgear": "beret", "effect": (255, 231, 92, 230), "satchel": True, "buttons": (255, 239, 212, 255),
    },
    {
        "name": "chibi-festival-kimono-boy", "weapon": "wood", "hair": (112, 65, 40, 255), "hair_hi": (205, 123, 71, 210),
        "skin": (255, 216, 185, 255), "main": (31, 48, 82, 255), "accent": (224, 40, 40, 255),
        "bottom": "shorts", "shoe": (55, 41, 35, 255), "headgear": "fox", "effect": (255, 213, 70, 230), "socks": (250, 245, 236, 255),
    },
    {
        "name": "chibi-magic-apprentice-girl", "weapon": "magic", "hair": (151, 93, 55, 255), "hair_hi": (223, 150, 92, 210),
        "skin": (255, 216, 188, 255), "main": (245, 172, 211, 255), "accent": (171, 112, 224, 255),
        "bottom": "skirt", "shoe": (202, 140, 226, 255), "headgear": "witch", "effect": (255, 229, 98, 230), "cape": (198, 139, 236, 255), "buttons": (255, 226, 97, 255),
    },
    {
        "name": "chibi-space-pilot-boy", "weapon": "wrench", "hair": (106, 64, 41, 255), "hair_hi": (205, 123, 72, 210),
        "skin": (255, 217, 187, 255), "main": (246, 248, 249, 255), "accent": (246, 127, 47, 255),
        "bottom": "pants", "leg": (245, 247, 249, 255), "shoe": (25, 45, 74, 255), "headgear": "space", "effect": (255, 219, 76, 230), "buttons": (33, 62, 101, 255),
    },
    {
        "name": "chibi-pastry-chef-girl", "weapon": "rolling", "hair": (149, 83, 49, 255), "hair_hi": (224, 142, 87, 210),
        "skin": (255, 217, 188, 255), "main": (255, 242, 222, 255), "accent": (243, 121, 150, 255),
        "bottom": "skirt", "shoe": (242, 118, 151, 255), "headgear": "chef", "effect": (255, 220, 92, 230), "buttons": (243, 121, 150, 255),
    },
    {
        "name": "chibi-marching-band-boy", "weapon": "drum", "hair": (105, 63, 40, 255), "hair_hi": (205, 124, 73, 210),
        "skin": (255, 216, 187, 255), "main": (220, 42, 52, 255), "accent": (255, 255, 250, 255),
        "bottom": "pants", "leg": (255, 255, 250, 255), "shoe": (28, 47, 78, 255), "headgear": "band", "effect": (255, 219, 74, 230), "buttons": (255, 218, 88, 255),
    },
]

for cfg in characters:
    character_dir = OUT / "by_character" / cfg["name"]
    character_dir.mkdir(parents=True, exist_ok=True)
    for pose in ["raised", "swing", "impact"]:
        image = make_sprite(cfg, pose)
        image.save(OUT / f"{cfg['name']}-hammer-{pose}.png")
        image.save(character_dir / f"{pose}.png")
    collapsed_image = make_collapsed_sprite(cfg)
    collapsed_image.save(OUT / f"{cfg['name']}-hammer-collapsed.png")
    collapsed_image.save(character_dir / "collapsed.png")

print(f"Wrote {len(characters) * 4} back-facing/collapsed sprites to {OUT}")
