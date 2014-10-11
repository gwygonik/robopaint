/**
 * @file Holds central controller objects and DOM management code for RoboPaint
 * modes that leverage SVG and path tracing functions.
 *
 * AMD Module format for inclusion via RequireJS.
 */

define(function(){return function($, robopaint, cncserver){

// Give cncserver semi-global scope so it can easily be checked elsewhere
// TODO: Maybe this can be done with some kind of fancy inter-mode API? :P
// Or is this even needed?
window.cncserver = cncserver;


// Set the "global" scope objects for any robopaint level details.
// These are used for positioning and tracing SVG via a central SVG object
cncserver.canvas = {
  height: robopaint.canvas.height,
  width: robopaint.canvas.width,
  scale: 1,
  offset: {
    top: 20,
    left: 235
  }
};

// TODO: How much of this is helpful for just SVG tracing modes/vs helpful for
// ALL modes??
cncserver.state = {
  pen: {}, // The state of the pen/machine at the end of the buffer
  actualPen: {}, // The current state of the pen/machine
  buffer: [], // Holds a copy of cncserver's internal command buffer
  media: '', // What we think is currently on the brush
  mediaTarget: '', // What we "want" to paint with
  process: {
    name: 'idle',
    waiting: false,
    busy: false,
    paused: false,
    max: 0
  }
};

cncserver.config = {
  colors: robopaint.statedata.colorsets[robopaint.settings.colorset].colors,
  canvasDebug: false, // Debug mode for helping find canvas offsets
  checkVisibility: true
};

$(function() {
  var $svg = $('svg#main');

  serverConnect(); // "Connect", and get the initial pen state

  // Bind the Stream event callbacks ===========================================

  // Use direct buffer if local, otherwise rely on socket.io
  if (robopaint.cncserver.api.server.domain == 'localhost') {
    robopaint.cncserver.penUpdateTrigger = penUpdateEvent;
    robopaint.cncserver.bufferUpdateTrigger = bufferUpdateEvent;
  } else {
    robopaint.socket.on('buffer update', bufferUpdateEvent);
    robopaint.socket.on('pen update', penUpdateEvent);
  }

  // CNCServer Buffer Change events (for pause, update, or resume)
  var bufferLen = 0;
  function bufferUpdateEvent(b){
    // Because this is connected to code outside its window, need to kill it
    // if we're still running once it's been closed.
    if (!console) {window.removeListeners(); return;}

    // Break out important buffer states into something with wider scope
    cncserver.state.process.busy = b.bufferRunning;
    cncserver.state.buffer = b.buffer;
    cncserver.state.process.paused = b.bufferPaused;

    // Empty buffer?
    if (!b.buffer.length) {
      cncserver.state.process.max = 0;
      bufferLen = 0;
      cncserver.cmd.progress({val: 0, max: 0});
    } else { // At least one item in buffer
      // Update the progress bar

      // Did the buffer go up? up the max
      if (b.buffer.length > bufferLen) {
        cncserver.state.process.max++;
      }
      bufferLen = b.buffer.length;

      cncserver.cmd.progress({
        val: cncserver.state.process.max - bufferLen,
        max: cncserver.state.process.max
      });
    }
  }

  var lastPen = {};
  function penUpdateEvent(actualPen){
    // Because this is connected to code outside its window, need to kill it
    // if we're still running once it's been closed.
    if (!console) {window.removeListeners(); return;}

    var animPen = {};
    cncserver.state.actualPen = $.extend({}, actualPen);

    // TODO: Add animation between points
    /*if (pen.lastDuration > 250) {
      animPen = $.extend({}, lastPen);
      $(lastPen).animate({ x:pen.x, y: pen.y  }, {
        duration: pen.lastDuration - 5,
        easing: 'linear',
        step: function(val, fx) {
          animPen[fx.prop] = val;
          moveDrawPoint(animPen);
        }
      });

    } else {*/
      //$(lastPen).stop();
      moveDrawPoint(actualPen);
      lastPen = $.extend({}, cncserver.state.actualPen);
    //}

    // Update button text/state
    var toState = 'up';
    if (cncserver.state.actualPen.state == "up" || cncserver.state.actualPen.state == 0){
      toState = 'down';
    }
    $('#pen').attr('class','normal ' + toState);
  }

  // Handle buffer status messages
  robopaint.socket.on('message update', messageUpdateEvent);
  function messageUpdateEvent(data){
    cncserver.wcb.status(data.message);
  }

  // Remove globalized listeners from this local container/window
  window.removeListeners = function() {
    if (robopaint.cncserver.api.server.domain == 'localhost') {
      robopaint.cncserver.penUpdateTrigger = null;
      robopaint.cncserver.bufferUpdateTrigger = null;
    } else {
       robopaint.socket.removeListener('buffer update', bufferUpdateEvent);
       robopaint.socket.removeListener('pen update', penUpdateEvent);
    }

    robopaint.socket.removeListener('message update', messageUpdateEvent);
  }

  /**
   * Move the point that the bot should be drawing
   *
   * @param {{x: Number, y: Number}} p
   *   Coordinate of the total bot maxArea (to be converted)
   */
  function moveDrawPoint(p) {
    // Move visible drawpoint
    $('#drawpoint').show().attr('fill', cncserver.state.pen.state ? '#FF0000' : '#00FF00');

    p = cncserver.wcb.getStepstoAbsCoord(p);
    $('#drawpoint').attr('transform', 'translate(' + p.x + ',' + p.y + ')');
  }

  // Set the height based on set aspect ratio / global width
  $svg.add('#shadow').height(robopaint.canvas.height);

  // Initial server connection handler
  function serverConnect() {
    // Get initial pen data from server
    if (cncserver.wcb) cncserver.wcb.status('Connecting to bot...');

    // Ensure bot is cleared and ready to receive commands at startup
    robopaint.cncserver.api.buffer.clear();
    robopaint.cncserver.api.buffer.resume();

    // Bind to API toolChange
    robopaint.$(robopaint.cncserver.api).bind('toolChange', function(toolName){
      cncserver.state.media = toolName;
    });

    robopaint.cncserver.api.pen.stat(function(d){
      cncserver.wcb.status(['Connected Successfully!'], d);
      cncserver.state.pen.state = 1; // Assume down
      robopaint.cncserver.api.pen.up(); // Send to put up
      cncserver.state.pen.state = 0; // Assume it's up (doesn't return til later)

      // Default last tool to given in returned state
      if (cncserver.state.pen.tool) {
        cncserver.state.media = cncserver.state.pen.tool;
      } else {
        cncserver.state.media = "water0";
      }

      // Default target to "current" media on startup
      cncserver.state.mediaTarget = cncserver.state.media;

      // Set the Pen state button
      $('#pen').addClass(!cncserver.state.pen.state ? 'down' : 'up');
      if (window.bindControls) window.bindControls();

      parent.fadeInWindow(); // Actually show the mode window
    });
  }

  // Public function to load in SVG
  cncserver.canvas.loadSVG = function(file) {
    // If we've been given a filename, go load it in then try again
    if (typeof file == 'string') {
      $.ajax({
        url: 'svgs/' + file,
        dataType: 'text',
        success: function(data){
          localStorage["svgedit-default"] = data;
          loadSVG();
        }
      });
      return;
    }

    // Load default content from SVG-edit
    if (localStorage["svgedit-default"]){
      $('svg#main g#cncserversvg').empty();
      $('svg#main g#cncserversvg').append(localStorage["svgedit-default"]);

      // Convert anything not a path into a path for proper tracing
      cncserver.paths.changeToPaths('svg#main g#cncserversvg');
    }

    if (cncserver.canvas.loadSVGCallback) {
      cncserver.canvas.loadSVGCallback();
    }
  }

});

// Triggered on before close or switch mode, call callback to complete operation
window.onClose = function(callback, isGlobal) {
  if (cncserver.state.buffer.length) {
    var r = confirm("Are you sure you want to go?\n\
Exiting print mode while printing will cancel all your jobs. Click OK to leave.");
    if (r == true) {
      unBindEvents(callback); // Cleanup, close, continue
    }
  } else {
    unBindEvents(callback);  // Cleanup, close, continue
  }
}

// When closing, make sure to tidy up bound events
// TODO: Namespace this to ensure only the ones we set are cleaned up
// jQuery namespacing for custom bind events (http://api.jquery.com/bind/)
// allows for unbinding of only namespaced bound events, instead of ALL events
// bound to things like "updatePen". Currently there's nothing globally using
// any of these bind events, but there could be in the future. Exactly what
// they'd be namespaced to is unclear, as this is used by both Auto and manual
// paint modes. Maybe "updatePen.paint".. etc?
window.unBindEvents = function (callback) {
  window.removeListeners();
  robopaint.$(robopaint.cncserver.api).unbind('updatePen');
  robopaint.$(robopaint.cncserver.api).unbind('toolChange');
  robopaint.$(robopaint.cncserver.api).unbind('offCanvas');
  robopaint.$(robopaint.cncserver.api).unbind('movePoint');

  // Clear CNC Server Buffer and set to resume state
  cncserver.state.buffer = [];
  cncserver.state.process.paused = true;
  robopaint.cncserver.api.buffer.resume(function(){
    robopaint.cncserver.api.buffer.clear(function(){
      robopaint.cncserver.api.pen.park();
      if (callback) callback();
    });
  });

}
}});