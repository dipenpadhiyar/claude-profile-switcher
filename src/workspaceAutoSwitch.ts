import { exec } from 'child_process';
import { ClaudeProfile } from './profileStore';

const GIT_PREFIX = 'git:';

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped.replace(/\*\*|\*/g, m => (m === '**' ? '.*' : '[^/\\\\]*'));
  return new RegExp('^' + pattern, process.platform === 'win32' ? 'i' : '');
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function matchesPathMatcher(workspacePath: string, matcher: string): boolean {
  const normalizedWorkspace = normalize(workspacePath);
  const normalizedMatcher = normalize(matcher);
  if (normalizedMatcher.includes('*')) {
    return globToRegExp(normalizedMatcher).test(normalizedWorkspace);
  }
  return normalizedWorkspace
    .toLowerCase()
    .startsWith(normalizedMatcher.replace(/\/$/, '').toLowerCase());
}

/** Runs `git remote -v` in the given folder; resolves to '' if not a git repo or git is unavailable. */
export function getGitRemotes(folderPath: string): Promise<string> {
  return new Promise(resolve => {
    exec('git remote -v', { cwd: folderPath, timeout: 3000 }, (error, stdout) => {
      resolve(error ? '' : stdout);
    });
  });
}

export async function findMatchingProfile(
  profiles: ClaudeProfile[],
  workspacePath: string
): Promise<ClaudeProfile | undefined> {
  let gitRemotes: string | undefined;

  for (const profile of profiles) {
    for (const matcher of profile.workspaceMatchers ?? []) {
      if (matcher.startsWith(GIT_PREFIX)) {
        const needle = matcher.slice(GIT_PREFIX.length);
        if (gitRemotes === undefined) {
          gitRemotes = await getGitRemotes(workspacePath);
        }
        if (needle && gitRemotes.includes(needle)) {
          return profile;
        }
      } else if (matchesPathMatcher(workspacePath, matcher)) {
        return profile;
      }
    }
  }
  return undefined;
}
