type UnknownRecord = Record<string, unknown>;

export type PeerResolverClient = {
  getDialogs(params: { limit: number }): Promise<unknown[]>;
  getInputEntity(peer: string): Promise<unknown>;
};

const DIALOG_SCAN_LIMIT = 500;
const DIALOG_CACHE_MS = 5 * 60 * 1000;

/**
 * Resolves a user-supplied peer to an input entity.
 *
 * Accepts @usernames, "me", the `peer` id returned by telegram_list_dialogs
 * (marked ids such as -1001234567890), raw entity ids, or a chat name.
 * Numeric ids and names are resolved through the dialog list, because GramJS
 * cannot resolve bare ids that are not already in its in-memory entity cache.
 */
export function createPeerResolver(now: () => number = Date.now) {
  let cache: { at: number; dialogs: UnknownRecord[] } | undefined;

  async function loadDialogs(client: PeerResolverClient, fresh = false): Promise<UnknownRecord[]> {
    if (!fresh && cache && now() - cache.at < DIALOG_CACHE_MS) {
      return cache.dialogs;
    }
    const dialogs = (await client.getDialogs({ limit: DIALOG_SCAN_LIMIT })) as UnknownRecord[];
    cache = { at: now(), dialogs };
    return dialogs;
  }

  function findInDialogs(dialogs: UnknownRecord[], peer: string): UnknownRecord | undefined {
    if (/^-?\d+$/.test(peer)) {
      return dialogs.find((dialog) => {
        const entity = (dialog.entity ?? {}) as UnknownRecord;
        return String(dialog.id) === peer || String(entity.id) === peer;
      });
    }

    const needle = peer.toLowerCase();
    const exact = dialogs.filter((dialog) => dialogName(dialog).toLowerCase() === needle);
    if (exact.length === 1) {
      return exact[0];
    }
    const candidates = exact.length > 1 ? exact : dialogs.filter((dialog) => dialogName(dialog).toLowerCase().includes(needle));
    if (candidates.length === 1) {
      return candidates[0];
    }
    if (candidates.length > 1) {
      const options = candidates
        .slice(0, 10)
        .map((dialog) => `"${dialogName(dialog)}" (peer ${String(dialog.id)})`)
        .join(", ");
      throw new Error(`Ambiguous peer "${peer}". Matches: ${options}. Pass the peer id instead.`);
    }
    return undefined;
  }

  return async function resolvePeer(client: PeerResolverClient, rawPeer: string): Promise<unknown> {
    const peer = rawPeer.trim();
    const lower = peer.toLowerCase();

    if (peer.startsWith("@") || lower === "me" || lower === "self") {
      return client.getInputEntity(peer);
    }

    let match = findInDialogs(await loadDialogs(client), peer);
    if (!match) {
      match = findInDialogs(await loadDialogs(client, true), peer);
    }
    if (match) {
      return match.inputEntity ?? match.entity;
    }

    // Last resort: a username given without "@", or a phone number in contacts.
    try {
      return await client.getInputEntity(peer);
    } catch {
      throw new Error(
        `Could not find Telegram chat "${peer}". Use telegram_list_dialogs and pass its peer id or exact name.`,
      );
    }
  };
}

function dialogName(dialog: UnknownRecord): string {
  const entity = (dialog.entity ?? {}) as UnknownRecord;
  const name = dialog.name ?? entity.title ?? entity.username ?? entity.firstName ?? "";
  return String(name);
}
