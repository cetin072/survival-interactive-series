"""Only the explicitly unrelated Netlify test-site checks may be ignored."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('illustration_finalizer_scope', Path(__file__).with_name('finalize-illustration-job.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CheckScopeTests(unittest.TestCase):
    def test_exact_unrelated_check_names_only(self):
        for prefix in ('Header rules', 'Redirect rules', 'Pages changed'):
            self.assertEqual(module.pr_check_bucket({'name': prefix+' - survival-zero-ai-test', 'status': 'IN_PROGRESS'}), 'IGNORED')
            self.assertEqual(module.pr_check_bucket({'name': prefix+' - survival-diary-archive', 'status': 'IN_PROGRESS'}), 'PENDING')
            self.assertEqual(module.pr_check_bucket({'name': prefix+' - survival-zero-ai-test-copy', 'status': 'IN_PROGRESS'}), 'PENDING')
        self.assertEqual(module.pr_check_bucket({'context':'netlify/survival-zero-ai-test/deploy-preview','state':'PENDING'}), 'IGNORED')
        self.assertEqual(module.pr_check_bucket({'name':'build','status':'COMPLETED','conclusion':'FAILURE'}), 'FAIL')
        self.assertEqual(module.pr_check_bucket({'name':'unknown new check','status':'IN_PROGRESS'}), 'PENDING')

    def test_ignored_checks_do_not_satisfy_required_check_registration(self):
        checks=[{'name':n,'status':'IN_PROGRESS'} for n in module.IGNORED_PR_CHECK_NAMES]
        self.assertEqual(module.relevant_pr_checks(checks), [])

    def test_pending_unrelated_site_does_not_block_passing_archive(self):
        view={'state':'OPEN','mergeable':'MERGEABLE','headRefOid':'a'*40,'statusCheckRollup':[
            {'name':'Header rules - survival-zero-ai-test','status':'IN_PROGRESS'},
            {'name':'build','status':'COMPLETED','conclusion':'SUCCESS'},
            {'context':'netlify/survival-diary-archive/deploy-preview','state':'SUCCESS'},
        ]}
        with patch.object(module,'gh_json',return_value=view), patch.object(module,'heartbeat'), patch.object(module.time,'sleep'):
            self.assertIsNone(module.wait_relevant_pr_checks(564))
        view['statusCheckRollup'][1]['conclusion']='FAILURE'
        with patch.object(module,'gh_json',return_value=view), patch.object(module,'heartbeat'), patch.object(module.time,'sleep'):
            with self.assertRaisesRegex(ValueError,'FINALIZER_PR_CHECK_FAILED:build'):
                module.wait_relevant_pr_checks(564)

if __name__ == '__main__':
    unittest.main()
