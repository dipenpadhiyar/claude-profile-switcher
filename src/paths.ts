import * as os from 'os';
import * as path from 'path';

export function homeDir(): string {
  return os.homedir();
}

export function claudeDir(): string {
  return path.join(homeDir(), '.claude');
}

export function profilesRootDir(): string {
  return path.join(homeDir(), '.claude-profiles');
}

export function profilesFilePath(): string {
  return path.join(profilesRootDir(), 'profiles.json');
}

export function backupsRootDir(): string {
  return path.join(profilesRootDir(), 'backups');
}

export function defaultConfigDirFor(id: string): string {
  return path.join(homeDir(), `.claude-${id}`);
}

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'profile';
}
