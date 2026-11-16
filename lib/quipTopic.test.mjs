import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatQuipTopicReason } from './quipTopic.ts';

test('describes the book instead of referring to the summary', () => {
  assert.equal(
    formatQuipTopicReason("The summary highlights a family's experience of migration."),
    "The book highlights a family's experience of migration.",
  );
  assert.equal(
    formatQuipTopicReason('This summary directly connects attention with freedom.'),
    'The book directly connects attention with freedom.',
  );
  assert.equal(
    formatQuipTopicReason("The idea in the book's summary is about resilience."),
    'The idea in the book is about resilience.',
  );
  assert.equal(formatQuipTopicReason('A family navigates change.'), 'A family navigates change.');
});
