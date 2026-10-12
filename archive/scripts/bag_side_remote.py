"""Only the existing BAG preview hosts may receive synthetic browser tests."""
import json, re, time, urllib.request
from urllib.parse import urlsplit

def verify_remote(base, expected):
    url=urlsplit(base)
    preview=re.fullmatch(r'deploy-preview-[1-9][0-9]*--survival-diary-archive.netlify.app',url.hostname or '')
    fixed=url.hostname=='qa-bag-side--survival-diary-archive.netlify.app'
    if (url.scheme!='https' or not (preview or fixed) or url.port is not None or
        url.username or url.password or url.path not in ('','/') or url.query or url.fragment or
        not re.fullmatch(r'[0-9a-f]{40}',expected or '')):
        raise RuntimeError('Only exact-SHA BAG Deploy Preview or fixed qa-bag-side host is allowed.')
    context='branch-deploy' if fixed else 'deploy-preview'
    for attempt in range(24):
        try:
            with urllib.request.urlopen(base.rstrip('/')+'/deploy-meta.json',timeout=8) as response: metadata=json.load(response)
            if metadata.get('commit_ref')==expected and metadata.get('context')==context:
                with urllib.request.urlopen(base.rstrip('/')+'/bag-lab/alpha.html',timeout=8) as response:
                    assert response.status==200
                    if fixed: assert 'noindex' in response.headers.get('X-Robots-Tag','').lower()
                print('PASS remote host/context/HTTP/exact SHA:',context,expected,flush=True)
                return metadata
        except Exception:
            if attempt==23: raise
        time.sleep(5)
    raise AssertionError('Allowed deployment exact SHA/context did not become ready')
