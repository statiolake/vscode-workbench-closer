# Change Log

All notable changes to the Workbench Closer extension will be documented in
this file.

## [Unreleased]

## [0.3.5] - 2026-08-18

### Changed

- Ignore terminal activation and focus; automatic closing now uses editor
  selection changes only.

## [0.3.4] - 2026-08-17

### Fixed

- Detect editor-area terminals through active `TabInputTerminal` tabs and
  ignore bottom-panel terminals to prevent the panel from closing itself.

## [0.3.3] - 2026-08-15

### Fixed

- Clear selection-change history and pending close state when the active
  editor changes.

## [0.3.1] - 2026-08-15

### Changed

- Start the closing delay when the selection-change threshold is first
  reached, then close on the first later selection change after that delay.
- Clear the pending timestamp and selection-change history when a part closes.
- Allow a new activity history to begin immediately after closing.

## [0.3.0] - 2026-08-15

### Changed

- Replace the last-selection delay gate with sliding-window editor activity
  detection.
- Close after the configured number of selection changes within each part's
  activity window.
- Rename per-part `delay` settings to `selectionChangeWindow`.
- Treat active terminal changes as direct closing triggers.

## [0.2.0] - 2026-08-15

### Added

- Close the primary sidebar, secondary sidebar, and bottom panel after editor
  or terminal interaction.
- Configure automatic closing and delay independently for each workbench part.
- Use event-driven delay gates instead of timer-based automatic closing.
- Document the limitations of VS Code's public focus events.
- VS Code Extension Development Host and test launch configurations.

## [0.1.0] - 2026-08-15

### Added

- Commands for manually closing configured parts and toggling automatic
  closing.
