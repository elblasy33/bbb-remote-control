// Messages exchanged between participants over the "remote-control" data channel.
// Every message names its intended recipient in `to`; the sender is taken from the
// server-side `createdBy` field (never from the payload) so it cannot be spoofed.

export interface RequestMessage {
  kind: 'request';
  reqId: string;
  to: string; // presenter userId
  fromName: string;
}

export interface GrantMessage {
  kind: 'grant';
  reqId: string;
  to: string; // requester userId
  rustdeskId: string;
}

export interface DenyMessage {
  kind: 'deny';
  reqId: string;
  to: string;
  reason: 'denied' | 'busy';
}

export interface CancelMessage {
  kind: 'cancel';
  reqId: string;
  to: string; // presenter userId
}

export type RcMessage = RequestMessage | GrantMessage | DenyMessage | CancelMessage;

// Loaded at runtime from config.json next to the plugin bundle (written by deploy.sh).
export interface RcConfig {
  rustdeskHost: string; // ID/relay server reachable directly (NOT behind Cloudflare proxy)
  rustdeskKey: string; // hbbs public key (id_ed25519.pub)
  configString: string; // RustDesk "Import server config" string
  windowsExeName: string; // rename the Windows installer to this to auto-configure it
  downloadUrl: string;
  requestRoles: 'moderator' | 'all'; // who may request control
}

export interface IncomingRequest {
  reqId: string;
  fromId: string;
  fromName: string;
}

export type OutgoingStatus = 'pending' | 'granted' | 'denied' | 'busy' | 'timeout';

export interface OutgoingRequest {
  reqId: string;
  presenterId: string;
  presenterName: string;
  status: OutgoingStatus;
  rustdeskId?: string;
}
