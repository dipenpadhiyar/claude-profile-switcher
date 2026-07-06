import * as path from 'path';
import * as vscode from 'vscode';
import {
  ClaudeProfile,
  ProfilesFile,
  addProfile,
  ensureConfigDirExists,
  getActiveProfile,
  isValidNewProfileName,
  loadProfiles,
  removeProfile,
  renameProfile,
  saveProfiles
} from './profileStore';
import { pointClaudeDirAt, syncTerminalEnvForProfile } from './profileSwitcher';
import { ProfileStatusBar } from './statusBar';
import {
  backupProfile,
  exportProfile,
  importProfileFrom,
  listBackups,
  restoreProfile
} from './backup';

export interface AppContext {
  context: vscode.ExtensionContext;
  statusBar: ProfileStatusBar;
}

/**
 * Persisted across extension-host restarts and window reloads. Claude Code's own sidebar
 * caches the signed-in account's name/email in memory and only re-derives it on a full
 * window reload - a plain extension-host restart (or no restart at all, as with silent
 * auto-switch) leaves that cached identity stale even though usage/chat data, which is
 * fetched live per-request, already reflects the newly active profile's credentials.
 * This flag drives the status bar warning until the user actually reloads the window.
 */
export const RELOAD_PENDING_KEY = 'claudeProfiles.reloadPending';

async function pickProfile(
  data: ProfilesFile,
  placeHolder: string
): Promise<ClaudeProfile | undefined> {
  if (data.profiles.length === 0) {
    vscode.window.showInformationMessage('No Claude profiles configured yet. Create one first.');
    return undefined;
  }
  const items = data.profiles.map(p => ({
    label: p.name,
    description: p.id === data.activeProfileId ? '(active)' : '',
    detail: p.configDir,
    profile: p
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder });
  return picked?.profile;
}

async function performSwitch(
  app: AppContext,
  data: ProfilesFile,
  profile: ClaudeProfile,
  offerReload: boolean
): Promise<boolean> {
  try {
    pointClaudeDirAt(profile);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Could not switch to "${profile.name}": ${(err as Error).message}`
    );
    return false;
  }
  data.activeProfileId = profile.id;
  saveProfiles(data);
  syncTerminalEnvForProfile(app.context.environmentVariableCollection, profile);
  app.statusBar.update(profile);

  // Credentials on disk have already changed at this point, so any new API calls (usage,
  // chat) will use the new profile. Only a full window reload is known to also refresh
  // the Claude sidebar's cached account name/email - mark the warning pending until that
  // happens, whichever path below the user ends up taking.
  await app.context.globalState.update(RELOAD_PENDING_KEY, true);
  app.statusBar.setReloadPending(true);

  if (offerReload) {
    const choice = await vscode.window.showWarningMessage(
      `Switched to Claude profile "${profile.name}". Reload the window so the Claude sidebar fully ` +
        `picks it up? Without a full reload, the sidebar's account name/email can keep showing the ` +
        `previous profile even though its usage numbers already reflect this one.`,
      'Reload Window',
      'Later'
    );
    if (choice === 'Reload Window') {
      await app.context.globalState.update(RELOAD_PENDING_KEY, false);
      vscode.commands.executeCommand('workbench.action.reloadWindow');
      return true;
    }
  }

  // Best-effort partial refresh when the user isn't doing a full reload right now
  // (chose "Later", or this was a silent auto-switch). This re-activates extensions,
  // including Claude Code's, against the new ~/.claude - it just isn't guaranteed to
  // clear the sidebar's cached identity the way a full window reload is, so the
  // warning above stays pending regardless.
  await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
  return true;
}

export function registerCommands(app: AppContext): void {
  const { context } = app;

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.switchProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a Claude profile to switch to');
      if (!profile) {
        return;
      }
      if (profile.id === data.activeProfileId) {
        vscode.window.showInformationMessage(`"${profile.name}" is already the active profile.`);
        return;
      }
      await performSwitch(app, data, profile, true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.createProfile', async () => {
      const data = loadProfiles();
      const name = await vscode.window.showInputBox({
        prompt: 'Name for the new Claude profile',
        placeHolder: 'e.g. Work, Personal, Client',
        validateInput: value => isValidNewProfileName(data, value)
      });
      if (!name) {
        return;
      }

      let switchNow = data.profiles.length === 0;
      if (!switchNow) {
        const choice = await vscode.window.showInformationMessage(
          `Profile "${name}" created. Switch to it now?`,
          'Switch Now',
          'Later'
        );
        switchNow = choice === 'Switch Now';
      }

      const profile = addProfile(data, { name, makeActive: switchNow });
      ensureConfigDirExists(profile);

      if (switchNow) {
        const reloaded = loadProfiles();
        await performSwitch(app, reloaded, profile, true);
      } else {
        vscode.window.showInformationMessage(
          `Profile "${name}" created at ${profile.configDir}.`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.renameProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to rename');
      if (!profile) {
        return;
      }
      const newName = await vscode.window.showInputBox({
        prompt: `New name for "${profile.name}"`,
        value: profile.name,
        validateInput: value =>
          value.trim().toLowerCase() === profile.name.toLowerCase()
            ? undefined
            : isValidNewProfileName(data, value)
      });
      if (!newName || newName === profile.name) {
        return;
      }
      renameProfile(data, profile.id, newName);
      if (profile.id === data.activeProfileId) {
        app.statusBar.update({ ...profile, name: newName });
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.deleteProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to delete');
      if (!profile) {
        return;
      }
      if (profile.id === data.activeProfileId) {
        vscode.window.showErrorMessage(
          `"${profile.name}" is the active profile. Switch to another profile before deleting it.`
        );
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Remove profile "${profile.name}" from the list? Its config folder (${profile.configDir}) will be left on disk.`,
        { modal: true },
        'Remove from List'
      );
      if (confirm !== 'Remove from List') {
        return;
      }
      try {
        removeProfile(data, profile.id);
        vscode.window.showInformationMessage(`Removed profile "${profile.name}".`);
      } catch (err) {
        vscode.window.showErrorMessage((err as Error).message);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.openConfigFolder', async () => {
      const data = loadProfiles();
      const active = getActiveProfile(data);
      const profile = active
        ? active
        : await pickProfile(data, 'Select a profile whose config folder to open');
      if (!profile) {
        return;
      }
      vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(profile.configDir));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.backupProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to back up');
      if (!profile) {
        return;
      }
      const dest = backupProfile(profile);
      vscode.window.showInformationMessage(`Backed up "${profile.name}" to ${dest}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.restoreProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to restore');
      if (!profile) {
        return;
      }
      const backups = listBackups(profile.id);
      if (backups.length === 0) {
        vscode.window.showInformationMessage(`No backups found for "${profile.name}".`);
        return;
      }
      const picked = await vscode.window.showQuickPick(
        backups.map(dir => ({ label: path.basename(dir), detail: dir, dir })),
        { placeHolder: 'Select a backup to restore' }
      );
      if (!picked) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Restore "${profile.name}" from ${picked.label}? This overwrites its current config folder contents.`,
        { modal: true },
        'Restore'
      );
      if (confirm !== 'Restore') {
        return;
      }
      restoreProfile(profile, picked.dir);
      vscode.window.showInformationMessage(`Restored "${profile.name}" from ${picked.label}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.exportProfile', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to export');
      if (!profile) {
        return;
      }
      const destUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Export Here'
      });
      if (!destUri || destUri.length === 0) {
        return;
      }
      const destDir = exportProfile(profile, destUri[0].fsPath);
      vscode.window.showInformationMessage(`Exported "${profile.name}" to ${destDir}.`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.importProfile', async () => {
      const sourceUri = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Import This Folder'
      });
      if (!sourceUri || sourceUri.length === 0) {
        return;
      }
      const name = await vscode.window.showInputBox({
        prompt: 'Name for the imported profile',
        validateInput: value => isValidNewProfileName(loadProfiles(), value)
      });
      if (!name) {
        return;
      }
      const data = loadProfiles();
      const profile = addProfile(data, { name, makeActive: false });
      importProfileFrom(sourceUri[0].fsPath, profile.configDir);
      vscode.window.showInformationMessage(
        `Imported "${name}" from ${sourceUri[0].fsPath} into ${profile.configDir}.`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeProfiles.editWorkspaceMapping', async () => {
      const data = loadProfiles();
      const profile = await pickProfile(data, 'Select a profile to edit workspace matchers for');
      if (!profile) {
        return;
      }
      const current = (profile.workspaceMatchers ?? []).join(', ');
      const input = await vscode.window.showInputBox({
        prompt: `Comma-separated workspace matchers for "${profile.name}" (folder path prefixes, glob patterns with *, or "git:<remote substring>")`,
        value: current,
        placeHolder: 'e.g. C:\\Users\\me\\work\\*, git:github.com/my-company'
      });
      if (input === undefined) {
        return;
      }
      profile.workspaceMatchers = input
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      saveProfiles(data);
      vscode.window.showInformationMessage(`Updated workspace matchers for "${profile.name}".`);
    })
  );
}

export { performSwitch };
