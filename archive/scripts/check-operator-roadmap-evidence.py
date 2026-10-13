"""Read-only, exact-commit check of same-deploy Operator roadmap manifest.

Works only with the project's canonical Production or its numbered PR preview.
No credentials, cookies, redirects to unrelated hosts, or database mutations.
"""
import argparse
import json
import re
import time
from urllib.error import URLError
from urllib.parse import urlsplit
from urllib.request import urlopen, Request

SHA=re.compile(r"^[a-f0-9]{40}$")
PREVIEW=re.compile(r"^deploy-preview-([0-9]+)--survival-diary-archive\.netlify\.app$")
FIELDS={"knowledge_home","published_knowledge_pages","bag_landing","bag_web_app","bag_pwa_manifest","published_bag_item_pages"}


def check(url, expected_sha, expected_context):
    host=urlsplit(url).hostname or ""
    if urlsplit(url).scheme!="https" or urlsplit(url).path not in ("","/") or urlsplit(url).query:
        raise ValueError("only an HTTPS site origin may be checked")
    if expected_context=="production":
        if host!="survival-diary-archive.netlify.app":
            raise ValueError("wrong production hostname")
    elif expected_context=="deploy-preview":
        if not PREVIEW.fullmatch(host):
            raise ValueError("wrong deploy-preview hostname")
    else:
        raise ValueError("unsupported context")
    if not SHA.fullmatch(expected_sha):
        raise ValueError("invalid expected commit sha")
    base="https://"+host

    def fetch(path):
        request=Request(base+path,headers={"Accept":"application/json","Cache-Control":"no-cache"})
        with urlopen(request,timeout=15) as response:
            if response.status!=200:
                raise ValueError(f"unexpected HTTP {response.status}: {path}")
            if response.geturl()!=base+path:
                raise ValueError("unexpected redirect")
            return json.load(response)

    # Netlify may complete the build just after GitHub reports a deployment.
    for index in range(15):
        try:
            deploy=fetch("/deploy-meta.json")
            evidence=fetch("/operator-roadmap-evidence.json")
            if deploy.get("context")==expected_context and deploy.get("commit_ref")==expected_sha and evidence.get("commit_ref")==expected_sha:
                break
        except (URLError, TimeoutError, ValueError):
            if index==14:
                raise
        time.sleep(4)
    else:
        raise AssertionError("preview evidence failed to become exact-head")

    if evidence.get("schema")!="operator-roadmap-build-evidence/v2" or evidence.get("kind")!="BUILD_ARTIFACTS_ONLY":
        raise AssertionError("invalid roadmap evidence schema")
    if evidence.get("context")!=expected_context or deploy.get("context")!=expected_context:
        raise AssertionError("wrong evidence context")
    if evidence.get("commit_ref")!=deploy.get("commit_ref") or evidence.get("provider")!="netlify":
        raise AssertionError("cross-deploy evidence rejected")
    artifacts=evidence.get("artifacts")
    if not isinstance(artifacts,dict) or set(artifacts)!=FIELDS:
        raise AssertionError("unexpected artifact schema")
    for key in ("published_knowledge_pages","published_bag_item_pages"):
        if type(artifacts[key]) is not int or not 0<=artifacts[key]<=100000:
            raise AssertionError("invalid published article count")
    for key in ("knowledge_home","bag_landing","bag_web_app","bag_pwa_manifest"):
        if type(artifacts[key]) is not bool:
            raise AssertionError("invalid artifact existence flag")
    print("PASS Operator Roadmap build identity:",expected_context,expected_sha)
    print(json.dumps({"artifacts":artifacts},ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--base-url",required=True)
    parser.add_argument("--expected-sha",required=True)
    parser.add_argument("--expected-context",choices=["deploy-preview","production"],required=True)
    args=parser.parse_args()
    check(args.base_url,args.expected_sha,args.expected_context)


if __name__=="__main__":
    main()
