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
    // Time (ms) to add to waiting before playing back to allow the optional
    // AudioBufferSourceNode to start in sync with the MIDI events
    SYNC_PAD: 50,
    //// Variables
    // MIDIOutput object for sending playback MIDI events to
    midiOut: undefined,
    // AudioBufferSourceNode of the original song being transcribed (may be
    // undefined)
    bufferSource: undefined,
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
   * Stops scheduling notes for playback and resets the playback index,
   * returning the time (ms, relative to the start) at which stop was called.
   */
  playback.stop = function() {
    var stopTime = playback.getTime();
    if (playback.isPlaying) {
      clearInterval(globals.playbackIntervalId);
      if (globals.bufferSource) {
        globals.bufferSource.stop();
      }
      playback.isPlaying = false;
      globals.playbackIndex = 0;
      if (globals.stopCallback) {
        globals.stopCallback();
      }
    }
    return stopTime;
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
   * Given a list of notes, a MIDIOutput object, and optionally an AudioBuffer
   * and AudioContext, stop whatever is currently playing and start playing back
   * the provided notes through the MIDIOutput device from the provided time
   * (ms, relative to start), calling the stopCallback when the playback is
   * finished or stopped, while simultaneously playing back the AudioBuffer (if
   * provided) with the given AudioContext.
   *
   * The function takes in an argument object with the following attributes:
   * - notes: list of recorded note objects to play back (see below)
   * - midiOut: MIDIOutput device to send the MIDI messages to
   * - startTime: integer time (ms) to start the notes and audio playback from
   * - stopCallback: function called when playback is stopped early or finished
   * - audioBuffer: AudioBuffer object to play in sync with the notes (optional)
   * - audioContext: AudioContext object for audio buffer playback (if provided)
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
  playback.play = function(args) {
    if (playback.isPlaying) {
      playback.stop();
    }
    playback.isPlaying = true;
    globals.midiOut = args.midiOut;
    globals.notes = args.notes;
    var hasRemainingNote = false;
    for (var i=0; i<globals.notes.length; i++) {
      var noteStart = globals.notes[i].start;
      if (globals.notes[i].start >= args.startTime) {
        hasRemainingNote = true;
        globals.playbackIndex = i;
        break;
      }
    }
    if (!hasRemainingNote) {
      globals.playbackIndex = globals.notes.length;
    }
    var maxTime = util.getMaxTime(globals.notes);
    var now = performance.now();
    globals.startPlaybackTime = now - args.startTime + globals.SYNC_PAD;
    if (args.audioBuffer) {
      maxTime = Math.max(maxTime, args.audioBuffer.duration * 1000);
      globals.bufferSource = args.audioContext.createBufferSource();
      globals.bufferSource.buffer = args.audioBuffer;
      globals.bufferSource.connect(args.audioContext.destination);
      globals.bufferSource.start(
        (now + globals.SYNC_PAD) / 1000.0, args.startTime / 1000.0
      );
    }
    globals.playbackIntervalId = setInterval(
      schedulePlaybackSection, globals.PLAYBACK_INTERVAL
    );
    globals.endPlaybackTime = globals.startPlaybackTime + maxTime;
    globals.stopCallback = args.stopCallback;
    return now + globals.SYNC_PAD;
  };

  /**
   * Return the time (ms) of the playback's current location. If not currently
   * playing, return 0.
   */
  playback.getTime = function() {
    if (playback.isPlaying) {
      // Scheduling is done relative to a start playback time. When we want to
      // start later, we just lie and say the start playback time was earlier
      // than it actually was. What this means is that we can technically be
      // briefly playing back in a time before the actual startPlaybackTime.
      // Thus, for the first SYNC_PAD ms after playback is initiated, the time
      // returned will be actual-starting-time - SYNC_PAD + time-since-play. We
      // work around this by passing notedisplay a minimum time (the actual
      // starting time) that it will never go below.
      return performance.now() - globals.startPlaybackTime;
    } else {
      return 0;
    }
  };
})()
