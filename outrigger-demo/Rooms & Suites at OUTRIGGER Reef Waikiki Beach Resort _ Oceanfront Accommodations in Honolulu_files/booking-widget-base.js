OUTRIGGER = (function () {
  var OUT = {};
  var local = {
    sels: {
      dropBtn: ".bw-drop-toggle",
      btnText: ".bw-drop-toggle-text",
      simpleDrop: ".bw-simple-drop",
      submitBtn: ".bw-submit-btn, .bwm-submit-btn",
      form: ".bw-form, .bwm-form",
      itemWrapMobile: ".bwm-item-wrap",
      errorMsgMobile: ".bwm-error-msg",
      errorScreenMobile: ".bwm-error-screen",
      errorWrapDesktop: ".bw-error-parent",
      errorMsgDesktop: ".bw-error-msg",
      rbeShellField: "#bwRbeShell",
    },
    data: {
      fieldValue: "data-field-value",
      displayValue: "data-display-text",
      textOverride: "data-simple-select-text",
      validation: "data-bw-validation",
    },
    classes: {
      dropOptionSelected: "bw-option-selected",
      bookBtnActive: "book-btn-active",
      errorStateDesktop: "bw-has-error",
    },
    // events are triggered by the booking widget actions (but do not do things)
    // they signify that the thing has happened
    // so other parts of the code can listen & react on change
    events: {
      openSecondStep: "openSecondStep:bw",
    },
    opts: {
      minStayNights: 0,
    },
    validation: {
      items: [
        {
          id: "destination",
          fields: ["[name=Hotel]", "[name=dest]"],
          errorSels: {
            mobile: "#bwmDestinationErrorMsg",
            desktop: ".bw-destination-wrap",
          },
          trackingError: "destination invalid",
          isValid: function ($context) {
            // destination is valid if either a hotel or subregion is present
            $context = OUT.utils.jqify($context);
            var valid = false;
            var hotelSelected = local.validation.checkFieldForValue(
              $context.find("[name=Hotel]")
            );
            var subRegionPopulated = local.validation.checkFieldForValue(
              $context.find("[name=dest]")
            );
            if (hotelSelected === true || subRegionPopulated === true) {
              valid = true;
            }
            return valid;
          },
        },
        {
          id: "dates",
          fields: ["[name=arrive]", "[name=depart]"],
          errorSels: {
            mobile: "#bwmDateErrorMsg",
            desktop: ".bw-dates-wrap",
          },
          trackingError: "dates invalid",
          isValid: function ($context) {
            // dates are valid if both start & end date are selected
            $context = OUT.utils.jqify($context);
            var valid = false;
            var startValid = local.validation.checkFieldForValue(
              $context.find("[name=arrive]")
            );
            var endValid = local.validation.checkFieldForValue(
              $context.find("[name=depart]")
            );
            if (startValid === true && endValid === true) {
              valid = true;
            }
            return valid;
          },
        },
      ],
    },
  };

  OUT.bookingWidget = {
    version: undefined, // toggle or scrolling
    toggleVersion: {
      active: false,
    },
    horizontalVersionOpen: false, // desktop version open/tall to show addition options
    validation: {
      items: local.validation.items,
    },
    getMinStay: function () {
      return local.opts.minStayNights;
    },
    // the calendar widget wants days, the hotel industry is all about nights...
    getMinStayDays: function () {
      return local.opts.minStayNights + 1;
    },
    setMinStay: function (newMinStay) {
      newMinStay = Number(newMinStay);
      if (newMinStay >= 0) {
        local.opts.minStayNights = newMinStay;
      }
    },
  };

  // simple drops use bootstrap dropdowns
  // on selection, they need to:
  // update a hidden input field for actual form submission
  // update the button text display
  // add on state
  // adults, chidlren, rooms
  local.initSimpleDrops = function bwInitSimpleDrops() {
    $(local.sels.simpleDrop).on("click", "a", function () {
      var $selected = $(this);
      var $container = $selected.parents(local.sels.simpleDrop);
      // reset on state
      $container
        .find(OUT.utils.selectorify(local.classes.dropOptionSelected))
        .removeClass(local.classes.dropOptionSelected);
      // update hidden field
      $container
        .find('input[type="hidden"]')
        .val($selected.attr(local.data.fieldValue))
        .trigger("change");
      // update button text
      $container
        .find(local.sels.btnText)
        .text($selected.attr(local.data.displayValue));
      // add on state
      $selected.addClass(local.classes.dropOptionSelected);
    });
  };

  OUT.bookingWidget.updateButtonText = function bwUpdateButtonText($btn, str) {
    $btn = OUT.utils.jqify($btn);
    $btn.find(local.sels.btnText).text(str);
  };

  // takes the selected option
  // returns the string to update the button with
  OUT.bookingWidget.getButtonText = function bwGetButtonText($optEl) {
    var buttonText;
    $optEl = OUT.utils.jqify($optEl);
    // user override text if available
    var overrideText = $optEl.attr(local.data.textOverride);
    if (_.isUndefined(overrideText) === false && overrideText.length > 0) {
      buttonText = overrideText;
    } else {
      // or just the option text
      buttonText = $optEl.text();
    }
    return buttonText;
  };

  //*** Validation Zone.....

  // validate form on submit
  local.validation.formSetup = function bwmFormSetup() {
    $(local.sels.form)
      .on("submit", function (event) {
        var startVal;
        var endVal;
        var adult;
        var child;
        var $destinationList;
        var destination;
        var $hotelList;
        var $context = $(this); // there's 2 forms: a mobile & a desktop version
        var errorAr = [];
        var trackingErrorAr = [];
        // go through & validate each item
        $.each(local.validation.items, function (index, item) {
          if (item.isValid($context) === false) {
            errorAr.push(item.errorSels);
            // track errors
            trackingErrorAr.push(item.trackingError);
          }
        });
        // show errors if neccessary
        if (errorAr.length > 0) {
          // track errors
          utag.link({
            bookingError: trackingErrorAr.join(", "),
            event_description: "booking error",
          });

          local.validation.showErrorDesktop(_.pluck(errorAr, "desktop"));
          event.preventDefault();
        } else {
          $destinationList = $("#bwDestination");
          startVal = $("#bwDateStartInput").val();
          endVal = $("#bwDateEndInput").val();
          rooms = $("input[name=rooms]").val();
          adult = $("input[name=adult]").val();
          child = $("input[name=child]").val();
          destination = $("#bwSubregionCode").val();
          $hotelList = $context.find('input[name="hotellist"]');

          // If selected All Properties
          if ($destinationList.val() == "") {
            // remove Hotel from form
            $destinationList.removeAttr("name");
          }

          // If selected a destination
          if (destination != "") {
            // remove HotelList from form
            $hotelList.removeAttr("name");
          }

          // determine if OBC is selected
          if ($destinationList.val() == "54321") {
            var checkinDate = new Date(startVal);
            var checkoutDate = new Date(endVal);

            event.preventDefault();
            $("#ObcFormcheckInDay").val(
              ("0" + checkinDate.getDate()).slice(-2).toString() +
                "-" +
                ("0" + (checkinDate.getMonth() + 1)).slice(-2).toString() +
                "-" +
                checkinDate.getFullYear().toString()
            );
            $("#ObcFormcheckOutDay").val(
              ("0" + checkoutDate.getDate()).slice(-2).toString() +
                "-" +
                ("0" + (checkoutDate.getMonth() + 1)).slice(-2).toString() +
                "-" +
                checkoutDate.getFullYear().toString()
            );

            $("#ObcFormroomCount").val(rooms);
            $("#ObcFormadult").val(adult);
            $("#ObcFormchild").val(child);
            $("#ObcFormPromotion").val($("#bwPromoCodeInput").val());

            $("#footer-loading-modal").modal("toggle");

            setTimeout(function () {
              $("#ObcForm").submit();
            }, 1000);

            setTimeout(function () {
              $("#footer-loading-modal").modal("toggle");
            }, 2000);
          } else {
            $("#footer-loading-modal").modal("toggle");
          }
        }
      })
      // when an error dropdown is opened, close the error
      .on("shown.bs.dropdown", ".bw-has-error .dropdown", function () {
        local.validation.clearError($(this).closest(".bw-has-error"));
      });
  };

  // takes field selector
  // returns true if it has a value
  // false if not
  local.validation.checkFieldForValue = function bwmCheckFieldForValue($field) {
    var valid = false;
    $field = OUT.utils.jqify($field);
    if ($field.is("select")) {
      valid = local.validation.checkSelectForValue($field);
    } else if ($field.is("input[type=text], input[type=hidden]")) {
      valid = local.validation.checkTextForValue($field);
    }
    return valid;
  };

  local.validation.checkTextForValue = function bwmCheckTextForValue($field) {
    $field = OUT.utils.jqify($field);
    var valid = false;
    if ($field.val().length > 0) {
      valid = true;
    }
    return valid;
  };

  local.validation.checkSelectForValue = function bwmCheckSelectForValue(
    $field
  ) {
    $field = OUT.utils.jqify($field);
    var valid = false;
    var selectedValue = $field.find("option:selected").val();
    if (selectedValue && selectedValue !== "") {
      valid = true;
    }
    return valid;
  };
  OUT.bookingWidget.validation.checkSelectForValue =
    local.validation.checkSelectForValue;

  local.validation.showErrorMobile = function bwmShowErrorMobile(errAr) {
    // console.warn('show error: ' + msgAr);
    var $errorScreen = $(local.sels.errorScreenMobile);
    var $msgContainer = $errorScreen.find(".msg");
    var html = "";
    $.each(errAr, function (index, msg) {
      html += "<div>" + $(msg).html() + "</div>";
    });
    $msgContainer.html(html);
    $errorScreen.removeClass("hidden");
  };

  // for mobile
  local.validation.hideError = function bmwHideError() {
    $(local.sels.errorScreenMobile).addClass("hidden");
  };
  OUT.bookingWidget.validation.hideErrorMobile = local.validation.hideError;

  // make the error close button close when you click it
  local.validation.closeBtnActivate = function bwmErrorCloseBtnActivate() {
    $(local.sels.errorScreenMobile).on("click", "button", function (event) {
      $(local.sels.errorScreenMobile).addClass("hidden");
    });
    $(".bw-close-error").on("click", function (event) {
      //$(event.target).closest('bw-error-parent').removeClass(local.classes.errorStateDesktop);
      local.validation.clearError(
        $(event.target).closest(local.sels.errorWrapDesktop)
      );
    });
  };

  // for desktop.
  local.validation.showErrorDesktop = function bwShowErrorDesktop(errAr) {
    $.each(errAr, function (index, item) {
      local.validation.showError(item);
    });
  };

  // for desktop. mobile is just one screen
  local.validation.clearError = function bwClearError($wrap) {
    $wrap = OUT.utils.jqify($wrap);
    $wrap.removeClass(local.classes.errorStateDesktop);
  };

  // again, just for desktop
  local.validation.showError = function bwShowError($wrap) {
    $wrap = OUT.utils.jqify($wrap);
    $wrap.addClass(local.classes.errorStateDesktop);
    // check to see if this is a dropup or dropdown error
    // its dropup if it fits, on scrolling. always dropdown on toggle
    if (OUT.bookingWidget.version === "scrolling") {
      var $err = $wrap.find(local.sels.errorMsgDesktop);
      $err.removeClass("dropup");
      if (OUT.bookingWidget.willItFit($err)) {
        $err.addClass("dropup");
      }
    }
  };

  OUT.bookingWidget.willItFit = function bwWillItFit($el) {
    var willItFitUp = false;
    $el = OUT.utils.jqify($el);

    var elHeight = $el.height();
    var elOffset = $el.offset().top;
    var windowTop = $(window).scrollTop();
    var insurance = 40;

    if (elHeight + OUT.desktopNav.height + insurance < elOffset - windowTop) {
      willItFitUp = true;
    }
    return willItFitUp;
  };

  OUT.bookingWidget.trackingDestination = function bwTrackDest($selectEl) {
    // tracking
    if (typeof utag !== "undefined") {
      $selectEl = OUT.utils.jqify($selectEl);
      var subregionCode = $selectEl
        .find("option:selected")
        .parent("optgroup")
        .attr("data-subregion-dest");
      var propertyCode = $selectEl.find("option:selected").val();
      if (subregionCode && subregionCode.length > 0) {
        utag.link({
          booking_region: subregionCode,
          event_description: "booking region",
        });
      }
    }
  };

  // toggle "Book Now" button style to indicate form is ready to submit
  // when required fields (destination & dates) are complete

  // when a required field changes, check all required fileds
  // if they are all valid, change the button

  local.validation.indicateReadySetup = function bwmIndicateFormReady() {
    $(local.sels.form).on(
      "change",
      local.validation.getFieldListString(),
      function (event) {
        // track which form we're dealing with, so we're validating the right one.
        var $context = $(event.target).parents(local.sels.form);
        // fully open the desktop widget when just the destination is selected (per Dan)
        if (
          $context.hasClass("bw-form") &&
          OUT.bookingWidget.horizontalVersionOpen === false
        ) {
          local.validation.openDesktopWidget($context);
        }
        if (local.validation.checkAllRequiredItems($context)) {
          // the things are all valid. do the stuff.
          local.validation.activateBookBtn($context);
        } else {
          local.validation.resetBookBtn($context);
        }
      }
    );
  };

  // open the desktop form up when the dest & date are both entered.
  // we're not going to close it again
  local.validation.openDesktopWidget = function bwOpenDesktopWidget($context) {
    $context.addClass("bw-fully-open").trigger(local.events.openSecondStep);
    OUT.bookingWidget.horizontalVersionOpen = true;
  };

  // combine all the field selectors & return a string
  local.validation.getFieldListString = function bwGetFieldListString() {
    var allFieldsAr = [];
    $.each(local.validation.items, function (index, item) {
      $.each(item.fields, function (index2, field) {
        allFieldsAr.push(field);
      });
    });
    return allFieldsAr.join(", ");
  };

  // takes an form element for context
  // returns false if any are not valid
  // returns true if all are valid
  local.validation.checkAllRequiredItems = function bwmCheckAllRequiredItems(
    $context
  ) {
    var valid = true;
    $.each(local.validation.items, function (index, item) {
      if (item.isValid($context) === false) {
        valid = false;
      }
    });
    return valid;
  };

  local.validation.activateBookBtn = function bwmActivateBookBtn($context) {
    $context.find(local.sels.submitBtn).addClass(local.classes.bookBtnActive);
  };

  local.validation.resetBookBtn = function bwmResetBookBtn($context) {
    $context
      .find(local.sels.submitBtn)
      .removeClass(local.classes.bookBtnActive);
  };

  //* End of Validation Zone

  (function initBookingWidget() {
    local.initSimpleDrops();
    local.validation.formSetup();
    local.validation.closeBtnActivate();
    local.validation.indicateReadySetup();
  })();
  return OUT;
})();
