/**
 * Wrap console to easily hide console debug message without have to comment in/out codes
 */
(function (window, undefined) {
  var noop = function () {};

  function DebugConsole(debug = false) {
    if (!(this instanceof DebugConsole)) {
      return new DebugConsole(debug);
    }

    this._debug = debug;
  }

  if (console !== undefined) {
    DebugConsole.prototype.log = console.log;
    DebugConsole.prototype.error = console.error;
    DebugConsole.prototype.warn = console.warn;
    DebugConsole.prototype.debug = function () {
      if (this._debug) {
        console.log.apply(window, arguments);
      }
    };
  } else {
    DebugConsole.prototype.log = noop;
    DebugConsole.prototype.debug = noop;
    DebugConsole.prototype.warn = noop;
    DebugConsole.prototype.error = noop;
  }

  window.DebugConsole = DebugConsole;
})(window);
