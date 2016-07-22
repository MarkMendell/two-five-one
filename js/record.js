/**
 * This module handles capturing MIDI input in the form of recorded note
 * objects, where a note object has a start time, end time, MIDI note value, and
 * MIDI velocity. It is only meant to record one thing at a time.
 */
var record = {};

// This is just a function that calls itself so that variables inside don't
// become globals
(function() {
  // Global variables used across functions
  var globals = {
    // Key for the MIDIInput object currently set to listen for input
    midiInputListeningKey: undefined,
    // Time (ms) from page load to when recording started
    startTime: undefined,
    // Map of note value to the index of a recorded note object in recordedNotes
    // for which we have yet to see a "NoteOff" event
    hangingNotes: {}
  };

  // Notes that have been recorded, ordered by start time; may have partially
  // recorded notes (with no end time) if recording is in progress
  record.notes = [];

  // Whether we are currently recording
  record.isRecording = false;

  /**
   * Handler for any incoming MIDIEvent. If it's NoteOn, save a partial note
   * object, and if it's NoteOff, find the previously saved partial note object
   * and complete it with an end time (note: only does these things if we're
   * recording).
   */
  function onMidiInputMessage(midiEvent) {
    var midiMsg = midiEvent.data;
    if (record.isRecording) {
      if (midi.isNoteOnMessage(midiMsg)) {
        var noteValue = midi.getNoteFromNoteMessage(midiMsg);
        globals.hangingNotes[noteValue] = record.notes.push({
          "note": noteValue,
          "start": midiEvent.timeStamp - globals.startTime,
          "velocity": midi.getVelocityFromNoteMessage(midiMsg)
        }) - 1;
      } else if (midi.isNoteOffMessage(midiMsg)) {
        var noteValue = midi.getNoteFromNoteMessage(midiMsg);
        var noteI = globals.hangingNotes[noteValue];
        if (noteI !== undefined) {
          var noteObj = record.notes[noteI];
          noteObj.end = midiEvent.timeStamp - globals.startTime;
          delete globals.hangingNotes[noteValue];
        }
      }
    }
  }

  /**
   * Given a MIDIInput object, clear any previous recording and start listening
   * to its MIDI events and saving them in order as complete note objects.
   */
  record.start = function(midiInput, midiAccess) {
    var midiInputKey = midiInput;
    globals.midiAccess = midiAccess;
    if (globals.midiInputListeningKey !== midiInputKey) {
      var midiInputs = globals.midiAccess.inputs;
      if (globals.midiInputListeningKey) {
        var oldInput = midiInputs.get(globals.midiInputListeningKey);
        oldInput.removeEventListener("midimessage", onMidiInputMessage);
      }
      var newInput = midiInputs.get(midiInputKey);
      newInput.addEventListener("midimessage", onMidiInputMessage);
      globals.midiInputListeningKey = midiInputKey;
    }
    globals.startTime = performance.now();
    record.notes = [];
    record.isRecording = true;
  };

  /**
   * Stop saving incoming MIDI events as new recorded notes and mark any hanging
   * notes as though their NoteOff event happened right now.
   */
  record.stop = function() {
    var end = performance.now() - globals.startTime;
    record.isRecording = false;
    for (var noteValue in globals.hangingNotes) {
      var noteObj = record.notes[globals.hangingNotes[noteValue]];
      noteObj.end = end;
      delete globals.hangingNotes[noteValue];
    }
  };
})();
