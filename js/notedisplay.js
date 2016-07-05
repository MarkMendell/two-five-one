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
    // Keys that can be pressed to delete a selection
    DELETE_KEYS: ["Backspace", "Delete", "x"],
    //// Variables
    // Canvas used for displaying the notes
    noteCanvas: undefined,
    // Internal notes list used as model (never modified)
    notes: [],
    // Note currently hovered over
    highlightedNote: undefined,
    // Note that the currently held-down mouse started on when it clicked
    mouseDownNote: undefined,
    // Note currently selected
    selectedNote: undefined,
    // Keeps track of whether the canvas can be treated as being 'in focus'
    // (since a canvas element can never be actually in focus)
    isFocused: false,
    // Callback for when a note is 'deleted' by the user
    deleteCallback: undefined
  };

  /**
   * Mouse events store coordinates relative to parts of the page or screen, not
   * relative to the canvas itself. This function takes a mouse event and a
   * canvas, then returns x and y coordinates relative to the canvas itself.
   */
  function getCanvasCoordinatesFromMouseEvent(mouseEvent, canvas) {
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
    var [x, y] = getCanvasCoordinatesFromMouseEvent(
        mouseEvent, globals.noteCanvas
    );
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
    var [x, y] = getCanvasCoordinatesFromMouseEvent(
      mouseEvent, globals.noteCanvas
    );
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
    if (globals.highlightedNoteEdge &&
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
   * If a note is set as having the mouse held down over it, remove it from
   * that designation and redraw it as normal.
   */
  function clearMouseDown() {
    if (globals.mouseDownNote) {
      var note = globals.mouseDownNote;
      globals.mouseDownNote = undefined;
      drawNote(note, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the cursor has hovered over the specified x and y coordinates
   * of the noteCanvas.
   */
  function onMouseMoveNoteCanvas(mouseEvent) {
    var hoveredNoteEdge = getNoteEdgeFromMouseEvent(mouseEvent);
    var hoveredNote = getNoteFromMouseEvent(mouseEvent);
    clearHighlight();
    if (hoveredNoteEdge) {
      globals.highlightedNoteEdge = hoveredNoteEdge;
      drawNote(hoveredNoteEdge.note, globals.noteCanvas.getContext("2d"));
    } else if (hoveredNote) {
      globals.highlightedNote = hoveredNote;
      drawNote(hoveredNote, globals.noteCanvas.getContext("2d"));
    }
    if (hoveredNote !== globals.mouseDownNote) {
      clearMouseDown();
    }
  }

  /**
   * Called when the cursor leaves the noteCanvas.
   */
  function onMouseLeaveNoteCanvas(mouseEvent) {
    clearHighlight();
    clearMouseDown();
  }

  /**
   * Called when the mouse is pressed down (but not a full click) in the
   * noteCanvas.
   */
  function onMouseDownNoteCanvas(mouseEvent) {
    // stops cursor from becoming text cursor on drag
    mouseEvent.preventDefault();
    // since the canvas can't be focused on normally, we keep track of clicks in
    // the canvas, and stop from bubbling out to the document mousedown
    // listener which will mark the canvas as out of focus
    globals.isFocused = true;
    mouseEvent.stopPropagation();
    globals.mouseDownNote = getNoteFromMouseEvent(mouseEvent);
    if (globals.mouseDownNote) {
      drawNote(globals.mouseDownNote, globals.noteCanvas.getContext("2d"));
    }
  }

  /**
   * Called when the mouse is pressed down outside of the canvas (the listener
   * is bound to anywhere in the document, but we stop propagation of the event
   * if it happened in the noteCanvas).
   */
  function onMouseDownDocument(mouseEvent) {
    globals.isFocused = false;
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
   * Called when the pressed-down mouse is lifted inside of the noteCanvas.
   */
  function onMouseUpNoteCanvas(mouseEvent) {
    var mouseUpNote = getNoteFromMouseEvent(mouseEvent);
    if (globals.mouseDownNote && (globals.mouseDownNote === mouseUpNote)) {
      clearSelection();
      globals.selectedNote = globals.mouseDownNote;
      drawNote(globals.selectedNote, globals.noteCanvas.getContext("2d"));
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
    }
    if (globals.DELETE_KEYS.includes(keyboardEvent.key)) {
      if (globals.selectedNote && globals.deleteCallback) {
        globals.deleteCallback(globals.selectedNote);
      }
    }
  }

  /**
   * Initialize the canvases used for the display as children of the provided
   * element. The deleteCallback will be called with the argument of a note if
   * the user ever tries to 'delete' said note.
   *
   * This function must be called first before you can use other display
   * functions.
   */
  notedisplay.init = function(container, deleteCallback) {
    globals.noteCanvas = document.createElement("canvas");
    globals.noteCanvas.width = 0;
    globals.noteCanvas.height = 0;
    globals.noteCanvas.addEventListener("mousemove", onMouseMoveNoteCanvas);
    globals.noteCanvas.addEventListener("mouseleave", onMouseLeaveNoteCanvas);
    globals.noteCanvas.addEventListener("mousedown", onMouseDownNoteCanvas);
    document.addEventListener("mousedown", onMouseDownDocument);
    globals.noteCanvas.addEventListener("mouseup", onMouseUpNoteCanvas);
    document.addEventListener("keydown", onKeyDownDocument);
    container.appendChild(globals.noteCanvas);
    globals.deleteCallback = deleteCallback;
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
  function refreshDisplay() {
    clearMouseDown()
    clearSelection();
    clearHighlight();
    var maxTime = globals.notes.reduce(function(prevMax, note) {
      return Math.max(prevMax, note.end);
    }, 0);
    // Setting the width/height clears the canvas as well
    globals.noteCanvas.width = Math.ceil(maxTime * globals.PX_PER_MS);
    globals.noteCanvas.height = (globals.NOTE_HEIGHT + globals.NOTE_GAP) * 128;
    var ctx = globals.noteCanvas.getContext("2d");
    globals.notes.forEach(function(note) { drawNote(note, ctx); });
  }

  /**
   * Given a list of notes, clear whatever notes were drawn before and display
   * the provided notes. A note is an object with the following attributes:
   * - start: double representing time (ms) the note begins
   * - end: double representing time (ms) the note ends
   * - note: integer MIDI note value (60 is middle C)
   */
  notedisplay.showNotes = function(notes) {
    setNotes(notes);
    refreshDisplay();
  };
})();
