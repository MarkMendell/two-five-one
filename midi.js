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
   * a MIDI "Note On" or "Note Off" message.
   *
   * The type of message is determined by the first byte, also known as the
   * "status" byte. If "1000nnnn" or "1001nnnn", it is a "Note On" or "Note Off"
   * message (where nnnn is the midi channel; we ignore this).
   */
  midi.isNoteMessage = function(midiMsg) {
    var statusByte = midiMsg[0];
    var statusByteStart = statusByte >> 4;
    return (statusByteStart == midi.NOTE_ON_START) ||
      (statusByteStart == midi.NOTE_OFF_START);
  };

  /**
   * Given a MIDIOutput object, send a Note Off message to every (note, channel)
   * combination.
   */
  midi.panic = function(midiOutput) {
    for (var channel=0; channel<16; channel++) {
      var statusByte = (midi.NOTE_OFF_START << 4) | channel;
      for (var note=0; note<128; note++) {
        midiOutput.send([statusByte, note, 0]);
      }
    }
  };
})();
