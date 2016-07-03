/**
 * This module handles displaying a list of notes on a canvas object, where a
 * "note" has a start time, end time, and MIDI note value.
 */
var notedisplay = {};

// Note that this is just a function that calls itself so that the variables
// declared inside don't become global
(function() {
  // Constants and variables used across functions
  var globals = {
    // Height (px) of a single note
    NOTE_HEIGHT: 3,
    // Space (px) between each note vertically
    NOTE_GAP: 1,
    // How many pixels correspond to a millisecond of time
    PX_PER_MS: 0.1
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
    ctx.fillRect(x, y, w, h);
  }

  /**
   * Given a list of notes and a canvas element, display the notes on the
   * canvas. A note is an object with the following attributes:
   * - start: double representing time (ms) the note begins
   * - end: double representing time (ms) the note ends
   * - note: integer MIDI note value (60 is middle C)
   */
  notedisplay.showNotes = function(notes, canvas) {
    var maxTime = notes.reduce(function(prevMax, note) {
      return Math.max(prevMax, note.end);
    }, 0);
    canvas.width = Math.ceil(maxTime * globals.PX_PER_MS);
    canvas.height = (globals.NOTE_HEIGHT + globals.NOTE_GAP) * 128;
    var ctx = canvas.getContext("2d");
    notes.forEach(function(note) { drawNote(note, ctx); });
  };
})();
