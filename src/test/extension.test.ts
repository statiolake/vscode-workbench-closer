import * as assert from "node:assert";
import * as vscode from "vscode";

import {
  AutoCloseController,
  closeConfiguredParts,
  getCloseCommands,
  isTerminalInEditorArea,
  type WorkbenchCloserSettings,
} from "../extension";

function createSettings(
  overrides: Partial<WorkbenchCloserSettings["primarySidebar"]> = {},
  selectionChangeThreshold = 3
): WorkbenchCloserSettings {
  return {
    selectionChangeThreshold,
    primarySidebar: {
      enabled: true,
      selectionChangeWindow: 3000,
      ...overrides,
    },
    secondarySidebar: { enabled: true, selectionChangeWindow: 3000 },
    panel: { enabled: true, selectionChangeWindow: 3000 },
  };
}

function createTerminal(
  location: vscode.TerminalOptions["location"]
): vscode.Terminal {
  return {
    creationOptions: { location },
  } as vscode.Terminal;
}

suite("Workbench Closer", () => {
  test("selects all enabled workbench close commands", () => {
    assert.deepStrictEqual(
      getCloseCommands(createSettings()),
      [
        "workbench.action.closeSidebar",
        "workbench.action.closeAuxiliaryBar",
        "workbench.action.closePanel",
      ]
    );
  });

  test("selects only enabled workbench parts", () => {
    const settings = createSettings();
    settings.primarySidebar.enabled = false;
    settings.panel.enabled = false;

    assert.deepStrictEqual(getCloseCommands(settings), [
      "workbench.action.closeAuxiliaryBar",
    ]);
  });

  test("delays closing from the first qualifying selection change", () => {
    let now = 0;
    const settings = createSettings({ selectionChangeWindow: 1000 }, 3);
    settings.secondarySidebar.selectionChangeWindow = 1000;
    settings.panel.selectionChangeWindow = 1000;
    const controller = new AutoCloseController(() => settings, () => now);

    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 100;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 200;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 999;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 1000;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "primarySidebar",
      "secondarySidebar",
      "panel",
    ]);
  });

  test("uses an independent activity window for each workbench part", () => {
    let now = 0;
    const settings = createSettings({ selectionChangeWindow: 1000 }, 2);
    settings.secondarySidebar.selectionChangeWindow = 2000;
    settings.panel.enabled = false;
    const controller = new AutoCloseController(() => settings, () => now);

    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 1500;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 2400;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "secondarySidebar",
    ]);

    now = 2500;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "primarySidebar",
    ]);
  });

  test("clears the history when a part closes", () => {
    let now = 0;
    const settings = createSettings({ selectionChangeWindow: 1000 }, 2);
    settings.secondarySidebar.selectionChangeWindow = 1000;
    settings.panel.selectionChangeWindow = 1000;
    const controller = new AutoCloseController(() => settings, () => now);

    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 100;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 200;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 1100;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "primarySidebar",
      "secondarySidebar",
      "panel",
    ]);

    now = 1200;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 1300;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 2300;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "primarySidebar",
      "secondarySidebar",
      "panel",
    ]);

    now = 2400;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);
  });

  test("clears the history when the active editor changes", () => {
    let now = 0;
    const settings = createSettings({ selectionChangeWindow: 1000 }, 2);
    settings.secondarySidebar.selectionChangeWindow = 1000;
    settings.panel.selectionChangeWindow = 1000;
    const controller = new AutoCloseController(() => settings, () => now);

    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 100;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    controller.handleActiveEditorChange();

    now = 1100;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 1200;
    assert.deepStrictEqual(controller.handleSelectionChange(), []);

    now = 2200;
    assert.deepStrictEqual(controller.handleSelectionChange(), [
      "primarySidebar",
      "secondarySidebar",
      "panel",
    ]);
  });

  test("handles terminal activation as a direct closing trigger", () => {
    let now = 0;
    const settings = createSettings();
    const controller = new AutoCloseController(() => settings, () => now);

    assert.deepStrictEqual(controller.handleActiveTerminalChange(), [
      "primarySidebar",
      "secondarySidebar",
      "panel",
    ]);
  });

  test("distinguishes editor-area and panel terminals", () => {
    const editorTerminal = createTerminal(vscode.TerminalLocation.Editor);
    const panelTerminal = createTerminal(vscode.TerminalLocation.Panel);
    const unknownTerminal = createTerminal(undefined);
    const splitEditorTerminal = createTerminal({
      parentTerminal: editorTerminal,
    });
    const splitPanelTerminal = createTerminal({
      parentTerminal: panelTerminal,
    });

    assert.strictEqual(isTerminalInEditorArea(editorTerminal), true);
    assert.strictEqual(isTerminalInEditorArea(panelTerminal), false);
    assert.strictEqual(isTerminalInEditorArea(unknownTerminal), false);
    assert.strictEqual(isTerminalInEditorArea(splitEditorTerminal), true);
    assert.strictEqual(isTerminalInEditorArea(splitPanelTerminal), false);
  });

  test("closes only the configured parts", async () => {
    const settings = createSettings();
    settings.primarySidebar.enabled = false;
    settings.panel.enabled = false;
    const executedCommands: string[] = [];

    await closeConfiguredParts(settings, async (command) => {
      executedCommands.push(command);
    });

    assert.deepStrictEqual(executedCommands, [
      "workbench.action.closeAuxiliaryBar",
    ]);
  });
});
