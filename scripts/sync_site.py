"""Read completed local coursework, publish media attachments, and update Pages.

Only docs/data is auto-committed. Original course files and application settings
are never copied into Git. State, media cache, lock and receipts stay outside it.
"""
from __future__ import annotations
import argparse, copy, fcntl, hashlib, json, os, re, shutil, subprocess, tempfile, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo
from export_courses import export, get_json, clean_text

ROOT=Path(__file__).resolve().parents[1]
STATE=Path.home()/'.local/state/sharingnotes'
REPO='liuhuayaxi/sharingnotes'
TAG='course-media'
API='http://127.0.0.1:8765'

def now():return datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(timespec='seconds')
def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp');temporary.write_text(json.dumps(value,ensure_ascii=False,indent=2));temporary.replace(path)
def run(*args,**kw):
    return subprocess.run(args,cwd=ROOT,check=True,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kw).stdout.strip()
def digest(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
def checked_file(folder,relative,suffixes):
    root=Path(folder).resolve();path=(root/relative).resolve()
    if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() not in suffixes:raise ValueError('Course asset is missing or outside its folder')
    return path

def records(base):
    rows=[];offset=0
    while True:
        page=get_json(base,f'/api/library?limit=100&offset={offset}&include_settings=false');rows.extend(page['records'])
        following=page.get('next_offset')
        if following is None:break
        if following<=offset:raise ValueError('Invalid library pagination')
        offset=following
    return page.get('categories',[]),rows

def prepare(base,folder):
    categories,rows=records(base)
    courses=[c for c in categories if c and c!='未分类']
    export(base,courses,folder)
    cache_dir=STATE/'media';cache_dir.mkdir(parents=True,exist_ok=True)
    cache_path=STATE/'media-cache.json'
    cache=json.loads(cache_path.read_text()) if cache_path.exists() else {}
    assets=[];audio=[];pdfs=[];material_ids={};sessions=[]
    def asset(path,kind):
        stat=path.stat();key=str(path);stamp=[stat.st_ino,stat.st_size,stat.st_mtime_ns]
        cached=cache.get(key,{})
        if cached.get('stamp')==stamp and (cache_dir/cached.get('name','')).is_file():info=cached['info']
        else:
            before=stamp;source_hash=digest(path);out=path
            if kind=='audio':
                out=cache_dir/(source_hash+'.m4a')
                if not out.exists():
                    temporary=cache_dir/(source_hash+'.partial.m4a')
                    run('ffmpeg','-nostdin','-v','error','-y','-threads','1','-i',str(path),'-map','0:a:0','-vn','-c:a','copy','-map_metadata','-1','-movflags','+faststart',str(temporary));temporary.replace(out)
            else:
                with path.open('rb') as stream:
                    if not stream.read(8).startswith(b'%PDF-'):raise ValueError('AI PDF signature is invalid')
            sha=digest(out);name=kind+'-'+sha+('.m4a' if kind=='audio' else '.pdf');target=cache_dir/name
            if not target.exists():shutil.copyfile(out,target)
            if out!=path and out!=target:out.unlink()
            after=path.stat()
            if before!=[after.st_ino,after.st_size,after.st_mtime_ns]:raise ValueError('Course asset changed during export; retry next sync')
            info={'sha256':sha,'bytes':target.stat().st_size,'url':f'https://github.com/{REPO}/releases/download/{TAG}/{name}'}
            cache[key]={'stamp':stamp,'name':name,'info':info};write(cache_path,cache)
        name=info['url'].split('/')[-1]
        if info['bytes']>=2*1024**3:raise ValueError('One attachment exceeds the supported size')
        assets.append({'name':name,'path':str(cache_dir/name),'sha256':info['sha256'],'bytes':info['bytes']})
        return info
    for row in rows:
        if row.get('category') not in courses or row.get('status')!='completed' or not row.get('has_ai_summary'):continue
        s=get_json(base,'/api/recordings/'+row['id'])['session']
        ident=hashlib.sha256((s['category']+':'+s['id']).encode()).hexdigest()[:20]
        if not (s.get('ai_note_summary') or {}).get('summary'):continue
        sessions.append((s,ident))
        try:path=checked_file(s['directory'],s['audio_filename'],{'.aac','.m4a','.mp3','.wav','.flac','.mp4'})
        except ValueError:
            print('Recording not locally available; keeping previous published audio:',ident,flush=True);continue
        print('Preparing recording:',clean_text(s.get('title')),flush=True)
        info=asset(path,'audio')
        audio.append({'id':ident,'noteId':ident,'course':clean_text(s['category']),'title':clean_text(s['title']),'date':str(s.get('recorded_at') or s['started_at'])[:10],'duration':s.get('duration',0),**info})
    for course in courses:
        listing=get_json(base,'/api/course-files?category='+quote(course))
        for item in listing['files']:
            conversion=item.get('conversion') or {}
            if conversion.get('status')!='completed':continue
            relative=conversion.get('relative_path')
            # Shared-folder installations expose the completed AI PDF's exact relative path.
            if relative: path=checked_file(listing['directory'],relative,{'.pdf'})
            else:path=checked_file(listing['directory'],item['id']+'/PDF/'+conversion['name'],{'.pdf'})
            print('Preparing AI PDF:',clean_text(item['name']),flush=True)
            info=asset(path,'pdf');ident=hashlib.sha256((course+':'+item['id']).encode()).hexdigest()[:20]
            material_ids[(course,item['id'])]=ident
            pdfs.append({'id':ident,'course':clean_text(course),'title':clean_text(item['name']),'kind':clean_text(item.get('kind') or '课程资料'),'pages':conversion.get('pages',0),'updatedAt':conversion.get('updated_at') or conversion.get('created_at') or '',**info})
    links={}
    for s,ident in sessions:
        used=((s.get('ai_note_summary') or {}).get('material_version') or {}).get('course_files') or {}
        links[ident]=[material_ids[(s['category'],asset_id)] for asset_id in used if (s['category'],asset_id) in material_ids]
    data={'version':1,'recordings':audio,'pdfs':pdfs,'noteMaterials':links}
    (folder/'resources.json').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    return list({a['name']:a for a in assets}.values())

def release_assets(release_id):
    result=[];page=1
    while True:
        batch=json.loads(run('gh','api',f'repos/{REPO}/releases/{release_id}/assets?per_page=100&page={page}'));result.extend(batch)
        if len(batch)<100:return result
        page+=1

def upload(assets,on_ready=lambda completed:None):
    try:release=json.loads(run('gh','api',f'repos/{REPO}/releases/tags/{TAG}'))
    except subprocess.CalledProcessError as exc:
        if '404' not in exc.stderr:raise
        body=STATE/'release-description.txt';body.write_text('课程资料共享附件：与 Sharing Notes 笔记对应的回听录音及已生成的 AI 友好版 PDF。文件按内容哈希命名，供课程阅读站使用。')
        run('gh','release','create',TAG,'--repo',REPO,'--target','main','--title','Sharing Notes 课程资料','--notes-file',str(body));release=json.loads(run('gh','api',f'repos/{REPO}/releases/tags/{TAG}'))
    existing=[];page=1
    while True:
        batch=json.loads(run('gh','api',f'repos/{REPO}/releases/{release["id"]}/assets?per_page=100&page={page}'));existing.extend(batch)
        if len(batch)<100:break
        page+=1
    by_name={a['name']:a for a in existing}
    def verify(remote,a):
        return remote.get('state')=='uploaded' and remote['size']==a['bytes'] and (not remote.get('digest') or remote['digest']=='sha256:'+a['sha256'])
    def send(pair):
        i,a=pair
        if a['name'] in by_name:
            remote=by_name[a['name']]
            if verify(remote,a):return a['name']
            if remote.get('state')!='starter':raise ValueError('Remote attachment digest does not match')
            # An abandoned starter contains no successfully published file. Remove
            # only that incomplete upload, never a completed user attachment.
            while any('gh release upload ' in line and a['path'] in line for line in run('ps','-Ao','command').splitlines()):
                time.sleep(15)
                candidates=release_assets(release['id'])
                found=next((x for x in candidates if x['name']==a['name']),None)
                if found and verify(found,a):return a['name']
            candidates=release_assets(release['id'])
            found=next((x for x in candidates if x['name']==a['name']),None)
            if found and verify(found,a):return a['name']
            run('gh','api','--method','DELETE',f'repos/{REPO}/releases/assets/{remote["id"]}')
        print(f'Uploading attachment {i+1}/{len(assets)} ({a["bytes"]/1e6:.1f} MB): {a["name"]}',flush=True)
        for attempt in range(3):
            try:
                run('gh','release','upload',TAG,a['path'],'--repo',REPO,timeout=1800)
            except (subprocess.CalledProcessError,subprocess.TimeoutExpired):
                if attempt==2:raise
                remote=release_assets(release['id'])
                if any(x['name']==a['name'] and verify(x,a) for x in remote):return a['name']
                for candidate in remote:
                    if candidate['name']==a['name'] and candidate.get('state')=='starter':run('gh','api','--method','DELETE',f'repos/{REPO}/releases/assets/{candidate["id"]}')
                time.sleep(3*(attempt+1));continue
            remote=release_assets(release['id'])
            found=next((x for x in remote if x['name']==a['name']),None)
            if not found or not verify(found,a):raise ValueError('Uploaded attachment failed verification')
            return a['name']
    complete={a['name'] for a in assets if a['name'] in by_name and verify(by_name[a['name']],a)}
    on_ready(complete)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures=[pool.submit(send,pair) for pair in enumerate(sorted(assets,key=lambda a:a['bytes']))]
        for future in as_completed(futures):
            complete.add(future.result());on_ready(complete)

def reconcile(old,new):
    """Keep last published notes when local tasks are incomplete or removed."""
    if not (old/'catalog.json').exists():return
    previous=json.loads((old/'catalog.json').read_text());catalog=json.loads((new/'catalog.json').read_text())
    ids={n['id'] for n in catalog['notes']};retained=[n for n in previous['notes'] if n['id'] not in ids]
    if retained:
        manifest=json.loads((new/'publish-manifest.json').read_text());prior=json.loads((old/'publish-manifest.json').read_text());index=json.loads((new/'search-index.json').read_text());kept={n['id'] for n in retained}
        for n in retained:shutil.copyfile(old/n['file'],new/n['file'])
        catalog['notes'].extend(retained);catalog['courses']=list(dict.fromkeys(catalog['courses']+[n['course'] for n in retained]));manifest['notes'].extend(n for n in prior['notes'] if n['id'] in kept);index.extend(x for x in json.loads((old/'search-index.json').read_text()) if x['note'] in kept)
        images={x['file']:x for x in manifest['images']}
        for n in retained:
            note=json.loads((old/n['file']).read_text())
            for image in note.get('images',[]):
                relative=image['src'].removeprefix('data/');(new/'images').mkdir(exist_ok=True);shutil.copyfile(old/relative,new/relative);images[relative]=next(x for x in prior['images'] if x['file']==relative)
        manifest['images']=list(images.values());manifest['sourceCount']=sum(n['sourceCount'] for n in catalog['notes'])
        for name,value in [('catalog.json',catalog),('publish-manifest.json',manifest),('search-index.json',index)]:write(new/name,value)
    for name in ['catalog.json','publish-manifest.json']:
        before=json.loads((old/name).read_text());after=json.loads((new/name).read_text())
        before.pop('publishedAt',None);after.pop('publishedAt',None)
        if before==after:shutil.copyfile(old/name,new/name)

def pending_snapshot(resources,complete):
    result=copy.deepcopy(resources)
    for key in ['recordings','pdfs']:
        for item in result[key]:
            if item['url'].split('/')[-1] not in complete:
                item['url']='';item['pending']=True
    return result

def validate_snapshot(folder):
    catalog=json.loads((folder/'catalog.json').read_text());manifest=json.loads((folder/'publish-manifest.json').read_text());by_id={x['id']:x for x in manifest['notes']}
    for meta in catalog['notes']:
        if not re.fullmatch(r'notes/[a-f0-9]{20}-[a-f0-9]{12}\.json',meta['file']):raise ValueError('Invalid public note path')
        payload=(folder/meta['file']).read_bytes()
        if hashlib.sha256(payload).hexdigest()!=by_id[meta['id']]['sha256']:raise ValueError('Published note integrity failed')
        note=json.loads(payload);sources={x['id'] for x in note['sources']}
        if any('text' in x or not isinstance(x.get('cipher'),str) for x in note['sources']):raise ValueError('Classroom text must be obfuscated before publication')
        if any(x not in sources for x in re.findall(r'\]\(#source-(\d+)\)',note['markdown'])):raise ValueError('A citation has no classroom source; preserving last published version')
        for image in note.get('images',[]):
            if not re.fullmatch(r'data/images/[a-f0-9]{64}\.png',image['src']):raise ValueError('Invalid public image path')
            if digest(folder/image['src'].removeprefix('data/'))!=image['sha256']:raise ValueError('Published image integrity failed')
    for chunk in json.loads((folder/'search-index.json').read_text()):
        if chunk.get('kind')=='source' and ('text' in chunk or not isinstance(chunk.get('cipher'),str)):raise ValueError('Classroom search text must be obfuscated before publication')

def publish(stage,resources,no_push=False):
    target=ROOT/'docs/data'
    prior=json.loads((target/'resources.json').read_text()) if (target/'resources.json').exists() else {}
    resources=copy.deepcopy(resources)
    for key in ['recordings','pdfs']:
        # Recordings whose audio is temporarily not on this Mac stay published.
        # The completed AI PDF list is read in full each sync, so a PDF the
        # owner removed or replaced is withdrawn instead of carried forward.
        exported={x['id'] for x in resources[key]}
        current={x['id']:x for x in prior.get(key,[]) if key=='recordings' or x['id'] in exported}
        for item in resources[key]:
            if item.get('pending') and item['id'] in current and not current[item['id']].get('pending'):continue
            current[item['id']]=item
        resources[key]=list(current.values())
    available={x['id'] for x in resources['pdfs']}
    resources['noteMaterials']={note:[x for x in ids if x in available] for note,ids in {**prior.get('noteMaterials',{}),**resources['noteMaterials']}.items()};write(stage/'resources.json',resources)
    catalog=json.loads((stage/'catalog.json').read_text());catalog['courses']=list(dict.fromkeys(catalog['courses']+[p['course'] for p in resources['pdfs']]));write(stage/'catalog.json',catalog)
    reconcile(target,stage);validate_snapshot(stage)
    for path in stage.rglob('*'):
        if not path.is_file():continue
        destination=target/path.relative_to(stage)
        if destination.exists() and destination.read_bytes()==path.read_bytes():continue
        destination.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,destination)
    changed=bool(run('git','status','--porcelain','--','docs/data'))
    if changed and not no_push:
        subprocess.run(['npm','test'],cwd=ROOT,check=True,stdout=subprocess.DEVNULL)
        run('git','add','--','docs/data');run('git','diff','--cached','--check')
        staged=run('git','diff','--cached','--name-only').splitlines()
        if any(not p.startswith('docs/data/') for p in staged):raise ValueError('Unrelated staged files found; not auto-committing')
        run('git','commit','-m','Sync completed coursework and shared materials')
    # No network push when an unchanged snapshot already matches our last push.
    # A previously failed push still retries its unpushed local commit.
    if not no_push and (changed or run('git','rev-list','--count','origin/main..HEAD')!='0'):
        run('git','push','origin','HEAD:main')
    return changed

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--prepare-only',action='store_true');parser.add_argument('--no-push',action='store_true');args=parser.parse_args()
    STATE.mkdir(parents=True,exist_ok=True)
    with (STATE/'sync.lock').open('w') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:print('A sync is already running');return
        status={'startedAt':now(),'status':'running'};write(STATE/'status.json',status)
        try:
            if run('git','branch','--show-current')!='main':raise ValueError('Automatic publication requires main branch')
            if run('git','remote','get-url','origin').removesuffix('.git')!='https://github.com/'+REPO:raise ValueError('Publication destination differs from sharingnotes')
            if run('git','status','--porcelain','--','docs/data'):raise ValueError('docs/data has uncommitted changes; preserving them')
            if run('git','diff','--cached','--name-only'):raise ValueError('Staged user changes found; preserving them')
            with tempfile.TemporaryDirectory(prefix='sharingnotes-publish-',dir=STATE) as temp:
                stage=Path(temp);assets=prepare(API,stage);write(STATE/'prepared-assets.json',assets);resources=json.loads((stage/'resources.json').read_text());last_publish=[0]
                if args.prepare_only:status.update(status='prepared',completedAt=now(),attachments=len(assets));print('Prepared only:',len(assets));return
                def progress(complete):
                    status.update(status='uploading',uploaded=sum(a['name'] in complete for a in assets),attachments=len(assets),updatedAt=now());write(STATE/'status.json',status)
                    if time.monotonic()-last_publish[0]>=600:
                        publish(stage,pending_snapshot(resources,complete),args.no_push);last_publish[0]=time.monotonic()
                upload(assets,progress);changed=publish(stage,resources,args.no_push)
                status.update(status='success',completedAt=now(),changed=changed,uploaded=len(assets),attachments=len(assets),notes=len(json.loads((stage/'catalog.json').read_text())['notes']))
                print(json.dumps(status,ensure_ascii=False),flush=True)
        except Exception as exc:
            status.update(status='failed',completedAt=now(),error=str(exc));raise
        finally:write(STATE/'status.json',status)
if __name__=='__main__':main()
