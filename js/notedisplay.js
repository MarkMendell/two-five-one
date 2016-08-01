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
    // Color of normal, unselected note
    NOTE_COLOR: "black",
    // Color of highlighted note, like when hovered over
    NOTE_HIGHLIGHTED_COLOR: "lightgrey",
    //// Variables
    // Canvas used for displaying the notes
    noteCanvas: undefined,
    // Internal notes list used as model (never modified)
    notes: [],
    // Note currently hovered over
    highlightedNote: undefined
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
   * Returns whether or not the provided x and y coordinates are within the
   * drawn area of the note.
   */
  function isInNote(x, y, note) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    return ((x >= x0) && (x <= x1) && (y >= y0) && (y <= y1));
  }

  /**
   * Draw the provided note in a highlighted style (like if it's hovered over)
   * on the provided CanvasRenderingContext2D.
   */
  function drawHighlightedNote(note, ctx) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    ctx.fillStyle = globals.NOTE_HIGHLIGHTED_COLOR;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /**
   * Given a note object and a CanvasRenderingContext2D, draw the note on the
   * canvas 2D context.
   */
  function drawNote(note, ctx) {
    var [x0, y0, x1, y1] = getNoteCoords(note);
    ctx.fillStyle = globals.NOTE_COLOR;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  }

  /**
   * If a note is currently highlighted, remove the highlighting and forget
   * about it.
   */
  function clearHighlight() {
    if (globals.highlightedNote) {
      drawNote(globals.highlightedNote, globals.noteCanvas.getContext("2d"));
      globals.highlightedNote = undefined;
    }
  }

  /**
   * Called when the cursor has hovered over the specified x and y coordinates
   * of the noteCanvas.
   */
  function onMouseOverNoteCanvas(mouseEvent) {
    var [x, y] = getCanvasCoordinatesFromMouseEvent(
      mouseEvent, globals.noteCanvas
    );
    clearHighlight();
    var ctx = globals.noteCanvas.getContext("2d");
    for (var i=0; i<globals.notes.length; i++) {
      var note = globals.notes[i];
      if (isInNote(x, y, note)) {
        globals.highlightedNote = note;
        drawHighlightedNote(note, ctx);
        break;
      }
    }
  }

  /**
   * Called when the cursor leaves the noteCanvas.
   */
  function onMouseLeaveNoteCanvas(mouseEvent) {
    clearHighlight();
  }

  /**
   * Initialize the canvases used for the display as children of the provided
   * element. This function must be called first before you can use other
   * display functions.
   */
  notedisplay.init = function(container) {
    globals.noteCanvas = document.createElement("canvas");
    globals.noteCanvas.width = 0;
    globals.noteCanvas.height = 0;
    globals.noteCanvas.addEventListener("mousemove", onMouseOverNoteCanvas);
    globals.noteCanvas.addEventListener("mouseleave", onMouseLeaveNoteCanvas);
    container.appendChild(globals.noteCanvas);
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
    globals.notes = [];
    for (var i=0; i<notes.length; i++ ) {
      var noteCopy = JSON.parse(JSON.stringify(notes[i]));
      globals.notes.push(noteCopy);
    }
  }

  /**
   * Using the internal list of notes as a model, clear the current display and
   * draw a new one.
   */
  function refreshDisplay() {
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
