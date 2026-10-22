"""One-off, idempotent migration: obfuscate classroom transcript text that is
already published in docs/data, using exactly the exporter's encoding.

Note versions and file names are unchanged (they hash the plain text, as the
exporter does); only the note files, their manifest digests and the search
index change. Run: python3 scripts/encode_published_transcripts.py [docs/data]
"""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_courses import published_sources, transcript_cipher

def migrate(folder):
    folder = Path(folder)
    catalog = json.loads((folder/'catalog.json').read_text())
    manifest = json.loads((folder/'publish-manifest.json').read_text())
    entries = {x['id']: x for x in manifest['notes']}
    plain = {}
    for meta in catalog['notes']:
        path = folder/meta['file']; note = json.loads(path.read_text())
        if any('text' in s for s in note['sources']):
            plain[note['id']] = {s['id']: s['text'] for s in note['sources']}
            note['sources'] = published_sources(note['id'], note['sources'])
            body = json.dumps(note, ensure_ascii=False, separators=(',', ':'))
            path.write_text(body)
            entries[note['id']].update(sha256=hashlib.sha256(body.encode()).hexdigest(), bytes=len(body.encode()))
    index = json.loads((folder/'search-index.json').read_text())
    parts, joined = {}, {}
    for i, chunk in enumerate(index):
        if chunk.get('kind') != 'source' or 'text' not in chunk: continue
        key = (chunk['note'], chunk['section'])
        part = parts.get(key, 0); parts[key] = part + 1
        joined[key] = joined.get(key, '') + chunk['text']
        index[i] = {'note': chunk['note'], 'kind': 'source', 'section': chunk['section'], 'heading': chunk['heading'], 'part': part,
                    'cipher': transcript_cipher(chunk['text'], chunk['note'], chunk['section'], part)}
    for (note_id, section), text in joined.items():
        expected = plain.get(note_id, {}).get(section.removeprefix('source-'))
        if expected is not None and expected != text: raise ValueError(f'Search index text differs from note source: {note_id} {section}')
    (folder/'search-index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    (folder/'publish-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    return {'notes': len(plain), 'indexChunks': sum(parts.values())}

if __name__ == '__main__':
    print(json.dumps(migrate(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]/'docs/data')))
