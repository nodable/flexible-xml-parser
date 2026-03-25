import FeedableSource from './FeedableSource.js';

/**
 * StreamSource — input source that reads from a Node.js Readable stream.
 *
 * Extends FeedableSource so it shares the same buffer management and read
 * interface. attachStream() wires Node.js stream events. On each 'data'
 * event the chunk is appended to the buffer and onChunk is called so the
 * caller can run parseXml() incrementally. Parsing is therefore driven
 * chunk-by-chunk rather than once over the full accumulated document.
 */
export default class StreamSource extends FeedableSource {
  /**
   * Wire a Readable stream to this source.
   *
   * @param {NodeJS.ReadableStream} readable
   * @param {function(Error|null):void} onChunk
   *   Called after each successful feed() with null, or immediately with the
   *   feed error if the buffer limit is exceeded. The caller runs parseXml()
   *   inside this callback and handles UNEXPECTED_END (chunk boundary mid-token)
   *   by calling rewindToMark().
   * @param {function():void} onEnd
   *   Called when the stream ends cleanly. The caller should finalise the parse
   *   (finalizeXml) here.
   * @param {function(Error):void} onError
   *   Called with any stream-level error (e.g. 'error' event from the readable).
   */
  attachStream(readable, onChunk, onEnd, onError) {
    readable.on('data', chunk => {
      try {
        this.feed(typeof chunk === 'string' ? chunk : chunk.toString());
        onChunk(null); // chunk appended successfully — caller runs parseXml()
      } catch (err) {
        onChunk(err); // buffer overflow or coercion failure
      }
    });

    readable.on('error', onError);

    readable.on('end', () => {
      try {
        this.end();
        onEnd();
      } catch (err) {
        onError(err);
      }
    });
  }
}