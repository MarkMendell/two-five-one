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
    //// Variables
    // Canvas used for displaying the notes
    noteCanvas: undefined
  };

  /**
   * Given a note object and a CanvasRenderingContext2D, draw the note on the
   * canvas 2D context.
   */
  function drawNote(note, ctx) {
    var x = Math.floor(note.start * globals.PX_PER_MS);
    var y = (127 - note.note) * (globals.NOTE_HEIGHT + globals.NOTE_GAP);
    var w = Math.ceil((note.end - note.start) * globals.PX_PER_MS);
    var h = globals.NOTE_HEIGHT;
    ctx.fillStyle = globals.NOTE_COLOR;
    ctx.fillRect(x, y, w, h);
  }

  /**
   * Given a list of notes, clear whatever notes were drawn before and display
   * the provided notes. A note is an object with the following attributes:
   * - start: double representing time (ms) the note begins
   * - end: double representing time (ms) the note ends
   * - note: integer MIDI note value (60 is middle C)
   */
  notedisplay.showNotes = function(notes) {
    var maxTime = notes.reduce(function(prevMax, note) {
      return Math.max(prevMax, note.end);
    }, 0);
    // Setting the width/height clears the canvas as well
    globals.noteCanvas.width = Math.ceil(maxTime * globals.PX_PER_MS);
    globals.noteCanvas.height = (globals.NOTE_HEIGHT + globals.NOTE_GAP) * 128;
    var ctx = globals.noteCanvas.getContext("2d");
    notes.forEach(function(note) { drawNote(note, ctx); });
  };

  /**
   * Initialize the canvases used for the display as children of the provided
   * element. This function must be called first before you can use other
   * display functions.
   */
  notedisplay.init = function(container) {
    globals.noteCanvas = document.createElement("canvas");
    globals.noteCanvas.width = 0;
    globals.noteCanvas.height = 0;
    container.appendChild(globals.noteCanvas);
  };
})();
