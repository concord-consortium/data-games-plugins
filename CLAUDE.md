# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This repository contains educational game plugins for CODAP (Common Online Data Analysis Platform). Each game is a data interactive that runs in an iframe within CODAP and sends gameplay data to CODAP for analysis.

## Architecture

### Game Structure

Each game follows a consistent MVC pattern:
- **index.html**: Loads dependencies and initializes the game via `GameName.initializeGame()` or similar
- **{game}_model.js**: Game logic, CODAP communication, and data management
- **{game}_view.js**: UI rendering (typically using Raphael.js for graphics)
- **{game}_game.js** (some games): Additional game controller logic
- **{game}_settings.js**: Configuration constants
- **{game}_levels.js**: Level definitions (if applicable)

Games: CartWeight, FloydsFargo, LunarLander, Markov, Proximity, Shuffleboard

### Shared Infrastructure (Common/)

The Common directory contains shared libraries used across all games:
- **CodapInterface.js**: Original CODAP API interface using iframePhone for bidirectional communication
- **codap_helper.js**: Higher-level helpers for common CODAP operations (dataset creation, case management)
- **events.js**: Event dispatcher for MVC communication
- **level_manager.js**: Level progression system
- **kcpcommon.js**: Utility functions
- **raphael.js, jquery.js**: Third-party libraries

### CODAP Integration

Games communicate with CODAP through multiple layers:

1. **iframePhone** (Common/js/iframe-phone.js): Low-level bidirectional RPC between iframe and parent window
2. **CodapInterface.js** or **codapInterface.js**: Abstraction layer providing:
   - `init()`: Establish connection, set frame properties, restore state
   - `sendRequest()`: Send API requests to CODAP (returns Promise)
   - `on()`: Subscribe to CODAP notifications (e.g., component creation, data changes)
   - `getInteractiveState()/updateInteractiveState()`: Persist game state in CODAP documents
3. **connect.js** (newer games): Higher-level singleton with game-specific initialization
4. **notifications.js** (newer games): Handles CODAP notifications (e.g., auto-configuring graphs when created)

**CODAP v3 Migration**: Recent work has migrated games from the old DG API to the modern CODAP v3 API. Games using `connect.js`, `codapInterface.js`, and `notifications.js` at the game level (not Common/) are v3-compatible.

### Data Flow

1. Game initializes connection via `codapInterface.init()` or `connect.initialize()`
2. Model creates/verifies CODAP datasets with hierarchical collections (e.g., Games → Turns)
3. Gameplay events trigger `openCase()`/`closeCase()` or `createCase()` calls to CODAP
4. CODAP stores game data and provides it for student analysis (graphs, tables, etc.)

## Recent Development

The current branch `CODAP-751-duplicate-datasets-bug-v3` addresses dataset duplication issues in games during initialization. Key changes involve checking for existing datasets by both `name` and `title` before creating new ones, since CODAP allows datasets to have different names and titles.

Recent migration work has added game-specific `codapInterface.js` and `notifications.js` files to individual games (visible as untracked files in git status), replacing reliance on Common/js/CodapInterface.js for CODAP v3 compatibility.

## Development Workflow

**No build process**: Games are vanilla JavaScript/HTML/CSS served directly. Open index.html in a browser or deploy to a web server.

**Testing**: Manual testing within CODAP. Drag the game's URL into a CODAP document to run it as a data interactive.

**Adding/Modifying Games**:
- Model files contain the core logic and CODAP integration
- Use `codapInterface.sendRequest()` for CODAP API calls
- Follow existing patterns for dataset/collection/attribute definitions
- Register notification handlers via `codapInterface.on()` for CODAP events
- Use event dispatchers for Model-View communication

## Key Patterns

**Dataset Creation**: Check if dataset exists before creating to avoid duplicates:
```javascript
const iResult = await codapInterface.sendRequest({
  action: 'get',
  resource: 'dataContextList'
});
if (iResult.success && !iResult.values.some(ds => [ds.name, ds.title].includes("DatasetName"))) {
  await codapHelper.createDataset({...});
}
```

**Hierarchical Data**: Games use parent-child collections (Games → Turns) with `openCase()`/`closeCase()` for parent cases and `createCase()` for child cases.

**Async Initialization**: Modern games use `async/await` for initialization sequences. The `initializeGame()` method should be `async` and `await` CODAP connection before proceeding.
