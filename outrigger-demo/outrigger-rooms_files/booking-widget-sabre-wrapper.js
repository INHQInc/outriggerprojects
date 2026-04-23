/**
 * Wrap Sabre Widget Events
 */
(function ($, window, undefined) {
  var Console = window.DebugConsole(
    new URLSearchParams(window.location.search).get("debug") !== null
  );

  /**
   * Helper function to create global (window context) function.
   * @param {*} fn
   * @return {string} function name
   */
  function createGlobalFunc(fn) {
    var id = createGlobalFunc.guid++;
    var name = "___fnSabreWidgetEvent_" + id;
    window[name] = fn;
    return name;
  }
  createGlobalFunc.guid = 1;

  var Sabre = {
    guid: 1,
    allowedEvents: [
      "onApiResponse",
      "onDaySelect",
      "onError",
      "onMonthChange",
      "onSubmit",
    ],

    init: function (widget) {
      $(widget).each(function () {
        Sabre._init(this);
      });
    },

    _init: function (widget) {
      if (!widget._sabreWidgetEventGuid) {
        widget._sabreWidgetEventGuid = Sabre.guid++;
      }

      for (var i = 0; i < Sabre.allowedEvents.length; i++) {
        Sabre.bindWidgetEvent(widget, Sabre.allowedEvents[i]);
      }
    },

    bindWidgetEvent: function (widget, eventName) {
      var oldEvent = widget[eventName];

      if (
        oldEvent &&
        typeof oldEvent === "string" &&
        oldEvent.match(/^___fnSabreWidgetEvent_/)
      ) {
        // already done
        return;
      }

      if (typeof oldEvent !== "string") {
        oldEvent = "";
      }

      var newEventHandler = Sabre.createWidgetEventHandler(
        widget,
        eventName,
        oldEvent
      );
      var newEvent = createGlobalFunc(newEventHandler);
      widget[eventName] = newEvent;
    },

    createWidgetEventHandler: function (widget, eventName, oldEvent) {
      return function () {
        Console.debug("sabre widget event fired", eventName, widget, arguments);

        var args = Array.prototype.slice.call(arguments, 0);

        if (oldEvent && typeof window[oldEvent] === "function") {
          window[oldEvent].apply(widget, args);
        }

        $(widget).trigger("sabrewidget:" + eventName, args);
      };
    },

    createGlobalFunc: createGlobalFunc,
  };

  window.SabreWidgetEventUtils = Sabre;
})(jQuery, window);

/**
 * Wrap sabre widget from vendor for consistency use and easier maintenance because
 *   it still have many bugs and being updated
 */
(function ($, window) {
  var Console = window.DebugConsole(
    new URLSearchParams(window.location.search).get("debug") !== null
  );
  var parseUrl = window.parseUrl;
  var RATE_ERROR_CODES = [
    "InvalidPromoOrCorporateCode",
    "InvalidGroupCode",
    "InvalidRate",
  ];
  var UNKNOWN_ERROR_MESSAGE =
    "Something wrong. Please refresh your page and try again.";

  var SabreWidgetWrapper = function (element) {
    this.el = $(element);
    this.init();
  };

  $.extend(SabreWidgetWrapper.prototype, {
    init: function () {
      this.elWidget = this.el.is("sabre-shs-widgets-calendar")
        ? this.el
        : this.el.find("sabre-shs-widgets-calendar");
      if (!this.elWidget || !this.elWidget.length) {
        this.error = "widget_not_found";
        return;
      }

      this.setupWidget();
    },

    setupWidget: function () {
      this.widget = this.elWidget[0];
      this.widget.renderSpinner = `
    

         <div class="spinner-border" role="status">
           <span class="visually-hidden">Loading...</span>
         </div>
			`;

      var labelsData = {};
      try {
        labelsData = JSON.parse(this.widget.labels);
      } catch {
        labelsData = {};
      }
      this.widget.renderLegend = `
				<div class="shs-widgets--calendar--legend">
					<ul>
						<li class="shs-widgets--calendar--legend__restricted">${
              labelsData["shs-widgets--calendar.legend.NotAvailable"] ||
              "Not Available"
            }</li>
						<li class="shs-widgets--calendar--legend__selected">${
              labelsData["shs-widgets--calendar.legend.Selected"] || "Selected"
            }</li>
					</ul>
				</div>
			`;

      if (this.elWidget.attr("start-Date") && this.elWidget.attr("end-Date")) {
        var startDate = new Date(this.elWidget.attr("start-Date"));
        var endDate = new Date(this.elWidget.attr("end-Date"));

        if (this._isValidDate(startDate) && this._isValidDate(endDate)) {
          this.selectedDate = {
            from: startDate,
            to: endDate,
          };
          this.hasFirstTwoDatesSelected = false;
        }
      }

      this.widgetData = this.retrieveWidgetData();

      // make sure we don't apply accessCode, rateFilter, and rate at the same time
      // priority order: accessCode, rateFilter, and rate
      this._prioritizeSpecialRates(true);

      this.initWidgetEvents();

      this.tmpPatch();

      if (this.canSwitchMonth) {
        this.addMonthPicker();
      }
    },

    tmpPatch: function () {
      var comp = $(".shs-widgets--calendar--component", this.el);
      var stateNode = null;
      var mainStateNode = null;
      var self = this;

      if (comp.length) {
        comp = comp[0];
        try {
          for (var k in comp) {
            if (k.startsWith("__reactInternalInstance$")) {
              stateNode =
                comp[k]["return"] && comp[k]["return"]["stateNode"]
                  ? comp[k]["return"]["stateNode"]
                  : null;
              break;
            }
          }
        } catch (err) {
          //
          stateNode = null;
        }
      }

      if (stateNode) {
        this.canSwitchMonth = true;
        this.widget.gotoMonth = function (d) {
          var dd;
          var today = moment().date(1);
          if (d instanceof Date) {
            dd = moment(d).date(1);
          } else {
            dd = moment()
              .date(1)
              .month(d - 1);
          }

          if (
            dd.year() < today.year() ||
            (dd.year() <= today.year() && dd.month() < today.month())
          ) {
            // prevent going to past
            dd = today;
          }

          stateNode.showMonth(dd.toDate());
        };

        this.widget.getCurrentMonth = function () {
          return stateNode.state.currentMonth;
        };

        if (
          !this.widget.startDate &&
          !this.widget.endDate &&
          stateNode.state.currentMonth
        ) {
          if (
            stateNode.state.currentMonth.getMonth() !==
            moment().toDate().getMonth()
          ) {
            this.widget.gotoMonth(moment().toDate().getMonth() + 1);
          }
        }
      } else {
        this.canSwitchMonth = false;
      }

      if (mainStateNode && stateNode) {
        this.setWidgetSelectedDates = function (from, to) {
          from = moment(from).toDate();
          to = moment(to).toDate();
          mainStateNode.setState(
            {
              from: from,
              to: to,
              enteredTo: to,
            },
            function () {
              self.saveWidgetState(mainStateNode.getState());
              stateNode.showMonth(from);
            }
          );
        };
      }
    },

    addMonthPicker: function () {
      this.elWidget.on(
        "click",
        ".DayPicker-Caption",
        function (ev) {
          this.showMonthPicker();
        }.bind(this)
      );
    },

    showMonthPicker: function () {
      if (!this.monthPicker) {
        this.monthPicker = new SabreWidgetMonthPicker(this.el);
        this.el.on(
          "sabreMonthPicker:onMonthSelect",
          function (ev, selectedMonth) {
            this.widget.gotoMonth(selectedMonth);
          }.bind(this)
        );
      }

      this.monthPicker.initState(this.widget.getCurrentMonth()).show();
    },

    initWidgetEvents: function () {
      SabreWidgetEventUtils.init(this.widget);

      this.el.on("sabrewidget:onDaySelect", this._onWidgetDaySelect.bind(this));
      this.el.on("sabrewidget:onError", this._onWidgetError.bind(this));
      this.el.on(
        "sabrewidget:onApiResponse",
        this._onWidgetApiResponse.bind(this)
      );
      this.el.on("sabrewidget:onSubmit", this._onWidgetSubmit.bind(this));
      /*
			this.el.on('sabrewidget:onMonthChange', function() {
				console.debug('sabrewidget:onMonthChange', arguments);
			}.bind(this));
			*/
    },

    retrieveWidgetData: function () {
      var data = Object.assign(
        {},
        {
          hotel: this.widget.hotel,
          rateList: this.widget.rateList
            ? JSON.parse(this.widget.rateList) || []
            : [],
          rateFilterList: this.widget.rateFilterList
            ? JSON.parse(this.widget.rateFilterList) || []
            : [],
          accessCode: this.widget.accessCode,
          accessCodeType: this.widget.accessCodeType,
          adult: this.widget.adult,
          child: this.widget.child,
          rooms: this.widget.rooms,
          //bookingParameters: parseUrl('foo?' + this.elWidget.attr('booking-parameters') || '', {}, true).query
          bookingParameters: this.elWidget.attr("booking-parameters"),
        }
      );

      return data;
    },

    getElement: function () {
      return this.elWidget;
    },

    getSubmitButton: function () {
      return this.elWidget.find(".shs-widgets--calendar--button").eq(0);
    },

    getWidgetData: function (key) {
      if (key === null || key === undefined || typeof key !== "string") {
        return this.widgetData;
      }

      return this.widgetData[key];
    },

    getWidgetProp: function (key) {
      return this.widget[key];
    },

    /**
     * set sabre widget data
     *
     * @param {string|Object} key
     * @param {*} value
     */
    setWidgetData: function (key, value) {
      if ($.isPlainObject(key)) {
        this.widgetData = $.extend(this.widgetData, key);
      } else {
        this.widgetData[key] = value;
      }

      this._prioritizeSpecialRates();

      if (
        (!this.widget.props.hotel || !this.widgetData.hotel) &&
        this.widgetState
      ) {
        this.widgetState = this._fixStateUrlQuery(this.widgetState);
      }
    },

    /**
     * Apply data to Sabre widget
     *
     * @param {*} forceRefresh
     */
    applyWidgetData: function () {
      var widget = this.widget;
      var widgetData = this.widgetData;
      
      if (
        (widgetData.rateList && widgetData.rateList.length) ||
        (widgetData.rateFilterList && widgetData.rateFilterList.length) ||
        (widgetData.accessCode && widgetData.accessCodeType) || 
        (widgetData.roomList && widgetData.roomList.length)
      ) {
        widgetData.onlyCheckRequested = true;
      } else {
        widgetData.onlyCheckRequested = false;
      }

      var props = {};
      $.each(widgetData, function (key, value) {
        props[key] = value;
      });

      Console.debug("applyWidgetData", widget, props);

      widget.props = props;

      if (!widget.props.hotel && this.widgetState) {
        this.widgetState = this._fixStateUrlQuery(this.widgetState);
      }

      props = null;
      widgetData = null;
      widget = null;
    },

    /**
     * Save last state from sabre widget
     * @param {*} state
     */
    saveWidgetState: function (state) {
      state = this._fixStateUrlQuery(state);
      this.widgetState = {
        from: state ? state.from : undefined,
        to: state ? state.to : undefined,
        urlQuery: state ? state.urlQuery : undefined,
        currency: state && state.response ? state.response.currency : undefined,
        prices: state && state.response ? state.response.prices : undefined,
        error: state ? state.error : undefined,
        priceForStay: state ? state.priceForStay : undefined,
        restrictionStay: state ? state.restrictionStay : undefined,
        restrictions: state ? state.restrictions : undefined,
      };

      if (this.widgetState.from && this.widgetState.to) {
        this.selectedDate = {
          from: this.widgetState.from,
          to: this.widgetState.to,
        };
      } else {
        this.selectedDate = null;
      }
    },

    getWidgetState: function (key) {
      if (key === null || key === undefined || typeof key !== "string") {
        return this.widgetState || {};
      }

      return this.widgetState ? this.widgetState[key] : undefined;
    },

    getSelectedDate: function () {
      if (this.selectedDate && this.selectedDate.from && this.selectedDate.to) {
        return this.selectedDate;
      }

      return false;
    },

    getParsedUrlQuery: function () {
      var state = this.getWidgetState();
      if (state && state.urlQuery) {
        return parseUrl(state.urlQuery, {}, true).query;
      }

      return false;
    },

    getSelectedDateFormatted: function () {
      if (this.selectedDate && this.selectedDate.from && this.selectedDate.to) {
        var selectedDates = [];
        selectedDates.push(moment(this.selectedDate.from).format("MMMM D"));
        selectedDates.push(moment(this.selectedDate.to).format("MMMM D, YYYY"));

        return selectedDates.join(" - ");
      }

      return false;
    },

    /**
     * Get special rate/ promo/ corporate/ group error message from widget
     *
     */
    getRateErrorMessage: function () {
      // shs-widgets--calendar--error alert alert-danger fade show
      var copyFrom = [".shs-widgets--calendar--error"];
      var errMessage = false;

      if (this.widgetState && this.widgetState.error) {
        var state = this.widgetState;
        if (RATE_ERROR_CODES.includes(state.error)) {
          for (var i = 0; i < copyFrom.length; i++) {
            var elErr = $(this.elWidget.find(copyFrom[i]));
            if (elErr.length) {
              errMessage = elErr.html();
              break;
            }
          }
        }
      }

      return errMessage;
    },

    /**
     * Get widget errors (other then rate related errors)
     */
    getWidgetErrorMessage: function () {
      // shs-widgets--calendar--error alert alert-danger fade show
      // shs-widgets--calendar--restriction alert alert-warning fade show
      var copyFrom = [
        ".shs-widgets--calendar--error",
        ".shs-widgets--calendar--restriction",
      ];
      var errMessage = false;

      if (
        this.widgetState &&
        this.widgetState.error &&
        RATE_ERROR_CODES.includes(this.widgetState.error)
      ) {
        // ignore rate related errors here
      } else {
        for (var i = 0; i < copyFrom.length; i++) {
          var elErr = $(this.elWidget.find(copyFrom[i]));
          if (elErr.length) {
            errMessage = elErr.html();
            break;
          }
        }
      }

      if (!errMessage) {
        // handle unknown error
        if (this.widgetState && this.widgetState.error === "unknown") {
          errMessage = UNKNOWN_ERROR_MESSAGE;
        }
      }

      return errMessage;
    },

    _onWidgetApiResponse: function (ev, resp, state) {
      if (!this.widget) {
        return;
      }

      Console.debug("_onWidgetApiResponse", resp);
      Console.debug("_onWidgetApiResponse", state);

      if (
        resp &&
        resp.LeadAvailabilityList &&
        resp.LeadAvailabilityList.length > 1
      ) {
        // this is a response from sabre widget (internal) request to fill the calendar with rates (prices)
        // we don't have to propagate this to our widget except when there are no dates selected.
        // when there are no dates selected - we have to propagate to our widget so it can end the loading state.
        if (this.getSelectedDate()) {
          Console.debug(
            "ignore api response with multiple LeadAvailabilityList"
          );
          ev.stopPropagation();
          ev.preventDefault();
          return;
        }
      }

      /*

			if (!this.hasFirstTwoDatesSelected) {
				this.hasFirstTwoDatesSelected = true;
			}
			else {
				if (!this.cancelApiResponseOnce) {
					this.cancelApiResponseOnce = true;
					if (this.getSelectedDate()) {
						Console.debug('cancelled _onWidgetApiResponse');
						ev.stopPropagation();
						ev.preventDefault();
						return;
					}
				}
			}

			this.cancelApiResponseOnce = false;

			if (state.from && state.to) {
				this.hasFirstTwoDatesSelected = true;
			}

            this.saveWidgetState(state);

			*/

      this.saveWidgetState(state);
    },

    _onWidgetSubmit: function (ev, state) {
      if (!this.widget) {
        return;
      }

      Console.debug("_onSabreWidgetSubmit", arguments);
    },

    /**
     * Sabre widget day change handler
     */
    _onWidgetDaySelect: function (ev, from, to, restrictios, state) {
      if (!this.widget) {
        return;
      }

      var data = {
        from: from,
        to: to,
      };

      if (from && to) {
      } else {
        this.hasFirstTwoDatesSelected = false;
      }

      this.saveWidgetState(state);

      Console.debug(
        "_onSabreWidgetDayChange",
        this.selectedDate,
        this.hasFirstTwoDatesSelected,
        this.newDateSelected
      );
    },

    /**
     * Sabre widget error handler
     *
     * @param {*} data
     */
    _onWidgetError: function (ev, errCode, resp, state) {
      if (!this.widget) {
        return;
      }

      if (typeof errCode === "object") {
        state = resp;
        errCode = state.error;
      }

      if (!errCode) {
        errCode = state.error = "unknown";
      }

      Console.debug("_onSabreWidgetError", arguments);
      Console.debug("_onSabreWidgetError", errCode, state);

      this.saveWidgetState(state);
    },

    /**
     * the _onDayChange state data returns depart=Invalid Date even the 'to' date is selected
     * fix it
     * @param {*} state
     */
    _fixStateUrlQuery: function (state) {
      Console.debug("_fixStateUrlQuery", state);

      if (state.urlQuery) {
        var query = parseUrl(state.urlQuery, {}, true).query || {};

        if (
          state.from &&
          state.to &&
          this._isValidDate(state.from) &&
          this._isValidDate(state.to)
        ) {
          Console.debug("_fixStateUrlQuery", query);
          if (
            !query.arrive ||
            !this._isValidDate(query.arrive) ||
            !query.depart ||
            !this._isValidDate(query.depart)
          ) {
            query.arrive = moment(state.from).format("YYYY-MM-DD");
            query.depart = moment(state.to).format("YYYY-MM-DD");
          }
          Console.debug("_fixStateUrlQuery", state.urlQuery);
        }

        if (typeof query.rooms === "undefined" && this.widgetData.rooms) {
          query.rooms = this.widgetData.rooms;
        }

        if (!this.widgetData.hotel) {
          delete query.hotel;
        }

        //if ((typeof query.hotel === 'undefined' || !query.hotel) && this.widgetData) {
        Console.debug(this.widgetData);
        query.rooms = this.widgetData.rooms;
        query.adult = this.widgetData.adult;
        query.child = this.widgetData.child;

        if (this.widgetData.accessCode) {
          if (this.widgetData.accessCodeType === "Group") {
            query.group = this.widgetData.accessCode;
          } else if (this.widgetData.accessCodeType === "Promotion") {
            query.promo = this.widgetData.accessCode;
          } else if (this.widgetData.accessCodeType === "Corporate") {
            query.promo = this.widgetData.accessCode;
          }

          delete query.rate;
          delete query.filter;
        }

        if (
          this.widgetData.rateFilterList &&
          this.widgetData.rateFilterList.length
        ) {
          query.filter = this.widgetData.rateFilterList.join(",");
          delete query.rate;
          delete query.group;
          delete query.promo;
        } else if (
          this.widgetData.rateList &&
          this.widgetData.rateList.length
        ) {
          query.rate = this.widgetData.rateList.join(",");
          delete query.filter;
          delete query.group;
          delete query.promo;
        }
        //}

        Console.debug($.extend(true, {}, query));

        state.urlQuery = "?" + $.param(query);
      }

      return state;
    },

    _prioritizeSpecialRates: function (reapply = false) {
      if (!this.widgetData) {
        return;
      }

      var _reapply = false;

      if (this.widgetData.accessCode && this.widgetData.accessCodeType) {
        this.widgetData.rateFilterList = [];
        this.widgetData.rateList = [];
        _reapply = true;
      } else if (
        this.widgetData.rateFilterList.length &&
        this.widgetData.rateList.length
      ) {
        this.widgetData.rateList = [];
        this.widgetData.accessCode = "";
        this.widgetData.accessCodeType = "";
        _reapply = true;
      } else if (this.widgetData.rateList && this.widgetData.rateList.length) {
        this.widgetData.accessCode = "";
        this.widgetData.accessCodeType = "";
        _reapply = true;
      }

      if (_reapply && reapply) {
        window.setTimeout(
          function () {
            this.applyWidgetData();
          }.bind(this)
        );
      }
    },

    /**
     * Check valid date
     * @param {*} d
     */
    _isValidDate: function (d) {
      if (d instanceof Date) {
        return d.getTime() === d.getTime();
      }

      try {
        var tmp = new Date(d);
        return tmp.getTime() === tmp.getTime();
      } catch (err) {
        return false;
      }
    },
  });

  window.SabreWidgetWrapper = SabreWidgetWrapper;
})(jQuery, window);
