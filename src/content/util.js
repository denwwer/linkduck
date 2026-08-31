const PROTOCOL = /^https?:\/\//;

/**
 * Google's `ai` click parameter is base64url-encoded protobuf.
 * @param {string} value Raw `ai` parameter.
 * @returns {string|null} Destination URL, or null when none is recognisable.
 */
export function decodeUriRedirect(value) {
  if (!value) return null;

  let best = null;

  // The value carries a leading marker character before the payload, so a
  // straight decode is misaligned — a base64 string can never be 1 mod 4 long.
  // Rather than assume the marker is always one character, every start that
  // could be valid base64 is tried and the best result wins.
  for (let start = 0; start < 4; start++) {
    if ((value.length - start) % 4 === 1) continue;

    best = longestUrl(fromBase64Url(value.slice(start)), best);
  }

  return best;
}

function longestUrl(bytes, best) {
  if (!bytes) return best;

  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (
      bytes[i] !== 0x68 || // h
      bytes[i + 1] !== 0x74 || // t
      bytes[i + 2] !== 0x74 || // t
      bytes[i + 3] !== 0x70 // p
    ) {
      continue;
    }

    const length = declaredLength(bytes, i);

    if (!length || i + length > bytes.length) continue;

    const candidate = decode(bytes.subarray(i, i + length));

    // The message holds the bare origin as well as the full link; the longest
    // is the one that still carries its query string.
    if (isUrl(candidate) && candidate.length > (best?.length ?? 0)) {
      best = candidate;
    }
  }

  return best;
}

// Read the varint sitting immediately before `at`. Protobuf varints are
// little-endian base 128, so a length is at most three bytes for any URL worth
// keeping.
function declaredLength(bytes, at) {
  for (let width = 1; width <= 3; width++) {
    const start = at - width;

    if (start < 0) break;

    let value = 0;

    for (let i = width - 1; i >= 0; i--) {
      const byte = bytes[start + i];
      const last = i === width - 1;

      // Every byte but the last must have its continuation bit set.
      if (last === Boolean(byte & 0x80)) {
        value = 0;
        break;
      }

      value = value * 128 + (byte & 0x7f);
    }

    if (value >= 4) return value;
  }

  return 0;
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  } catch {
    return null;
  }
}

function decode(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function isUrl(value) {
  if (!PROTOCOL.test(value)) return false;

  try {
    return new URL(value).hostname.includes('.');
  } catch {
    return false;
  }
}
