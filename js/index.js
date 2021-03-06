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
    // AudioContext object used for audio playback and decoding
    audioContext: undefined,
    // AudioBuffer object containing the decoded audio of the original song file
    // (may be undefined)
    audioBuffer: undefined,
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
   * Load the chosen file and save its decoded buffer to later send to the
   * playback module.
   */
  function onPressLoadAudio() {
    var statusElem = document.getElementById("load-audio-status");
    statusElem.textContent = "Loading...";
    var fileElem = document.getElementById("original-audio");
    if (fileElem.files.length < 1) {
      statusElem.textContent = "Please choose a file to upload.";
    } else {
      var reader = new FileReader();
      reader.onload = function() {
        globals.audioContext.decodeAudioData(reader.result).then(
          function(buffer) {
            globals.audioBuffer = buffer;
            notedisplay.showNotes(globals.notes, globals.audioBuffer);
            statusElem.textContent = "Loaded.";
          }, function(error) {
            statusElem.textContent = "Failed to load: " + error;
          }
        );
      };
      reader.readAsArrayBuffer(fileElem.files[0]);
    }
  }

  /**
   * Forget the audio buffer of any previously laoded audio file.
   */
  function onPressClearAudio() {
    if (playback.isPlaying) {
      playback.stop();
    }
    globals.audioBuffer = undefined;
    notedisplay.showNotes(globals.notes, globals.audioBuffer);
    var statusElem = document.getElementById("load-audio-status");
    statusElem.textContent = "Cleared.";
  }

  /**
   * Stop playback and start saving MIDI events from the selected input as note
   * objects.
   */
  function onPressRecord() {
    if (playback.isPlaying) {
      onPressPause();
    }
    var midiInputSelect = document.getElementById("inputs");
    var midiInputKey = midiInputSelect.value;
    var midiInput = globals.midiAccess.inputs.get(midiInputKey);
    notedisplay.startContinuousTimeUpdate(function() {
      return globals.time + record.getTime();
    }, globals.time);
    var recordStartTime = record.start(midiInput);
    var playbackStartTime = playback.play({
      notes: [],
      startTime: globals.time,
      audioBuffer: globals.audioBuffer,
      audioContext: globals.audioContext
    });
    // We can't start recording with precise timing, so we instead get a close
    // estimate of when recording started, when playback started, and add the
    // difference to our time variable so that when the recorded notes get
    // merged in, they're relative to the timing heard in the original audio
    // playback.
    globals.time += recordStartTime - playbackStartTime;
  }

  /**
   * Returns true if the two notes are the same note value played before the
   * first one finishes.
   */
  function areOverlapping(note1, note2) {
    return (note1.note === note2.note) &&
      ((note2.end >= note1.start) && (note1.end >= note2.start));
  }

  /**
   * Given two lists of notes, return one list of notes where overlapping notes
   * (same note value and start while another is still sounding) become a single
   * note whose duration is the union of both notes' durations. This function
   * assumes that both note lists are in increasing order in terms of their
   * start, and that they don't themselves contain overlaps. The reason for an
   * "old" and "new" designation is because the merged note needs a velocity, so
   * we go with the newer velocity.
   *
   * The algorithm is simple: for each note in one list, if it overlaps with a
   * note in the other list, remove the other list's note and combine it with
   * this one, then try to merge this combined note and repeat until the note
   * doesn't overlap with any and you can insert it into the list. (O(n^2))
   */
  function mergeNotes(oldNotes, newNotes) {
    var mergedNotes = util.noteListCopy(oldNotes);
    for (var newNote_i=0; newNote_i<newNotes.length; newNote_i++) {
      var mergingNote = newNotes[newNote_i];
      var merged_i = 0;
      while (merged_i < mergedNotes.length) {
        var mergedNote = mergedNotes[merged_i];
        if (areOverlapping(mergingNote, mergedNote)) {
          mergingNote = {
            note: mergingNote.note,
            start: Math.min(mergingNote.start, mergedNote.start),
            end: Math.max(mergingNote.end, mergedNote.end),
            velocity: mergingNote.velocity
          };
          mergedNotes.splice(merged_i, 1);
          merged_i = 0;
        } else {
          merged_i += 1;
        }
      }
      var wasAdded = false;
      for (var i=0; i<mergedNotes.length; i++) {
        var mergedNote = mergedNotes[i];
        if (mergedNote.start > mergingNote.start) {
          mergedNotes.splice(i, 0, mergingNote);
          wasAdded = true;
          break;
        }
      }
      if (!wasAdded) {
        mergedNotes.push(mergingNote);
      }
    }
    return mergedNotes;
  }

  /**
   * Stop recording any more incoming MIDI events. If there are any hanging
   * notes left (i.e. notes that had NoteOn but no NoteOff), save them as though
   * they just got a NoteOff. Merge the newly recorded notes with the ones that
   * were already recorded, combining overlapping notes to be a single note
   * covering the union of their duration.
   */
  function onPressStopRecord() {
    if (record.isRecording) {
      var recordedNotes = record.stop();
      notedisplay.stopContinuousTimeUpdate();
      recordedNotes.forEach(function(note) {
        note.start += globals.time;
        note.end += globals.time;
      });
      globals.notes = mergeNotes(globals.notes, recordedNotes);
      notedisplay.showNotes(globals.notes, globals.audioBuffer);
      // When we subtracted the difference between the start of the recording
      // and the start of playback, we could end up with a negative start time,
      // so reset it to 0 now that the offset has been applied.
      globals.time = Math.max(0, globals.time);
      notedisplay.showTime(globals.time);
    }
    if (playback.isPlaying) {
      playback.stop();
    }
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
   * Forget all recorded notes and reset the time bar.
   */
  function onPressClear() {
    onPressStopPlay();
    globals.notes = [];
    notedisplay.showNotes(globals.notes, globals.audioBuffer);
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
      notedisplay.startContinuousTimeUpdate(playback.getTime, globals.time);
      playback.play({
        notes: globals.notes,
        midiOut: playbackMidiOut,
        startTime: globals.time,
        audioBuffer: globals.audioBuffer,
        audioContext: globals.audioContext,
        stopCallback: function() {
          notedisplay.stopContinuousTimeUpdate();
          globals.time = 0;
          notedisplay.showTime(globals.time);
        }
      });
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
   * Stop playback but don't update the position from what is was before.
   */
  function onPressPauseKeepSpot() {
    var time = globals.time;
    if (playback.isPlaying) {
      playback.stop();
      globals.time = time;
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
   * Download the notes as a json file.
   */
  function onPressSave() {
    var a = document.createElement('a');
    var notesJson = JSON.stringify(globals.notes);
    var notesBlob = new Blob([notesJson], {type: 'application/json'});
    a.href = window.URL.createObjectURL(notesBlob);
    a.download = 'notes.json';
    a.click();
  }

  /**
   * Parse the json list of notes, making sure that each note has a start, end,
   * note, and velocity that make sense (nonnegative, end > start), and that the
   * order also makes sense (ascending starts and no overlap).
   */
  function onPressLoadNotes() {
    var statusElem = document.getElementById("load-notes-status");
    statusElem.textContent = "Loading...";
    var fileElem = document.getElementById("notes-file");
    if (fileElem.files.length < 1) {
      statusElem.textContent = "Please choose a file to upload.";
    } else {
      var reader = new FileReader();
      reader.onload = function() {
        var notes = null;
        try {
          notes = JSON.parse(reader.result);
        } catch (e) {
          statusElem.textContent = "Failed to parse notes (json): " + e.message;
        }
        if (notes) {
          noteloop:
          for (var i=0; i<notes.length; i++) {
            var props = ["start", "end", "note", "velocity"];
            for (var propI=0; propI<props.length; propI++) {
              var prop = props[propI];
              if (!notes[i].hasOwnProperty(prop)) {
                statusElem.textContent = "Failed to parse notes: Note " + i +
                  " missing property " + prop + ".";
                break noteloop;
              }
              var type = typeof notes[i][prop];
              if (type !== 'number') {
                statusElem.textContent = "Failed to parse notes: Note " + i +
                  " property " + prop + " is not a number, but a " + type;
                break noteloop;
              }
              if (notes[i][prop] < 0) {
                statusElem.textContent = "Failed to parse notes: Note " + i +
                  " property " + prop + " is negative";
                break noteloop;
              }
            }
            notes[i] = {
              start: notes[i].start,
              end: notes[i].end,
              note: notes[i].note,
              velocity: notes[i].velocity
            };
            if (notes[i].end <= notes[i].start) {
              statusElem.textContent = "Failed to parse notes: Note " + i +
                " end was not after start";
              break;
            }
            if (i && (notes[i].start < notes[i-1].start)) {
              statusElem.textContent = "Failed to parse notes: Note " + i +
                " out of order";
              break;
            }
            for (var j=i+1; j<notes.length; j++) {
              if (areOverlapping(notes[i], notes[j])) {
                statusElem.textContent = "Failed to parse notes: Notes " + i +
                  " and " + j + " are overlapping";
                break noteloop;
              }
            }
          }
          if (statusElem.textContent === "Loading...") {
            globals.notes = notes;
            notedisplay.showNotes(notes, globals.audioBuffer);
            statusElem.textContent = "Loaded.";
          }
        }
      };
      reader.readAsText(fileElem.files[0]);
    }
  }

  /**
   * Shows or hides the key bindings section.
   */
  function onClickKeysToggle() {
    if (this.innerText === "[show]") {
      this.nextSibling.nextSibling.style.display = "block";
      this.innerText = "[hide]";
    } else {
      this.nextSibling.nextSibling.style.display = "none";
      this.innerText = "[show]";
    }
  }

  /**
   * Set up the functions to get called when a user clicks on record, play, etc.
   */
  function initEventListeners() {
    var refreshInputsButton = document.getElementById("refresh-inputs");
    refreshInputsButton.addEventListener("click", onPressRefreshInputs);
    var refreshOutputsButton = document.getElementById("refresh-outputs");
    refreshOutputsButton.addEventListener("click", onPressRefreshOutputs);
    var loadAudioButton = document.getElementById("load-audio");
    loadAudioButton.addEventListener("click", onPressLoadAudio);
    var clearAudioButton = document.getElementById("clear-audio");
    clearAudioButton.addEventListener("click", onPressClearAudio);
    var recordButton = document.getElementById("record");
    recordButton.addEventListener("click", onPressRecord);
    var stopRecordButton = document.getElementById("stop-record");
    stopRecordButton.addEventListener("click", onPressStopRecord);
    var clearButton = document.getElementById("clear");
    clearButton.addEventListener("click", onPressClear);
    var playButton = document.getElementById("play");
    playButton.addEventListener("click", onPressPlay);
    var pauseButton = document.getElementById("pause");
    pauseButton.addEventListener("click", onPressPause);
    var pauseKeepSpotButton = document.getElementById("pause-keep-spot");
    pauseKeepSpotButton.addEventListener("click", onPressPauseKeepSpot);
    var stopPlayButton = document.getElementById("stop-play");
    stopPlayButton.addEventListener("click", onPressStopPlay);
    var panicButton = document.getElementById("panic");
    panicButton.addEventListener("click", onPressPanic);
    var saveButton = document.getElementById("save");
    saveButton.addEventListener("click", onPressSave);
    var loadNotesButton = document.getElementById("load-notes");
    loadNotesButton.addEventListener("click", onPressLoadNotes);
    var keysToggleElem = document.getElementById("keys-toggle");
    keysToggleElem.addEventListener("click", onClickKeysToggle);
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
    notedisplay.showNotes(globals.notes, globals.audioBuffer);
  }

  /**
   * Called by notedisplay when the user wants to seek to another position in
   * time.
   */
  function onSetTime(time) {
    if (!(record.isRecording || playback.isPlaying)) {
      globals.time = time;
      notedisplay.showTime(time);
    }
  }

  /**
   * If playing, pause, and vice versa.
   */
  function togglePlayPause() {
    if (playback.isPlaying) {
      onPressPause();
    } else {
      onPressPlay();
    }
  }

  /**
   * If playing, pause while keeping the original spot, and vice versa.
   */
  function togglePlayPauseKeepSpot() {
    if (playback.isPlaying) {
      onPressPauseKeepSpot();
    } else {
      onPressPlay();
    }
  }

  /**
   * Called by notedisplay when a user has 'updated' the note at the given index
   * to the provided value.
   */
  function onUpdateNote(index, note) {
    globals.notes.splice(index, 1);
    globals.notes = mergeNotes(globals.notes, [note]);
    notedisplay.showNotes(globals.notes, globals.audioBuffer);
  }

  /**
   * Initialize the page - called once and first on load.
   */
  index.init = function() {
    if (!navigator.requestMIDIAccess) {
      var msg = "Web MIDI support is required (try using Chrome).";
      document.getElementById("warning").innerText = msg;
    }
    initEventListeners();
    var displayContainer = document.getElementById("record-display");
    notedisplay.init(
      displayContainer, onDeleteNote, onUpdateNote, onSetTime, togglePlayPause,
      togglePlayPauseKeepSpot
    );
    navigator.requestMIDIAccess().then(function(midiAccess) {
      globals.midiAccess = midiAccess;
      onPressRefreshInputs();
      onPressRefreshOutputs();
    }, function() {
      alert("MIDI access denied.");
    });
    globals.audioContext = new AudioContext();
  };
})()

window.onload = index.init;
