import { describe, expect, it, vi } from 'vitest';
import { checkAuthorization } from '../../src/github/authorization.js';
import type { Octokit } from '@octokit/rest';

function makeOctokit(permission: string): Octokit {
  return {
    repos: {
      getCollaboratorPermissionLevel: vi.fn().mockResolvedValue({ data: { permission } }),
    },
  } as unknown as Octokit;
}

describe('checkAuthorization', () => {
  it('allows a write-permission actor to run /anubis fix', async () => {
    const octokit = makeOctokit('write');
    const result = await checkAuthorization(octokit, 'owner', 'repo', 'alice', { type: 'fix' });
    expect(result.allowed).toBe(true);
    expect(result.requiredLevel).toBe('write');
  });

  it('denies a read-only actor from running /anubis fix', async () => {
    const octokit = makeOctokit('read');
    const result = await checkAuthorization(octokit, 'owner', 'repo', 'bob', { type: 'fix' });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/write\+/);
  });

  it('allows a read-only actor to run /anubis review', async () => {
    const octokit = makeOctokit('read');
    const result = await checkAuthorization(octokit, 'owner', 'repo', 'bob', { type: 'review' });
    expect(result.allowed).toBe(true);
    expect(result.requiredLevel).toBe('read');
  });

  it('allows a read-only actor to run /anubis explain', async () => {
    const octokit = makeOctokit('read');
    const result = await checkAuthorization(octokit, 'owner', 'repo', 'bob', { type: 'explain' });
    expect(result.allowed).toBe(true);
  });

  it('denies an actor with no access at all', async () => {
    const octokit = makeOctokit('none');
    const result = await checkAuthorization(octokit, 'owner', 'repo', 'eve', { type: 'review' });
    expect(result.allowed).toBe(false);
  });

  it('allows admin-level actors for both read and write commands', async () => {
    const octokit = makeOctokit('admin');
    expect((await checkAuthorization(octokit, 'o', 'r', 'admin-user', { type: 'fix' })).allowed).toBe(true);
    expect((await checkAuthorization(octokit, 'o', 'r', 'admin-user', { type: 'review' })).allowed).toBe(true);
  });
});
