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
    // AudioContext object used for timing
    audioContext: undefined,
    // ID returned by setInterval for the function scheduling blocks of playback
    playbackIntervalId: undefined,
    // Time (ms) from page load to when playback started
    startPlaybackTime: undefined,
    // Index of the next note in recordedNotes that we need to schedule for
    // playback
    playbackIndex: 0
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
    }
  };

  /**
   * Called every PLAYBACK_INTERVAL milliseconds during playback, this function
   * sends scheduled MIDI events corresponding to all of the notes which start
   * in the next PLAYBACK_LOOKAHEAD milliseconds.
   */
  function schedulePlaybackSection() {
    var currentTime = globals.audioContext.currentTime * 1000;
    var currentPlaybackTime = currentTime - globals.startPlaybackTime;
    var sectionEndTime = currentPlaybackTime + globals.PLAYBACK_LOOKAHEAD;
    var maxIndex = globals.notes.length;
    while (true) {
      if (globals.playbackIndex >= maxIndex) {
        playback.stop();
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
   * Given a list of notes, a MIDIOutput object, and an AudioContext, stop
   * whatever is currently playing and start playing back those notes through
   * the MIDIOutput device using the AudioContext object for timing.
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
  playback.play = function(notes, midiOut, audioContext) {
    if (playback.isPlaying) {
      playback.stop();
    }
    playback.isPlaying = true;
    globals.midiOut = midiOut;
    globals.audioContext = audioContext;
    globals.notes = notes;
    globals.playbackIntervalId = setInterval(
      schedulePlaybackSection, globals.PLAYBACK_INTERVAL
    );
    globals.startPlaybackTime = globals.audioContext.currentTime * 1000;
  };
})()
