import * as vscode from 'vscode';
import {
  addProfile,
  getActiveProfile,
  loadProfiles,
  saveProfiles
} from './profileStore';
import {
  claudeDirIsLink,
  claudeDirIsRealDirectory,
  migrateRealClaudeDirToProfile,
  pointClaudeDirAt,
  syncTerminalEnvForProfile
} from './profileSwitcher';
import { ProfileStatusBar } from './statusBar';
import { registerCommands, performSwitch, AppContext, RELOAD_PENDING_KEY } from './commands';
import { findMatchingProfile } from './workspaceAutoSwitch';

const DISMISSED_WORKSPACES_KEY = 'claudeProfiles.dismissedWorkspaces';

async function offerFirstRunMigration(app: AppContext): Promise<void> {
  const data = loadProfiles();
  if (data.profiles.length > 0 || !claudeDirIsRealDirectory()) {
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    'An existing ~/.claude folder was found. Convert it into a profile named "Default" so Claude Profile Switcher can manage account switching?',
    { modal: true },
    'Convert to "Default" Profile'
  );
  if (choice !== 'Convert to "Default" Profile') {
    return;
  }
  const profile = addProfile(data, { name: 'Default', makeActive: true });
  migrateRealClaudeDirToProfile(profile.id);
  saveProfiles(data);
  syncTerminalEnvForProfile(app.context.environmentVariableCollection, profile);
  app.statusBar.update(profile);
}

/** Self-heals ~/.claude if it's missing (e.g. deleted by hand) but a profile is already active. */
function reconcileActiveProfileLink(): void {
  const data = loadProfiles();
  const active = getActiveProfile(data);
  if (!active || claudeDirIsLink() || claudeDirIsRealDirectory()) {
    return;
  }
  try {
    pointClaudeDirAt(active);
  } catch {
    // Leave it - user will see the mismatch via the status bar tooltip / config folder path.
  }
}

async function checkWorkspaceAutoSwitch(app: AppContext): Promise<void> {
  const mode = vscode.workspace
    .getConfiguration('claudeProfiles')
    .get<string>('autoSwitch.mode', 'prompt');
  if (mode === 'off') {
    return;
  }
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }
  const data = loadProfiles();
  const match = await findMatchingProfile(data.profiles, folder.uri.fsPath);
  if (!match || match.id === data.activeProfileId) {
    return;
  }

  const dismissed = app.context.workspaceState.get<string[]>(DISMISSED_WORKSPACES_KEY, []);
  if (dismissed.includes(folder.uri.fsPath)) {
    return;
  }

  if (mode === 'silent') {
    await performSwitch(app, data, match, false);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `This workspace matches Claude profile "${match.name}". Switch now?`,
    'Switch Now',
    'Not Now',
    "Don't Ask Again For This Workspace"
  );
  if (choice === 'Switch Now') {
    await performSwitch(app, loadProfiles(), match, true);
  } else if (choice === "Don't Ask Again For This Workspace") {
    await app.context.workspaceState.update(DISMISSED_WORKSPACES_KEY, [
      ...dismissed,
      folder.uri.fsPath
    ]);
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusBar = new ProfileStatusBar();
  context.subscriptions.push(statusBar);
  const app: AppContext = { context, statusBar };

  await offerFirstRunMigration(app);
  reconcileActiveProfileLink();

  const data = loadProfiles();
  const active = getActiveProfile(data);
  if (active) {
    syncTerminalEnvForProfile(context.environmentVariableCollection, active);
  }
  statusBar.update(active);
  // Survives extension-host restarts (and window reloads, until cleared by one) so the
  // warning stays visible until a full "Reload Window" actually happens - see RELOAD_PENDING_KEY.
  statusBar.setReloadPending(context.globalState.get<boolean>(RELOAD_PENDING_KEY, false));

  registerCommands(app);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void checkWorkspaceAutoSwitch(app);
    })
  );
  void checkWorkspaceAutoSwitch(app);
}

export function deactivate(): void {
  // Nothing to clean up: status bar and command registrations are disposed via context.subscriptions.
}
