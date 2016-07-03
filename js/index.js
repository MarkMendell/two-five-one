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
    // AudioContext object for interfacing with web audio API
    audioContext: undefined,
    // MIDIAccess object for interfacing with web MIDI API
    midiAccess: undefined
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
    var recordMidiInput = globals.midiAccess.inputs.get(midiInputKey);
    // 21u39812u39871829740982739084720938748!!!!!!!!!!!!!!
    record.start(midiInputKey, globals.midiAccess); // #$%@$%^@$%^@$%^@#$%@#$%@#$%@#)$%
  }

  /**
   * Stop recording any more incoming MIDI events. If there are any hanging
   * notes left (i.e. notes that had NoteOn but no NoteOff), save them as though
   * they just got a NoteOff.
   */
  function onPressStopRecord() {
    record.stop();
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
  }

  /**
   * Stop recording and start sending MIDI events out for all of the recorded
   * notes.
   */
  function onPressPlay() {
    if (record.isRecording) {
      onPressStopRecord();
    }
    var playbackMidiOut = getSelectedMidiOut();
    if (playbackMidiOut === undefined) {
      alert("No MIDI out selected.");
    } else {
      playback.play(
        record.notes, playbackMidiOut, globals.audioContext
      );
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
    var stopPlayButton = document.getElementById("stop-play");
    stopPlayButton.addEventListener("click", onPressStopPlay);
    var panicButton = document.getElementById("panic");
    panicButton.addEventListener("click", onPressPanic);
  }

  /**
   * Initialize the page - called once and first on load.
   */
  index.init = function() {
    initEventListeners();
    globals.audioContext = new AudioContext();
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
