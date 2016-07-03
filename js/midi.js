var midi = {};

/**
 * Note that this is just a function which immediately gets executed - that way
 * the only variables accessable outside of this file are through the midi
 * object
 */
(function() {
  midi.NOTE_ON_START = 0b1001;
  midi.NOTE_OFF_START = 0b1000;

  /**
   * Takes in a midi message in the form of a Uint8Array (as given by the data
   * attribute of a MIDIMessageEvent) and returns true if the message represents
   * a MIDI "Note On" message.
   *
   * A "Note On" message has a first byte of the form "1001nnnn", where "nnnn"
   * is a MIDI Channel number (we ignore this channel number). The third byte is
   * the velocity of the key pressed. If this value is 0, then we consider the
   * message a "Note Off" message.
   */
  midi.isNoteOnMessage = function(midiMsg) {
    var statusByte = midiMsg[0];
    if ((statusByte >> 4) === midi.NOTE_ON_START) {
      var velocityByte = midiMsg[2];
      return velocityByte !== 0;
    } else {
      return false;
    }
  };

  /**
   * Takes in a midi message in the form of a Uint8Array (as given by the data
   * attribute of a MIDIMessageEvent) and returns true if the message represents
   * a MIDI "Note Off" message.
   *
   * A "Note Off" message can be represented in a couple different ways. The
   * first is by a message whose status (first) byte is of the form "1000nnnn"
   * (where nnnn corresponds to the channel; we ignore this). The second is by a
   * message whose status byte is of the form "1001nnnn" AND has a velocity byte
   * of 0.
   */
  midi.isNoteOffMessage = function(midiMsg) {
    var statusByte = midiMsg[0];
    var statusByteStart = statusByte >> 4;
    if (statusByteStart === midi.NOTE_OFF_START) {
      return true;
    } else if (statusByteStart === midi.NOTE_ON_START) {
      var velocityByte = midiMsg[2];
      return velocityByte === 0;
    } else {
      return false;
    }
  };

  /**
   * Takes in a midi message in the form of a Uint8Array (as given by the data
   * attribute of a MIDIMessageEvent) and returns true if the message represents
   * a MIDI "Note On" or "Note Off" message.
   *
   * The type of message is determined by the first byte, also known as the
   * "status" byte. If "1000nnnn" or "1001nnnn", it is a "Note On" or "Note Off"
   * message (where nnnn is the midi channel; we ignore this).
   */
  midi.isNoteMessage = function(midiMsg) {
    var statusByte = midiMsg[0];
    var statusByteStart = statusByte >> 4;
    return (statusByteStart === midi.NOTE_ON_START) ||
      (statusByteStart === midi.NOTE_OFF_START);
  };

  /**
   * Given a midi message in the form of a Uint8Array (as given by the data
   * attribute of a MIDIMessageEvent), gets the value of the velocity of the
   * event and returns it.
   */
  midi.getVelocityFromNoteMessage = function(midiMsg) {
    return midiMsg[2];
  };

  /**
   * Given a midi message in the form of a Uint8Array (as given by the data
   * attribute of a MIDIMessageEvent), gets the value of the midi note the event
   * is for and returns it.
   */
  midi.getNoteFromNoteMessage = function(midiMsg) {
    return midiMsg[1];
  };

  /**
   * Send the provided MIDIOutput object a Note On message to the optional
   * channel (default 0) for the provided note value with the provided velocity
   * at optional time time (default now).
   *
   * The function takes in an argument object with the following attributes:
   * - midiOutput: a MIDIOutput device to send the MIDI message to
   * - time: double representing time in milliseconds from the time origin at
   *   which to send the message; defaults to 0 (this will play immediately)
   * - note: integer representing the midi note value to send (0-127)
   * - velocity: integer representing the velocity value to send (0-127)
   * - channel: integer representing which channel to send the note to; defaults
   *   to 0
   */
  midi.sendNoteOn = function(args) {
    var time = (args.time === undefined) ? 0 : args.time;
    var channel = (args.channel === undefined) ? 0 : args.channel;
    var statusByte = (midi.NOTE_ON_START << 4) | channel;
    args.midiOutput.send([statusByte, args.note, args.velocity], time)
  };

  /**
   * Send the provided MIDIOutput object a Note Off message to the optional
   * channel (default 0) for the provided note value at optional time time
   * (default now).
   *
   * The function takes in an argument object with the following attributes:
   * - midiOutput: a MIDIOutput device to send the MIDI message to
   * - time: double representing time in milliseconds from the time origin at
   *   which to send the message; defaults to 0 (this will play immediately)
   * - note: integer representing the midi note value to send (0-127)
   * - channel: integer representing which channel to send the note to; defaults
   *   to 0
   */
  midi.sendNoteOff = function(args) {
    var time = (args.time === undefined) ? 0 : args.time;
    var channel = (args.channel === undefined) ? 0 : args.channel;
    var statusByte = (midi.NOTE_OFF_START << 4) | channel;
    args.midiOutput.send([statusByte, args.note, 0], time)
  };

  /**
   * Send the provided MIDIOutput object a Note On message to the optional
   * channel (default 0) for the provided note value with the provided velocity
   * at optional time onTime (default now), then send a Note Off message
   * for the provided note value at time offTime.
   *
   * The function takes in an argument object with the following attributes:
   * - midiOutput: a MIDIOutput device to send the MIDI commands to
   * - onTime: double representing time in milliseconds from the time origin at
   *   which to start the note; defaults to 0 (this will play immediately)
   * - offTime: double representing time in milliseconds from the time origin at
   *   which to stop the note
   * - note: integer representing the midi note value to send (0-127)
   * - velocity: integer representing the velocity value to send (0-127)
   * - channel: integer representing which channel to send the note to; defaults
   *   to 0
   */
  midi.sendNote = function(args) {
    var onTime = (args.onTime === undefined) ? 0 : args.onTime;
    var channel = (args.channel === undefined) ? 0 : args.channel;
    midi.sendNoteOn({
      "midiOutput": args.midiOutput,
      "note": args.note,
      "time": args.onTime,
      "velocity": args.velocity,
      "channel": channel
    });
    midi.sendNoteOff({
      "midiOutput": args.midiOutput,
      "note": args.note,
      "time": args.offTime,
      "channel": channel
    });
  };

  /**
   * Given a MIDIOutput object, send a Note Off message to every (note, channel)
   * combination.
   */
  midi.panic = function(midiOutput) {
    for (var channel=0; channel<16; channel++) {
      for (var note=0; note<128; note++) {
        midi.sendNoteOff({
          "midiOutput": midiOutput,
          "time": 0,
          "channel": channel,
          "note": note
        });
      }
    }
  };
})();
