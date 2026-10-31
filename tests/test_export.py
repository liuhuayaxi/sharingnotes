import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('export_courses',Path(__file__).resolve().parents[1]/'scripts/export_courses.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)

class ExportTests(unittest.TestCase):
    def test_explicit_chapters_are_published_and_change_content_version(self):
        session={'id':'chapters','status':'completed','category':'示例课','title':'第一章标题不能猜章节',
                 'ai_note_summary':{'summary':'正文'},'segments':[]}
        unknown=module.public_note(session)
        self.assertEqual((unknown['chapter'],unknown['chapters']),('',[]))
        first=module.public_note({**session,'chapter':'第1章 绪论','chapters':['第1章 绪论']})
        self.assertEqual(first['chapter'],'第1章 绪论')
        self.assertNotEqual(first['version'],unknown['version'])
        spanning=module.public_note({**session,'chapters':['第1章 绪论','第2章 电路','第1章 绪论']})
        self.assertEqual(spanning['chapters'],['第1章 绪论','第2章 电路'])
        self.assertEqual(spanning['chapter'],'第1章 绪论 · 第2章 电路')
        self.assertNotEqual(spanning['version'],first['version'])
        dirty=module.public_note({**session,'chapter':'/Users/example/private/lesson','chapters':['第1章 绪论',None,3]})
        self.assertNotIn('/Users/',dirty['chapter'])
        self.assertEqual(dirty['chapters'],['第1章 绪论'])
    def test_catalog_and_note_document_share_chapter_metadata(self):
        import json,tempfile
        from unittest.mock import patch
        session={'id':'chapter-export','status':'completed','category':'示例课','title':'课堂标题','chapter':'第2章','chapters':['第2章'],
                 'started_at':'2026-10-31T08:00:00+08:00','ai_note_summary':{'summary':'## 课堂正文\n正文'},'segments':[]}
        def response(base,path):
            return {'records':[{'id':session['id'],'category':'示例课'}],'next_offset':None} if path.startswith('/api/library?') else {'session':session}
        with tempfile.TemporaryDirectory() as folder,patch.object(module,'get_json',side_effect=response):
            module.export('http://127.0.0.1:1',['示例课'],folder)
            root=Path(folder);entry=json.loads((root/'catalog.json').read_text())['notes'][0]
            document=json.loads((root/entry['file']).read_text())
            for item in [entry,document]:
                self.assertEqual(item['chapter'],'第2章');self.assertEqual(item['chapters'],['第2章'])
    def test_placeholder_citations_become_plain_text(self):
        text='讲授 [原文 Sxx](#source-xx) 与 [原文 SXX](#source-XX)；真实 [课堂 S2 · 00:01:00–00:02:00](#source-2)，缺失 [原文 S9](#source-9)，代码 `[原文 Sxx](#source-xx)`'
        out=module.unlink_unresolved_citations(text,['1','2'])
        self.assertEqual(out,'讲授 原文 Sxx 与 原文 SXX；真实 [课堂 S2 · 00:01:00–00:02:00](#source-2)，缺失 原文 S9，代码 `原文 Sxx`')
    def test_public_note_never_links_a_placeholder_citation(self):
        session={'id':'s1','status':'completed','category':'课','title':'t','started_at':'2026-10-01',
                 'segments':[{'id':1,'raw':'甲','corrected':'甲'}],
                 'ai_note_summary':{'summary':'来源 [原文 S1](#source-1) 格式 [原文 Sxx](#source-xx)','source_map':{'1':{'segment_ids':[1],'start':0,'end':1}}}}
        note=module.public_note(session)
        self.assertEqual(note['markdown'],'来源 [原文 S1](#source-1) 格式 原文 Sxx')
    def test_embedded_image_is_preserved_only_with_explicit_published_mapping(self):
        target='data/images/'+'a'*64+'.png'
        text=module.clean_text('![课堂配图](assets/fig-0123456789abcdef.png)',{'assets/fig-0123456789abcdef.png':target})
        self.assertEqual(text,f'![课堂配图]({target})')
        with self.assertRaises(ValueError):module.clean_text('![图](assets/fig-0123456789abcdef.png)',{'assets/fig-0123456789abcdef.png':'https://example.com/private.png'})
    def test_corrupt_or_non_png_asset_is_rejected(self):
        with self.assertRaises(ValueError):module.png_dimensions(b'not a PNG')
        import struct,zlib
        def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
        payload=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IEND',b'')
        self.assertEqual(module.png_dimensions(payload),(1,1))
        with self.assertRaises(ValueError):module.png_dimensions(payload[:-1]+b'x')
    def test_only_text_and_internal_source_links_survive(self):
        text=module.clean_text('![图](assets/fig.png) [原文](#source-1) [录音](/api/recordings/x/playback) /Users/example/private/a.txt <video src="x">hidden</video>')
        self.assertIn('[原文](#source-1)',text)
        for value in ['assets/fig.png','/api/recordings','/Users/example','<video']:self.assertNotIn(value,text)
    def test_source_mapping_uses_real_ids_and_does_not_infer_missing_references(self):
        session={'segments':[{'id':101,'raw':'原始文本','corrected':'精修文本'},{'id':201,'raw':'其他段落'}]}
        note={'source_map':{'1':{'segment_ids':[101],'start':0,'end':60},'2':{'segment_ids':[999]}}}
        self.assertEqual(module.source_texts(session,note),[{'id':'1','start':0.0,'end':60.0,'text':'精修文本','corrected':True}])
    def test_public_schema_drops_credentials_paths_and_provider_settings(self):
        session={'id':'synthetic','status':'completed','category':'示例课程','title':'示例笔记','directory':'/private/path','course_settings':{'api_key':'synthetic-secret'},'ai_note_summary':{'summary':'## 课堂概念\n正文','review_status':'pending'},'segments':[]}
        note=module.public_note(session)
        self.assertEqual(note['reviewStatus'],'pending')
        self.assertNotIn('directory',note);self.assertNotIn('course_settings',note)
        self.assertIsNone(module.public_note({**session,'status':'active'}))
    def test_transcript_text_is_obfuscated_deterministically_and_round_trips(self):
        text='课堂原文：啊这个应该没什么问题吧 Bragg 😀\n\n第二段'
        cipher=module.transcript_cipher(text,'a'*20,'source-1','note')
        self.assertEqual(cipher,module.transcript_cipher(text,'a'*20,'source-1','note'))
        self.assertNotIn('课堂',cipher);self.assertNotEqual(cipher,module.transcript_cipher(text,'a'*20,'source-1',0))
        self.assertEqual(module.transcript_plain(cipher,'a'*20,'source-1','note'),text)
        self.assertEqual(module.transcript_cipher('','a'*20,'source-1','note'),'')
    def test_published_sources_and_index_chunks_hide_text_but_keep_ids_and_times(self):
        sources=[{'id':'2','start':1.0,'end':9.0,'text':'甲'*2500,'corrected':True}]
        public=module.published_sources('b'*20,sources)
        self.assertEqual(set(public[0]),{'id','start','end','corrected','cipher'});self.assertEqual(sources[0]['text'],'甲'*2500)
        chunks=list(module.source_index_chunks('b'*20,sources))
        self.assertEqual([c['part'] for c in chunks],[0,1,2]);self.assertTrue(all('text' not in c and c['section']=='source-2' and c['heading']=='课堂原文 S2' for c in chunks))
        self.assertEqual(''.join(module.transcript_plain(c['cipher'],'b'*20,'source-2',c['part']) for c in chunks),'甲'*2500)
    def test_migration_matches_exporter_and_is_idempotent(self):
        import hashlib,json,sys,tempfile
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
        import encode_published_transcripts as migration
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'notes').mkdir();ident='c'*20
            source={'id':'1','start':0.0,'end':3.0,'text':'乙'*1200,'corrected':False}
            note={'id':ident,'markdown':'正文 [原文](#source-1)','sources':[source],'version':'v'};file=f'notes/{ident}-000000000000.json'
            body=json.dumps(note,ensure_ascii=False,separators=(',',':'));(root/file).write_text(body)
            (root/'catalog.json').write_text(json.dumps({'notes':[{'id':ident,'file':file}]}))
            (root/'publish-manifest.json').write_text(json.dumps({'notes':[{'id':ident,'file':file,'sha256':'x','bytes':1}]}))
            plain_index=[{'note':ident,'kind':'note','section':'section-1','heading':'','text':'正文'}]+[{'note':ident,'kind':'source','section':'source-1','heading':'课堂原文 S1','text':source['text'][a:a+1000]} for a in (0,1000)]
            (root/'search-index.json').write_text(json.dumps(plain_index,ensure_ascii=False,separators=(',',':')))
            self.assertEqual(migration.migrate(root),{'notes':1,'indexChunks':2})
            migrated=json.loads((root/file).read_text());index=json.loads((root/'search-index.json').read_text())
            self.assertEqual(migrated['sources'],module.published_sources(ident,[source]))
            self.assertEqual(index[1:],list(module.source_index_chunks(ident,[source])));self.assertEqual(index[0],plain_index[0])
            manifest=json.loads((root/'publish-manifest.json').read_text())['notes'][0]
            self.assertEqual(manifest['sha256'],hashlib.sha256((root/file).read_bytes()).hexdigest())
            self.assertEqual(migration.migrate(root),{'notes':0,'indexChunks':0})

if __name__=='__main__':unittest.main()
