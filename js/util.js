/**
 * This module holds a few helper methods used by different modules.
 */
var util = {};

// This is just a function that calls itself so that we only export variables
// through the util object
(function() {
  /**
   * Given a list of notes, return a copy of that notes list containing copies
   * of each of the notes (not the original objects themselves).
   */
  util.noteListCopy = function(l) {
    var copyList = [];
    for (var i=0; i<l.length; i++) {
      copyList.push(JSON.parse(JSON.stringify(l[i])));
    }
    return copyList;
  };
})()
