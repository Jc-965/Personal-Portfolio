# Grid asset provenance

## Environment

`environment/modern_buildings_night_1k.hdr`: Modern Buildings Night,
https://polyhaven.com/a/modern_buildings_night. CC0 1.0:
https://polyhaven.com/license.

## Surface scans

All surface scans are Poly Haven CC0 1.0 assets. Source files were resolved using
`https://api.polyhaven.com/files/ASSET_ID`. Exact download URLs are recorded in
[materials/sources.json](materials/sources.json).

| Local directory | Source |
| --- | --- |
| materials/asphalt | https://polyhaven.com/a/asphalt_02 |
| materials/concrete | https://polyhaven.com/a/concrete_floor_02 |
| materials/facade | https://polyhaven.com/a/concrete_wall_006 |
| materials/paintedMetal | https://polyhaven.com/a/blue_metal_plate |
| materials/corrugatedMetal | https://polyhaven.com/a/corrugated_iron |
| materials/rust | https://polyhaven.com/a/rusty_metal_sheet |
| materials/tile | https://polyhaven.com/a/interior_tiles |
| materials/velvet | https://polyhaven.com/a/velour_velvet |

Each directory contains 1024 x 1024 `albedo`, OpenGL `normal`, and `roughness`
maps as KTX2 and quality-90 WebP. Albedo uses sRGB; normal and roughness are linear
data. WebP variants were converted with Sharp. KTX2 variants were encoded with
KTX-Software 4.4.2 `toktx --t2 --encode uastc --uastc_quality 2 --zcmp 18
--genmipmap --assign_oetf srgb|linear --assign_primaries bt709`. The compiler was
run from a temporary local directory and is not an application dependency.

Runtime loads KTX2 with device-specific transcoding, falling back to WebP if a
compressed texture fails. Only asphalt and sidewalk sets are prefetched at boot.
Facade and structural metal are requested by their render consumers; district
surfaces are requested by `SurfaceMaterial` when mounted and released after the
last consumer unmounts. Glass requires no external scan.

## Basis Universal transcoder

`basis/basis_transcoder.js` and `basis/basis_transcoder.wasm` were copied from
three 0.185.1 `examples/jsm/libs/basis`. Upstream:
https://github.com/BinomialLLC/basis_universal. These files are **Apache-2.0**,
not CC0. The Apache license is bundled at [basis/LICENSE](basis/LICENSE).
Three wrapper source uses the three MIT license and remains in the npm package.
