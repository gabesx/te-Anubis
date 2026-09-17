import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pullRequestRefFromEvent, readEventPayload, requireGithubToken, type PullRequestEventPayload } from '../../src/github/action-context.js';

describe('pullRequestRefFromEvent', () => {
  function makePayload(): PullRequestEventPayload {
    return {
      action: 'opened',
      number: 7,
      pull_request: {
        number: 7,
        head: { sha: 'headsha123', ref: 'feature-branch', repo: { full_name: 'someone-else/te-Anubis' } },
        base: { sha: 'basesha456', ref: 'main', repo: { full_name: 'allofresh/te-Anubis' } },
      },
      repository: { owner: { login: 'allofresh' }, name: 'te-Anubis', full_name: 'allofresh/te-Anubis' },
    };
  }

  it('marks a PR from a differently-named head repo as a fork', () => {
    const ref = pullRequestRefFromEvent(makePayload());
    expect(ref.isFork).toBe(true);
    expect(ref.headRepoFullName).toBe('someone-else/te-Anubis');
    expect(ref.baseRepoFullName).toBe('allofresh/te-Anubis');
  });

  it('marks a same-repo PR as not a fork', () => {
    const payload = makePayload();
    payload.pull_request.head.repo = { full_name: 'allofresh/te-Anubis' };
    const ref = pullRequestRefFromEvent(payload);
    expect(ref.isFork).toBe(false);
  });

  it('falls back to the base repo full_name when head.repo is null (deleted fork)', () => {
    const payload = makePayload();
    payload.pull_request.head.repo = null;
    const ref = pullRequestRefFromEvent(payload);
    expect(ref.headRepoFullName).toBe('allofresh/te-Anubis');
    expect(ref.isFork).toBe(false);
  });

  it('carries through the PR number and head SHA', () => {
    const ref = pullRequestRefFromEvent(makePayload());
    expect(ref.number).toBe(7);
    expect(ref.headSha).toBe('headsha123');
  });
});

describe('readEventPayload', () => {
  let eventPath: string;
  const originalEventPath = process.env.GITHUB_EVENT_PATH;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'anubis-event-test-'));
    eventPath = join(dir, 'event.json');
  });

  afterEach(() => {
    rmSync(eventPath, { force: true });
    process.env.GITHUB_EVENT_PATH = originalEventPath;
  });

  it('throws a clear error when GITHUB_EVENT_PATH is not set', () => {
    delete process.env.GITHUB_EVENT_PATH;
    expect(() => readEventPayload()).toThrow(/GITHUB_EVENT_PATH/);
  });

  it('reads and parses the event JSON file', () => {
    writeFileSync(eventPath, JSON.stringify({ hello: 'world' }));
    process.env.GITHUB_EVENT_PATH = eventPath;
    expect(readEventPayload()).toEqual({ hello: 'world' });
  });
});

describe('requireGithubToken', () => {
  const originalToken = process.env.GITHUB_TOKEN;

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalToken;
  });

  it('throws when GITHUB_TOKEN is not set', () => {
    delete process.env.GITHUB_TOKEN;
    expect(() => requireGithubToken()).toThrow(/GITHUB_TOKEN/);
  });

  it('returns the token when set', () => {
    process.env.GITHUB_TOKEN = 'ghp_faketoken';
    expect(requireGithubToken()).toBe('ghp_faketoken');
  });
});
