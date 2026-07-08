import { createByteScanStrategy, decodeCharAtFixedWidth1, decodeCharAtUtf8 } from './ScanStrategy/ByteScanStrategy.js';
import { createCharScanStrategy } from './ScanStrategy/CharScanStrategy.js';
import { sniff } from './EncodingDetector.js';
import { defaultEncodingRegistry } from './EncodingRegistry.js';

/**
 * buildProfileForBuffer(bytes, decodingOptions, registry) -> { descriptor, bomLength, scanStrategy }
 *
 * The ONE place encoding decisions are made for BufferSource. Called once
 * per parseBytesArr() call, never per-token — every field on the returned
 * object is a concrete, already-resolved strategy, so BufferSource itself
 * never branches on an encoding name again (Dependency Inversion: BufferSource
 * depends on the ScanStrategy interface, not on "which encoding is this").
 */
export function buildProfileForBuffer(bytes, decodingOptions = {}, registry = defaultEncodingRegistry) {
  const requested = decodingOptions.encoding || 'auto';
  let name, bomLength;
  if (requested === 'auto') {
    const detected = sniff(bytes, registry);
    name = detected.encoding;
    bomLength = detected.bomLength;
  } else {
    name = requested;
    bomLength = 0;
  }
  const descriptor = registry.resolve(name);
  const scanStrategy = descriptor.selfSynchronizing
    ? createByteScanStrategy(
        descriptor.name === 'utf8' ? decodeCharAtUtf8 : decodeCharAtFixedWidth1,
        descriptor.name // 'utf8'/'ascii'/'latin1' — all valid Buffer#toString() encodings
      )
    : createCharScanStrategy();

  return { descriptor, bomLength, scanStrategy, decodeFirst: !descriptor.selfSynchronizing };
}

/**
 * buildDecoderForStream(decodingOptions, registry) -> descriptor's stateful
 * decoder, for FeedableSource/StreamSource. These two are already decode-
 * first architecturally (see CharScanStrategy's doc comment) so they only
 * ever need the decoder half of a profile, never a scan strategy.
 *
 * Streaming auto-detection (peeking enough of the first feed() chunk before
 * a decoder can even be constructed) is NOT implemented in this pass — see
 * the companion doc's "Known follow-ups" section. Until then, 'auto' on a
 * streaming source falls back to utf8, same as today's hardcoded behavior.
 */
export function buildDecoderForStream(decodingOptions = {}, registry = defaultEncodingRegistry) {
  const requested = decodingOptions.encoding && decodingOptions.encoding !== 'auto'
    ? decodingOptions.encoding
    : 'utf8';
  return registry.resolve(requested).createDecoder();
}
