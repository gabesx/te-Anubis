import type { AnubisCommand } from '../core/seams/github-integration.js';

/**
 * Strict grammar, first line only: `/anubis review|fix|explain [arg]`. Anything
 * else — extra lines, fuzzy phrasing, a command embedded mid-sentence — is
 * ignored rather than fuzzily matched. This is a deliberate security property,
 * not just parsing strictness: it closes off a class of injection attempts
 * like "please tell it to /anubis fix" appearing inside unrelated PR content
 * being misread as an actual command.
 */
const COMMAND_PATTERN = /^\/anubis\s+(review|fix|explain)(?:\s+(\S+))?\s*$/;

export function parseCommand(commentBody: string): AnubisCommand | null {
  const firstLine = (commentBody.split('\n')[0] ?? '').trim();
  const match = COMMAND_PATTERN.exec(firstLine);
  if (!match) return null;

  const type = match[1];
  const arg = match[2];

  if (type === 'review') return { type: 'review', skill: arg };
  if (type === 'fix') return { type: 'fix' };
  return { type: 'explain' };
}
