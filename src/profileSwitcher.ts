import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { claudeDir, defaultConfigDirFor } from './paths';
import { ClaudeProfile } from './profileStore';

/** True if ~/.claude exists and is already a junction/symlink (i.e. already under our management). */
export function claudeDirIsLink(): boolean {
  try {
    return fs.lstatSync(claudeDir()).isSymbolicLink();
  } catch {
    return false; // does not exist
  }
}

/** True if ~/.claude exists as a real (non-link) directory with actual content. */
export function claudeDirIsRealDirectory(): boolean {
  try {
    const stat = fs.lstatSync(claudeDir());
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false; // does not exist
  }
}

function removeExistingClaudeLink(): void {
  // On Windows, a directory junction must be removed with rmdir (unlink fails with EPERM);
  // this removes only the link, never the target's contents.
  if (process.platform === 'win32') {
    fs.rmdirSync(claudeDir());
  } else {
    fs.unlinkSync(claudeDir());
  }
}

function createClaudeLink(targetDir: string): void {
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(targetDir, claudeDir(), linkType);
}

/**
 * Moves the current real ~/.claude directory into a new profile folder and replaces
 * ~/.claude with a junction pointing at it. Used for first-run migration of an
 * existing single-account setup into the "Default" profile.
 */
export function migrateRealClaudeDirToProfile(profileId: string): string {
  const targetDir = defaultConfigDirFor(profileId);
  if (fs.existsSync(targetDir)) {
    throw new Error(`${targetDir} already exists; cannot migrate into it.`);
  }
  fs.renameSync(claudeDir(), targetDir);
  createClaudeLink(targetDir);
  return targetDir;
}

/** Repoints ~/.claude at the given profile's config dir, creating the dir if needed. */
export function pointClaudeDirAt(profile: ClaudeProfile): void {
  fs.mkdirSync(profile.configDir, { recursive: true });
  if (claudeDirIsLink()) {
    removeExistingClaudeLink();
  } else if (fs.existsSync(claudeDir())) {
    throw new Error(
      `${claudeDir()} exists as a real directory, not a managed link. Refusing to overwrite it.`
    );
  }
  createClaudeLink(path.resolve(profile.configDir));
}

/** Syncs CLAUDE_CONFIG_DIR (and any profile-specific extra vars) for new integrated terminals. */
export function syncTerminalEnvForProfile(
  collection: vscode.EnvironmentVariableCollection,
  profile: ClaudeProfile
): void {
  collection.clear();
  collection.replace('CLAUDE_CONFIG_DIR', path.resolve(profile.configDir));
  if (profile.env) {
    for (const [key, value] of Object.entries(profile.env)) {
      collection.replace(key, value);
    }
  }
}
