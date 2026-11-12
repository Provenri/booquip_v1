import unittest
from unittest.mock import patch

from curate import MAX_BYTES, NoRedirect, feed_host, parse_feed, run
from argparse import Namespace


class FeedTests(unittest.TestCase):
    def test_metadata_only_and_deduplication(self):
        feed = b'''<rss><channel><item><title>A book</title>
        <link>https://pilot.substack.com/p/book?tracking=1</link>
        <pubDate>Thu, 12 Nov 2026 10:00:00 GMT</pubDate>
        <description>Must not be stored</description></item>
        <item><title>Duplicate</title><link>https://pilot.substack.com/p/book</link></item>
        <item><title>External</title><link>https://other.example/p/book</link></item></channel></rss>'''
        records = parse_feed(feed, 'https://pilot.substack.com/feed')
        self.assertEqual(len(records), 1)
        self.assertEqual(set(records[0]), {'title', 'canonical_url', 'published_at'})
        self.assertEqual(records[0]['canonical_url'], 'https://pilot.substack.com/p/book')
        self.assertEqual(records[0]['published_at'], '2026-11-12T10:00:00+00:00')

    def test_atom(self):
        feed = b'''<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Book</title>
        <link href="https://pilot.substack.com/p/book"/><updated>2026-11-12T10:00:00Z</updated>
        </entry></feed>'''
        self.assertEqual(len(parse_feed(feed, 'https://pilot.substack.com/feed')), 1)

    def test_limit(self):
        items = ''.join(f'<item><title>Book {index}</title><link>https://pilot.substack.com/p/{index}</link></item>' for index in range(25))
        self.assertEqual(len(parse_feed(f'<rss><channel>{items}</channel></rss>'.encode(), 'https://pilot.substack.com/feed')), 20)

    def test_unsafe_inputs(self):
        for content in (b'<!DOCTYPE rss><rss/>', b'<!ENTITY x "y"><rss/>', b'\x00', b'x' * (MAX_BYTES + 1)):
            with self.assertRaises(ValueError):
                parse_feed(content, 'https://pilot.substack.com/feed')
        for url in ('http://pilot.substack.com/feed', 'https://localhost/feed', 'https://pilot.substack.com.evil.example/feed'):
            with self.assertRaises(ValueError):
                feed_host(url)

    def test_redirect_refused(self):
        with self.assertRaises(ValueError):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'http://localhost')

    @patch('curate.fetch_feed')
    @patch('curate.AdminApi')
    def test_unapproved_source_not_fetched(self, api, fetch):
        api.return_value.request.return_value = [{'enabled': False, 'approved_at': None}]
        with self.assertRaises(ValueError):
            run(Namespace(command='import', source_id='source', dry_run=False))
        fetch.assert_not_called()

    @patch('curate.fetch_feed')
    @patch('curate.AdminApi')
    def test_cooldown_before_fetch(self, api, fetch):
        from curate import now
        api.return_value.request.return_value = [{'enabled': True, 'approved_at': now(), 'last_imported_at': now()}]
        with self.assertRaises(ValueError):
            run(Namespace(command='import', source_id='source', dry_run=False))
        fetch.assert_not_called()

    @patch('curate.fetch_feed')
    @patch('curate.AdminApi')
    def test_dry_run_does_not_write(self, api, fetch):
        api.return_value.request.return_value = [{
            'id': 'source', 'enabled': True, 'approved_at': '2026-11-12',
            'last_imported_at': None, 'feed_url': 'https://pilot.substack.com/feed',
        }]
        fetch.return_value = [{'title': 'Book', 'canonical_url': 'https://pilot.substack.com/p/book', 'published_at': None}]
        result = run(Namespace(command='import', source_id='source', dry_run=True))
        self.assertTrue(result['dry_run'])
        self.assertEqual(api.return_value.request.call_count, 1)

    @patch('curate.fetch_feed')
    @patch('curate.AdminApi')
    def test_real_import_uses_metadata_rpc_only(self, api, fetch):
        api.return_value.request.side_effect = [[{
            'id': 'source', 'enabled': True, 'approved_at': '2026-11-12',
            'last_imported_at': None, 'feed_url': 'https://pilot.substack.com/feed',
        }], 1]
        records = [{'title': 'Book', 'canonical_url': 'https://pilot.substack.com/p/book', 'published_at': None}]
        fetch.return_value = records
        self.assertEqual(run(Namespace(command='import', source_id='source', dry_run=False)), {'inserted': 1})
        api.return_value.request.assert_called_with('rpc/import_curation_posts', 'POST', {'source_id': 'source', 'posts': records})


if __name__ == '__main__':
    unittest.main()