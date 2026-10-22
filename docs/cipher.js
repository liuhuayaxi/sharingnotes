// Classroom transcripts (课堂原文) are published obfuscated: UTF-8 text is
// raw-deflated, XORed with an xorshift32 stream keyed by note, passage and
// part, then base64 encoded. This mirrors transcript_cipher() in
// scripts/export_courses.py. It keeps the text out of plain sight in the public
// JSON; it is not encryption, since this file holds the whole algorithm.
const SALT = 'sharingnotes/transcript/v1';
const encoder = new TextEncoder();
export function transcriptSeed(noteId, section, part) {
  let value = 0x811c9dc5;
  for (const byte of encoder.encode(`${SALT}|${noteId}|${section}|${part}`)) value = Math.imul(value ^ byte, 0x01000193) >>> 0;
  return value || 0x9e3779b9;
}
function mix(bytes, seed) {
  let state = seed >>> 0;
  for (let i = 0; i < bytes.length; i += 4) {
    state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0;
    for (let k = 0; k < 4 && i + k < bytes.length; k++) bytes[i + k] ^= (state >>> (8 * k)) & 255;
  }
  return bytes;
}
const through = (bytes, transform) => new Response(new Blob([bytes]).stream().pipeThrough(transform));
export async function decodeTranscript(cipher, noteId, section, part) {
  if (!cipher) return '';
  if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器版本过旧，无法显示课堂原文');
  const binary = atob(cipher), bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return through(mix(bytes, transcriptSeed(noteId, section, part)), new DecompressionStream('deflate-raw')).text();
}
export async function encodeTranscript(text, noteId, section, part) {
  if (!String(text ?? '')) return '';
  const bytes = mix(new Uint8Array(await through(encoder.encode(String(text)), new CompressionStream('deflate-raw')).arrayBuffer()), transcriptSeed(noteId, section, part));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
/** Restore readable source text on a fetched note (in memory only). */
export async function revealNote(note) {
  await Promise.all((note.sources || []).map(async source => {
    if (typeof source.text !== 'string') source.text = await decodeTranscript(source.cipher, note.id, 'source-' + source.id, 'note');
  }));
  return note;
}
/** Restore readable text on classroom entries of the search index. */
export async function revealIndex(index) {
  await Promise.all(index.map(async chunk => {
    if (chunk.kind === 'source' && typeof chunk.text !== 'string') chunk.text = await decodeTranscript(chunk.cipher, chunk.note, chunk.section, chunk.part);
  }));
  return index;
}
