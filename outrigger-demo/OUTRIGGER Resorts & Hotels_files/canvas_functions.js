var SEMICOLON = SEMICOLON || {};

(function ($) {
  "use strict";

  SEMICOLON.initialize = {
    init: function () {
      SEMICOLON.initialize.defaults();
    },

    execFunc: function (functionName, context) {
      let args = Array.prototype.slice.call(arguments, 2),
        namespaces = functionName.split("."),
        func = namespaces.pop();

      for (let i = 0; i < namespaces.length; i++) {
        context = context[namespaces[i]];
      }

      if (typeof context[func] !== "undefined") {
        return context[func].apply(context, args);
      } else {
        console.log(functionName + " Function does not exist");
      }
    },

    execPlugin: function (element, settings) {
      window.scwEvents = window.scwEvents || {};
      let pluginActive = false;

      if (settings.trigger && !scwEvents[settings.trigger]) {
        let pluginLinkingInterval = setInterval(function () {
          let pluginFnExec = Function("return " + settings.pluginfn)();
          if (pluginFnExec) {
            $(window).trigger(settings.trigger);
            scwEvents[settings.trigger] = true;
            clearInterval(pluginLinkingInterval);
          }
        }, 1000);
      } else {
        pluginActive = true;
      }

      if (settings.execfn) {
        if (settings.trigger && !pluginActive) {
          $(window).on(settings.trigger, function () {
            SEMICOLON.initialize.execFunc(settings.execfn, window, element);
          });
        } else {
          SEMICOLON.initialize.execFunc(settings.execfn, window, element);
        }
      }

      if (settings.class) {
        $body.addClass(settings.class);
      }
    },

    jsLinking: function (element, settings) {
      SEMICOLON.initialize.execPlugin(element, settings);
    },

    functions: function (settings) {
      let element, parent, item;

      if (typeof settings.element === "object" && settings.element !== null) {
        if (settings.element.parent !== "undefined") {
          parent = settings.element.parent;
        }
        if (settings.element.el !== "undefined") {
          settings.element = settings.element.el;
        }
      }

      if (settings.element) {
        item = settings.element;
      } else {
        item = settings.default;
      }

      if (parent === "object") {
        element = parent.find(item);
      } else {
        element = $(item);
      }

      this.jsLinking(element, settings);
    },

    defaults: function () {},
  };

  SEMICOLON.widget = {
    init: function () {
      SEMICOLON.widget.cartQuantity();
    },

    counter: function (element) {
      let settings = {
        element: element,
        default: ".counter",
        file: "plugins.counter.js",
        error: "plugins.counter.js: Plugin could not be loaded",
        execfn: "SEMICOLON_counterInit",
        pluginfn: "$().countTo",
        trigger: "pluginCounterReady",
        class: "has-plugin-counter",
      };

      SEMICOLON.initialize.functions(settings);
    },

    countdown: function (element) {
      let momentSettings = {
        element: element,
        default: ".countdown",
        file: "components/moment.js",
        error: "components/moment.js: Plugin could not be loaded",
        execfn: false,
        pluginfn: 'typeof moment !== "undefined"',
        trigger: "pluginMomentReady",
        class: "has-plugin-moment",
      };

      let settings = {
        element: element,
        default: ".countdown",
        file: "plugins.countdown.js",
        error: "plugins.countdown.js: Plugin could not be loaded",
        execfn: "SEMICOLON_countdownInit",
        pluginfn: "$().countdown",
        trigger: "pluginCountdownReady",
        class: "has-plugin-countdown",
      };

      SEMICOLON.initialize.functions(momentSettings);
      SEMICOLON.initialize.functions(settings);
    },

    ajaxForm: function (element) {
      let formSettings = {
        element: element,
        default: ".form-widget",
        file: "plugins.form.js",
        error: "plugins.form.js: Plugin could not be loaded",
        execfn: false,
        pluginfn: "$().validate && $().ajaxSubmit",
        class: "has-plugin-form",
      };

      let settings = {
        element: element,
        default: ".form-widget",
        file: "plugins.ajaxform.js",
        error: "plugins.ajaxform.js: Plugin could not be loaded",
        execfn: "SEMICOLON_ajaxFormInit",
        pluginfn: 'typeof scwAjaxFormPlugin !== "undefined"',
        trigger: "pluginAjaxFormReady",
        class: "has-plugin-ajaxform",
      };

      SEMICOLON.initialize.functions(formSettings);
      SEMICOLON.initialize.functions(settings);
    },

    subscription: function (element) {
      let formSettings = {
        element: element,
        default: ".subscribe-widget",
        file: "plugins.form.js",
        error: "plugins.form.js: Plugin could not be loaded",
        execfn: false,
        pluginfn: "$().validate && $().ajaxSubmit",
        class: "has-plugin-form",
      };

      let settings = {
        element: element,
        default: ".subscribe-widget",
        file: "plugins.subscribe.js",
        error: "plugins.subscribe.js: Plugin could not be loaded",
        execfn: "SEMICOLON_subscribeFormInit",
        pluginfn: 'typeof scwSubscribeFormPlugin !== "undefined"',
        trigger: "pluginSubscribeFormReady",
        class: "has-plugin-subscribeform",
      };

      SEMICOLON.initialize.functions(formSettings);
      SEMICOLON.initialize.functions(settings);
    },

    cartQuantity: function () {
      let settings = {
        default: ".qty",
        file: "plugins.quantity.js",
        error: "plugins.quantity.js: Plugin could not be loaded",
        execfn: "SEMICOLON_quantityInit",
        pluginfn: 'typeof scwQuantityPlugin !== "undefined"',
        trigger: "pluginQuantityReady",
        class: "has-plugin-quantity",
      };

      SEMICOLON.initialize.functions(settings);
    },
  };

  SEMICOLON.documentOnReady = {
    init: function () {
      SEMICOLON.widget.init();
    },
  };

  let $body = $("body"),
    $pagemenu = $("#page-menu"),
    $topCart = $("#top-cart");

  $(document).ready(SEMICOLON.documentOnReady.init);
})(jQuery);
