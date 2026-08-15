# Workbench Closer

Automatically closes selected VS Code workbench parts after enough editor
activity or terminal activation.

The extension can close these areas independently:

- Primary Side Bar
- Secondary Side Bar
- Bottom Panel

## How it works

VS Code's public extension API does not expose a general workbench focus-lost
event for these areas. Workbench Closer therefore uses these editor-side
signals as practical proxies:

- the active editor's selection changes
- the active terminal changes

The terminal event is `onDidChangeActiveTerminal`; it detects a terminal
becoming active or changing, but not every mouse-only focus transition to an
already-active terminal.

An active-editor change is not a closing signal. It starts a new activity
session by clearing the previous editor's selection-change history and any
pending close delay, but it does not close anything by itself.

## Editor activity detection

Each workbench part has its own `enabled` and `selectionChangeWindow` setting.
The extension also has a common `selectionChangeThreshold` setting. By
default, three selection changes within three seconds start the closing delay:

1. Each selection change adds a timestamp to the part's sliding activity
   window.
2. Timestamps older than `selectionChangeWindow` are discarded.
3. When the number of remaining timestamps first reaches
   `selectionChangeThreshold`, the timestamp of the first event in that group
   is saved. The part does not close yet.
4. After `selectionChangeWindow` has elapsed from that saved timestamp, the
   first later selection change closes the part.
5. Closing the part clears the saved timestamp and all previous selection
   change history.

There is no timer running in the background. The check happens only when a
selection change is reported.

There is no quiet-period re-arm requirement. After a part closes, a new
selection-change history can immediately start building.

Activating a terminal is a direct closing trigger and does not require the
selection-change threshold. The terminal event is
`onDidChangeActiveTerminal`; it detects a terminal becoming active or changing,
but not every mouse-only focus transition to an already-active terminal.

This is an activity heuristic, not a general focus event. For example, merely
reading an editor without changing its selection may not produce enough
events to close a workbench part.

## Commands

- `Workbench Closer: Close Configured Parts`
- `Workbench Closer: Toggle Automatic Closing`

The toggle command enables or disables all three targets together. Individual
target settings remain available in Settings.

## Settings

All targets are enabled by default. The default threshold is three selection
changes in a three-second activity window and closing delay:

```json
{
  "vscode-workbench-closer.selectionChangeThreshold": 3,
  "vscode-workbench-closer.primarySidebar.enabled": true,
  "vscode-workbench-closer.primarySidebar.selectionChangeWindow": 3000,
  "vscode-workbench-closer.secondarySidebar.enabled": true,
  "vscode-workbench-closer.secondarySidebar.selectionChangeWindow": 3000,
  "vscode-workbench-closer.panel.enabled": true,
  "vscode-workbench-closer.panel.selectionChangeWindow": 3000
}
```

For example, to start closing the primary sidebar after three selection
changes within one second, then close it on the first later selection change
after one second from the first of those changes:

```json
{
  "vscode-workbench-closer.primarySidebar.selectionChangeWindow": 1000,
  "vscode-workbench-closer.selectionChangeThreshold": 3
}
```

## Development

```sh
npm install
npm run compile
npm test
```

Open the project in VS Code and press `F5` to launch an Extension Development
Host window with Workbench Closer loaded. The `Run Extension` configuration is
provided in `.vscode/launch.json`. `Extension Tests` can be used to debug the
test suite.

## Packaging and publishing

Create a VSIX package locally:

```sh
npm run package
```

Publish to the Visual Studio Marketplace after authenticating `vsce` as the
`statiolake` publisher:

```sh
npm run publish
```

The optional Open VSX command is also available:

```sh
npm run publish:ovsx
```

## License

MIT
