import { describe, expect, it } from 'vitest';
import { parseCommand } from '../../src/github/command-parser.js';

describe('parseCommand', () => {
  it('parses a bare /anubis review command', () => {
    expect(parseCommand('/anubis review')).toEqual({ type: 'review', skill: undefined });
  });

  it('parses /anubis review <skill> with the skill argument', () => {
    expect(parseCommand('/anubis review review-wdio-api-automation')).toEqual({
      type: 'review',
      skill: 'review-wdio-api-automation',
    });
  });

  it('parses /anubis fix', () => {
    expect(parseCommand('/anubis fix')).toEqual({ type: 'fix' });
  });

  it('parses /anubis explain', () => {
    expect(parseCommand('/anubis explain')).toEqual({ type: 'explain' });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCommand('   /anubis review   ')).toEqual({ type: 'review', skill: undefined });
  });

  it('only looks at the first line — trailing lines are ordinary commentary', () => {
    expect(parseCommand('/anubis review\nthanks for looking into this!')).toEqual({ type: 'review', skill: undefined });
  });

  it('returns null for an unrecognized command verb', () => {
    expect(parseCommand('/anubis deploy')).toBeNull();
  });

  it('returns null for a command embedded mid-sentence rather than at the start', () => {
    expect(parseCommand('please tell it to /anubis fix this please')).toBeNull();
  });

  it('returns null for ordinary conversational text', () => {
    expect(parseCommand('this looks great, thanks!')).toBeNull();
  });

  it('returns null for an empty comment', () => {
    expect(parseCommand('')).toBeNull();
  });

  it('is case-sensitive on the command verb (does not fuzzy-match)', () => {
    expect(parseCommand('/anubis REVIEW')).toBeNull();
  });
});
