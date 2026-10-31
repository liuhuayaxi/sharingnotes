"""Export selected course notes and their embedded PNGs from the local API."""
import argparse
import base64
import hashlib
import json
import re
import struct
import zlib
from collections import Counter
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from zoneinfo import ZoneInfo

COURSES = ['光电子学', '物理光学', '微型计算机原理与接口技术', '光电子器件（全英文）', '通信原理 C']
NOTE_IMAGE = re.compile(r'!\[([^\]]*)\]\(([^\n)]*)\)')

def clean_text(value, published_images=None):
    text = str(value or '')
    placeholders = {}
    def image(match):
        alt, path = match.groups()
        target = (published_images or {}).get(path)
        if not target: return f'〔插图未公开：{alt}〕' if alt else '〔插图未公开〕'
        if not re.fullmatch(r'data/images/[a-f0-9]{64}\.png', target): raise ValueError('Invalid published image path')
        placeholder = f'\ue000PUBLISHED_IMAGE_{len(placeholders)}\ue001'
        placeholders[placeholder] = f'![{clean_text(alt)}]({target})'
        return placeholder
    text = NOTE_IMAGE.sub(image, text)
    text = re.sub(r'<(audio|video|iframe|object|script|style)\b[^>]*>[\s\S]*?</\1\s*>', '', text, flags=re.I)
    text = re.sub(r'<(?:img|source|embed)\b[^>]*>', '', text, flags=re.I)
    text = re.sub(r'(?<!!)\[([^\]]+)\]\((?!#)[^\n]*?\)', r'\1', text)
    text = re.sub(r'(?:https?://|file://)[^\s<>\])）]+', '〔外部地址未公开〕', text)
    text = re.sub(r'/Users/[^\s<>\])）]+|[A-Za-z]:\\[^\s<>\])）]+', '〔本机路径未公开〕', text)
    text = re.sub(r'(?<![A-Za-z0-9])[Bb]\d{8}(?!\d)', '〔学号已隐藏〕', text)
    text = re.sub(r'(?<!\d)1[3-9]\d{9}(?!\d)', '〔联系电话已隐藏〕', text)
    text = re.sub(r'[A-Za-z0-9_.+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '〔邮箱已隐藏〕', text)
    for placeholder, markup in placeholders.items(): text = text.replace(placeholder, markup)
    return text.strip()

TRANSCRIPT_SALT = 'sharingnotes/transcript/v1'

def transcript_seed(note_id, section, part):
    """FNV-1a (32-bit) of the key label; mirrored in docs/cipher.js."""
    value = 0x811c9dc5
    for byte in f'{TRANSCRIPT_SALT}|{note_id}|{section}|{part}'.encode():
        value = ((value ^ byte) * 0x01000193) & 0xffffffff
    return value or 0x9e3779b9

def transcript_keystream(seed, length):
    words, state = [], seed
    for _ in range((length + 3) // 4):
        state ^= (state << 13) & 0xffffffff
        state ^= state >> 17
        state ^= (state << 5) & 0xffffffff
        words.append(state)
    return struct.pack(f'<{len(words)}I', *words)[:length]

def transcript_cipher(text, note_id, section, part):
    """Obfuscate classroom transcript text for the public site.

    UTF-8 bytes are raw-deflated (keeps the public files small), XORed with an
    xorshift32 stream keyed by note, passage and part, then base64 encoded. This only deters casual reading of the public
    JSON: the browser holds the same algorithm in docs/cipher.js.
    """
    if not str(text): return ''
    packer = zlib.compressobj(9, zlib.DEFLATED, -15)
    data = packer.compress(str(text).encode()) + packer.flush()
    stream = transcript_keystream(transcript_seed(note_id, section, part), len(data))
    mixed = (int.from_bytes(data, 'little') ^ int.from_bytes(stream, 'little')).to_bytes(len(data), 'little')
    return base64.b64encode(mixed).decode('ascii')

def transcript_plain(cipher, note_id, section, part):
    data = base64.b64decode(cipher) if cipher else b''
    if not data: return ''
    stream = transcript_keystream(transcript_seed(note_id, section, part), len(data))
    packed = (int.from_bytes(data, 'little') ^ int.from_bytes(stream, 'little')).to_bytes(len(data), 'little')
    return zlib.decompress(packed, -15).decode()

def published_sources(note_id, sources):
    """Public note JSON keeps passage ids and times; the text is obfuscated."""
    result = []
    for source in sources:
        item = {k: v for k, v in source.items() if k != 'text'}
        item['cipher'] = transcript_cipher(source['text'], note_id, 'source-' + source['id'], 'note')
        result.append(item)
    return result

def source_index_chunks(note_id, sources):
    """Search entries for classroom text, obfuscated per 1000-character part."""
    for source in sources:
        text, section = source['text'], 'source-' + source['id']
        for part, at in enumerate(range(0, len(text), 1000)):
            yield {'note': note_id, 'kind': 'source', 'section': section, 'heading': '课堂原文 S' + source['id'], 'part': part,
                   'cipher': transcript_cipher(text[at:at+1000], note_id, section, part)}

def png_dimensions(payload):
    if not payload.startswith(b'\x89PNG\r\n\x1a\n') or payload[12:16] != b'IHDR': raise ValueError('Image is not PNG')
    offset, ended = 8, False
    while offset + 12 <= len(payload):
        length = struct.unpack('>I', payload[offset:offset+4])[0]
        stop = offset + 12 + length
        if stop > len(payload): raise ValueError('Truncated PNG')
        chunk = payload[offset+4:offset+8+length]
        expected = struct.unpack('>I', payload[offset+8+length:stop])[0]
        if zlib.crc32(chunk) & 0xffffffff != expected: raise ValueError('PNG integrity check failed')
        offset = stop
        if chunk[:4] == b'IEND': ended = True; break
    if not ended: raise ValueError('PNG has no end marker')
    width, height = struct.unpack('>II', payload[16:24])
    if not 0 < width <= 100000 or not 0 < height <= 100000: raise ValueError('Invalid PNG dimensions')
    return width, height

def export_images(base, session, destination, manifest):
    note = session.get('ai_note_summary') or {}
    references = list(dict.fromkeys(match[2] for match in NOTE_IMAGE.finditer(str(note.get('summary') or ''))))
    if not references: return {}, []
    package = str(note.get('review_package') or '')
    if not re.fullmatch(r'\.review-notes/(?:legacy-)?[a-f0-9]{24}', package): raise ValueError('Embedded images have no valid note package')
    task = package.split('/')[-1]
    mapping, images = {}, []
    for reference in references:
        if not re.fullmatch(r'assets/fig-[a-f0-9]{16}\.png', reference): raise ValueError('Unsupported embedded image reference')
        address = f"{base.rstrip('/')}/api/recordings/{session['id']}/note-assets/{task}/{reference.split('/')[-1]}"
        with urlopen(address, timeout=30) as response:
            payload = response.read(25 * 1024 * 1024 + 1)
        if len(payload) > 25 * 1024 * 1024: raise ValueError('One embedded image exceeds 25 MiB')
        width, height = png_dimensions(payload)
        digest = hashlib.sha256(payload).hexdigest()
        file = f'images/{digest}.png'
        (destination/'images').mkdir(exist_ok=True)
        target = destination/file
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest: raise ValueError('Existing image digest mismatch')
        if not target.exists(): target.write_bytes(payload)
        public_path = 'data/' + file
        mapping[reference] = public_path
        info = {'src': public_path, 'sha256': digest, 'width': width, 'height': height}
        if not any(item['src'] == public_path for item in images): images.append(info)
        manifest[digest] = {'file': file, 'sha256': digest, 'bytes': len(payload), 'width': width, 'height': height}
    return mapping, images

def source_texts(session, note):
    segments = session.get('segments') or []
    by_id = {str(s.get('id')): s for s in segments}
    mapping = note.get('source_map') or {}
    if not isinstance(mapping, dict): return []
    results = []
    for ident, item in mapping.items():
        if not isinstance(item, dict) or not re.fullmatch(r'\d+', str(ident)): continue
        selected = [by_id[str(i)] for i in item.get('segment_ids', []) if str(i) in by_id]
        if not selected: continue
        text = '\n\n'.join(clean_text(s.get('corrected') or s.get('raw')) for s in selected)
        if not text.strip(): continue
        results.append({'id': str(ident), 'start': max(0, float(item.get('start') or 0)),
                        'end': max(0, float(item.get('end') or 0)), 'text': text,
                        'corrected': all(bool(s.get('corrected')) for s in selected)})
    return results

SOURCE_LINK = re.compile(r'\[([^\]\n]*)\]\(#source-([^)\s]*)\)')

def unlink_unresolved_citations(markdown, source_ids):
    """AI notes sometimes describe the citation format with a template such as
    [原文 Sxx](#source-xx). Such a link has no classroom passage, so it is kept as
    plain, non-clickable label text. Real citations are left untouched."""
    ids = {str(i) for i in source_ids}
    return SOURCE_LINK.sub(lambda m: m.group(0) if m.group(2) in ids else m.group(1), markdown)

def search_chunks(markdown):
    heading, number, fenced, block = '', 0, False, []
    def emit():
        text = '\n'.join(block).strip()
        return [{'section': f'section-{number}', 'heading': heading, 'text': text[i:i+1000]} for i in range(0, len(text), 1000) if text[i:i+1000].strip()]
    for line in markdown.splitlines():
        if re.match(r'^\s*(```|~~~)', line): fenced = not fenced
        match = re.match(r'^ {0,3}(#{1,6})\s+(.+)', line) if not fenced else None
        if match:
            yield from emit(); block = []; number += 1; heading = re.sub(r'[*`]', '', match[2]).strip()
        if not line.strip() and block:
            yield from emit(); block = []
        else: block.append(line)
    yield from emit()

def public_note(session, published_images=None, images=None):
    note = session.get('ai_note_summary') or {}
    if session.get('status') != 'completed' or not str(note.get('summary') or '').strip(): return None
    course = clean_text(session.get('category'))
    ident = hashlib.sha256((course + ':' + str(session['id'])).encode()).hexdigest()[:20]
    sources = source_texts(session, note)
    markdown = unlink_unresolved_citations(clean_text(note['summary'], published_images), [s['id'] for s in sources])
    chapter = clean_text(session.get('chapter')) if isinstance(session.get('chapter'), str) else ''
    declared = session.get('chapters') if isinstance(session.get('chapters'), list) else []
    chapters = list(dict.fromkeys(clean_text(value) for value in declared if isinstance(value, str) and clean_text(value)))
    if not chapters and chapter: chapters = [chapter]
    if not chapter and chapters: chapter = ' · '.join(chapters)
    version = hashlib.sha256(json.dumps([markdown, sources, chapter, chapters], ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    date = str(session.get('recorded_at') or session.get('started_at') or '')[:10]
    return {'id': ident, 'course': course, 'title': clean_text(session.get('title') or course), 'date': date,
            'chapter': chapter, 'chapters': chapters,
            'abstract': clean_text(note.get('abstract') or '')[:700], 'markdown': markdown, 'sources': sources,
            'reviewStatus': str(note.get('review_status') or 'unknown'), 'version': version,
            'wordCount': len(re.sub(r'\s', '', markdown)), 'images': images or [], 'imageCount': len(images or [])}

def get_json(base, path):
    with urlopen(base.rstrip('/') + path, timeout=30) as response: return json.load(response)

def export(base, courses, destination):
    parsed = urlsplit(base)
    if parsed.scheme != 'http' or parsed.hostname not in {'127.0.0.1', 'localhost', '::1'}:
        raise ValueError('Source must be the local loopback API')
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    (destination/'notes').mkdir(exist_ok=True)
    records, offset = [], 0
    while True:
        page = get_json(base, f'/api/library?limit=100&offset={offset}&include_settings=false')
        records.extend(page['records'])
        following = page.get('next_offset')
        if following is None: break
        if following <= offset: raise ValueError('Invalid library pagination')
        offset = following
    catalog, index, manifest, image_manifest = [], [], [], {}
    for record in records:
        if record.get('category') not in courses: continue
        session = get_json(base, '/api/recordings/' + record['id'])['session']
        if session.get('status') != 'completed' or not (session.get('ai_note_summary') or {}).get('summary'): continue
        mapping, images = export_images(base, session, destination, image_manifest)
        note = public_note(session, mapping, images)
        if not note: continue
        plain_sources = note['sources']
        note = {**note, 'sources': published_sources(note['id'], plain_sources)}
        filename = f"notes/{note['id']}-{note['version'][:12]}.json"
        body = json.dumps(note, ensure_ascii=False, separators=(',', ':'))
        (destination/filename).write_text(body)
        summary = {k: note[k] for k in ['id', 'course', 'title', 'chapter', 'chapters', 'date', 'abstract', 'reviewStatus', 'version', 'wordCount', 'imageCount']}
        summary.update(file=filename, sourceCount=len(note['sources']), lessonAt=str(session.get('recorded_at') or session.get('started_at') or note['date']))
        catalog.append(summary)
        for chunk in search_chunks(note['markdown']): index.append({'note': note['id'], 'kind': 'note', **chunk})
        index.extend(source_index_chunks(note['id'], plain_sources))
        manifest.append({'id': note['id'], 'file': filename, 'sha256': hashlib.sha256(body.encode()).hexdigest(), 'bytes': len(body.encode())})
    catalog.sort(key=lambda n: (n['date'], n['title']), reverse=True)
    published = datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')
    result = {'version': 1, 'publishedAt': published, 'courses': [c for c in courses if any(n['course'] == c for n in catalog)],
              'notes': catalog, 'textOnly': False, 'includesImages': True, 'authentication': 'disabled'}
    (destination/'catalog.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')))
    (destination/'search-index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    (destination/'publish-manifest.json').write_text(json.dumps({'publishedAt': published, 'notes': manifest, 'images': list(image_manifest.values()), 'sourceCount': sum(n['sourceCount'] for n in catalog)}, ensure_ascii=False, indent=2))
    print(json.dumps({'notes': len(catalog), 'courses': dict(Counter(n['course'] for n in catalog)), 'sources': sum(n['sourceCount'] for n in catalog), 'images': len(image_manifest), 'imageBytes': sum(m['bytes'] for m in image_manifest.values()), 'searchChunks': len(index), 'noteBytes': sum(m['bytes'] for m in manifest)}, ensure_ascii=False))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-url', default='http://127.0.0.1:8765')
    parser.add_argument('--course', action='append', default=[])
    parser.add_argument('--all-courses', action='store_true')
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    if not args.course and not args.all_courses: parser.error('Select --course or --all-courses explicitly')
    selected = [c for c in get_json(args.api_url, '/api/library?limit=1&include_settings=false')['categories'] if c and c != '未分类'] if args.all_courses else args.course
    export(args.api_url, selected, args.out)
