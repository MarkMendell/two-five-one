var index = {};

/**
 * Note - this is just a function that immediately runs; we do this so that any
 * variables declared don't exist outside of this file (except through the
 * index object we purposefully make public)
 */
(function() {
  var globals = {
    // Constants
    PLAYBACK_LOOKAHEAD: 100,  // milliseconds
    PLAYBACK_INTERVAL: 25,  // milliseconds
    // Variables
    audioContext: undefined,
    midiAccess: undefined,
    midiInputListeningKey: undefined,
    isRecording: false,
    startRecordTime: undefined,  // milliseconds
    recordedMidi: [],
    startPlaybackTime: undefined,  // milliseconds
    isPlaying: false,
    playbackMidiOut: undefined,
    playbackIntervalId: undefined,
    playbackIndex: 0
  };

  function clearChildren(e) {
    while (e.firstChild) {
      e.removeChild(e.firstChild);
    }
  }

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

  function onMidiInputMessage(midiEvent) {
    var midiMsg = midiEvent.data;
    if (globals.isRecording) {
      if (midi.isNoteMessage(midiMsg)) {
        globals.recordedMidi.push({
          "time": midiEvent.timeStamp - globals.startRecordTime,
          "midiMsg": midiMsg
        });
      }
    }
  }

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
    globals.recordedMidi = [];
    globals.isRecording = true;
  }

  function stopRecord() {
    globals.isRecording = false;
  }

  function getSelectedMidiOut() {
    var midiOutputSelect = document.getElementById("midi-outputs");
    var midiOutputKey = midiOutputSelect.value;
    return globals.midiAccess.outputs.get(midiOutputKey);
  }

  function stopPlay() {
    if (globals.isPlaying) {
      clearInterval(globals.playbackIntervalId);
      globals.isPlaying = false;
      globals.playbackIndex = 0;
    }
  }

  function schedulePlaybackSection() {
    var currentTime = globals.audioContext.currentTime * 1000;
    var currentPlaybackTime = currentTime - globals.startPlaybackTime;
    var sectionEndTime = currentPlaybackTime + globals.PLAYBACK_LOOKAHEAD;
    var maxIndex = globals.recordedMidi.length;
    while (true) {
      if (globals.playbackIndex >= maxIndex) {
        stopPlay();
        break;
      } else {
        var midiEvent = globals.recordedMidi[globals.playbackIndex];
        if (midiEvent.time <= sectionEndTime) {
          var sendTime = globals.startPlaybackTime + midiEvent.time;
          globals.playbackMidiOut.send(midiEvent.midiMsg, sendTime);
          globals.playbackIndex++;
        } else {
          break;
        }
      }
    }
  }

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

  function panic() {
    midi.panic(getSelectedMidiOut());
  }

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
