/**
 * This module is the main one run first by the website.
 */
var index = {};

/**
 * Note - this is just a function that immediately runs; we do this so that any
 * variables declared don't exist outside of this file (except through the
 * index object we purposefully make public)
 */
(function() {
  // Global variables used across functions
  var globals = {
    // MIDIAccess object for interfacing with web MIDI API
    midiAccess: undefined,
    // Notes that exist for playback
    notes: [],
    // Time (ms, relative to start) where the next playback or record event will
    // start from
    time: 0
  };

  /**
   * Remove all of the children from the provided DOM element.
   */
  function clearChildren(e) {
    while (e.firstChild) {
      e.removeChild(e.firstChild);
    }
  }

  /**
   * Cycle through available MIDIInput objects and make the input options
   * reflect these.
   */
  function onPressRefreshInputs() {
    var midiInputs = document.getElementById("inputs");
    clearChildren(midiInputs);
    globals.midiAccess.inputs.forEach(function(port, key) {
      var inputOption = document.createElement("option");
      inputOption.text = port.name;
      inputOption.value = key;
      midiInputs.appendChild(inputOption);
    });
  }

  /**
   * Cycle through available MIDIOutput objects and make the output options
   * reflect these.
   */
  function onPressRefreshOutputs() {
    var midiOutputs = document.getElementById("outputs");
    clearChildren(midiOutputs);
    globals.midiAccess.outputs.forEach(function(port, key) {
      var outputOption = document.createElement("option");
      outputOption.text = port.name;
      outputOption.value = key;
      midiOutputs.appendChild(outputOption);
    });
  }

  /**
   * Stop playback and start saving MIDI events from the selected input as note
   * objects.
   */
  function onPressRecord() {
    if (playback.isPlaying) {
      playback.stop();
    }
    var midiInputSelect = document.getElementById("inputs");
    var midiInputKey = midiInputSelect.value;
    var midiInput = globals.midiAccess.inputs.get(midiInputKey);
    record.start(midiInput);
  }

  /**
   * Stop recording any more incoming MIDI events. If there are any hanging
   * notes left (i.e. notes that had NoteOn but no NoteOff), save them as though
   * they just got a NoteOff.
   */
  function onPressStopRecord() {
    var recordedNotes = record.stop();
    if (recordedNotes.length > 0) {
      globals.notes = recordedNotes;
      notedisplay.showNotes(globals.notes);
    }
  }

  /**
   * Return the MIDIOutput object corresponding to the choice currently
   * selected.
   */
  function getSelectedMidiOut() {
    var midiOutputSelect = document.getElementById("outputs");
    var midiOutputKey = midiOutputSelect.value;
    return globals.midiAccess.outputs.get(midiOutputKey);
  }

  /**
   * Stop and reset playback.
   */
  function onPressStopPlay() {
    playback.stop();
    globals.time = 0;
    notedisplay.showTime(globals.time);
  }

  /**
   * Stop recording and start sending MIDI events out for all of the recorded
   * notes.
   */
  function onPressPlay() {
    if (playback.isPlaying) {
      return;
    }
    if (record.isRecording) {
      onPressStopRecord();
    }
    var playbackMidiOut = getSelectedMidiOut();
    if (playbackMidiOut === undefined) {
      alert("No MIDI out selected.");
    } else {
      notedisplay.startContinuousTimeUpdate(playback.getTime);
      playback.play(
        globals.notes, playbackMidiOut, globals.time,
        function() {
          notedisplay.stopContinuousTimeUpdate();
          globals.time = 0;
          notedisplay.showTime(globals.time);
        }
      );
    }
  }

  /**
   * Stop playback and save the position for starting at the same time next
   * play.
   */
  function onPressPause() {
    if (playback.isPlaying) {
      globals.time = playback.stop();
      notedisplay.showTime(globals.time);
    }
  }

  /**
   * Send a MIDI panic signal out - AKA a NoteOff message to every single note.
   * This will silence any lingering notes waiting for a NoteOff.
   */
  function onPressPanic() {
    midi.panic(getSelectedMidiOut());
  }

  /**
   * Set up the functions to get called when a user clicks on record, play, etc.
   */
  function initEventListeners() {
    var refreshInputsButton = document.getElementById("refresh-inputs");
    refreshInputsButton.addEventListener("click", onPressRefreshInputs);
    var refreshOutputsButton = document.getElementById("refresh-outputs");
    refreshOutputsButton.addEventListener("click", onPressRefreshOutputs);
    var recordButton = document.getElementById("record");
    recordButton.addEventListener("click", onPressRecord);
    var stopRecordButton = document.getElementById("stop-record");
    stopRecordButton.addEventListener("click", onPressStopRecord);
    var playButton = document.getElementById("play");
    playButton.addEventListener("click", onPressPlay);
    var pauseButton = document.getElementById("pause");
    pauseButton.addEventListener("click", onPressPause);
    var stopPlayButton = document.getElementById("stop-play");
    stopPlayButton.addEventListener("click", onPressStopPlay);
    var panicButton = document.getElementById("panic");
    panicButton.addEventListener("click", onPressPanic);
  }

  /**
   * Given two notes, return true if the two notes are equal (same attributes)
   * and false otherwise.
   */
  function noteEquals(note1, note2) {
    var properties = ["start", "end", "note", "velocity"];
    for (var i=0; i<properties.length; i++) {
      if (note1[properties[i]] !== note2[properties[i]]) {
        return false;
      }
    }
    return true;
  }

  /**
   * This function is called by notedisplay when a user has 'deleted' a note. We
   * then perform the deletion and refresh the display with the updated model.
   */
  function onDeleteNote(note) {
    for (var i=0; i<globals.notes.length; i++) {
      if (noteEquals(note, globals.notes[i])) {
        globals.notes.splice(i, 1);
        break;
      }
    }
    notedisplay.showNotes(globals.notes);
  }

  /**
   * Initialize the page - called once and first on load.
   */
  index.init = function() {
    initEventListeners();
    var displayContainer = document.getElementById("record-display");
    notedisplay.init(displayContainer, onDeleteNote);
    navigator.requestMIDIAccess().then(function(midiAccess) {
      globals.midiAccess = midiAccess;
      onPressRefreshInputs();
      onPressRefreshOutputs();
    }, function() {
      alert("MIDI access denied.");
    });
  }
})()

window.onload = index.init;
