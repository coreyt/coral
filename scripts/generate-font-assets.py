#!/usr/bin/env python3
"""Generate Coral's embedded release-font data and deterministic metrics.

This is a maintainer-only reproducibility tool; normal build/test/publish never
downloads fonts or runs Python. Acquire the pinned Fontsource packages with:

  npm pack @fontsource-variable/inter@5.3.0 \
    @fontsource-variable/source-serif-4@5.3.0 \
    @fontsource-variable/jetbrains-mono@5.3.0 \
    @fontsource/comic-neue@5.3.0 --pack-destination /tmp/coral-fontsource

Extract each tarball below SOURCE_ROOT/{inter,serif,mono,handwritten}/package,
install scripts/font-requirements.txt, and pass SOURCE_ROOT to this script.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
from pathlib import Path
import shutil
from typing import Any

import fontTools
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def javascript_number_semantics(value: Any) -> Any:
    """Normalize integral floats as JavaScript JSON.stringify observes them."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {key: javascript_number_semantics(member) for key, member in value.items()}
    if isinstance(value, list):
        return [javascript_number_semantics(member) for member in value]
    return value


def metrics(path: Path, weight: int) -> dict[str, Any]:
    font = TTFont(path)
    if "fvar" in font:
        axes = {axis.axisTag: axis.defaultValue for axis in font["fvar"].axes}
        if "wght" in axes:
            axes["wght"] = weight
        font = instantiateVariableFont(font, axes, inplace=False)

    units_per_em = font["head"].unitsPerEm
    hhea = font["hhea"]
    cmap = font.getBestCmap() or {}
    horizontal = font["hmtx"].metrics
    advances = {
        codepoint: round(horizontal[glyph][0] / units_per_em, 6)
        for codepoint, glyph in sorted(cmap.items())
        if glyph in horizontal
    }
    fallback = advances.get(0xFFFD, advances.get(ord("?"), 0.6))
    return {
        "unitsPerEm": units_per_em,
        "ascent": round(hhea.ascent / units_per_em, 6),
        "descent": round(abs(hhea.descent) / units_per_em, 6),
        "fallback": fallback,
        "advances": advances,
    }


def ts_literal(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source_root", type=Path)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
    )
    args = parser.parse_args()

    pin_path = args.repo_root / "scripts/font-assets.json"
    pins = json.loads(pin_path.read_text(encoding="utf-8"))
    fontsource_version = pins["fontsourceVersion"]
    fonttools_version = pins["fontToolsVersion"]
    unicode_range = pins["unicodeRange"]
    raw_asset_budget = pins["rawAssetBudget"]
    if fontTools.__version__ != fonttools_version:
        raise RuntimeError(
            f"FontTools {fontTools.__version__} does not match pinned {fonttools_version}"
        )

    generated: dict[str, Any] = {}
    manifest_rows: list[dict[str, Any]] = []
    unique_assets: set[Path] = set()

    for spec in pins["fonts"]:
        package = args.source_root / spec["directory"] / "package"
        metadata_path = package / "package.json"
        if not metadata_path.is_file():
            raise FileNotFoundError(f"Missing package metadata for {spec['id']}")
        package_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        expected_metadata = {
            "name": spec["package"],
            "version": fontsource_version,
            "license": spec["license"]["id"],
        }
        actual_metadata = {key: package_metadata.get(key) for key in expected_metadata}
        if actual_metadata != expected_metadata:
            raise RuntimeError(
                f"Package metadata mismatch for {spec['id']}: "
                f"expected {expected_metadata}, got {actual_metadata}"
            )

        asset400 = spec["assets"]["400"]
        asset700 = spec["assets"]["700"]
        path400 = package / "files" / asset400["file"]
        path700 = package / "files" / asset700["file"]
        if not path400.is_file() or not path700.is_file():
            raise FileNotFoundError(f"Missing pinned font asset for {spec['id']}")

        data400 = path400.read_bytes()
        data700 = path700.read_bytes()
        for weight, data, expected in (
            (400, data400, asset400),
            (700, data700, asset700),
        ):
            if len(data) != expected["bytes"] or sha256(data) != expected["sha256"]:
                raise RuntimeError(f"Pinned {spec['id']} {weight} asset digest mismatch")

        license_source = package / spec["license"]["source"]
        license_data = license_source.read_bytes()
        if sha256(license_data) != spec["license"]["sha256"]:
            raise RuntimeError(f"Pinned {spec['id']} license digest mismatch")

        metric400 = metrics(path400, 400)
        metric700 = metrics(path700, 700)
        metric_digest = sha256(
            json.dumps(
                javascript_number_semantics({"400": metric400, "700": metric700}),
                sort_keys=True,
                separators=(",", ":"),
            ).encode()
        )

        generated[spec["id"]] = {
            "data400": "data:font/woff2;base64," + base64.b64encode(data400).decode(),
            "data700": "data:font/woff2;base64," + base64.b64encode(data700).decode(),
            "metrics": {"400": metric400, "700": metric700},
            "source": {
                "packageName": spec["package"],
                "version": fontsource_version,
                "upstreamVersion": spec["upstreamVersion"],
                "unicodeRange": unicode_range,
                "licensePath": f"third_party/fonts/{spec['license']['output']}",
                "licenseSha256": spec["license"]["sha256"],
                "url400": asset400["url"],
                "url700": asset700["url"],
                "sha256_400": sha256(data400),
                "sha256_700": sha256(data700),
                "bytes400": len(data400),
                "bytes700": len(data700),
                "metricsSha256": metric_digest,
            },
        }
        unique_assets.update((path400.resolve(), path700.resolve()))
        manifest_rows.append({
            "profile": spec["id"],
            "family": spec["family"],
            **generated[spec["id"]]["source"],
        })

    raw_bytes = sum(path.stat().st_size for path in unique_assets)
    if raw_bytes > raw_asset_budget:
        raise RuntimeError(f"Raw assets {raw_bytes} exceed {raw_asset_budget}")

    output = args.repo_root / "packages/render/src/text/generated-fonts.ts"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        "/** GENERATED by scripts/generate-font-assets.py; do not edit. */\n"
        f"/** Fontsource {fontsource_version}; FontTools {fonttools_version}. */\n"
        "export interface GeneratedMetricProfile { readonly unitsPerEm: number; readonly ascent: number; readonly descent: number; readonly fallback: number; readonly advances: Readonly<Record<number, number>>; }\n"
        "export interface GeneratedFontAsset { readonly data400: string; readonly data700: string; readonly metrics: Readonly<Record<400 | 700, GeneratedMetricProfile>>; readonly source: { readonly packageName: string; readonly version: string; readonly upstreamVersion: string; readonly unicodeRange: string; readonly licensePath: string; readonly licenseSha256: string; readonly url400: string; readonly url700: string; readonly sha256_400: string; readonly sha256_700: string; readonly bytes400: number; readonly bytes700: number; readonly metricsSha256: string; }; }\n"
        "export const GENERATED_FONT_ASSETS: Readonly<Record<string, GeneratedFontAsset>> = "
        + ts_literal(generated)
        + ";\n",
        encoding="utf-8",
    )

    third_party = args.repo_root / "packages/render/third_party/fonts"
    third_party.mkdir(parents=True, exist_ok=True)
    for spec in pins["fonts"]:
        source = args.source_root / spec["directory"] / "package" / spec["license"]["source"]
        shutil.copyfile(source, third_party / spec["license"]["output"])

    manifest = [
        "# Bundled Font Manifest",
        "",
        "Generated by `scripts/generate-font-assets.py`. Runtime, build, test,",
        f"and publish do not download fonts. All assets are Fontsource {fontsource_version}",
        "Latin normal WOFF2 files under the adjacent OFL-1.1 license copies.",
        "Coral does not modify font binaries; `Coral ...` names are CSS aliases.",
        "",
        f"Unique raw asset bytes: **{raw_bytes}** (budget: {raw_asset_budget}).",
        f"Packed-render delta budget: **{pins['packedDeltaBudget']}** bytes.",
        "Unicode range: `" + unicode_range + "`.",
        "",
        "Reproduce from repository root with the package names/versions below:",
        "",
        "```sh",
        "python3 -m pip install --target /tmp/coral-fonttools -r scripts/font-requirements.txt",
        "# npm pack each manifest package@5.3.0 and extract it under SOURCE_ROOT/<directory>/package",
        "PYTHONPATH=/tmp/coral-fonttools python3 scripts/generate-font-assets.py SOURCE_ROOT",
        "```",
        "",
        f"Generator tool versions: Fontsource {fontsource_version}; FontTools {fonttools_version}.",
        "",
        "```json",
        json.dumps(manifest_rows, indent=2, sort_keys=True),
        "```",
        "",
        "Metric generation instantiates variable faces at weights 400 and 700",
        "with their default axes, then records cmap horizontal advances divided",
        "by units-per-em. Browser shaping features are disabled by the registry",
        "CSS; deterministic layout rounds each per-codepoint advance upward so",
        "browser grid fitting cannot exceed the supported Latin text bounds.",
        "",
        "Reserved-font-name assessment: Fontsource supplies these binaries under",
        "OFL-1.1. Coral neither changes their name tables nor presents a modified",
        "binary under an upstream reserved name; its CSS aliases begin with",
        "`Coral`. See each adjacent license for the exact copyright notice.",
        "",
    ]
    (third_party / "README.md").write_text("\n".join(manifest), encoding="utf-8")

    print(f"generated {output}")
    print(f"unique raw WOFF2 bytes: {raw_bytes}/{raw_asset_budget}")


if __name__ == "__main__":
    main()
