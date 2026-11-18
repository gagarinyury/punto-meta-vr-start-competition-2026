import {
  AdditiveBlending,
  AssetManager,
  BackSide,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';

export type PlanetName =
  | 'sun'
  | 'mercury'
  | 'moon'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

const DIR = './textures/planets';

/** Puts a planet map onto a material once it has loaded. */
function withMap<T extends Material & { map: unknown }>(material: T, file: string, slot: 'map' | 'alphaMap' = 'map'): T {
  void AssetManager.loadTexture(`${DIR}/${file}`).then((texture) => {
    if (slot === 'map') {
      texture.colorSpace = SRGBColorSpace;
    }
    (material as unknown as Record<string, unknown>)[slot] = texture;
    material.needsUpdate = true;
  });
  return material;
}

/**
 * A real planet with NASA's map on it (public domain), `radius` in metres.
 * The Sun glows by itself; Earth has clouds and a thin blue air; Saturn has
 * its rings. The equator is horizontal; spin it with
 * `planet.rotation.y += delta * speed` and tilt it with `rotation.z`.
 */
// The fuse (Yury, 18.11: «предохранитель, чтобы не падало, если чего-то нет»): any other name (Pluto, Ceres, a made-up
// world) is a grey cratered ball on the Moon's map instead of a type error — the build never fails on a missing planet.
const MAPPED = new Set<string>(['sun', 'mercury', 'moon', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

export function planet(asked: PlanetName | (string & {}), options: { radius?: number } = {}): Group {
  const name = String(asked).toLowerCase().trim();
  const radius = options.radius ?? 0.15;
  const group = new Group();
  group.name = name;
  const sphere = new SphereGeometry(radius, 64, 32);
  const shell = (scale: number, material: Material) => {
    const mesh = new Mesh(new SphereGeometry(radius * scale, 64, 32), material);
    group.add(mesh);
    return mesh;
  };

  if (name === 'sun') {
    group.add(new Mesh(sphere, withMap(new MeshBasicMaterial(), 'sun.jpg')));
    shell(1.18, new MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.25, side: BackSide, blending: AdditiveBlending, depthWrite: false }));
    return group;
  }

  if (!MAPPED.has(name)) {
    console.info(`[planets] no map for "${asked}": a grey cratered ball`);
    group.add(new Mesh(sphere, withMap(new MeshStandardMaterial({ roughness: 0.95, color: 0xb8b0a8 }), 'moon.jpg')));
    return group;
  }
  group.add(new Mesh(sphere, withMap(new MeshStandardMaterial({ roughness: 0.9 }), `${name}.jpg`)));

  if (name === 'earth') {
    shell(1.012, withMap(new MeshStandardMaterial({ transparent: true, depthWrite: false }), 'earth-clouds.jpg', 'alphaMap'));
    shell(1.05, new MeshBasicMaterial({ color: 0x4a90ff, transparent: true, opacity: 0.18, side: BackSide, blending: AdditiveBlending, depthWrite: false }));
  }

  if (name === 'saturn') {
    // The ring map is a radial strip: across it runs from the inner to the outer edge.
    const inner = radius * 1.24;
    const outer = radius * 2.27;
    const ring = new RingGeometry(inner, outer, 128, 1);
    const position = ring.attributes.position;
    const uv = ring.attributes.uv;
    for (let i = 0; i < position.count; i++) {
      uv.setXY(i, (Math.hypot(position.getX(i), position.getY(i)) - inner) / (outer - inner), 0.5);
    }
    const rings = new Mesh(
      ring,
      withMap(new MeshBasicMaterial({ transparent: true, side: DoubleSide, depthWrite: false }), 'saturn-rings.png'),
    );
    rings.rotation.x = -Math.PI / 2; // in the plane of the equator
    group.add(rings);
  }
  return group;
}

/**
 * A real planet with NASA's map on it (public domain), `radius` in metres.
 * The Sun glows by itself; Earth has clouds and a thin blue air; Saturn has
 * its rings. The equator is horizontal; spin it with
 * `planet.rotation.y += delta * speed` and tilt it with `rotation.z`.
 */
export const realPlanet = planet;
