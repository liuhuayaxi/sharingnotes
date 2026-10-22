import importlib.util,json,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import sync_site as sync
class SyncTests(unittest.TestCase):
 def test_pagination_collects_all_rows(self):
  with patch.object(sync,'get_json',side_effect=[{'records':[{'id':'a'}],'next_offset':100},{'records':[{'id':'b'}],'next_offset':None,'categories':['课程']}]) as get:
   categories,rows=sync.records('http://127.0.0.1:8765')
   self.assertEqual([x['id'] for x in rows],['a','b']);self.assertEqual(categories,['课程']);self.assertIn('offset=100',get.call_args.args[1])
 def test_asset_path_cannot_escape_course_folder(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'course').mkdir();(root/'secret.pdf').write_bytes(b'%PDF-')
   with self.assertRaises(ValueError):sync.checked_file(root/'course','../secret.pdf',{'.pdf'})
 def test_unchanged_publication_retains_original_timestamp(self):
  with tempfile.TemporaryDirectory() as d:
   old=Path(d)/'old';new=Path(d)/'new';old.mkdir();new.mkdir()
   for name in ['catalog.json','publish-manifest.json']:
    value={'publishedAt':'yesterday','notes':[]}
    (old/name).write_text(json.dumps(value));(new/name).write_text(json.dumps({**value,'publishedAt':'today'}))
   sync.reconcile(old,new)
   self.assertEqual(json.loads((new/'catalog.json').read_text())['publishedAt'],'yesterday')
 def test_pending_attachments_have_no_live_link_and_ready_urls_are_retained(self):
  original={'pdfs':[{'url':'https://github.com/a/pdf-2.pdf'},{'url':'https://github.com/a/pdf-3.pdf'}],'noteMaterials':{}}
  candidate=sync.pending_snapshot(original,{'pdf-2.pdf'})
  self.assertEqual(candidate['pdfs'][0],original['pdfs'][0]);self.assertEqual(candidate['pdfs'][1],{'url':'','pending':True});self.assertNotIn('pending',original['pdfs'][1])
  self.assertNotIn('recordings',sync.pending_snapshot({**original,'recordings':[{'url':'https://github.com/a/audio-1.m4a'}]},set()))
 def test_unchanged_snapshot_does_not_push(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);stage=root/'stage';stage.mkdir();target=root/'docs/data';target.mkdir(parents=True)
   catalog={'notes':[],'courses':[],'publishedAt':'same'};resources={'version':2,'pdfs':[],'noteMaterials':{}}
   for folder in [stage,target]:
    sync.write(folder/'catalog.json',catalog);sync.write(folder/'resources.json',resources)
   calls=[]
   def command(*args,**kwargs):
    calls.append(args)
    if args[:2]==('git','rev-list'):return '0'
    return ''
   with patch.object(sync,'ROOT',root),patch.object(sync,'reconcile'),patch.object(sync,'validate_snapshot'),patch.object(sync,'run',side_effect=command):
    self.assertFalse(sync.publish(stage,resources))
   self.assertFalse(any(c[:2]==('git','push') for c in calls))
 def test_snapshot_with_plain_classroom_text_is_rejected(self):
  import hashlib
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'notes').mkdir();ident='d'*20;file=f'notes/{ident}-000000000000.json'
   def publish(sources,index):
    body=json.dumps({'id':ident,'markdown':'[原文](#source-1)','sources':sources,'images':[]},ensure_ascii=False).encode();(root/file).write_bytes(body)
    (root/'catalog.json').write_text(json.dumps({'notes':[{'id':ident,'file':file}]}))
    (root/'publish-manifest.json').write_text(json.dumps({'notes':[{'id':ident,'sha256':hashlib.sha256(body).hexdigest()}]}))
    (root/'search-index.json').write_text(json.dumps(index,ensure_ascii=False))
   publish([{'id':'1','text':'原文'}],[])
   with self.assertRaises(ValueError):sync.validate_snapshot(root)
   publish([{'id':'1','cipher':'abc'}],[{'kind':'source','text':'原文'}])
   with self.assertRaises(ValueError):sync.validate_snapshot(root)
   publish([{'id':'1','cipher':'abc'}],[{'kind':'source','cipher':'abc','part':0},{'kind':'note','text':'正文'}])
   sync.validate_snapshot(root)
   body=json.dumps({'id':ident,'markdown':'[原文 S1](#source-1) [原文 Sxx](#source-xx)','sources':[{'id':'1','cipher':'abc'}],'images':[]},ensure_ascii=False).encode();(root/file).write_bytes(body)
   (root/'publish-manifest.json').write_text(json.dumps({'notes':[{'id':ident,'sha256':hashlib.sha256(body).hexdigest()}]}))
   with self.assertRaises(ValueError):sync.validate_snapshot(root)
 def test_removed_pdf_is_withdrawn_and_old_recordings_are_never_carried_forward(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);stage=root/'stage';stage.mkdir();target=root/'docs/data';target.mkdir(parents=True)
   old={'recordings':[{'id':'r1','url':'a'}],'pdfs':[{'id':'old','course':'课','url':'x'},{'id':'kept','course':'课','url':'y'}],'noteMaterials':{'n1':['old','kept'],'n2':['old']}}
   sync.write(target/'resources.json',old);sync.write(stage/'catalog.json',{'notes':[],'courses':[]})
   new={'recordings':[],'pdfs':[{'id':'kept','course':'课','url':'','pending':True},{'id':'ppt3','course':'课','url':'z'}],'noteMaterials':{}}
   with patch.object(sync,'ROOT',root),patch.object(sync,'reconcile'),patch.object(sync,'validate_snapshot'),patch.object(sync,'run',return_value=''):
    sync.publish(stage,new,no_push=True)
   result=json.loads((stage/'resources.json').read_text())
   self.assertNotIn('recordings',result)
   self.assertEqual(sorted(x['id'] for x in result['pdfs']),['kept','ppt3'])
   self.assertEqual(next(x for x in result['pdfs'] if x['id']=='kept')['url'],'y')
   self.assertEqual(result['noteMaterials'],{'n1':['kept'],'n2':[]})
class NoRecordingsGuardTests(unittest.TestCase):
 def asset(self,name,path=None):return {'name':name,'path':path or '/m/'+name,'sha256':'0'*64,'bytes':1}
 def test_audio_attachments_are_refused(self):
  sync.assert_no_recordings([self.asset('pdf-'+'a'*64+'.pdf')])
  for bad in [self.asset('audio-'+'a'*64+'.m4a'),self.asset('pdf-'+'a'*64+'.pdf','/m/x.m4a'),self.asset('rec.mp3'),self.asset('pdf-'+'a'*64+'.m4a')]:
   with self.assertRaises(ValueError):sync.assert_no_recordings([bad])
 def test_upload_refuses_audio_before_contacting_github(self):
  with patch.object(sync,'run') as run:
   with self.assertRaises(ValueError):sync.upload([self.asset('audio-'+'a'*64+'.m4a')])
   run.assert_not_called()
 def test_snapshot_with_recordings_or_audio_links_is_refused(self):
  url='https://github.com/liuhuayaxi/sharingnotes/releases/download/course-media/'
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);(root/'notes').mkdir()
   sync.write(root/'resources.json',{'version':2,'pdfs':[{'url':url+'pdf-'+'a'*64+'.pdf'}],'noteMaterials':{}})
   sync.write(root/'notes/n.json',{'markdown':'正文 [原文](#source-1)','sources':[{'cipher':'ab/cd+m4a=='}]})
   sync.assert_no_recordings(folder=root)
   for name,value in [('resources.json',{'recordings':[{'id':'r'}],'pdfs':[]}),('resources.json',{'pdfs':[{'url':url+'audio-'+'b'*64+'.m4a'}]}),('notes/n.json',{'markdown':'[录音](https://example.com/lesson.mp3)'}),('catalog.json',{'x':'https://cdn.example/a.wav?x=1'})]:
    original=(root/name).read_text() if (root/name).exists() else None
    sync.write(root/name,value)
    with self.assertRaises(ValueError,msg=name):sync.assert_no_recordings(folder=root)
    if original is None:(root/name).unlink()
    else:(root/name).write_text(original)
 def test_publish_refuses_a_stage_containing_recordings(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);stage=root/'stage';stage.mkdir();target=root/'docs/data';target.mkdir(parents=True)
   sync.write(stage/'catalog.json',{'notes':[],'courses':[]});sync.write(stage/'leak.json',{'u':'https://github.com/liuhuayaxi/sharingnotes/releases/download/course-media/audio-'+'c'*64+'.m4a'})
   with patch.object(sync,'ROOT',root),patch.object(sync,'reconcile'),patch.object(sync,'validate_snapshot'),patch.object(sync,'run',return_value='') as run:
    with self.assertRaises(ValueError):sync.publish(stage,{'pdfs':[],'noteMaterials':{}})
   self.assertFalse((target/'leak.json').exists());self.assertFalse(any(c.args[:2]==('git','push') for c in run.call_args_list))
 def test_published_site_data_has_no_recordings(self):
  sync.assert_no_recordings(folder=Path(__file__).resolve().parents[1]/'docs/data')
if __name__=='__main__':unittest.main()
