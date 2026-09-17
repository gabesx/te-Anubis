import type { Octokit } from '@octokit/rest';
import type { AnubisCommand } from '../core/seams/github-integration.js';

export type PermissionLevel = 'read' | 'write';

export interface AuthorizationResult {
  allowed: boolean;
  requiredLevel: PermissionLevel;
  actorLevel: string;
  reason?: string;
}

const WRITE_CAPABLE = new Set(['write', 'maintain', 'admin']);
const READ_CAPABLE = new Set(['read', 'triage', 'write', 'maintain', 'admin']);

/** `fix` (once it exists) needs write+; `review`/`explain` only need read+ — they're read-only analysis. */
function requiredLevelFor(command: AnubisCommand): PermissionLevel {
  return command.type === 'fix' ? 'write' : 'read';
}

/**
 * Re-checked on every invocation, never cached — permissions can change
 * between comments. Queries the actor's actual collaborator permission on
 * this repo rather than trusting anything in the comment/event payload.
 */
export async function checkAuthorization(
  octokit: Octokit,
  owner: string,
  repo: string,
  actor: string,
  command: AnubisCommand,
): Promise<AuthorizationResult> {
  const requiredLevel = requiredLevelFor(command);

  const { data } = await octokit.repos.getCollaboratorPermissionLevel({ owner, repo, username: actor });
  const actorLevel = data.permission;

  const allowed = requiredLevel === 'write' ? WRITE_CAPABLE.has(actorLevel) : READ_CAPABLE.has(actorLevel);

  return {
    allowed,
    requiredLevel,
    actorLevel,
    reason: allowed ? undefined : `this command needs ${requiredLevel}+ repository access; @${actor} has "${actorLevel}"`,
  };
}
