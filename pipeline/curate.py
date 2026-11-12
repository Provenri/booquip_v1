import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from xml.etree import ElementTree


MAX_BYTES = 2 * 1024 * 1024
MAX_POSTS = 20
SHELVES = ('substack-longform-pioneers', 'algorithmic-blockbusters')


def now():
    return datetime.now(timezone.utc).isoformat()


def feed_host(url):
    if not re.fullmatch(r'https://[a-z0-9-]+\.substack\.com/feed', url):
        raise ValueError('Use an approved https://publication.substack.com/feed URL.')
    return urlsplit(url).hostname


def parse_date(value):
    if not value:
        return None
    try:
        date = parsedate_to_datetime(value)
    except (ValueError, TypeError):
        try:
            date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=timezone.utc)
    return date.isoformat()


def parse_feed(content, source_url):
    host = feed_host(source_url)
    if len(content) > MAX_BYTES:
        raise ValueError('Feed exceeds the 2 MiB limit.')
    if b'<!DOCTYPE' in content.upper() or b'<!ENTITY' in content.upper() or b'\x00' in content:
        raise ValueError('DTD, entity declarations, and non-UTF XML encodings are not accepted.')
    root = ElementTree.fromstring(content)
    atom = '{http://www.w3.org/2005/Atom}'
    if root.tag == 'rss':
        entries = root.findall('./channel/item')
    elif root.tag == f'{atom}feed':
        entries = root.findall(f'{atom}entry')
    else:
        raise ValueError('Expected an RSS 2.0 or Atom feed.')
    posts = []
    seen = set()
    for entry in entries:
        if root.tag == 'rss':
            title = entry.findtext('title', '').strip()
            link = entry.findtext('link', '').strip()
            published = entry.findtext('pubDate')
        else:
            title = entry.findtext(f'{atom}title', '').strip()
            link = next((node.get('href', '') for node in entry.findall(f'{atom}link')
                         if node.get('rel', 'alternate') == 'alternate'), '')
            published = entry.findtext(f'{atom}published') or entry.findtext(f'{atom}updated')
        parsed = urlsplit(link)
        if (not title or len(title) > 500 or parsed.scheme != 'https' or parsed.hostname != host
                or parsed.username or parsed.password or parsed.port not in (None, 443)
                or not parsed.path.startswith('/p/')):
            continue
        canonical = f'https://{host}{parsed.path}'
        if canonical in seen:
            continue
        seen.add(canonical)
        posts.append({'title': title, 'canonical_url': canonical, 'published_at': parse_date(published)})
        if len(posts) == MAX_POSTS:
            break
    return posts


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        raise ValueError('Feed redirect refused. Review the registered source URL.')


def fetch_feed(url):
    feed_host(url)
    request = Request(url, headers={'User-Agent': 'BooQuip-Curation/1.0', 'Accept': 'application/rss+xml, application/atom+xml'})
    with build_opener(NoRedirect()).open(request, timeout=15) as response:
        content = response.read(MAX_BYTES + 1)
    return parse_feed(content, url)


class AdminApi:
    def __init__(self):
        self.url = os.environ.get('SUPABASE_URL', '').rstrip('/')
        self.key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
        if not re.fullmatch(r'https://[a-z0-9-]+\.supabase\.co', self.url) or not self.key:
            raise ValueError('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY privately in this terminal.')

    def request(self, table, method='GET', body=None, query=None):
        url = f'{self.url}/rest/v1/{table}'
        if query:
            url += '?' + urlencode(query)
        request = Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                          headers={'apikey': self.key, 'Authorization': f'Bearer {self.key}',
                                   'Content-Type': 'application/json', 'Prefer': 'return=representation'})
        try:
            with build_opener().open(request, timeout=20) as response:
                content = response.read()
                return json.loads(content) if content else None
        except HTTPError as error:
            raise ValueError(f'Supabase request failed (HTTP {error.code}). Check source approval, import cooldown, or review constraints.') from None


def parser():
    cli = argparse.ArgumentParser(description='Private, metadata-only Digital curation pilot. Never modifies the book catalog.')
    commands = cli.add_subparsers(dest='command', required=True)
    register = commands.add_parser('register', help='Register a disabled, unapproved Substack source.')
    register.add_argument('--name', required=True)
    register.add_argument('--feed-url', required=True)
    register.add_argument('--terms-url', required=True)
    approve = commands.add_parser('approve-source', help='Approve only after checking publication terms and reuse scope.')
    approve.add_argument('source_id')
    approve.add_argument('--reviewer', required=True)
    approve.add_argument('--terms-reviewed', required=True, action='store_true')
    commands.add_parser('sources')
    import_feed = commands.add_parser('import', help='Import up to 20 posts from an approved source.')
    import_feed.add_argument('source_id')
    import_feed.add_argument('--dry-run', action='store_true')
    posts = commands.add_parser('posts')
    posts.add_argument('--source-id')
    candidate = commands.add_parser('propose', help='Manually record a proposed book classification with evidence.')
    candidate.add_argument('--post-id', required=True)
    candidate.add_argument('--title', required=True)
    candidate.add_argument('--author', required=True)
    candidate.add_argument('--book-id')
    candidate.add_argument('--shelf', choices=SHELVES, required=True)
    candidate.add_argument('--evidence-type', choices=('digital_origin', 'recommendation', 'digital_traction'), required=True)
    candidate.add_argument('--evidence-url', required=True)
    candidate.add_argument('--rationale', required=True)
    commands.add_parser('candidates')
    review = commands.add_parser('review', help='Record a human review; approval never publishes to the catalog.')
    review.add_argument('candidate_id')
    review.add_argument('--status', choices=('approved', 'rejected', 'needs_evidence'), required=True)
    review.add_argument('--reviewer', required=True)
    review.add_argument('--notes', required=True)
    return cli


def run(args):
    api = AdminApi()
    if args.command == 'sources':
        return api.request('curation_sources', query={'order': 'created_at.desc', 'limit': '100'})
    if args.command == 'register':
        feed_host(args.feed_url)
        if not args.terms_url.startswith('https://'):
            raise ValueError('Use an HTTPS terms URL.')
        return api.request('curation_sources', 'POST', {'name': args.name, 'feed_url': args.feed_url, 'terms_url': args.terms_url})
    if args.command == 'approve-source':
        return api.request('curation_sources', 'PATCH', {'enabled': True, 'approved_by': args.reviewer, 'approved_at': now()},
                           {'id': f'eq.{args.source_id}'})
    if args.command == 'import':
        sources = api.request('curation_sources', query={'id': f'eq.{args.source_id}'})
        if len(sources) != 1 or not sources[0]['enabled'] or not sources[0]['approved_at']:
            raise ValueError('Source must be explicitly approved and enabled first.')
        source = sources[0]
        if source['last_imported_at']:
            elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(source['last_imported_at'])
            if elapsed.total_seconds() < 86400:
                raise ValueError('Source already imported in the last 24 hours; no feed request made.')
        records = fetch_feed(source['feed_url'])
        if args.dry_run:
            return {'dry_run': True, 'posts': records}
        return {'inserted': api.request('rpc/import_curation_posts', 'POST', {'source_id': source['id'], 'posts': records})}
    if args.command == 'posts':
        query = {'order': 'imported_at.desc', 'limit': '100'}
        if args.source_id:
            query['source_id'] = f'eq.{args.source_id}'
        return api.request('curation_posts', query=query)
    if args.command == 'propose':
        return api.request('curation_candidates', 'POST', {
            'post_id': args.post_id, 'book_id': args.book_id, 'proposed_title': args.title,
            'proposed_author': args.author, 'proposed_shelf': args.shelf, 'evidence_type': args.evidence_type,
            'evidence_url': args.evidence_url, 'rationale': args.rationale,
        })
    if args.command == 'candidates':
        return api.request('curation_candidates', query={'order': 'created_at.desc', 'limit': '100'})
    if args.command == 'review':
        return api.request('curation_candidates', 'PATCH', {
            'status': args.status, 'reviewed_by': args.reviewer, 'reviewed_at': now(), 'review_notes': args.notes,
        }, {'id': f'eq.{args.candidate_id}'})


if __name__ == '__main__':
    try:
        print(json.dumps(run(parser().parse_args()), indent=2, ensure_ascii=False))
    except (ValueError, URLError, TimeoutError, ElementTree.ParseError):
        print('Curation command failed. Check source URL/approval, feed validity, credentials, and network access. No catalog changes were made.', file=sys.stderr)
        sys.exit(1)