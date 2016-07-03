var index = {};

/**
 * Note - this is just a function that immediately runs; we do this so that any
 * variables declared don't exist outside of this file (except through the
 * index object we purposefully make public)
 */
(function() {
  // Global variables used across functions
  var globals = {
    //// Constants
    // Time (ms) to wait between scheduling the next batch of notes for playback
    PLAYBACK_INTERVAL: 25,
    // For each batch of scheduling, the amount of time (ms) to schedule note
    // playback for
    PLAYBACK_LOOKAHEAD: 100,
    //// Variables
    // AudioContext object for interfacing with web audio API
    audioContext: undefined,
    // MIDIAccess object for interfacing with web MIDI API
    midiAccess: undefined,
    // Key for the MIDIInput object currently set to listen for input
    midiInputListeningKey: undefined,
    // Whether we are currently listening and saving MIDI input
    isRecording: false,
    // Time (ms) from page load to when recording started
    startRecordTime: undefined,
    // Map of note value to the index of a recorded note object in recordedNotes
    // for which we have yet to see a "NoteOff" event
    hangingNotes: {},
    // Notes that have been recorded, ordered by start time
    recordedNotes: [],
    // Time (ms) from page load to when playback started
    startPlaybackTime: undefined,
    // Whether playback scheduling is going on currently
    isPlaying: false,
    // MIDIOutput object currently set for sending playback MIDI events to
    playbackMidiOut: undefined,
    // ID returned by setInterval for the function scheduling blocks of playback
    playbackIntervalId: undefined,
    // Index of the next note in recordedNotes that we need to schedule for
    // playback
    playbackIndex: 0
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
  function refreshMidiInputs() {
    var midiInputs = document.getElementById("midi-inputs");
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
  function refreshMidiOutputs() {
    var midiOutputs = document.getElementById("midi-outputs");
    clearChildren(midiOutputs);
    globals.midiAccess.outputs.forEach(function(port, key) {
      var outputOption = document.createElement("option");
      outputOption.text = port.name;
      outputOption.value = key;
      midiOutputs.appendChild(outputOption);
    });
  }

  /**
   * Handler for any incoming MIDIEvent. If it's NoteOn, save a partial note
   * object, and if it's NoteOff, find the previously saved partial note object
   * and complete it with an end time (note: only does these things if we're
   * recording).
   */
  function onMidiInputMessage(midiEvent) {
    var midiMsg = midiEvent.data;
    if (globals.isRecording) {
      if (midi.isNoteOnMessage(midiMsg)) {
        var noteValue = midi.getNoteFromNoteMessage(midiMsg);
        globals.hangingNotes[noteValue] = globals.recordedNotes.push({
          "note": noteValue,
          "start": midiEvent.timeStamp - globals.startRecordTime,
          "velocity": midi.getVelocityFromNoteMessage(midiMsg)
        }) - 1;
      } else if (midi.isNoteOffMessage(midiMsg)) {
        var noteValue = midi.getNoteFromNoteMessage(midiMsg);
        var noteI = globals.hangingNotes[noteValue];
        if (noteI !== undefined) {
          var noteObj = globals.recordedNotes[noteI];
          noteObj.end = midiEvent.timeStamp - globals.startRecordTime;
          delete globals.hangingNotes[noteValue];
        }
      }
    }
  }

  /**
   * Stop playback and start saving MIDI events from the selected input as note
   * objects.
   */
  function record() {
    if (globals.isPlaying) {
      globals.stopPlay();
    }
    var midiInputSelect = document.getElementById("midi-inputs");
    var midiInputKey = midiInputSelect.value;
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
    globals.startRecordTime = performance.now();
    globals.recordedNotes = [];
    globals.isRecording = true;
  }

  /**
   * Stop recording any more incoming MIDI events. If there are any hanging
   * notes left (i.e. notes that had NoteOn but no NoteOff), save them as though
   * they just got a NoteOff.
   */
  function stopRecord() {
    var end = globals.audioContext.currentTime * 1000;
    globals.isRecording = false;
    for (var noteValue in globals.hangingNotes) {
      var noteObj = globals.recordedNotes[globals.hangingNotes[note]];
      noteObj.end = end;
      delete globals.hangingNotes[noteValue];
    }
  }

  /**
   * Return the MIDIOutput object corresponding to the choice currently
   * selected.
   */
  function getSelectedMidiOut() {
    var midiOutputSelect = document.getElementById("midi-outputs");
    var midiOutputKey = midiOutputSelect.value;
    return globals.midiAccess.outputs.get(midiOutputKey);
  }

  /**
   * Stop scheduling notes for playback and reset the playback index.
   */
  function stopPlay() {
    if (globals.isPlaying) {
      clearInterval(globals.playbackIntervalId);
      globals.isPlaying = false;
      globals.playbackIndex = 0;
    }
  }

  /**
   * Called every PLAYBACK_INTERVAL milliseconds during playback, this function
   * sends scheduled MIDI events corresponding to all of the notes which start
   * in the next PLAYBACK_LOOKAHEAD milliseconds.
   */
  function schedulePlaybackSection() {
    var currentTime = globals.audioContext.currentTime * 1000;
    var currentPlaybackTime = currentTime - globals.startPlaybackTime;
    var sectionEndTime = currentPlaybackTime + globals.PLAYBACK_LOOKAHEAD;
    var maxIndex = globals.recordedNotes.length;
    while (true) {
      if (globals.playbackIndex >= maxIndex) {
        stopPlay();
        break;
      } else {
        var noteObj = globals.recordedNotes[globals.playbackIndex];
        if (noteObj.start <= sectionEndTime) {
          midi.sendNote({
            "midiOutput": globals.playbackMidiOut,
            "note": noteObj.note,
            "onTime": globals.startPlaybackTime + noteObj.start,
            "offTime": globals.startPlaybackTime + noteObj.end,
            "velocity": noteObj.velocity
          });
          globals.playbackIndex++;
        } else {
          break;
        }
      }
    }
  }

  /**
   * Stop recording and start sending MIDI events out for all of the recorded
   * notes.
   */
  function play() {
    if (globals.isRecording) {
      stopRecord();
    }
    globals.playbackMidiOut = getSelectedMidiOut();
    if (globals.playbackMidiOut === undefined) {
      alert("No MIDI out selected.");
    } else {
      globals.isPlaying = true;
      globals.playbackIntervalId = setInterval(
        schedulePlaybackSection, globals.PLAYBACK_INTERVAL
      );
      globals.startPlaybackTime = globals.audioContext.currentTime * 1000;
    }
  }

  /**
   * Send a MIDI panic signal out - AKA a NoteOff message to every single note.
   * This will silence any lingering notes waiting for a NoteOff.
   */
  function panic() {
    midi.panic(getSelectedMidiOut());
  }

  /**
   * Set up the functions to get called when a user clicks on record, play, etc.
   */
  function initEventListeners() {
    var refreshInputsButton = document.getElementById("refresh-midi-inputs");
    refreshInputsButton.addEventListener("click", refreshMidiInputs);
    var refreshOutputsButton = document.getElementById("refresh-midi-outputs");
    refreshOutputsButton.addEventListener("click", refreshMidiOutputs);
    var recordButton = document.getElementById("record");
    recordButton.addEventListener("click", record);
    var stopRecordButton = document.getElementById("stop-record");
    stopRecordButton.addEventListener("click", stopRecord);
    var playButton = document.getElementById("play");
    playButton.addEventListener("click", play);
    var stopPlayButton = document.getElementById("stop-play");
    stopPlayButton.addEventListener("click", stopPlay);
    var panicButton = document.getElementById("panic");
    panicButton.addEventListener("click", panic);
  }

  /**
   * Initialize the page - called once and first on load.
   */
  index.init = function() {
    initEventListeners();
    globals.audioContext = new AudioContext();
    navigator.requestMIDIAccess().then(function(midiAccess) {
      globals.midiAccess = midiAccess;
      refreshMidiInputs();
      refreshMidiOutputs();
    }, function() {
      alert("MIDI access denied.");
    });
  }
})()

window.onload = index.init;
