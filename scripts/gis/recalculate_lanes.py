"""Velosiped zolaqları şəbəkəsinin müstəqil yenidən hesablanması.

Mənbələr (git-də saxlanılan xam fayllar):
  server/data/raw/mpv-v-mps.-son.kmz       -> "Velosiped yolları 2025" qovluğu
  server/data/raw/movcud-zolaqlar-velo.kmz -> "VELO YOL 2026" qovluğu
Müqayisə üçün:
  server/data/lanes-existing.geojson (xerite_after.html-dən çıxarılmış 67 seqment)

Heç bir nəticə 67.8 km-ə "uyğunlaşdırılmır": hər ssenari ayrıca hesablanır və hesabata yazılır.
İstifadə:  python scripts/gis/recalculate_lanes.py
"""
from __future__ import annotations

import json
import math
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from pyproj import Geod, Transformer
from shapely.geometry import LineString
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "server" / "data" / "raw"  # dist/raw-dan köçürülüb: vite build dist-i silir
OUT = ROOT / "server" / "data"
KML = "{http://www.opengis.net/kml/2.2}"

GEOD = Geod(ellps="WGS84")
TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32639", always_xy=True).transform  # UTM 39N (Bakı)
TO_WGS = Transformer.from_crs("EPSG:32639", "EPSG:4326", always_xy=True).transform
BAKU_BBOX = (49.4, 40.2, 50.4, 40.7)  # lon_min, lat_min, lon_max, lat_max
DUP_TOL_M = 5.0      # iki seqment "eyni xətt" sayılır: Hausdorff məsafəsi <= 5 m
SPIKE_M = 1500.0     # ardıcıl iki nöqtə arasında > 1.5 km sıçrayış şübhəlidir


# ---------------------------------------------------------------- KML oxuma
def read_kmz(path: Path) -> ET.Element:
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".kml"))
        return ET.fromstring(z.read(name))


def walk(node: ET.Element, folders: list[str], out: list[dict], source: str) -> None:
    for child in node:
        tag = child.tag.replace(KML, "")
        if tag in ("Folder", "Document"):
            name = child.findtext(f"{KML}name") or ""
            walk(child, folders + [name], out, source)
        elif tag == "Placemark":
            name = (child.findtext(f"{KML}name") or "").strip()
            for ls in child.iter(f"{KML}LineString"):
                raw = (ls.findtext(f"{KML}coordinates") or "").split()
                coords = [tuple(float(v) for v in c.split(",")) for c in raw]
                out.append({"source": source, "folders": folders, "name": name, "coords": coords})


def load_lines() -> list[dict]:
    lines: list[dict] = []
    walk(read_kmz(RAW / "mpv-v-mps.-son.kmz"), [], lines, "mpv-v-mps.-son.kmz")
    walk(read_kmz(RAW / "movcud-zolaqlar-velo.kmz"), [], lines, "movcud-zolaqlar-velo.kmz")
    for i, line in enumerate(lines):
        path = " / ".join(line["folders"])
        line["version"] = "2026" if "2026" in path else "2025" if "2025" in path else "naməlum"
        line["uid"] = f"{line['version']}-{i:03d}"
        line["folder_path"] = path
    return lines


# ---------------------------------------------------------------- uzunluqlar
def geodesic_m(coords) -> float:
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return GEOD.line_length(lons, lats) if len(coords) > 1 else 0.0


def haversine_m(coords) -> float:
    r = 6371008.8
    total = 0.0
    for (lon1, lat1, *_), (lon2, lat2, *_) in zip(coords, coords[1:]):
        p1, p2 = math.radians(lat1), math.radians(lat2)
        dp, dl = p2 - p1, math.radians(lon2 - lon1)
        h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
        total += 2 * r * math.asin(math.sqrt(h))
    return total


def utm_line(coords) -> LineString:
    xs, ys = TO_UTM([c[0] for c in coords], [c[1] for c in coords])
    return LineString(list(zip(xs, ys)))


def geodesic_of_geom(geom) -> float:
    """UTM-də birləşdirilmiş həndəsənin geodezik uzunluğu (WGS84-ə qaytarılaraq)."""
    parts = getattr(geom, "geoms", [geom])
    total = 0.0
    for part in parts:
        xs, ys = TO_WGS(*zip(*part.coords))
        total += geodesic_m(list(zip(xs, ys)))
    return total


# ---------------------------------------------------------------- yoxlamalar
def qa(line: dict) -> list[str]:
    issues = []
    c = line["coords"]
    if len(c) < 2:
        issues.append("tək nöqtəli xətt")
    if any(len(p) > 2 and abs(p[2]) > 0.01 for p in c):
        issues.append("sıfırdan fərqli Z (hündürlük) dəyəri")
    lon_min, lat_min, lon_max, lat_max = BAKU_BBOX
    if any(not (lon_min <= p[0] <= lon_max and lat_min <= p[1] <= lat_max) for p in c):
        swapped = all(lon_min <= p[1] <= lon_max and lat_min <= p[0] <= lat_max for p in c)
        issues.append("lat/lon yerləri dəyişib" if swapped else "Bakı ərazisindən kənar koordinat")
    dups = sum(1 for a, b in zip(c, c[1:]) if a[:2] == b[:2])
    if dups:
        issues.append(f"{dups} təkrarlanan ardıcıl nöqtə")
    for a, b in zip(c, c[1:]):
        if haversine_m([a, b]) > SPIKE_M:
            issues.append("şübhəli sıçrayış (>1.5 km ardıcıl nöqtələr arası)")
            break
    if len(c) > 2 and not LineString([(p[0], p[1]) for p in c]).is_simple:
        issues.append("öz-özünü kəsən xətt")
    return issues


def same_line(a: LineString, b: LineString) -> bool:
    return a.hausdorff_distance(b) <= DUP_TOL_M


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    lines = load_lines()
    for line in lines:
        line["geodesic_m"] = geodesic_m(line["coords"])
        line["haversine_m"] = haversine_m(line["coords"])
        line["utm"] = utm_line(line["coords"])
        line["utm_m"] = line["utm"].length
        line["issues"] = qa(line)

    by_version = {v: [l for l in lines if l["version"] == v] for v in ("2025", "2026")}
    km = lambda ls, key="geodesic_m": round(sum(l[key] for l in ls) / 1000, 3)

    # Eyni xətlər (təkrar seqmentlər): versiyadaxili və versiyalararası
    unique: list[dict] = []
    for line in sorted(lines, key=lambda l: (l["version"] != "2026", l["uid"])):  # 2026 versiyasına üstünlük
        match = next((u for u in unique if same_line(u["utm"], line["utm"])), None)
        if match:
            line["duplicate_of"] = match["uid"]
            match["in_versions"].add(line["version"])
        else:
            line["in_versions"] = {line["version"]}
            unique.append(line)
    drawable = [l for l in unique if len(l["coords"]) >= 2]
    only_2025 = [l for l in drawable if l["in_versions"] == {"2025"}]
    only_2026 = [l for l in drawable if l["in_versions"] == {"2026"}]
    both = [l for l in drawable if l["in_versions"] == {"2025", "2026"}]
    # 2025-də olub 2026-da "itən" seqment həqiqətən yoxdur, yoxsa 2026-da yenidən çəkilib?
    near_2026 = unary_union([l["utm"] for l in lines if l["version"] == "2026" and len(l["coords"]) >= 2]).buffer(15)
    redrawn = []
    for l in only_2025:
        share = l["utm"].intersection(near_2026).length / l["utm"].length
        l["share_within_15m_of_2026"] = round(share, 3)
        redrawn.append({"uid": l["uid"], "name": l["name"], "km": round(l["geodesic_m"] / 1000, 3), "share_within_15m_of_2026": round(share, 3)})

    # 2026 faylı daxilində təkrar çəkilmiş (paralel ≤8 m) hissələr
    lines_2026 = [l for l in lines if l["version"] == "2026" and len(l["coords"]) >= 2]
    internal_overlaps = []
    for l in lines_2026:
        others = unary_union([o["utm"] for o in lines_2026 if o is not l]).buffer(8)
        overlap = l["utm"].intersection(others).length
        if overlap > 50:
            internal_overlaps.append({"uid": l["uid"], "name": l["name"], "km": round(l["geodesic_m"] / 1000, 3),
                                      "overlap_km": round(overlap / 1000, 3), "share": round(overlap / l["utm"].length, 3)})
    # Hər cüt üçün üst-üstə düşmə iki dəfə sayılır → yarısı real təkrar uzunluqdur
    internal_double_km = round(sum(o["overlap_km"] for o in internal_overlaps) / 2, 3)

    # Kanonik şəbəkə: 2026 faylı (2025-in bütün xətlərini əhatə edir). 2025-də də olub-olmadığı qeyd olunur.
    near_2025 = unary_union([l["utm"] for l in lines if l["version"] == "2025" and len(l["coords"]) >= 2]).buffer(15)
    for l in lines_2026:
        l["in_2025"] = l["utm"].intersection(near_2025).length / l["utm"].length >= 0.95

    # Qismən üst-üstə düşən hissələr: həndəsi birləşmə (dissolve) UTM-də
    union_all = unary_union([l["utm"] for l in lines])
    union_2026 = unary_union([l["utm"] for l in by_version["2026"]])
    union_2025 = unary_union([l["utm"] for l in by_version["2025"]])

    # Emal olunmuş 67 seqmentlə müqayisə
    processed = json.loads((OUT / "lanes-existing.geojson").read_text(encoding="utf-8"))["features"]
    proc_utm = [utm_line(f["geometry"]["coordinates"]) for f in processed]
    proc_union = unary_union(proc_utm)
    missing = [l for l in unique if not any(same_line(l["utm"], p) for p in proc_utm)]
    raw_covered = union_all.buffer(DUP_TOL_M)
    proc_not_in_raw = [i for i, p in enumerate(proc_utm) if not raw_covered.contains(p)]
    missing_geom = union_all.difference(proc_union.buffer(DUP_TOL_M))

    scenarios = {
        "A_2025_raw_sum": km(by_version["2025"]),
        "B_2026_raw_sum": km(by_version["2026"]),
        "C_2025_plus_2026_raw_sum": km(lines),
        "D_unique_segments_sum": km(unique),
        "E_dissolved_union_2025": round(geodesic_of_geom(union_2025) / 1000, 3),
        "F_dissolved_union_2026": round(geodesic_of_geom(union_2026) / 1000, 3),
        "G_dissolved_union_all": round(geodesic_of_geom(union_all) / 1000, 3),
        "H_processed_67_segments": round(sum(geodesic_m(f["geometry"]["coordinates"]) for f in processed) / 1000, 3),
        "I_processed_dissolved": round(geodesic_of_geom(proc_union) / 1000, 3),
        "J_2026_minus_internal_double_drawn": round(km(lines_2026) - internal_double_km, 3),
    }
    methods = {
        "canonical_2026": {"geodesic_wgs84_km": km(lines_2026), "utm39n_planar_km": km(lines_2026, "utm_m"), "haversine_km": km(lines_2026, "haversine_m")},
        "unique_segments": {"geodesic_wgs84_km": km(unique), "utm39n_planar_km": km(unique, "utm_m"), "haversine_km": km(unique, "haversine_m")},
        "all_raw": {"geodesic_wgs84_km": km(lines), "utm39n_planar_km": km(lines, "utm_m"), "haversine_km": km(lines, "haversine_m")},
    }

    declared = json.loads((OUT / "infrastructure.json").read_text(encoding="utf-8"))["existing_km"]
    measured = km(lines_2026)
    tolerance = 0.1
    closest = min(scenarios.items(), key=lambda kv: abs(kv[1] - declared))
    verification = {
        "declared_km": declared,
        "measured_km": measured,
        "difference_km": round(declared - measured, 3),
        "difference_pct": round((declared - measured) / measured * 100, 2),
        "tolerance_km": tolerance,
        "status": "verified" if abs(declared - measured) <= tolerance else "not_verified",
        "closest_scenario": {"name": closest[0], "km": closest[1]},
        "method": "WGS84 geodezik uzunluq (pyproj.Geod) · kanonik şəbəkə: VELO YOL 2026 KMZ (2025 xətlərinin hamısını əhatə edir)",
        "previous_pipeline_km": km(drawable),
        "previous_pipeline_overcount_km": km(only_2025),
        "internal_double_drawn_km": internal_double_km,
    }

    report = {
        "sources": {"2025": "server/data/raw/mpv-v-mps.-son.kmz", "2026": "server/data/raw/movcud-zolaqlar-velo.kmz", "processed": "server/data/lanes-existing.geojson"},
        "crs": {"input": "EPSG:4326 (KML standartı, WGS84)", "metric": "EPSG:32639 (UTM 39N) və WGS84 geodezik"},
        "counts": {
            "raw_lines": len(lines),
            "by_version": {v: len(ls) for v, ls in by_version.items()},
            "duplicates_removed": len(lines) - len(unique),
            "unique_segments": len(unique),
            "processed_segments": len(processed),
            "unique_missing_from_processed": len(missing),
            "processed_not_in_raw": len(proc_not_in_raw),
        },
        "scenarios_km": scenarios,
        "version_breakdown": {
            "in_both_2025_2026": {"segments": len(both), "km": km(both)},
            "only_2025": {"segments": len(only_2025), "km": km(only_2025), "overlap_with_2026": redrawn},
            "only_2026": {"segments": len(only_2026), "km": km(only_2026), "names": [l["name"] for l in only_2026]},
        },
        "internal_2026_overlaps": internal_overlaps,
        "verification": verification,
        "methods_km": methods,
        "missing_from_processed": [
            {"uid": l["uid"], "name": l["name"], "folder": l["folder_path"], "km": round(l["geodesic_m"] / 1000, 3), "issues": l["issues"]}
            for l in missing
        ],
        "missing_geometry_km": round(geodesic_of_geom(missing_geom) / 1000, 3) if not missing_geom.is_empty else 0.0,
        "qa_issues": Counter(i.split(" (")[0] for l in lines for i in l["issues"]),
        "qa_by_line": [{"uid": l["uid"], "name": l["name"], "issues": l["issues"]} for l in lines if l["issues"]],
        "segments": [
            {"uid": l["uid"], "version": l["version"], "name": l["name"], "folder": l["folder_path"], "points": len(l["coords"]),
             "geodesic_km": round(l["geodesic_m"] / 1000, 4), "utm_km": round(l["utm_m"] / 1000, 4), "duplicate_of": l.get("duplicate_of")}
            for l in lines
        ],
    }
    out = OUT / "lane-recalculation.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1, default=dict), encoding="utf-8")

    # Yoxlanılmış unikal şəbəkə GeoJSON (xəritə üçün namizəd)
    features = [{
        "type": "Feature",
        "properties": {
            "id": l["uid"], "name": l["name"], "status": "existing", "length_km": round(l["geodesic_m"] / 1000, 4),
            "also_in_2025": l["in_2025"],
            "qa": [*l["issues"], *(["düz xətt (2 nöqtə) — yol boyu izlənməyib"] if len(l["coords"]) == 2 and l["geodesic_m"] > 1000 else [])],
        },
        "geometry": {"type": "LineString", "coordinates": [[round(c[0], 7), round(c[1], 7)] for c in l["coords"]]},
    } for l in lines_2026]
    (OUT / "lanes-existing-verified.geojson").write_text(json.dumps({"type": "FeatureCollection", "meta": {
        "source": "server/data/raw/movcud-zolaqlar-velo.kmz (VELO YOL 2026), WGS84", "generated_by": "scripts/gis/recalculate_lanes.py"},
        "features": features}, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({k: report[k] for k in ("counts", "scenarios_km", "methods_km", "version_breakdown", "verification", "qa_issues")}, ensure_ascii=False, indent=1, default=dict))
    return 0


if __name__ == "__main__":
    sys.exit(main())
