import { StringDecoder } from 'node:string_decoder';
import { ParseError, ErrorCode } from '../ParseError.js';

/**
 * EncodingRegistry — owns the set of known EncodingDescriptors.
 *
 * A descriptor is a pure data + factory bundle:
 *   {
 *     name, aliases,
 *     bomBytes            // Buffer | null — signature to detect this encoding via BOM
 *     selfSynchronizing   // boolean — true if an ASCII delimiter byte (<,>,",')
 *                         //   can never appear as part of a multi-byte sequence.
 *                         //   Only self-synchronizing encodings are eligible for
 *                         //   BufferSource's byte-level scan fast path.
 *     variableWidth       // boolean — true if bytes-per-character varies.
 *                         //   Informational only for now (position reporting
 *                         //   is index-only, so nothing currently branches
 *                         //   on this) — kept on the descriptor shape so
 *                         //   existing custom-encoding registrations don't
 *                         //   need to change.
 *     createDecoder()     // -> { write(buf): string, end(): string } stateful decoder
 *   }
 *
 * SRP: this class only stores/validates/resolves descriptors. It knows nothing
 * about scanning strategy — see ScanStrategy/, composed together in
 * EncodingProfile.js.
 */
export default class EncodingRegistry {
  constructor() {
    this._byName = new Map();
    this._seedDefaults();
  }

  _seedDefaults() {
    this.register({
      name: 'utf8',
      aliases: ['utf-8'],
      bomBytes: Buffer.from([0xef, 0xbb, 0xbf]),
      selfSynchronizing: true,
      variableWidth: true,
      createDecoder: () => new StringDecoder('utf8'),
    });
    this.register({
      name: 'ascii',
      aliases: [],
      bomBytes: null,
      selfSynchronizing: true,
      variableWidth: false,
      createDecoder: () => new StringDecoder('ascii'),
    });
    this.register({
      name: 'latin1',
      aliases: ['iso-8859-1', 'binary'],
      bomBytes: null,
      selfSynchronizing: true,
      variableWidth: false,
      createDecoder: () => new StringDecoder('latin1'),
    });
    this.register({
      name: 'utf16le',
      aliases: ['utf-16le', 'ucs2', 'ucs-2'],
      bomBytes: Buffer.from([0xff, 0xfe]),
      selfSynchronizing: false,
      variableWidth: true,
      createDecoder: () => new StringDecoder('utf16le'),
    });
    this.register({
      name: 'utf16be',
      aliases: ['utf-16be'],
      // Node has no native utf16be decoder; byte-swap then decode as utf16le.
      bomBytes: Buffer.from([0xfe, 0xff]),
      selfSynchronizing: false,
      variableWidth: true,
      createDecoder: () => makeUtf16BeDecoder(),
    });
  }

  /**
   * Register a descriptor. Validates shape immediately (fail-fast), same
   * spirit as ValueParserRegistry.register() in base-output-builder: a
   * broken custom encoding should throw at registration time, not silently
   * corrupt data three parses later.
   */
  register(descriptor) {
    if (!descriptor || typeof descriptor.name !== 'string' || !descriptor.name) {
      throw new ParseError('Encoding descriptor requires a non-empty "name"', ErrorCode.INVALID_DECODER);
    }
    if (typeof descriptor.createDecoder !== 'function') {
      throw new ParseError(`Encoding "${descriptor.name}" is missing createDecoder()`, ErrorCode.INVALID_DECODER);
    }
    const probe = descriptor.createDecoder();
    if (!probe || typeof probe.write !== 'function' || typeof probe.end !== 'function') {
      throw new ParseError(
        `Encoding "${descriptor.name}"'s createDecoder() must return an object with write()/end()`,
        ErrorCode.INVALID_DECODER
      );
    }
    const resolved = {
      selfSynchronizing: false, // safe default per savepoint §3 — opt-in speed, not opt-in correctness
      variableWidth: true,
      aliases: [],
      bomBytes: null,
      ...descriptor,
    };
    this._byName.set(resolved.name.toLowerCase(), resolved);
    for (const alias of resolved.aliases) this._byName.set(alias.toLowerCase(), resolved);
  }

  resolve(name) {
    const descriptor = this._byName.get(String(name).toLowerCase());
    if (!descriptor) {
      throw new ParseError(`Unsupported encoding "${name}"`, ErrorCode.UNSUPPORTED_ENCODING);
    }
    return descriptor;
  }

  /** All descriptors that carry a BOM signature, for detection (longest first). */
  bomCandidates() {
    const seen = new Set();
    const out = [];
    for (const d of this._byName.values()) {
      if (d.bomBytes && !seen.has(d.name)) {
        seen.add(d.name);
        out.push(d);
      }
    }
    return out.sort((a, b) => b.bomBytes.length - a.bomBytes.length);
  }
}

function makeUtf16BeDecoder() {
  const inner = new StringDecoder('utf16le');
  let pending = null; // holds a single odd leftover byte across writes
  return {
    write(buf) {
      let work = pending ? Buffer.concat([pending, buf]) : buf;
      pending = null;
      if (work.length % 2 === 1) {
        pending = work.subarray(work.length - 1);
        work = work.subarray(0, work.length - 1);
      }
      const swapped = Buffer.from(work);
      for (let i = 0; i + 1 < swapped.length; i += 2) {
        const tmp = swapped[i];
        swapped[i] = swapped[i + 1];
        swapped[i + 1] = tmp;
      }
      return inner.write(swapped);
    },
    end() {
      return inner.end();
    },
  };
}

export const defaultEncodingRegistry = new EncodingRegistry();
