import { micStream } from './voice.js';

/**
 * Talking to friends in other rooms (research/notes/SHARING.md, 16.11): the voice goes straight between the players' browsers
 * (WebRTC); the room only passes the handshake on (src/together.ts, `rtc` messages). A friend's voice comes
 * from where their head is: a panner in Web Audio, moved every frame (voicePlace) while the listener follows
 * the player's own head (voiceListener).
 *
 * The one with the lower id calls, the other answers: two calls never cross. STUN is Google's; with no TURN
 * server, two very strict networks may not find each other (then there is no voice; the game goes on).
 */

const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

interface Link {
  pc: RTCPeerConnection;
  panner?: PannerNode;
  /** Chromium plays a remote stream into Web Audio only while a media element holds it too (muted) */
  holder?: HTMLAudioElement;
}

const links = new Map<number, Link>();
let ctx: AudioContext | undefined;
let send: (to: number, data: unknown) => void = () => {};

/** Web Audio, once; it starts on the next touch if the browser holds it back. */
function audio(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    const wake = () => ctx?.state === 'suspended' && ctx.resume();
    addEventListener('pointerup', wake);
    wake();
  }
  return ctx;
}

/** My voice: the microphone Punto hears too (src/voice.ts); a silent one if there is none, so the call still goes. */
async function myVoice(): Promise<MediaStream> {
  try {
    return await micStream();
  } catch (error) {
    console.warn('[voice] no microphone: the friends hear nothing from here', error);
    return audio().createMediaStreamDestination().stream;
  }
}

function linkTo(id: number): Link {
  const have = links.get(id);
  if (have) return have;
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const link: Link = { pc };
  links.set(id, link);
  pc.onicecandidate = (event) => event.candidate && send(id, { ice: event.candidate.toJSON() });
  pc.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track]);
    const holder = new Audio();
    holder.muted = true;
    holder.srcObject = stream;
    holder.play().catch(() => {});
    const a = audio();
    const panner = new PannerNode(a, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, rolloffFactor: 0.6 });
    a.createMediaStreamSource(stream).connect(panner).connect(a.destination);
    link.holder = holder;
    link.panner = panner;
    console.info(`[voice] hearing player ${id}`);
  };
  pc.onconnectionstatechange = () => console.info(`[voice] player ${id}: ${pc.connectionState}`);
  return link;
}

/** Starts the voice: `signal` passes a handshake message to one player through the room. */
export function voiceStart(signal: (to: number, data: unknown) => void): void {
  send = signal;
}

/** A player is in the room: the one with the lower id calls. */
export async function voiceJoin(id: number, myId: number): Promise<void> {
  const link = linkTo(id);
  const stream = await myVoice();
  for (const track of stream.getAudioTracks()) if (!link.pc.getSenders().some((s) => s.track === track)) link.pc.addTrack(track, stream);
  if (myId < id) {
    await link.pc.setLocalDescription(await link.pc.createOffer());
    send(id, { sdp: link.pc.localDescription });
  }
}

/** A handshake message from player `from`. */
export async function voiceSignal(from: number, data: { sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit }): Promise<void> {
  const link = linkTo(from);
  try {
    if (data.sdp) {
      if (data.sdp.type === 'offer') {
        const stream = await myVoice();
        for (const track of stream.getAudioTracks()) if (!link.pc.getSenders().some((s) => s.track === track)) link.pc.addTrack(track, stream);
      }
      await link.pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await link.pc.setLocalDescription(await link.pc.createAnswer());
        send(from, { sdp: link.pc.localDescription });
      }
    } else if (data.ice) await link.pc.addIceCandidate(data.ice);
  } catch (error) {
    console.warn(`[voice] the handshake with player ${from} failed`, error);
  }
}

/** A player left: their voice goes. */
export function voiceLeave(id: number): void {
  const link = links.get(id);
  if (!link) return;
  link.pc.close();
  link.panner?.disconnect();
  if (link.holder) link.holder.srcObject = null;
  links.delete(id);
}

/** Where a player's head is in the world now: their voice comes from there. */
export function voicePlace(id: number, x: number, y: number, z: number): void {
  const panner = links.get(id)?.panner;
  if (!panner || !ctx) return;
  const t = ctx.currentTime;
  panner.positionX.setTargetAtTime(x, t, 0.03);
  panner.positionY.setTargetAtTime(y, t, 0.03);
  panner.positionZ.setTargetAtTime(z, t, 0.03);
}

/** The player's own ears: where their head is and which way it looks (forward, up), in the world. */
export function voiceListener(x: number, y: number, z: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
  if (!ctx || !links.size) return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  l.positionX.setTargetAtTime(x, t, 0.03);
  l.positionY.setTargetAtTime(y, t, 0.03);
  l.positionZ.setTargetAtTime(z, t, 0.03);
  l.forwardX.setTargetAtTime(fx, t, 0.03);
  l.forwardY.setTargetAtTime(fy, t, 0.03);
  l.forwardZ.setTargetAtTime(fz, t, 0.03);
  l.upX.setTargetAtTime(ux, t, 0.03);
  l.upY.setTargetAtTime(uy, t, 0.03);
  l.upZ.setTargetAtTime(uz, t, 0.03);
}
