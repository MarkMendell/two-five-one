/**
 * This module handles displaying a list of notes inside of a container element
 * using canvases, where a "note" has a start time, end time, and MIDI note
 * value. Basic usage:
 *   var displayContainer = document.getElementById("display-container");
 *   notedisplay.init(displayContainer);
 *   notedisplay.showNotes(notes);
 */
var notedisplay = {};

// Note that this is just a function that calls itself so that the variables
// declared inside don't become global
(function() {
  // Constants and variables used across functions
  var globals = {
    //// Constants
    // Height (px) of a single note
    NOTE_HEIGHT: 3,
    // Space (px) between each note vertically
    NOTE_GAP: 1,
    // Width (px) of the line indicating where in the recording we are
    TIME_BAR_WIDTH: 2,
    // How many pixels correspond to a millisecond of time
    PX_PER_MS: 0.1,
    // Number of pixels on the outward side of a note's edge that the mouse can
    // still be considered over that edge
    EDGE_PAD_OUT: 1,
    // Number of pixels on the inward side of a note's edge that the mouse can
    // still be considered over that edge
    EDGE_PAD_IN: 5,
    // Number of pixels to highlight when an edge is selected, hovered, etc.
    // (Note that while EDGE_PAD_* modifies the hoverable region by the mouse,
    // EDGE_WIDTH is purely cosmetic.)
    EDGE_WIDTH: 7,
    // Color of normal, unselected note
    NOTE_COLOR: "black",
    // Color of highlighted note, like when hovered over
    NOTE_HIGHLIGHTED_COLOR: "lightgrey",
    // Color of note that that has been clicked and held down on
    NOTE_MOUSEDOWN_COLOR: "darkgrey",
    // Color of note that is currently selected
    NOTE_SELECTED_COLOR: "silver",
    // Color of the line indicating where in the timeline we are
    TIME_BAR_COLOR: "lightsteelblue",
    // Keys that can be pressed to delete a selection
    DELETE_KEYS: ["Backspace", "Delete", "x"],
    // Key to toggle play/pause
    PLAY_PAUSE_KEY: " ",
    // Color of note that is being dragged
    NOTE_DRAG_COLOR: "orange",
    // Keys that can be pressed to delete a selection
    DELETE_KEYS: ["Backspace", "Delete", "x"],
    //// Variables
    // SVG containing a line that represents time location
    timeBarSvg: undefined,
    // Canvas used for displaying the notes
    noteCanvas: undefined,
    // Canvas layer above the noteCanvas used for notes being dragged
    dragCanvas: undefined,
    // Internal notes list used as model (never modified)
    notes: [],
    // Note currently hovered over
    highlightedNote: undefined,
    // Note that the currently held-down mouse started on when it clicked
    mouseDownNote: undefined,
    // Note edge that the currently held-down mouse started on when it clicked
    mouseDownNoteEdge: undefined,
    // Coordinates of the current mousedown event [x, y]
    mouseDownCoords: undefined,
    // Whether the mouse moved after the last mousedown event
    mouseDownMoved: false,
    // Note currently selected
    selectedNote: undefined,
    // Keeps track of whether the canvas can be treated as being 'in focus'
    // (since a canvas element can never be actually in focus)
    isFocused: false,
    // Callback for when a note is 'deleted' by the user
    deleteCallback: undefined,
    // Callback for when a note is 'updated' by the user
    updateCallback: undefined,
    // Callback for when a time is seeked (sought?) by the user
    setTimeCallback: undefined,
    // Callback for when the user toggles play/pause
    playPauseCallback: undefined,
    // Callback for when the user toggles play/pause (keep spot)
    playPauseKeepSpotCallback: undefined,
    // Whether the time bar is being continously updated
    isContinuouslyUpdatingTime: false
  };

  /**
   * Return the height (px) of the display.
   */
  function getDisplayHeight() {
    return (globals.NOTE_HEIGHT + globals.NOTE_GAP) * 128;
  }

  /**
   * Given the container element housing the display, create and append an SVG
   * element with a line inside. This line will correspond to where in the score
   * the next playback or record event will start.
   */
  function initTimeBarSvg(container) {
    var svgNs = "http://www.w3.org/2000/svg";
    globals.timeBarSvg = document.createElementNS(svgNs, "svg");
    var timeBarLine = document.createElementNS(svgNs, "line");
    globals.timeBarSvg.appendChild(timeBarLine);
    timeBarLine.setAttributeNS(null, "x1", 0);
    timeBarLine.setAttributeNS(null, "x2", 0);
    timeBarLine.setAttributeNS(null, "y1", 0);
    timeBarLine.setAttributeNS(null, "stroke", globals.TIME_BAR_COLOR);
    globals.timeBarSvg.setAttributeNS(null, "width", globals.TIME_BAR_WIDTH);
    timeBarLine.setAttributeNS(null, "stroke-width", globals.TIME_BAR_WIDTH);
    globals.timeBarSvg.setAttributeNS(null, "height", getDisplayHeight());
    timeBarLine.setAttributeNS(null, "y2", getDisplayHeight());
    container.appendChild(globals.timeBarSvg);
  }

  /**
   * Mouse events store coordinates relative to parts of the page or screen, not
   * relative to the canvas itself. This function takes a mouse event and a
   * canvas, then returns x and y coordinates relative to the canvas itself.
   */
  function getCanvasCoordsFromMouseEvent(mouseEvent, canvas) {
    var rect = canvas.getBoundingClientRect();
    return [mouseEvent.x - rect.left, mouseEvent.y - rect.top];
  }

  /**
   * Returns the boundaries (px, integer) of the note's displayed rectangle in
   * order of left, top, right, bottom (x0, y0, x1, y1).
   */
  function getNoteCoords(note) {
    var x0 = Math.floor(note.start * globals.PX_PER_MS);
    var y0 = (127 - note.note) * (globals.NOTE_HEIGHT + globals.NOTE_GAP);
    var x1 = Math.ceil(note.end * globals.PX_PER_MS);
    var y1 = y0 + globals.NOTE_HEIGHT;
    return [x0, y0, x1, y1];
  }

  /**
   * Return true if the provided coordinates could be considered hovering over
   * the edge of the given note, and false otherwise.
   *
   * Note that if by the dimensions of the EDGE_PAD_* the coordinates could be
   * in either edge, return true only if this edge is the closer one.
   */
  function isInNoteEdge(x, y, note, edge) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    if ((y < y0) || (y > y1)) {
      return false;
    }
    var [leftEdgeCoord, rightEdgeCoord] = [x0, x1];
    var leftLeftBound = leftEdgeCoord - globals.EDGE_PAD_OUT;
    var rightLeftBound = Math.max(
      leftEdgeCoord, rightEdgeCoord - globals.EDGE_PAD_IN
    );
    var leftRightBound = Math.min(
      rightEdgeCoord, leftEdgeCoord + globals.EDGE_PAD_IN
    );
    var rightRightBound = rightEdgeCoord + globals.EDGE_PAD_OUT;
    var isInLeftEdge = ((x >= leftLeftBound) && (x <= leftRightBound));
    var isInRightEdge = ((x >= rightLeftBound) && (x <= rightRightBound));
    if (isInLeftEdge && isInRightEdge) {
      var leftDelta = Math.abs(x - leftEdgeCoord);
      var rightDelta = Math.abs(x - rightEdgeCoord);
      if (leftDelta <= rightDelta) {
        return edge === "left";
      } else {
        return edge === "right";
      }
    } else if (isInLeftEdge) {
      return edge === "left";
    } else if (isInRightEdge) {
      return edge === "right";
    } else {
      return false;
    }
  }

  /**
   * Loop through the notes on the noteCanvas and see if the provided x and y
   * coordinates could be considered to be hovering over one of their edges. If
   * they are, return an object with attributes "note" representing the note
   * matched and "edge", either "left" or "right"; otherwise, return undefined.
   */
  function getNoteEdgeInCoords(x, y) {
    for (var i=0; i<globals.notes.length; i++) {
      var note = globals.notes[i];
      if (isInNoteEdge(x, y, note, "left")) {
        return {note: note, edge: "left"};
      } else if (isInNoteEdge(x, y, note, "right")) {
        return {note: note, edge: "right"};
      }
    }
    return undefined;
  }

  /**
   * If the edge of a note could be considered hovered over by the mouse
   * coordinates of the provided MouseEvent, return an object with attributes
   * "note" representing the note matched and "edge", either "left" or "right".
   * Otherwise, return undefined.
   */
  function getNoteEdgeFromMouseEvent(mouseEvent) {
    var [x, y] = getCanvasCoordsFromMouseEvent(mouseEvent, globals.noteCanvas);
    return getNoteEdgeInCoords(x, y);
  }

  /**
   * Returns whether or not the provided x and y coordinates are within the
   * drawn area of the note.
   */
  function isInNote(x, y, note) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    return ((x >= x0) && (x <= x1) && (y >= y0) && (y <= y1));
  }

  /**
   * Loop through the notes on the noteCanvas and see if the provided x and y
   * coordinates are inside one of them. If they are, return that note;
   * otherwise, return undefined.
   */
  function getNoteInCoords(x, y) {
    for (var i=0; i<globals.notes.length; i++) {
      var note = globals.notes[i];
      if (isInNote(x, y, note)) {
        return note;
      }
    }
    return undefined;
  }

  /**
   * Return the note corresponding to the location of the mouse event, if there
   * is one. Otherwise, return undefined.
   */
  function getNoteFromMouseEvent(mouseEvent) {
    var [x, y] = getCanvasCoordsFromMouseEvent(mouseEvent, globals.noteCanvas);
    return getNoteInCoords(x, y);
  }

  /**
   * Given a note object, a color, and a CanvasRenderingContext2D, draw the note
   * on the canvas 2D context with the given color.
   */
  function drawNoteWithColor(note, color, ctx) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    ctx.fillStyle = color;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /**
   * Given an object with a "note" attribute and an "edge" (either left or
   * right), a color, and a CanvasRenderingContext2D, draw the edge of the note
   * given with the provided color on the canvas 2D context.
   */
  function drawNoteEdgeWithColor(noteEdge, color, ctx) {
    var [x0, y0, x1, y1] = getNoteCoords(noteEdge.note);
    var noteLength = x1 - x0;
    var edgeWidth = Math.max(1, Math.min(globals.EDGE_WIDTH, noteLength - 1));
    var x = (noteEdge.edge === "left")
      ? (x0 + edgeWidth/2)
      : (x1 - edgeWidth/2);
    ctx.beginPath();
    ctx.lineWidth = edgeWidth;
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  /**
   * Given a note and CanvasRenderingContext2D, check if the note is any of the
   * special notes (highlighted, selected, mousedown) and draw it accordingly.
   */
  function drawNote(note, ctx) {
    if (note === globals.mouseDownNote) {
      drawNoteWithColor(note, globals.NOTE_MOUSEDOWN_COLOR, ctx);
    } else if (note === globals.selectedNote) {
      drawNoteWithColor(note, globals.NOTE_SELECTED_COLOR, ctx);
    } else if (note === globals.highlightedNote) {
      drawNoteWithColor(note, globals.NOTE_HIGHLIGHTED_COLOR, ctx);
    } else {
      drawNoteWithColor(note, globals.NOTE_COLOR, ctx);
    }
    if (globals.mouseDownNoteEdge &&
        (note === globals.mouseDownNoteEdge.note)) {
      drawNoteEdgeWithColor(
        globals.mouseDownNoteEdge, globals.NOTE_MOUSEDOWN_COLOR, ctx
      );
    } else if (globals.highlightedNoteEdge &&
        (note === globals.highlightedNoteEdge.note)) {
      drawNoteEdgeWithColor(
        globals.highlightedNoteEdge, globals.NOTE_HIGHLIGHTED_COLOR, ctx
      );
    }
  }

  /**
   * If a note is currently highlighted, remove the highlighting and forget
   * about it.
   */
  function clearHighlight() {
    if (globals.highlightedNote) {
      var note = globals.highlightedNote;
      globals.highlightedNote = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
    if (globals.highlightedNoteEdge) {
      var note = globals.highlightedNoteEdge.note;
      globals.highlightedNoteEdge = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Erases any dragged notes.
   */
  function clearDrag() {
    var ctx = globals.dragCanvas.getContext("2d");
    ctx.clearRect(0, 0, globals.dragCanvas.width, globals.dragCanvas.height);
  }

  /**
   * Return a copy of the note with its values shifted according to the delta
   * between the start and end coordinates.
   */
  function getNoteShifted(note, start, end) {
    var newNote = {};
    var dt = (end[0] - start[0]) / globals.PX_PER_MS;
    var dNote = (start[1] - end[1]) / (globals.NOTE_HEIGHT + globals.NOTE_GAP);
    Object.assign(newNote, note, {
      start: note.start + dt,
      end: note.end + dt,
      note: note.note + Math.floor(dNote)
    });
    return newNote;
  }

  /**
   * Return a copy of the note with its values shifted like the edge has been
   * dragged from the start to the end coordinates.
   */
  function getNoteStretched(note, edge, start, end) {
    var newNote = getNoteShifted(note, start, end);
    newNote.note = note.note;
    if (edge === "left") {
      newNote.end = note.end;
      if (newNote.start >= (newNote.end - globals.PX_PER_MS)) {
        newNote.start = newNote.end - globals.PX_PER_MS;
      }
    } else {
      newNote.start = note.start;
      if (newNote.end <= (newNote.start + globals.PX_PER_MS)) {
        newNote.end = newNote.start + globals.PX_PER_MS;
      }
    }
    return newNote;
  }

  /**
   * If a note is set as having the mouse held down over it, remove it from
   * that designation and redraw it as normal.
   */
  function clearMouseDown() {
    globals.mouseDownCoords = undefined;
    if (globals.mouseDownNote) {
      var note = globals.mouseDownNote;
      globals.mouseDownNote = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
    if (globals.mouseDownNoteEdge) {
      var note = globals.mouseDownNoteEdge.note;
      globals.mouseDownNoteEdge = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the cursor has hovered over the specified x and y coordinates
   * of the dragCanvas.
   */
  function onMouseMoveDragCanvas(mouseEvent) {
    var coords = getCanvasCoordsFromMouseEvent(mouseEvent, globals.noteCanvas);
    globals.mouseDownMoved = true;
    var hoveredNoteEdge = getNoteEdgeFromMouseEvent(mouseEvent);
    var hoveredNote = getNoteFromMouseEvent(mouseEvent);
    clearHighlight();
    clearDrag();
    if (globals.mouseDownNote) {
      var dragNote = getNoteShifted(globals.mouseDownNote,
        globals.mouseDownCoords, coords);
      var ctx = globals.dragCanvas.getContext("2d");
      drawNoteWithColor(dragNote, globals.NOTE_DRAG_COLOR, ctx);
    } else if (globals.mouseDownNoteEdge) {
      var stretchNote = getNoteStretched(globals.mouseDownNoteEdge.note,
        globals.mouseDownNoteEdge.edge, globals.mouseDownCoords, coords);
      var ctx = globals.dragCanvas.getContext("2d");
      drawNoteWithColor(stretchNote, globals.NOTE_DRAG_COLOR, ctx);
    } else if (hoveredNoteEdge) {
      globals.highlightedNoteEdge = hoveredNoteEdge;
      drawNote(hoveredNoteEdge.note, globals.noteCanvas.getContext("2d"));
    } else if (hoveredNote) {
      globals.highlightedNote = hoveredNote;
      drawNote(hoveredNote, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the cursor leaves the dragCanvas.
   */
  function onMouseLeaveDragCanvas(mouseEvent) {
    globals.mouseDownCoords = undefined;
    clearHighlight();
    clearMouseDown();
    clearDrag();
  }

  /**
   * If there's a selected note, remove it and redraw it.
   */
  function clearSelection() {
    if (globals.selectedNote) {
      var note = globals.selectedNote;
      globals.selectedNote = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the mouse is pressed down (but not a full click) in the
   * dragCanvas.
   */
  function onMouseDownDragCanvas(mouseEvent) {
    // stops cursor from becoming text cursor on drag
    mouseEvent.preventDefault();
    // since the canvas can't be focused on normally, we keep track of clicks in
    // the canvas, and stop from bubbling out to the document mousedown
    // listener which will mark the canvas as out of focus
    globals.isFocused = true;
    mouseEvent.stopPropagation();
    globals.mouseDownMoved = false;
    var mouseDownNoteEdge = getNoteEdgeFromMouseEvent(mouseEvent);
    var mouseDownNote = getNoteFromMouseEvent(mouseEvent);
    clearSelection();
    clearMouseDown();
    globals.mouseDownCoords = getCanvasCoordsFromMouseEvent(mouseEvent,
      globals.noteCanvas);
    if (mouseDownNoteEdge) {
      globals.mouseDownNoteEdge = mouseDownNoteEdge;
      drawNote(mouseDownNoteEdge.note, globals.noteCanvas.getContext("2d"));
    } else if (mouseDownNote) {
      globals.mouseDownNote = mouseDownNote;
      drawNote(mouseDownNote, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the mouse is pressed down outside of the canvas (the listener
   * is bound to anywhere in the document, but we stop propagation of the event
   * if it happened in the dragCanvas).
   */
  function onMouseDownDocument(mouseEvent) {
    globals.isFocused = false;
  }

  /**
   * Called when the pressed-down mouse is lifted inside of the dragCanvas.
   */
  function onMouseUpDragCanvas(mouseEvent) {
    var coords = getCanvasCoordsFromMouseEvent(mouseEvent, globals.dragCanvas);
    var mouseUpNote = getNoteFromMouseEvent(mouseEvent);
    clearSelection();
    clearDrag();
    if (globals.mouseDownNote || globals.mouseDownNoteEdge) {
      if ((coords[0] === globals.mouseDownCoords[0]) &&
          (coords[1] === globals.mouseDownCoords[1])) {
        globals.selectedNote = mouseUpNote;
        drawNote(globals.selectedNote, globals.noteCanvas.getContext("2d"));
      } else if (globals.updateCallback) {
        var noteI = globals.notes.indexOf(globals.mouseDownNote ?
          globals.mouseDownNote : globals.mouseDownNoteEdge.note);
        globals.updateCallback(noteI, globals.mouseDownNote ?
          getNoteShifted(
            globals.mouseDownNote, globals.mouseDownCoords, coords
          ) : getNoteStretched(
            globals.mouseDownNoteEdge.note, globals.mouseDownNoteEdge.edge,
            globals.mouseDownCoords, coords
        ));
      }
    } else if (globals.mouseDownCoords && !globals.mouseDownMoved) {
      var offsetTime = globals.mouseDownCoords[0] / globals.PX_PER_MS;
      if (globals.setTimeCallback) {
        globals.setTimeCallback(offsetTime);
      }
    }
    clearMouseDown();
  }

  /**
   * Called when a key is pressed down in the document.
   *
   * Ideally, this would be a key down event handler for keys pressed when the
   * canvas is in focus, but a canvas can never be in focus. To handle this, we
   * keep track of whether the canvas would technically currently be in focus
   * (globals.isFocused), then listen for all key presses in the document, and
   * ignore them if the canvas isn't 'in focus'.
   */
  function onKeyDownDocument(keyboardEvent) {
    // Ignore key presses if the canvas isn't 'in focus'
    if (!globals.isFocused) {
      return;
    }
    // Prevent browsers from going back a page when backspace is pressed
    if (keyboardEvent.key === "Backspace") {
      keyboardEvent.preventDefault();
    // Prevent spacebar from toggling the last-clicked button
    } else if (keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
    }
    if (globals.DELETE_KEYS.includes(keyboardEvent.key)) {
      if (globals.selectedNote && globals.deleteCallback) {
        globals.deleteCallback(globals.selectedNote);
      }
    } else if (keyboardEvent.key === globals.PLAY_PAUSE_KEY) {
      if (keyboardEvent.shiftKey) {
        if (globals.playPauseKeepSpotCallback) {
          globals.playPauseKeepSpotCallback();
        }
      } else if (globals.playPauseCallback) {
        globals.playPauseCallback();
      }
    }
  }

  /**
   * Given the container element housing the display, create and append canvas
   * objects that will be used for displaying notes.
   */
  function initNoteCanvas(container) {
    var canvasWrap = document.createElement("div");
    canvasWrap.style.whiteSpace = "nowrap";
    globals.noteCanvas = document.createElement("canvas");
    globals.noteCanvas.width = 0;
    globals.noteCanvas.height = getDisplayHeight();
    canvasWrap.appendChild(globals.noteCanvas);
    globals.dragCanvas = document.createElement("canvas");
    globals.dragCanvas.width = 0;
    globals.dragCanvas.height = 0;
    globals.dragCanvas.style.position = "relative";
    globals.dragCanvas.style.zIndex = 1;
    globals.dragCanvas.addEventListener("mousemove", onMouseMoveDragCanvas);
    globals.dragCanvas.addEventListener("mouseleave", onMouseLeaveDragCanvas);
    globals.dragCanvas.addEventListener("mousedown", onMouseDownDragCanvas);
    document.addEventListener("mousedown", onMouseDownDocument);
    globals.dragCanvas.addEventListener("mouseup", onMouseUpDragCanvas);
    document.addEventListener("keydown", onKeyDownDocument);
    canvasWrap.appendChild(globals.dragCanvas);
    container.appendChild(canvasWrap);
  }

  /**
   * Initialize the canvases used for the display as children of the provided
   * element. The deleteCallback will be called with the argument of a note if
   * the user ever tries to 'delete' said note. The updateCallback will be
   * called with the arguments index newNote if the user tries to 'update' the
   * note at index to newNote. The setTimeCallback will be called with the
   * argument of the time (ms) the user wants to move the time bar to.
   *
   * This function must be called first before you can use other display
   * functions.
   */
  notedisplay.init = function(container, deleteCallback, updateCallback,
      setTimeCallback, playPauseCallback, playPauseKeepSpotCallback) {
    initTimeBarSvg(container);
    initNoteCanvas(container);
    globals.deleteCallback = deleteCallback;
    globals.updateCallback = updateCallback;
    globals.setTimeCallback = setTimeCallback;
    globals.playPauseCallback = playPauseCallback;
    globals.playPauseKeepSpotCallback = playPauseKeepSpotCallback;
  };

  /**
   * Given a list of notes, make a copy of it for our own internal use and store
   * it globally, never to be modified, just updated using this function.
   *
   * Ideally, we wouldn't store these notes globally but just implicitly in the
   * event listeners since they're only used there, but since we would then have
   * to keep around the event listeners to be able to replace them, we might as
   * well just keep the notes model around.
   */
  function setNotes(notes) {
    globals.notes = util.noteListCopy(notes);
  }

  /**
   * Using the internal list of notes as a model, clear the current display and
   * draw a new one.
   */
  function refreshDisplay(minWidth) {
    clearMouseDown()
    clearSelection();
    clearHighlight();
    var maxTime = util.getMaxTime(globals.notes);
    // Setting the width/height clears the canvas as well
    var notesWidth = Math.ceil(maxTime * globals.PX_PER_MS);
    globals.noteCanvas.width = Math.max(minWidth, notesWidth);
    globals.noteCanvas.height = getDisplayHeight();
    globals.dragCanvas.width = globals.noteCanvas.width;
    globals.dragCanvas.height = globals.noteCanvas.height;
    globals.dragCanvas.style.left = -globals.noteCanvas.width;
    var ctx = globals.noteCanvas.getContext("2d");
    globals.notes.forEach(function(note) { drawNote(note, ctx); });
  }

  /**
   * Given a list of notes, clear whatever notes were drawn before and display
   * the provided notes. A note is an object with the following attributes:
   * - start: double representing time (ms) the note begins
   * - end: double representing time (ms) the note ends
   * - note: integer MIDI note value (60 is middle C)
   * The second argument, audioBuffer (which may be undefined), if present,
   * determines the minimum length of the noteCanvas so that it is at least as
   * long as the song.
   */
  notedisplay.showNotes = function(notes, audioBuffer) {
    setNotes(notes);
    if (audioBuffer) {
      var minWidth = (audioBuffer.duration * 1000.0) * globals.PX_PER_MS;
    } else {
      var minWidth = 0;
    }
    refreshDisplay(minWidth);
  };

  /**
   * Move the time bar to the location corresponding to the provided time (ms).
   */
  notedisplay.showTime = function(time) {
    var offset = globals.PX_PER_MS * time;
    globals.timeBarSvg.style.transform = "translate(" + offset + "px)";
  };

  /**
   * This function starts a continous animation loop that will update the
   * location of the time bar to match what the provided callback returns as the
   * current time (ms), never going below the minTime.
   *
   * See playback.getTime for why minTime is necessary.
   */
  notedisplay.startContinuousTimeUpdate = function(getTime, minTime) {
    if (!globals.isContinuouslyUpdatingTime) {
      globals.isContinuouslyUpdatingTime = true;
      var onAnimationFrame = function() {
        if (globals.isContinuouslyUpdatingTime) {
          var time = Math.max(minTime, getTime());
          notedisplay.showTime(time);
          window.requestAnimationFrame(onAnimationFrame);
        }
      };
      window.requestAnimationFrame(onAnimationFrame);
    }
  };

  /**
   * Stops continuously checking and updating the time bar's location.
   */
  notedisplay.stopContinuousTimeUpdate = function() {
    globals.isContinuouslyUpdatingTime = false;
  };
})();
