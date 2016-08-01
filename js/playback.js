/**
 * This module handles playback of a list of recorded 'note' objects, each with
 * a MIDI note value, MIDI velocity, start time, and end time. Note that it is
 * only designed to play back one list of notes at a time.
 */
var playback = {};

// This is just a function that calls itself so its variables aren't made global
(function() {
  var globals = {
    //// Constants
    // Time (ms) to wait between scheduling the next batch of notes for playback
    PLAYBACK_INTERVAL: 25,
    // For each batch of scheduling, the amount of time (ms) to schedule note
    // playback for
    PLAYBACK_LOOKAHEAD: 100,
    //// Variables
    // MIDIOutput object for sending playback MIDI events to
    midiOut: undefined,
    // ID returned by setInterval for the function scheduling blocks of playback
    playbackIntervalId: undefined,
    // Time (ms) from page load to when playback started
    startPlaybackTime: undefined,
    // Time (ms) from page load to when playback must be done
    endPlaybackTime: undefined,
    // Index of the next note in recordedNotes that we need to schedule for
    // playback
    playbackIndex: 0,
    // Function to call when playback is finished or stopped
    stopCallback: undefined
  };

  // Whether playback scheduling is going on currently
  playback.isPlaying = false;

  /**
   * Stops scheduling notes for playback and resets the playback index.
   */
  playback.stop = function() {
    if (playback.isPlaying) {
      clearInterval(globals.playbackIntervalId);
      playback.isPlaying = false;
      globals.playbackIndex = 0;
      if (globals.stopCallback) {
        globals.stopCallback();
      }
    }
  };

  /**
   * Called every PLAYBACK_INTERVAL milliseconds during playback, this function
   * sends scheduled MIDI events corresponding to all of the notes which start
   * in the next PLAYBACK_LOOKAHEAD milliseconds.
   */
  function schedulePlaybackSection() {
    var currentTime = performance.now();
    var currentPlaybackTime = currentTime - globals.startPlaybackTime;
    var sectionEndTime = currentPlaybackTime + globals.PLAYBACK_LOOKAHEAD;
    var maxIndex = globals.notes.length;
    while (true) {
      if (globals.playbackIndex >= maxIndex) {
        if (globals.endPlaybackTime <= currentTime) {
          playback.stop();
        }
        break;
      } else {
        var noteObj = globals.notes[globals.playbackIndex];
        if (noteObj.start <= sectionEndTime) {
          midi.sendNote({
            "midiOutput": globals.midiOut,
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
   * Given a list of notes and a MIDIOutput object, stop whatever is currently
   * playing and start playing back the provided notes through the MIDIOutput
   * device, calling the stopCallback when the playback is finished or stopped.
   *
   * Recorded notes are each an object with attributes:
   * - note: integer MIDI note value (middle C is 60)
   * - velocity: integer MIDI velocity value (loudness, 0-127)
   * - start: double representing time (ms) the note should start relative to
   *   the start of playback
   * - end: double representing time (ms) the note should stop relative to the
   *   start of playback
   * Playback occurs by scheduling PLAYBACK_LOOKAHEAD ms of notes every
   * PLAYBACK_LOOKAHEAD ms.
   */
  playback.play = function(notes, midiOut, stopCallback) {
    if (playback.isPlaying) {
      playback.stop();
    }
    playback.isPlaying = true;
    globals.midiOut = midiOut;
    globals.notes = notes;
    var maxTime = util.getMaxTime(globals.notes);
    globals.playbackIntervalId = setInterval(
      schedulePlaybackSection, globals.PLAYBACK_INTERVAL
    );
    globals.startPlaybackTime = performance.now();
    globals.endPlaybackTime = globals.startPlaybackTime + maxTime;
    globals.stopCallback = stopCallback;
  };

  /**
   * Return the time (ms) of the playback's current location. If not currently
   * playing, return 0.
   */
  playback.getTime = function() {
    if (playback.isPlaying) {
      return performance.now() - globals.startPlaybackTime;
    } else {
      return 0;
    }
  };
})()
