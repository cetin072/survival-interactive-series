"""Remote safety contract, no network or browser required."""
import io, json, unittest
from unittest.mock import patch
from bag_side_remote import verify_remote
SHA='a'*40
QA='https://qa-bag-side--survival-diary-archive.netlify.app'
PREVIEW='https://deploy-preview-516--survival-diary-archive.netlify.app'
class Response(io.BytesIO):
    status=200
    headers={'X-Robots-Tag':'noindex, nofollow, noarchive'}
class RemoteGuard(unittest.TestCase):
    def test_rejected_addresses_never_connect(self):
        for base in ['https://survival-diary-archive.netlify.app','https://qa-preview--survival-diary-archive.netlify.app',
                     'https://example.com',PREVIEW.replace('.netlify.','XnetlifyX'),PREVIEW+':443',PREVIEW+'/bag-lab',
                     PREVIEW+'?test=1',PREVIEW+'#test',PREVIEW.replace('https','http'),PREVIEW.replace('https://','https://user@')]:
            with self.subTest(base=base),patch('urllib.request.urlopen') as connect:
                with self.assertRaises(RuntimeError):verify_remote(base,SHA)
                connect.assert_not_called()
        with self.assertRaises(RuntimeError):verify_remote(QA,None)
    def test_exact_sha_context_and_fixed_noindex(self):
        for base,context in [(QA,'branch-deploy'),(PREVIEW,'deploy-preview')]:
            with patch('urllib.request.urlopen',side_effect=[Response(json.dumps({'commit_ref':SHA,'context':context}).encode()),Response(b'html')]):
                self.assertEqual(verify_remote(base,SHA)['commit_ref'],SHA)
        for metadata in [{'commit_ref':'b'*40,'context':'branch-deploy'},{'commit_ref':SHA,'context':'production'}]:
            with patch('urllib.request.urlopen',side_effect=lambda *_args,**_kwargs:Response(json.dumps(metadata).encode())),patch('time.sleep'):
                with self.assertRaises(AssertionError):verify_remote(QA,SHA)
if __name__=='__main__':unittest.main()
