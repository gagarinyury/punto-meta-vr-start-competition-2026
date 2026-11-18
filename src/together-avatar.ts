import {
  AssetManager,
  BackSide,
  BoxGeometry,
  CanvasTexture,
  Color,
  FrontSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  ShaderMaterial,
  type SkinnedMesh,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  BufferAttribute,
} from '@iwsdk/core';
import { AnimatedControllerHand } from '@iwsdk/xr-input';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/**
 * A player from another room, as you see them at your table (research/notes/SHARING.md, 16.11): a headset where their head
 * is, a glowing plate with their name over it, and the WebXR hands IWSDK draws for your own hands — the same
 * model, the same outline, in the player's colour — so it is plain that a person is there.
 *
 * Everything is in the shared frame (src/together.ts): `group` goes under the stage root.
 *
 * The headset is public/models/together/headset.glb when there is one (origin between the eyes, metres, +Y up,
 * looking down -Z as a WebXR head does); until then a simple one is built here.
 */

/** The 25 joints of a WebXR hand, in the order fillPoses() gives them; the hand model's bones have these names. */
export const JOINTS = [
  'wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...['index', 'middle', 'ring', 'pinky'].flatMap((f) =>
    ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((j) => `${f}-finger-${j}`),
  ),
];

// The hand model IWSDK draws (@iwsdk/xr-input loads it from the WebXR input profiles).
const HANDS = 'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';
const HEADSET = './models/together/headset.glb';
const COLORS = [0x35d8ff, 0xffb347, 0x4dff8f, 0xb07cff]; // by seat

// IWSDK's hand look (@iwsdk/xr-input, visual/impl/animated-hand.js, MIT, Meta): the hand itself only writes
// depth, an outline round it shows, fading out towards the wrist. Here the outline is the player's colour.
const depthOnly = new ShaderMaterial({
  uniforms: { outlineThickness: { value: 0.0012 } },
  vertexShader: `
    #include <common>
    #include <skinning_pars_vertex>
    uniform float outlineThickness;
    void main() {
      #include <skinbase_vertex>
      #include <beginnormal_vertex>
      #include <skinnormal_vertex>
      #include <defaultnormal_vertex>
      vec3 transformed = position - normal * outlineThickness;
      #include <skinning_vertex>
      gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
    }`,
  fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
  transparent: true,
  depthWrite: true,
  depthTest: true,
  alphaTest: 0.05,
  side: FrontSide,
});
function outline(color: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { outlineColor: { value: new Color(color) }, opacityThresholds: { value: new Vector2(0.03, 0.08) } },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      attribute float wristDist;
      varying float vWristDist;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        vec3 transformed = vec3(position);
        #include <skinning_vertex>
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        vWristDist = wristDist;
      }`,
    fragmentShader: `
      uniform vec3 outlineColor;
      uniform vec2 opacityThresholds;
      varying float vWristDist;
      void main() {
        gl_FragColor = vec4(outlineColor, clamp(smoothstep(opacityThresholds.x, opacityThresholds.y, vWristDist), 0.0, 1.0));
      }`,
    side: BackSide,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
}

let handModels: Promise<Record<'left' | 'right', Object3D>> | undefined;
/** The two hand models, loaded once. */
function loadHands(): Promise<Record<'left' | 'right', Object3D>> {
  handModels ??= Promise.all(
    (['left', 'right'] as const).map((side) => AssetManager.loadGLTF(`${HANDS}${side}.glb`, `together-hand-${side}`)),
  ).then(([left, right]) => {
    // each vertex's distance from the wrist, for the outline's fade (as IWSDK does it)
    for (const gltf of [left, right]) {
      const mesh = gltf.scene.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh;
      const geometry = mesh.geometry;
      if (geometry.getAttribute('wristDist')) continue;
      gltf.scene.updateMatrixWorld(true);
      const wrist = mesh.worldToLocal(gltf.scene.getObjectByName('wrist')!.getWorldPosition(new Vector3()));
      const position = geometry.getAttribute('position');
      const distance = new Float32Array(position.count);
      for (let i = 0; i < position.count; i++) {
        distance[i] = Math.hypot(position.getX(i) - wrist.x, position.getY(i) - wrist.y, position.getZ(i) - wrist.z);
      }
      geometry.setAttribute('wristDist', new BufferAttribute(distance, 1));
    }
    return { left: left.scene, right: right.scene };
  });
  return handModels;
}

let headsetModel: Promise<Object3D | null> | undefined;
/** Yury's headset model if it is there; null: build the simple one. */
function loadHeadset(): Promise<Object3D | null> {
  headsetModel ??= AssetManager.loadGLTF(HEADSET, 'together-headset').then(
    (gltf) => gltf.scene,
    () => null,
  );
  return headsetModel;
}

/** A stand-in headset until the real model comes: a visor, a shell, a strap. Looks down -Z, origin between the eyes. */
function simpleHeadset(color: number): Group {
  const g = new Group();
  const shell = new MeshStandardMaterial({ color: 0xeceff3, roughness: 0.45 });
  const body = new Mesh(new BoxGeometry(0.19, 0.1, 0.075), shell);
  body.position.z = -0.045;
  const front = new Mesh(new BoxGeometry(0.175, 0.085, 0.012), new MeshStandardMaterial({ color: 0x14171d, roughness: 0.18, metalness: 0.35 }));
  front.position.z = -0.087;
  const glow = new Mesh(new BoxGeometry(0.11, 0.006, 0.004), new MeshBasicMaterial({ color }));
  glow.position.set(0, -0.034, -0.094);
  const strap = new Mesh(new TorusGeometry(0.1, 0.011, 10, 40, Math.PI * 1.25), new MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.8 }));
  strap.rotation.set(Math.PI / 2, 0, -Math.PI * 0.125);
  strap.position.z = 0.03;
  g.add(body, front, glow, strap);
  return g;
}

/** A plate with the player's name that glows in their colour. */
function namePlate(name: string, color: number): Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 160;
  const x = c.getContext('2d')!;
  const hex = `#${new Color(color).getHexString()}`;
  x.shadowColor = hex;
  x.shadowBlur = 34;
  x.fillStyle = 'rgba(10,12,16,0.88)';
  x.beginPath();
  x.roundRect(40, 32, 432, 96, 48);
  x.fill();
  x.shadowBlur = 18;
  x.lineWidth = 6;
  x.strokeStyle = hex;
  x.stroke();
  x.shadowBlur = 14;
  x.fillStyle = '#ffffff';
  x.font = '700 54px system-ui, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 256, 82, 400);
  const map = new CanvasTexture(c);
  map.colorSpace = SRGBColorSpace;
  const plate = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false }));
  plate.scale.set(0.22, 0.069, 1);
  plate.raycast = () => {}; // a Sprite needs a camera to be ray-tested and throws without one
  plate.renderOrder = 5;
  return plate;
}

/** A player holding a controller, not tracked fingers: where the controller is (its grip), how far the trigger
 *  and the grip button are pressed (0..1). The hand is drawn on it in a made-up pose from those. */
export interface Pad {
  position: Vector3;
  quaternion: Quaternion;
  /** trigger, grip button, the thumb's button (0..1) */
  trigger: number;
  squeeze: number;
  thumb: number;
}

/** IWSDK's own hand on a controller (@iwsdk/xr-input, AnimatedControllerHand): every joint's pose on the grip,
 *  released and pressed; the index finger goes with the trigger, the thumb with the thumb's button, the rest
 *  with the grip button. Written for a right hand; a left one is its mirror, as IWSDK does it. */
function padPoses(side: 1 | -1): { rest: { p: Vector3; q: Quaternion }[]; pressed: { p: Vector3; q: Quaternion }[]; button: number[] } {
  const m = new Matrix4();
  const s = new Vector3();
  const pose = (table: Record<string, number[]>) =>
    JOINTS.map((name) => {
      const p = new Vector3();
      const q = new Quaternion();
      m.fromArray(table[name]).decompose(p, q, s);
      if (side === 1) {
        p.x *= -1;
        q.x *= -1;
        q.w *= -1;
      }
      return { p, q };
    });
  return {
    rest: pose(AnimatedControllerHand.defaultPose as Record<string, number[]>),
    pressed: pose(AnimatedControllerHand.pressedPose as Record<string, number[]>),
    button: JOINTS.map((name) => (name.startsWith('index') ? 0 : name.startsWith('thumb') ? 2 : 1)),
  };
}

/** One WebXR hand of the player: its 25 bones take the joints' poses as they come. */
class Hand {
  readonly root: Object3D;
  private readonly bones: Object3D[];
  private readonly pad: ReturnType<typeof padPoses>;

  constructor(model: Object3D, color: number, side: 1 | -1) {
    this.pad = padPoses(side);
    this.root = cloneSkinned(model);
    // the model is cached by its address, and IWSDK's own hand is the same one, already put on a grip and
    // made 1.05 bigger: the copy starts from none of that, its bones take shared-frame poses as they are
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    this.root.scale.set(1, 1, 1);
    this.bones = JOINTS.map((name) => this.root.getObjectByName(name)!);
    const mesh = this.root.getObjectByProperty('type', 'SkinnedMesh') as SkinnedMesh;
    for (let up = this.bones[0].parent; up && up !== this.root; up = up.parent) up.scale.set(1, 1, 1);
    mesh.frustumCulled = false;
    mesh.material = depthOnly;
    const rim = mesh.clone();
    rim.material = outline(color);
    rim.renderOrder = 999;
    mesh.parent!.add(rim);
    this.root.visible = false;
  }

  /** A controller's hand: IWSDK's pose of a hand on a controller, put on the grip, each finger between released
   *  and pressed as far as its button is pressed. */
  holdPad(pad: Pad): void {
    this.root.visible = true;
    this.root.position.copy(pad.position);
    this.root.quaternion.copy(pad.quaternion);
    const values = [pad.trigger, pad.squeeze, pad.thumb];
    for (let j = 0; j < 25; j++) {
      const k = values[this.pad.button[j]];
      this.bones[j].position.lerpVectors(this.pad.rest[j].p, this.pad.pressed[j].p, k);
      this.bones[j].quaternion.slerpQuaternions(this.pad.rest[j].q, this.pad.pressed[j].q, k);
    }
  }

  /** `joints`: 25 × (x, y, z, qx, qy, qz, qw) in the shared frame, or null when the hand is not tracked. */
  update(joints: Float32Array | null): void {
    this.root.visible = joints !== null;
    if (!joints) return;
    // tracked: the bones are in the shared frame themselves (after a controller's hand, the root goes back)
    this.root.position.set(0, 0, 0);
    this.root.quaternion.identity();
    for (let j = 0; j < 25; j++) {
      const bone = this.bones[j];
      bone.position.fromArray(joints, j * 7);
      bone.quaternion.fromArray(joints, j * 7 + 3);
    }
  }
}

export class Avatar {
  /** Put this under the stage root: everything in it is in the shared frame. */
  readonly group = new Group();
  private readonly head = new Group();
  private readonly plate: Sprite;
  private left?: Hand;
  private right?: Hand;
  private seen = false;

  constructor(name: string, seat: number) {
    const color = COLORS[seat % COLORS.length];
    this.plate = namePlate(name, color);
    this.group.add(this.head, this.plate);
    this.group.visible = false;
    loadHeadset().then((model) => this.head.add(model ? model.clone() : simpleHeadset(color)));
    loadHands()
      .then((models) => {
        this.left = new Hand(models.left, color, 1);
        this.right = new Hand(models.right, color, -1);
        this.group.add(this.left.root, this.right.root);
      })
      .catch((error) => console.warn('[together] no hand models', error));
  }

  /**
   * One frame of this player: their head (null: nothing heard yet) and each hand's 25 joints
   * (null: that hand is not tracked). All in the shared frame.
   */
  update(
    head: { position: Vector3; quaternion: Quaternion } | null,
    left: Float32Array | Pad | null,
    right: Float32Array | Pad | null,
  ): void {
    if (!head) return;
    if (!this.seen) this.seen = this.group.visible = true;
    this.head.position.copy(head.position);
    this.head.quaternion.copy(head.quaternion);
    this.plate.position.copy(head.position).y += 0.16;
    if (left instanceof Float32Array || !left) this.left?.update(left);
    else this.left?.holdPad(left);
    if (right instanceof Float32Array || !right) this.right?.update(right);
    else this.right?.holdPad(right);
  }

  /** The player left. (The hand and headset models stay cached for the next one.) */
  remove(): void {
    this.group.removeFromParent();
    (this.plate.material as SpriteMaterial).map?.dispose();
    this.plate.material.dispose();
  }
}
