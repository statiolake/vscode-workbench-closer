import * as vscode from "vscode";

const CONFIGURATION_SECTION = "vscode-workbench-closer";

export const WORKBENCH_PARTS = [
  "primarySidebar",
  "secondarySidebar",
  "panel",
] as const;

export type WorkbenchPart = (typeof WORKBENCH_PARTS)[number];

const DEFAULT_SELECTION_CHANGE_WINDOW = 3_000;
const DEFAULT_SELECTION_CHANGE_THRESHOLD = 3;

export interface WorkbenchCloserPartSettings {
  enabled: boolean;
  /** Sliding window in milliseconds used to detect editor activity. */
  selectionChangeWindow: number;
}

export type WorkbenchCloserSettings = Record<
  WorkbenchPart,
  WorkbenchCloserPartSettings
> & {
  /** Number of selection changes required inside a part's activity window. */
  selectionChangeThreshold: number;
};

const CLOSE_COMMANDS: Readonly<Record<WorkbenchPart, string>> = {
  primarySidebar: "workbench.action.closeSidebar",
  secondarySidebar: "workbench.action.closeAuxiliaryBar",
  panel: "workbench.action.closePanel",
};

function normalizeWindow(window: number): number {
  return Number.isFinite(window)
    ? Math.max(1, Math.floor(window))
    : DEFAULT_SELECTION_CHANGE_WINDOW;
}

function normalizeThreshold(threshold: number): number {
  return Number.isFinite(threshold)
    ? Math.max(1, Math.floor(threshold))
    : DEFAULT_SELECTION_CHANGE_THRESHOLD;
}

function getPartSettings(
  configuration: vscode.WorkspaceConfiguration,
  part: WorkbenchPart
): WorkbenchCloserPartSettings {
  return {
    enabled: configuration.get(`${part}.enabled`, true),
    selectionChangeWindow: configuration.get(
      `${part}.selectionChangeWindow`,
      DEFAULT_SELECTION_CHANGE_WINDOW
    ),
  };
}

function getSettings(): WorkbenchCloserSettings {
  const configuration = vscode.workspace.getConfiguration(
    CONFIGURATION_SECTION
  );

  return {
    selectionChangeThreshold: configuration.get(
      "selectionChangeThreshold",
      DEFAULT_SELECTION_CHANGE_THRESHOLD
    ),
    primarySidebar: getPartSettings(configuration, "primarySidebar"),
    secondarySidebar: getPartSettings(configuration, "secondarySidebar"),
    panel: getPartSettings(configuration, "panel"),
  };
}

export function getEnabledParts(
  settings: WorkbenchCloserSettings
): WorkbenchPart[] {
  return WORKBENCH_PARTS.filter((part) => settings[part].enabled);
}

/**
 * Returns the workbench close commands selected by the user's settings.
 *
 * The workbench commands are internal VS Code commands because the public
 * extension API does not expose visibility controls for these three areas.
 */
export function getCloseCommands(
  settings: WorkbenchCloserSettings
): string[] {
  return getEnabledParts(settings).map((part) => CLOSE_COMMANDS[part]);
}

/**
 * Keeps the activity policy separate from VS Code event subscriptions.
 *
 * No timer closes anything. Each part tracks selection changes in a sliding
 * activity window. When the configured threshold is reached, the first event
 * in that qualifying window starts the close delay. The part closes on the
 * first later selection change after that delay.
 */
export class AutoCloseController {
  private readonly activityByPart = new Map<
    WorkbenchPart,
    {
      selectionChanges: number[];
      pendingSince: number | undefined;
    }
  >();

  public constructor(
    private readonly settings: () => WorkbenchCloserSettings,
    private readonly now: () => number = () => Date.now()
  ) {
    this.reset();
  }

  public reset(): void {
    for (const part of WORKBENCH_PARTS) {
      this.resetPart(part);
    }
  }

  public handleActiveEditorChange(): void {
    // A new editor starts a new activity session; it must not inherit the
    // previous editor's selection-change history or pending close delay.
    this.reset();
  }

  public handleSelectionChange(): WorkbenchPart[] {
    const currentTime = this.now();
    const currentSettings = this.settings();
    const threshold = normalizeThreshold(
      currentSettings.selectionChangeThreshold
    );
    const partsToClose: WorkbenchPart[] = [];

    for (const part of WORKBENCH_PARTS) {
      const partSettings = currentSettings[part];
      if (!partSettings.enabled) {
        continue;
      }

      const activity = this.activityByPart.get(part) ?? {
        selectionChanges: [],
        pendingSince: undefined,
      };
      this.activityByPart.set(part, activity);

      const window = normalizeWindow(partSettings.selectionChangeWindow);

      if (
        activity.pendingSince !== undefined &&
        currentTime - activity.pendingSince >= window
      ) {
        partsToClose.push(part);
        this.resetPart(part);
        continue;
      }

      const cutoff = currentTime - window;
      activity.selectionChanges = activity.selectionChanges.filter(
        (timestamp) => timestamp > cutoff
      );

      activity.selectionChanges.push(currentTime);

      if (
        activity.pendingSince === undefined &&
        activity.selectionChanges.length >= threshold
      ) {
        activity.pendingSince = activity.selectionChanges[0];
      }
    }

    return partsToClose;
  }

  private resetPart(part: WorkbenchPart): void {
    this.activityByPart.set(part, {
      selectionChanges: [],
      pendingSince: undefined,
    });
  }
}

/**
 * Closes specific workbench parts.
 *
 * `executeCommand` is injectable so the command selection can be tested
 * without depending on a particular VS Code workbench layout.
 */
export async function closeParts(
  parts: readonly WorkbenchPart[],
  executeCommand: (command: string) => Thenable<unknown> = (command) =>
    vscode.commands.executeCommand(command)
): Promise<void> {
  const commands = parts.map((part) => CLOSE_COMMANDS[part]);
  const results = await Promise.allSettled(
    commands.map((command) => executeCommand(command))
  );

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      console.error(
        `Workbench Closer failed to execute ${commands[index]}`,
        result.reason
      );
    }
  }
}

export async function closeConfiguredParts(
  settings: WorkbenchCloserSettings = getSettings(),
  executeCommand: (command: string) => Thenable<unknown> = (command) =>
    vscode.commands.executeCommand(command)
): Promise<void> {
  await closeParts(getEnabledParts(settings), executeCommand);
}

export function activate(context: vscode.ExtensionContext) {
  let eventDisposables: vscode.Disposable[] = [];
  const controller = new AutoCloseController(getSettings);

  const disposeEventListeners = () => {
    for (const disposable of eventDisposables) {
      disposable.dispose();
    }
    eventDisposables = [];
  };

  const closeFromTrigger = (parts: readonly WorkbenchPart[]) => {
    if (parts.length === 0) {
      return;
    }

    void closeParts(parts).catch((error: unknown) => {
      console.error("Workbench Closer failed", error);
    });
  };

  const refreshEventListeners = () => {
    disposeEventListeners();
    controller.reset();

    const settings = getSettings();
    if (getEnabledParts(settings).length === 0) {
      return;
    }

    eventDisposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => {
        controller.handleActiveEditorChange();
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (event.textEditor === vscode.window.activeTextEditor) {
          closeFromTrigger(controller.handleSelectionChange());
        }
      })
    );
  };

  const closeCommand = vscode.commands.registerCommand(
    "vscode-workbench-closer.closeConfiguredParts",
    () => closeConfiguredParts()
  );

  const toggleCommand = vscode.commands.registerCommand(
    "vscode-workbench-closer.toggleAutomaticClosing",
    async () => {
      const configuration = vscode.workspace.getConfiguration(
        CONFIGURATION_SECTION
      );
      const settings = getSettings();
      const enable = getEnabledParts(settings).length === 0;

      await Promise.all(
        WORKBENCH_PARTS.map((part) =>
          configuration.update(
            `${part}.enabled`,
            enable,
            vscode.ConfigurationTarget.Global
          )
        )
      );

      vscode.window.showInformationMessage(
        `Workbench Closer automatic closing ${enable ? "enabled" : "disabled"}.`
      );
    }
  );

  const configurationListener = vscode.workspace.onDidChangeConfiguration(
    (event) => {
      if (event.affectsConfiguration(CONFIGURATION_SECTION)) {
        refreshEventListeners();
      }
    }
  );

  const cleanup = new vscode.Disposable(() => {
    disposeEventListeners();
  });

  context.subscriptions.push(
    closeCommand,
    toggleCommand,
    configurationListener,
    cleanup
  );

  refreshEventListeners();
}

export function deactivate() {}
