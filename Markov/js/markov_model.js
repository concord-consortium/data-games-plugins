"use strict";
// ==========================================================================
// Project:   Markov
// Copyright: ©2012 KCP Technologies, Inc.
// ==========================================================================
/*global Event, EventDispatcher, KCPCommon, LevelManager, MarkovLevels, MarkovSettings, StrategyEditor */
/**
 * @fileoverview Defines MarkovModel
 * @author bfinzer@kcptech.com (William Finzer)
 * @preserve (c) 2012 KCP Technologies, Inc.
 */

/* codapPhone is initialized in index.html when game is initialized*/

function MarkovModel()
{
  this.eventDispatcher = new EventDispatcher();
  this.levelManager = new LevelManager( MarkovLevels, this, 'MarkovGame.model.handleLevelButton(event, ##);',
                                        this, this.isLevelEnabled);
  this.levelManager.unlockAll();

  this.gameState = "welcome";  // "welcome" or "playing" or "gameEnded" or "levelsMode"
  this.turnState = 'waiting'; // 'waiting' or 'moving' or 'abort'

  // DG vars
  this.openGameCase = null;
  
  // game vars
  this.gameNumber = 0;
  this.level = this.levelManager.getStartingLevel();
  this.winner = '';

  // turn vars
  this.turn = 0;
  this.marMove = 'P'; // Necessary seed for strategy to be able to work on first turn
  this.yourMove = '';
  this.result = '';
  this.up_down = 0;
  this.mar_prev_2 = 'PP'; // A seed so a strategy can begin working right away

  this.autoplay = false;
  this.animTime = MarkovSettings.kAnimTime; // milliseconds for each phase

  // other
  this.hasChangedLevels = false;
  this.results = ['lose', 'win'];
  this.up_downs = [ -1, 1]; // In autoplay gets multiplied by weight
  this.outcomes = { // Your move followed by Markov's move
    RR: 0, RP: 0, RS: 1,
    PP: 0, PR: 1, PS: 0,
    SS: 0, SR: 0, SP: 1
  };

  this.strategy = {};
  var this_ = this;
  KCPCommon.keys( this.outcomes ).forEach( function( iKey) {
    this_.strategy[iKey] = { move: '', weight: 2 };
  });

}

/**
 * Inform DG about this game
 */
/* Called from index.html*/
MarkovModel.prototype.initialize = async function()
{
  let interactiveState = codapInterface.getInteractiveState();    //  get stored state, if any

  // We create a dataset, if not already existing with the name "Game/Turns", a parent collection named "Games"
  // and a child collection named "Turns"
  const iResult = await codapInterface.sendRequest({
    action: 'get',
    resource: 'dataContextList'
  });
  // It can happen that an existing dataset has "Games/Turns" as either its name or title, so we check both.
  if (iResult.success && !iResult.values.some(ds => [ds.name, ds.title].includes("Games/Turns"))) {
    await codapHelper.createDataset({
      name: "Games/Turns",
      collections: [
        {
          name: "Games",
          title: "Games",
          attrs: [
            {
              "name": "game",
              "type": "numeric",
              "precision": 0,
              defaultMin: 1,
              defaultMax: 5,
              "description": "game number"
            },
            {
              "name": "turns",
              "type": "numeric",
              "precision": 0,
              defaultMin: 0,
              defaultMax: 10,
              "description": "number of turns in the game"
            },
            { "name": "winner", "type": "categorical", 'description': 'who won? You or Markov?' },
            { "name": "level", "type": "categorical", 'description': 'what level of the game was played' }
          ],
          defaults: {
            xAttr: "game",
            yAttr: "score"
          }
        },
        {
          name: "Turns",
          title: "Turns",
          parent: "Games",
          attrs: [
            {
              "name": "turn",
              "type": "numeric",
              "precision": 0,
              defaultMin: 0,
              defaultMax: 10,
              "description": "the turn number in the game"
            },
            {
              "name": "markovs_move", "type": "categorical", "description": "the move markov made this turn",
              colormap: { "R": 'red', "P": 'blue', "S": 'green' }
            },
            {
              "name": "your_move", "type": "categorical", "description": "the move you made this turn",
              colormap: { "R": 'red', "P": 'blue', "S": 'green' }
            },
            { "name": "result", "type": "categorical", "description": "(win|lose) you vs Markov?" },
            {
              "name": "up_down",
              "type": "numeric",
              precision: 0,
              defaultMin: -1,
              defaultMax: 1,
              description: "(up|down) Madeline moved this turn?"
            },
            {
              "name": "previous_2_markov_moves",
              type: "categorical",
              "description": "the two moves Markov made prior to this one"
            }
          ],
          defaults: {
            xAttr: "previous_2_markov_moves",
            yAttr: "markovs_move"
          }
        }
      ],
      type: 'DG.GameContext',
    });
  }

  notificatons.registerForDocumentChanges();
  if (interactiveState) {
    this.restoreGameState(interactiveState);
  }
};

/**
 * If we don't already have an open game case, open one now.
 */
/* Called by playGame(), and addTurnCase() in this model*/
MarkovModel.prototype.openNewGameCase = async function()
{
  if( !this.openGameCase) {
    await codapInterface.sendRequest({
      action: 'create',
      resource: "dataContext[Games/Turns].collection[Games].case",
      values: [
        {
          values: {
            game: this.gameNumber,
            turns: 0,
            winner: '',
            level: this.level.levelName
          }
        }
      ]
    }).then(function(iResult) {
      if(iResult.success) {
        this.openGameCase = iResult.values[0].id;
      } else {
        console.log("Markov: Error creating new game case");
      }
    }.bind(this));
  }
};

/**
 * Pass DG the values for the turn that just got completed
 */
/* Called by endTurn() in this model */
MarkovModel.prototype.addTurnCase = async function()
{
  var values =  {
    turn: this.turn,
    markovs_move: this.marMove,
    your_move: this.yourMove,
    result: this.result,
    up_down: this.up_down,
    previous_2_markov_moves: (this.turn > 2) ? this.mar_prev_2 : ''
  };

  if (this.turn === 1) {
    // Update the existing case
    // First get the case ID of the already created first turn
    var iResult = await codapInterface.sendRequest({
      action: 'get',
      resource: 'dataContext[Games/Turns].collection[Games].caseByID[' + this.openGameCase + ']'
    });
    if (iResult.success) {
      var idOfFirstTurnCase = iResult.values.case.children[0];
      // Update the existing case with the new values
      await codapInterface.sendRequest({
        action: 'update',
        resource: "dataContext[Games/Turns].collection[Turns].caseByID[" + idOfFirstTurnCase + "]",
        values: {
          values: values
        }
      });
    } else {
      console.log("Markov: Error finding existing turn case");
      return; // Cannot proceed without a case ID
    }
  }
  else {
    // Create the new Turn case
    await codapInterface.sendRequest({
      action: "create",
      resource: `dataContext[Games/Turns].collection[Turns].case`,
      values: [
        {
          parent: this.openGameCase,
          values: values
        }
      ],
    });
  }
};

/**
 * Let DG know that the current game is complete.
 * Stash relevant values for the level and check to see if any levels are newly unlocked.
 */
/* Called by endGame() in this model*/
MarkovModel.prototype.addGameCase = async function()
{
  var this_ = this;
  var iResult = await codapInterface.sendRequest({
    action: 'update',
    resource: `dataContext[Games/Turns].collection[Games].caseByID[${this.openGameCase}]`,
    values: {
      values: {
        turns: this.turn,
        winner: this.winner,
        level: this.level.levelName
      }
    }
  });
  if(!iResult.success) {
    console.log("Markov: Error updating game case");
  }
  this.openGameCase = null;

  if( !this.level.scores)
    this.level.scores = [];
  this.level.scores.push( this.score);
  this.level.highScore = !this.level.highScore ? this.score : Math.max( this.level.highScore, this.score);

  // This game may have unlocked a previously locked level
  this.levelManager.levelsArray.forEach( function( iLevel) {
    if( !iLevel.unlocked && this_.isLevelEnabled( iLevel)) {
      iLevel.unlocked = true;
      var tEvent = new Event("levelUnlocked");
      tEvent.levelName = iLevel.levelName;
      this_.eventDispatcher.dispatchEvent( tEvent);
    }
  });
};

/**
 * Prepare for the new game that is beginning.
 */
/*playGame is called from index.html as an onclick event on the Play game button*/
MarkovModel.prototype.playGame = async function()
{
  this.gameNumber++;
  this.turn = 0;
  this.autoplay = false;
  // this.mar_prev_2 = '';  We don't re-initialize so last two moves of previous game apply to new game
  this.winner = '';

  await this.openNewGameCase();
  this.changeGameState('playing');
  this.updateInteractiveState();
};

/**
 * Dispatch an event with change of state information
 * @param iNewState {String}
 */
/* Called by playGame() in this model*/
MarkovModel.prototype.changeGameState = function( iNewState)
{
  var tEvent = new Event('stateChange');
  tEvent.priorState = this.gameState;
  tEvent.newState = iNewState;
  this.gameState = iNewState;
  this.eventDispatcher.dispatchEvent( tEvent);
};

/**
 * Dispatch an event with change of state information
 * @param iNewState {String}
 */
/* Called by playGame(), endTurn(), endGame() in this model */
MarkovModel.prototype.changeTurnState = function( iNewState)
{
  var tEvent = new Event('turnStateChange');
  tEvent.newTurnState = iNewState;
  this.turnState = iNewState;
  this.eventDispatcher.dispatchEvent( tEvent);
};

/**
 * The view has told us the turn is over.
 * @param iDogState{String} - one of 'top', 'middle', 'bottom'
 */
MarkovModel.prototype.endTurn = function( iDogState)
{
  if( this.turnState !== 'waiting') {
    this.addTurnCase();
    this.changeTurnState('waiting');
    switch( iDogState) {
      case 'middle':
        // Nothing to do here
        break;
      case 'top':
        this.winner = 'you';
        this.endGame();
        break;
      case 'bottom':
        this.winner = 'Markov';
        this.endGame();
        break;
    }
    this.changeTurnState('waiting');
    if(!this.abortingFromMove && this.autoplay)
      this.autoplay = this.autoTurn();

    if( !this.autoplay) {
      var tEvent = new Event('autoplayChange');
      tEvent.state = 'off';
      this.eventDispatcher.dispatchEvent( tEvent);
    }
  }
};

/**
 * The current game has just ended, possibly by user action
 */
MarkovModel.prototype.endGame = function()
{
  if( this.turnState === 'moving') {  // user End Game before move is finished
    this.changeTurnState('abort');
  }
  this.addGameCase();
  this.changeGameState( 'gameEnded');
};

/**
 * The game button can either end the current game or start a new game
 */
MarkovModel.prototype.handleGameButton = function()
{
  switch( this.gameState) {
    case 'playing':
      this.endGame();
      break;
    case 'gameEnded':
    case 'levelsMode':
      this.playGame();
      break;
    default:
  }
};

/**
 *
 * @param iMove - One of 'R', 'P', 'S'. Result of user button press.
 */
MarkovModel.prototype.move = function( iMove)
{
  var this_ = this;

  function chooseMarMove() {
    var tPrev = this_.mar_prev_2,
        tLength = tPrev.length,
        tChoiceString = (tLength === 2) ? this_.level[ tPrev] : 'RPS',
        tChoiceLength = tChoiceString.length,
        tChoice = tChoiceString.charAt( Math.floor( tChoiceLength * Math.random()));
    return tChoice;
  }

  if( this.turnState === 'moving') { // user can make next move before previous one is complete
    this.abortingFromMove = true;
    this.changeTurnState('abort');
    this.abortingFromMove = false;
  }

  if( this.gameState !== 'playing')
    return;

  this.turn++;
  this.yourMove = iMove;
  if( this.mar_prev_2.length > 1)
    this.mar_prev_2 = this.mar_prev_2.charAt( 1);
  this.mar_prev_2 += this.marMove;
  this.marMove = chooseMarMove();
  var tOutcome = this.outcomes[ this.yourMove + this.marMove];
  this.result = this.results[ tOutcome];
  this.up_down = this.up_downs[ tOutcome];
  if( this.autoplay)
    this.up_down *= this.strategy[ this.mar_prev_2].weight;
  this.changeTurnState( 'moving');
};

/**
 * Key was pressed in guess input
 */
MarkovModel.prototype.handleBodyKeypress = function( iEvent)
{
  var tCharCode = iEvent.charCode;
  switch( tCharCode) {
    case 'p'.charCodeAt(0):
    case 'r'.charCodeAt(0):
    case 's'.charCodeAt(0):
      this.move( String.fromCharCode( tCharCode - 32));
      return true;
  }
  return true;
};

/**
 * Bring up the dialog with which the user can devise their strategy.
 */
MarkovModel.prototype.handleStrategyButton = function()
{
  var this_ = this,
      tSavedState = this.gameState;

  function finishedEditing() {
    this_.gameState = tSavedState;
    this_.eventDispatcher.dispatchEvent( new Event('finishedEditingStrategy'));
  }

  this.gameState = 'editingStrategy';
  this.autoplay = false;
  var tEvent = new Event('autoplayChange');
  tEvent.state = 'off';
  this.eventDispatcher.dispatchEvent( tEvent);
  var strategyEditor = new StrategyEditor( this.strategy, finishedEditing );
  codapInterface.sendRequest({
    action: 'notify',
    resource: 'logMessage',
    values: {
      formatStr: "setStrategy:"
    }
  });
  this.updateInteractiveState();
};

/**
 * User has pressed Autoplay button. If there's a strategy, we push the disks automatically
 */
MarkovModel.prototype.handleAutoButton = function()
{
  var tEvent = new Event('autoplayChange');
  this.autoplay = !this.autoplay;
  tEvent.state = this.autoplay ? 'on' : 'off';
  this.eventDispatcher.dispatchEvent( tEvent);
  if( this.autoplay)
    this.autoplay = this.autoTurn();
  codapInterface.sendRequest({
    action: 'notify',
    resource: 'logMessage',
    values: {
      formatStr: "autoPlay: " + JSON.stringify( { state: tEvent.state})
    }
  });
};

/**
 * Send out the current disk using the user's strategy. Return true if it's appropriate for another disk after
 * this one.
 * @return {Boolean}
 */
MarkovModel.prototype.autoTurn = function()
{
  var tResult = false,
      tMove = this.getAutoMove();
  if( tMove !== '') {
    this.move(tMove);
    tResult = true;
  }

  return tResult;
};

/**
 * If Markov has two previous moves, and our strategy has an entry for that, return it.
 * @return {Boolean}
 */
MarkovModel.prototype.getAutoMove = function()
{
  var tNumPrevious = this.mar_prev_2.length,
      tFormerPrev2 = this.mar_prev_2,
      tCurrPrev2,
      tStratMove,
      tResult = '';
  if( tNumPrevious >= 1) {
    tCurrPrev2 = tFormerPrev2[ tNumPrevious - 1] + this.marMove;
    tStratMove = this.strategy[ tCurrPrev2];
    tResult = tStratMove ? tStratMove.move : '';
  }

  return tResult;
};

/**
 * We simply change state and let the view do the work
 */
MarkovModel.prototype.handleLevelsButton = function()
{
  this.changeGameState( "levelsMode");
};

/**
 * Called when the user clicks on a level in the levels dialog
 * @param iEvent - a mouse event
 * @param iLevelIndex {Number} The 0-based index of the chosen level
 */
MarkovModel.prototype.handleLevelButton = function( iEvent, iLevelIndex)
{
  var tClickedLevel = MarkovLevels[ iLevelIndex],
      tLevelIsChanging = tClickedLevel !== this.level;
  if( iEvent.shiftKey && iEvent.altKey) {
      tClickedLevel.unlocked = true;
  }
  if( this.isLevelEnabled( tClickedLevel)) {
    this.level = tClickedLevel;
    this.playGame();
    if( tLevelIsChanging && !this.hasChangedLevels) {
      this.hasChangedLevels = true;
      this.eventDispatcher.dispatchEvent( new Event( "firstTimeLevelChanged"));
    }
  }
  this.updateInteractiveState();
};

/**
 * The logic for whether a level is enabled lives here in the model, not in the level manager.
 *
 * @param iLevelSpec
 * @return {Boolean}
 */
MarkovModel.prototype.isLevelEnabled = function( iLevelSpec)
{
  /**
   * Does the array of scores contain enough in a row above the given threshold?
   * @param iRequiredNumInARow {Number}
   * @param iThreshold {Number}
   * @param iScores {Array} of {Number}
   * @return {Boolean}
   */
  function gotEnoughHighScoresInARow( iRequiredNumInARow, iThreshold, iScores) {
    if( !iRequiredNumInARow)
      return true;  // Not required to get any in a row
    if( !iScores || !iScores.length)
      return false; // Didn't exist or wasn't an array with entries
    var tNumInARow = 0;
    iScores.forEach( function( iScore) {
      if( tNumInARow >= iRequiredNumInARow)
        return;
      if( iScore >= iThreshold)
        tNumInARow++;
      else
        tNumInARow = 0;
    });
    return tNumInARow >= iRequiredNumInARow;
  }

  var tEnabled = true,
      tPrereq = iLevelSpec.prerequisite,
      tPrereqLevel;
  if( tPrereq && !iLevelSpec.unlocked) {
    tPrereqLevel = (tPrereq.level) ? this.levelManager.getLevelNamed( tPrereq.level) : null;
    if( tPrereqLevel.highScore && (tPrereqLevel.highScore >= tPrereq.score))
      tEnabled = gotEnoughHighScoresInARow( tPrereq.inARow, tPrereq.score, tPrereqLevel.scores);
    else
      tEnabled = false;
  }

  return tEnabled;
};

/**
  Saves the game state for the game. Currently, only level information
  is saved so that the user need not unlock levels again, for instance.
  @returns  {Object}    { success: {Boolean}, state: {Object} }
 */
MarkovModel.prototype.updateInteractiveState = function() {
  var currentInteractiveState =  {
    gameNumber: this.gameNumber,
    currentLevel: this.level && this.level.levelName,
    levelsMap: this.levelManager.getLevelsLockState(),
    strategy: this.strategy
  };
  codapInterface.updateInteractiveState(currentInteractiveState);
};

/**
  Restores the game state for the game. Currently, only level information
  is saved so that the user need not unlock levels again, for instance.
  @param    {Object}    iState -- The state as saved previously by updateInteractiveState().
 */
MarkovModel.prototype.restoreGameState = function( iState) {
  if( iState) {
    if( iState.gameNumber)
      this.gameNumber = iState.gameNumber;
    if( iState.currentLevel) {
      var level = this.levelManager.getLevelNamed( iState.currentLevel);
      if( level) this.level = level;
    }
    if( iState.levelsMap)
      this.levelManager.setLevelsLockState( iState.levelsMap);
    if( iState.strategy)
      this.strategy = iState.strategy;
    if (this.gameNumber > 0) {
      this.changeGameState('playing');
      this.changeGameState('gameEnded');
    }
  }
  return { success: true };
};

