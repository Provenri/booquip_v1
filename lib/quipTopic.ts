export function formatQuipTopicReason(reason: string): string {
  return reason.replace(/\b(?:the|this|the book's|the book’s) summary\b/gi, (match) =>
    match[0] === match[0].toUpperCase() ? 'The book' : 'the book');
}
