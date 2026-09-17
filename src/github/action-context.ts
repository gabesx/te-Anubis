import { readFileSync } from 'node:fs';
import type { PullRequestRef } from '../core/seams/github-integration.js';

export interface PullRequestEventPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    head: { sha: string; ref: string; repo: { full_name: string } | null };
    base: { sha: string; ref: string; repo: { full_name: string } };
  };
  repository: { owner: { login: string }; name: string; full_name: string };
}

export interface IssueCommentEventPayload {
  action: string;
  issue: { number: number; pull_request?: unknown };
  comment: { body: string; user: { login: string } };
  repository: { owner: { login: string }; name: string; full_name: string };
}

export function readEventPayload<T>(): T {
  const path = process.env.GITHUB_EVENT_PATH;
  if (!path) {
    throw new Error('GITHUB_EVENT_PATH is not set — this command must run inside a GitHub Actions workflow.');
  }
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

export function pullRequestRefFromEvent(payload: PullRequestEventPayload): PullRequestRef {
  const pr = payload.pull_request;
  const baseRepoFullName = payload.repository.full_name;
  const headRepoFullName = pr.head.repo?.full_name ?? baseRepoFullName;
  return {
    owner: payload.repository.owner.login,
    repo: payload.repository.name,
    number: pr.number,
    headSha: pr.head.sha,
    headRepoFullName,
    baseRepoFullName,
    isFork: headRepoFullName !== baseRepoFullName,
  };
}

export function requireGithubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set.');
  return token;
}
