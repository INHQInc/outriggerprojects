(function () {
  'use strict';

  const camelToDashMap = new Map();
  function camelToDash(str) {
    let result = camelToDashMap.get(str);
    if (result === undefined) {
      result = str.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      camelToDashMap.set(str, result);
    }
    return result;
  }

  function pascalToDash(str) {
    return camelToDash(str.replace(/((?!([A-Z]{2}|^))[A-Z])/g, "-$1"));
  }

  const deferred = Promise.resolve();

  const defaultTransform = v => v;

  const objectTransform = value => {
    if (typeof value !== "object") {
      throw TypeError(`Assigned value must be an object: ${typeof value}`);
    }
    return value && Object.freeze(value);
  };

  function property(value, connect) {
    const type = typeof value;
    let transform = defaultTransform;

    switch (type) {
      case "string":
        transform = String;
        break;
      case "number":
        transform = Number;
        break;
      case "boolean":
        transform = Boolean;
        break;
      case "function":
        transform = value;
        value = transform();
        break;
      case "object":
        if (value) Object.freeze(value);
        transform = objectTransform;
        break;
    }

    return {
      get: (host, val = value) => val,
      set: (host, val, oldValue) => transform(val, oldValue),
      connect:
        type !== "object" && type !== "undefined"
          ? (host, key, invalidate) => {
              if (host[key] === value) {
                const attrName = camelToDash(key);

                if (host.hasAttribute(attrName)) {
                  const attrValue = host.getAttribute(attrName);
                  host[key] =
                    attrValue === "" && transform === Boolean ? true : attrValue;
                }
              }

              return connect && connect(host, key, invalidate);
            }
          : connect,
    };
  }

  function render(fn, customOptions = {}) {
    if (typeof fn !== "function") {
      throw TypeError(`The first argument must be a function: ${typeof fn}`);
    }

    const options = { shadowRoot: true, ...customOptions };
    const shadowRootInit = { mode: "open" };

    if (typeof options.shadowRoot === "object") {
      Object.assign(shadowRootInit, options.shadowRoot);
    }

    return {
      get(host) {
        const update = fn(host);
        let target = host;

        if (options.shadowRoot) {
          if (!host.shadowRoot) host.attachShadow(shadowRootInit);
          target = host.shadowRoot;
        }

        return function flush() {
          update(host, target);
          return target;
        };
      },
      observe(host, flush) {
        flush();
      },
    };
  }

  const callbacks = new WeakMap();
  const queue = new Set();

  function execute() {
    try {
      queue.forEach(target => {
        try {
          callbacks.get(target)();
          queue.delete(target);
        } catch (e) {
          queue.delete(target);
          throw e;
        }
      });
    } catch (e) {
      if (queue.size) execute();
      throw e;
    }
  }

  function dispatch(target) {
    if (callbacks.has(target)) {
      if (!queue.size) {
        requestAnimationFrame(execute);
      }
      queue.add(target);
    }
  }

  function subscribe(target, cb) {
    callbacks.set(target, cb);
    dispatch(target);

    return function unsubscribe() {
      queue.delete(target);
      callbacks.delete(target);
    };
  }

  const entries = new WeakMap();
  const suspense = new WeakSet();

  function getEntry(target, key) {
    let targetMap = entries.get(target);
    if (!targetMap) {
      targetMap = new Map();
      entries.set(target, targetMap);
    }

    let entry = targetMap.get(key);

    if (!entry) {
      entry = {
        target,
        key,
        value: undefined,
        contexts: new Set(),
        deps: new Set(),
        resolved: false,
      };
      targetMap.set(key, entry);
    }

    return entry;
  }

  function dispatchDeep(entry) {
    entry.resolved = false;

    dispatch(entry);
    entry.contexts.forEach(dispatchDeep);
  }

  const contexts = [];
  function get(target, key, getter, validate) {
    const entry = getEntry(target, key);

    if (contexts.includes(entry)) {
      throw Error(`Circular get invocation is forbidden: '${key}'`);
    }

    const context = contexts[0];

    if (context && !suspense.has(context.target)) {
      context.deps.add(entry);
      entry.contexts.add(context);
    }

    if (
      !suspense.has(target) &&
      entry.resolved &&
      ((validate && validate(entry.value)) || !validate)
    ) {
      return entry.value;
    }

    try {
      contexts.unshift(entry);

      entry.deps.forEach(depEntry => {
        depEntry.contexts.delete(entry);
      });
      entry.deps.clear();

      const nextValue = getter(target, entry.value);

      if (nextValue !== entry.value) {
        entry.value = nextValue;
        dispatchDeep(entry);
      }

      entry.resolved = !suspense.has(target);

      contexts.shift();
    } catch (e) {
      contexts.shift();

      entry.resolved = false;

      if (context && !suspense.has(context)) {
        context.deps.delete(entry);
        entry.contexts.delete(context);
      }

      throw e;
    }

    return entry.value;
  }

  function set(target, key, setter, value) {
    const entry = getEntry(target, key);
    const newValue = setter(target, value, entry.value);

    if (newValue !== entry.value) {
      entry.value = newValue;
      dispatchDeep(entry);
    }
  }

  const gcList = new Set();
  function deleteEntry(entry) {
    if (!gcList.size) {
      requestAnimationFrame(() => {
        gcList.forEach(e => {
          if (e.contexts.size === 0) {
            e.deps.forEach(depEntry => {
              depEntry.contexts.delete(e);
            });

            const targetMap = entries.get(e.target);
            targetMap.delete(e.key);
          }
        });
        gcList.clear();
      });
    }

    gcList.add(entry);
  }

  function invalidateEntry(entry, clearValue, deleteValue) {
    dispatchDeep(entry);

    if (clearValue) {
      entry.value = undefined;
    }

    if (deleteValue) {
      deleteEntry(entry);
    }
  }

  function invalidate(target, key, clearValue, deleteValue) {
    if (contexts.length) {
      throw Error(
        `Invalidating property in chain of get calls is forbidden: '${key}'`,
      );
    }

    const entry = getEntry(target, key);
    invalidateEntry(entry, clearValue, deleteValue);
  }

  function observe(target, key, getter, fn) {
    const entry = getEntry(target, key);
    let lastValue;

    return subscribe(entry, () => {
      if (!suspense.has(target)) {
        const value = get(target, key, getter);
        if (value !== lastValue) {
          fn(target, value, lastValue);
          lastValue = value;
        }
      }
    });
  }

  const clearTargets = new Set();
  function clear(target) {
    if (clearTargets.size === 0) {
      requestAnimationFrame(() => {
        clearTargets.forEach(t => {
          const targetMap = entries.get(t);
          if (targetMap) {
            targetMap.forEach(entry => {
              entry.resolved = false;

              entry.deps.forEach(depEntry => {
                depEntry.contexts.delete(entry);
              });

              entry.deps.clear();
              entry.contexts.clear();
            });
          }
        });

        clearTargets.clear();
      });
    }
    clearTargets.add(target);
  }

  function suspend(target) {
    suspense.add(target);
  }

  function unsuspend(target) {
    suspense.delete(target);
    clearTargets.delete(target);
  }

  const defaultMethod = (host, value) => value;

  const callbacksMap = new WeakMap();
  const propsMap = new WeakMap();

  function translate(key, desc) {
    const type = typeof desc;

    let config;

    if (type === "function") {
      switch (key) {
        case "render":
          config = render(desc);
          break;
        case "content":
          config = render(desc, { shadowRoot: false });
          break;
        default:
          config = { get: desc };
      }
    } else if (type !== "object" || desc === null || Array.isArray(desc)) {
      config = property(desc);
    } else {
      config = {
        get: desc.get || defaultMethod,
        set: desc.set || (!desc.get && defaultMethod) || undefined,
        connect: desc.connect,
        observe: desc.observe,
      };
    }

    return config;
  }

  function compile(Hybrid, descriptors) {
    Hybrid.hybrids = descriptors;

    const callbacks = [];
    const props = Object.keys(descriptors);

    callbacksMap.set(Hybrid, callbacks);
    propsMap.set(Hybrid, props);

    props.forEach(key => {
      const config = translate(key, descriptors[key]);

      Object.defineProperty(Hybrid.prototype, key, {
        get: function get$1() {
          return get(this, key, config.get);
        },
        set:
          config.set &&
          function set$1(newValue) {
            set(this, key, config.set, newValue);
          },
        enumerable: true,
        configurable: true,
      });

      if (config.observe) {
        callbacks.unshift(host =>
          observe(host, key, config.get, config.observe),
        );
      }

      if (config.connect) {
        callbacks.push(host =>
          config.connect(host, key, () => {
            invalidate(host, key);
          }),
        );
      }
    });
  }

  function walkInShadow(node, fn) {
    fn(node);

    Array.from(node.children).forEach(el => walkInShadow(el, fn));

    if (node.shadowRoot) {
      Array.from(node.shadowRoot.children).forEach(el => walkInShadow(el, fn));
    }
  }

  const updateQueue = new Map();
  function update(Hybrid, lastHybrids) {
    if (!updateQueue.size) {
      deferred.then(() => {
        walkInShadow(document.body, node => {
          if (updateQueue.has(node.constructor)) {
            const hybrids = updateQueue.get(node.constructor);
            node.disconnectedCallback();

            Object.keys(node.constructor.hybrids).forEach(key => {
              invalidate(
                node,
                key,
                node.constructor.hybrids[key] !== hybrids[key],
              );
            });

            node.connectedCallback();
          }
        });
        updateQueue.clear();
      });
    }
    updateQueue.set(Hybrid, lastHybrids);
  }

  const disconnects = new WeakMap();

  function defineElement(tagName, hybrids) {
    const type = typeof hybrids;
    if (!hybrids || type !== "object") {
      throw TypeError(`Second argument must be an object: ${type}`);
    }

    if (tagName !== null) {
      const CustomElement = window.customElements.get(tagName);

      if (CustomElement) {
        if (CustomElement.hybrids === hybrids) {
          return CustomElement;
        }
        if (CustomElement.hybrids) {
          Object.keys(CustomElement.hybrids).forEach(key => {
            delete CustomElement.prototype[key];
          });

          const lastHybrids = CustomElement.hybrids;

          compile(CustomElement, hybrids);
          update(CustomElement, lastHybrids);

          return CustomElement;
        }

        return window.customElements.define(tagName, HTMLElement);
      }
    }

    class Hybrid extends HTMLElement {
      constructor() {
        super();

        const props = propsMap.get(Hybrid);

        for (let index = 0; index < props.length; index += 1) {
          const key = props[index];
          if (Object.prototype.hasOwnProperty.call(this, key)) {
            const value = this[key];
            delete this[key];
            this[key] = value;
          }
        }

        suspend(this);
      }

      connectedCallback() {
        unsuspend(this);

        const callbacks = callbacksMap.get(Hybrid);
        const list = [];

        for (let index = 0; index < callbacks.length; index += 1) {
          const cb = callbacks[index](this);
          if (cb) list.push(cb);
        }

        disconnects.set(this, list);
      }

      disconnectedCallback() {
        const list = disconnects.get(this);
        for (let index = 0; index < list.length; index += 1) {
          list[index]();
        }

        suspend(this);
        clear(this);
      }
    }

    compile(Hybrid, hybrids);

    if (tagName !== null) {
      Object.defineProperty(Hybrid, "name", {
        get: () => tagName,
      });
      customElements.define(tagName, Hybrid);
    }

    return Hybrid;
  }

  function defineMap(elements) {
    return Object.keys(elements).reduce((acc, key) => {
      const tagName = pascalToDash(key);
      acc[key] = defineElement(tagName, elements[key]);

      return acc;
    }, {});
  }

  function define(...args) {
    if (typeof args[0] === "object" && args[0] !== null) {
      return defineMap(args[0]);
    }

    return defineElement(...args);
  }

  /** Used for built-in method references. */
  var objectProto = Object.prototype;

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

    return value === proto;
  }

  var _isPrototype = isPrototype;

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */
  function overArg(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  var _overArg = overArg;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeKeys = _overArg(Object.keys, Object);

  var _nativeKeys = nativeKeys;

  /** Used for built-in method references. */
  var objectProto$1 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty = objectProto$1.hasOwnProperty;

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys(object) {
    if (!_isPrototype(object)) {
      return _nativeKeys(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeys = baseKeys;

  var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

  function commonjsRequire () {
  	throw new Error('Dynamic requires are not currently supported by rollup-plugin-commonjs');
  }

  function unwrapExports (x) {
  	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  /** Detect free variable `global` from Node.js. */
  var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  var _freeGlobal = freeGlobal;

  /** Detect free variable `self`. */
  var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root = _freeGlobal || freeSelf || Function('return this')();

  var _root = root;

  /** Built-in value references. */
  var Symbol$1 = _root.Symbol;

  var _Symbol = Symbol$1;

  /** Used for built-in method references. */
  var objectProto$2 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString = objectProto$2.toString;

  /** Built-in value references. */
  var symToStringTag = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
  function getRawTag(value) {
    var isOwn = hasOwnProperty$1.call(value, symToStringTag),
        tag = value[symToStringTag];

    try {
      value[symToStringTag] = undefined;
      var unmasked = true;
    } catch (e) {}

    var result = nativeObjectToString.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag] = tag;
      } else {
        delete value[symToStringTag];
      }
    }
    return result;
  }

  var _getRawTag = getRawTag;

  /** Used for built-in method references. */
  var objectProto$3 = Object.prototype;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$1 = objectProto$3.toString;

  /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
  function objectToString(value) {
    return nativeObjectToString$1.call(value);
  }

  var _objectToString = objectToString;

  /** `Object#toString` result references. */
  var nullTag = '[object Null]',
      undefinedTag = '[object Undefined]';

  /** Built-in value references. */
  var symToStringTag$1 = _Symbol ? _Symbol.toStringTag : undefined;

  /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag(value) {
    if (value == null) {
      return value === undefined ? undefinedTag : nullTag;
    }
    return (symToStringTag$1 && symToStringTag$1 in Object(value))
      ? _getRawTag(value)
      : _objectToString(value);
  }

  var _baseGetTag = baseGetTag;

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
  function isObject(value) {
    var type = typeof value;
    return value != null && (type == 'object' || type == 'function');
  }

  var isObject_1 = isObject;

  /** `Object#toString` result references. */
  var asyncTag = '[object AsyncFunction]',
      funcTag = '[object Function]',
      genTag = '[object GeneratorFunction]',
      proxyTag = '[object Proxy]';

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction(value) {
    if (!isObject_1(value)) {
      return false;
    }
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 9 which returns 'object' for typed arrays and other constructors.
    var tag = _baseGetTag(value);
    return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
  }

  var isFunction_1 = isFunction;

  /** Used to detect overreaching core-js shims. */
  var coreJsData = _root['__core-js_shared__'];

  var _coreJsData = coreJsData;

  /** Used to detect methods masquerading as native. */
  var maskSrcKey = (function() {
    var uid = /[^.]+$/.exec(_coreJsData && _coreJsData.keys && _coreJsData.keys.IE_PROTO || '');
    return uid ? ('Symbol(src)_1.' + uid) : '';
  }());

  /**
   * Checks if `func` has its source masked.
   *
   * @private
   * @param {Function} func The function to check.
   * @returns {boolean} Returns `true` if `func` is masked, else `false`.
   */
  function isMasked(func) {
    return !!maskSrcKey && (maskSrcKey in func);
  }

  var _isMasked = isMasked;

  /** Used for built-in method references. */
  var funcProto = Function.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString = funcProto.toString;

  /**
   * Converts `func` to its source code.
   *
   * @private
   * @param {Function} func The function to convert.
   * @returns {string} Returns the source code.
   */
  function toSource(func) {
    if (func != null) {
      try {
        return funcToString.call(func);
      } catch (e) {}
      try {
        return (func + '');
      } catch (e) {}
    }
    return '';
  }

  var _toSource = toSource;

  /**
   * Used to match `RegExp`
   * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
   */
  var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

  /** Used to detect host constructors (Safari). */
  var reIsHostCtor = /^\[object .+?Constructor\]$/;

  /** Used for built-in method references. */
  var funcProto$1 = Function.prototype,
      objectProto$4 = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$1 = funcProto$1.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty$2 = objectProto$4.hasOwnProperty;

  /** Used to detect if a method is native. */
  var reIsNative = RegExp('^' +
    funcToString$1.call(hasOwnProperty$2).replace(reRegExpChar, '\\$&')
    .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  );

  /**
   * The base implementation of `_.isNative` without bad shim checks.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a native function,
   *  else `false`.
   */
  function baseIsNative(value) {
    if (!isObject_1(value) || _isMasked(value)) {
      return false;
    }
    var pattern = isFunction_1(value) ? reIsNative : reIsHostCtor;
    return pattern.test(_toSource(value));
  }

  var _baseIsNative = baseIsNative;

  /**
   * Gets the value at `key` of `object`.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function getValue(object, key) {
    return object == null ? undefined : object[key];
  }

  var _getValue = getValue;

  /**
   * Gets the native function at `key` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the method to get.
   * @returns {*} Returns the function if it's native, else `undefined`.
   */
  function getNative(object, key) {
    var value = _getValue(object, key);
    return _baseIsNative(value) ? value : undefined;
  }

  var _getNative = getNative;

  /* Built-in method references that are verified to be native. */
  var DataView$1 = _getNative(_root, 'DataView');

  var _DataView = DataView$1;

  /* Built-in method references that are verified to be native. */
  var Map$1 = _getNative(_root, 'Map');

  var _Map = Map$1;

  /* Built-in method references that are verified to be native. */
  var Promise$1 = _getNative(_root, 'Promise');

  var _Promise = Promise$1;

  /* Built-in method references that are verified to be native. */
  var Set$1 = _getNative(_root, 'Set');

  var _Set = Set$1;

  /* Built-in method references that are verified to be native. */
  var WeakMap$1 = _getNative(_root, 'WeakMap');

  var _WeakMap = WeakMap$1;

  /** `Object#toString` result references. */
  var mapTag = '[object Map]',
      objectTag = '[object Object]',
      promiseTag = '[object Promise]',
      setTag = '[object Set]',
      weakMapTag = '[object WeakMap]';

  var dataViewTag = '[object DataView]';

  /** Used to detect maps, sets, and weakmaps. */
  var dataViewCtorString = _toSource(_DataView),
      mapCtorString = _toSource(_Map),
      promiseCtorString = _toSource(_Promise),
      setCtorString = _toSource(_Set),
      weakMapCtorString = _toSource(_WeakMap);

  /**
   * Gets the `toStringTag` of `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  var getTag = _baseGetTag;

  // Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
  if ((_DataView && getTag(new _DataView(new ArrayBuffer(1))) != dataViewTag) ||
      (_Map && getTag(new _Map) != mapTag) ||
      (_Promise && getTag(_Promise.resolve()) != promiseTag) ||
      (_Set && getTag(new _Set) != setTag) ||
      (_WeakMap && getTag(new _WeakMap) != weakMapTag)) {
    getTag = function(value) {
      var result = _baseGetTag(value),
          Ctor = result == objectTag ? value.constructor : undefined,
          ctorString = Ctor ? _toSource(Ctor) : '';

      if (ctorString) {
        switch (ctorString) {
          case dataViewCtorString: return dataViewTag;
          case mapCtorString: return mapTag;
          case promiseCtorString: return promiseTag;
          case setCtorString: return setTag;
          case weakMapCtorString: return weakMapTag;
        }
      }
      return result;
    };
  }

  var _getTag = getTag;

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
  function isObjectLike(value) {
    return value != null && typeof value == 'object';
  }

  var isObjectLike_1 = isObjectLike;

  /** `Object#toString` result references. */
  var argsTag = '[object Arguments]';

  /**
   * The base implementation of `_.isArguments`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   */
  function baseIsArguments(value) {
    return isObjectLike_1(value) && _baseGetTag(value) == argsTag;
  }

  var _baseIsArguments = baseIsArguments;

  /** Used for built-in method references. */
  var objectProto$5 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$3 = objectProto$5.hasOwnProperty;

  /** Built-in value references. */
  var propertyIsEnumerable = objectProto$5.propertyIsEnumerable;

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  var isArguments = _baseIsArguments(function() { return arguments; }()) ? _baseIsArguments : function(value) {
    return isObjectLike_1(value) && hasOwnProperty$3.call(value, 'callee') &&
      !propertyIsEnumerable.call(value, 'callee');
  };

  var isArguments_1 = isArguments;

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */
  var isArray = Array.isArray;

  var isArray_1 = isArray;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER = 9007199254740991;

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
  }

  var isLength_1 = isLength;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike(value) {
    return value != null && isLength_1(value.length) && !isFunction_1(value);
  }

  var isArrayLike_1 = isArrayLike;

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */
  function stubFalse() {
    return false;
  }

  var stubFalse_1 = stubFalse;

  var isBuffer_1 = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

  /**
   * Checks if `value` is a buffer.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
   * @example
   *
   * _.isBuffer(new Buffer(2));
   * // => true
   *
   * _.isBuffer(new Uint8Array(2));
   * // => false
   */
  var isBuffer = nativeIsBuffer || stubFalse_1;

  module.exports = isBuffer;
  });

  /** `Object#toString` result references. */
  var argsTag$1 = '[object Arguments]',
      arrayTag = '[object Array]',
      boolTag = '[object Boolean]',
      dateTag = '[object Date]',
      errorTag = '[object Error]',
      funcTag$1 = '[object Function]',
      mapTag$1 = '[object Map]',
      numberTag = '[object Number]',
      objectTag$1 = '[object Object]',
      regexpTag = '[object RegExp]',
      setTag$1 = '[object Set]',
      stringTag = '[object String]',
      weakMapTag$1 = '[object WeakMap]';

  var arrayBufferTag = '[object ArrayBuffer]',
      dataViewTag$1 = '[object DataView]',
      float32Tag = '[object Float32Array]',
      float64Tag = '[object Float64Array]',
      int8Tag = '[object Int8Array]',
      int16Tag = '[object Int16Array]',
      int32Tag = '[object Int32Array]',
      uint8Tag = '[object Uint8Array]',
      uint8ClampedTag = '[object Uint8ClampedArray]',
      uint16Tag = '[object Uint16Array]',
      uint32Tag = '[object Uint32Array]';

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags = {};
  typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
  typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
  typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
  typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
  typedArrayTags[uint32Tag] = true;
  typedArrayTags[argsTag$1] = typedArrayTags[arrayTag] =
  typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
  typedArrayTags[dataViewTag$1] = typedArrayTags[dateTag] =
  typedArrayTags[errorTag] = typedArrayTags[funcTag$1] =
  typedArrayTags[mapTag$1] = typedArrayTags[numberTag] =
  typedArrayTags[objectTag$1] = typedArrayTags[regexpTag] =
  typedArrayTags[setTag$1] = typedArrayTags[stringTag] =
  typedArrayTags[weakMapTag$1] = false;

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray(value) {
    return isObjectLike_1(value) &&
      isLength_1(value.length) && !!typedArrayTags[_baseGetTag(value)];
  }

  var _baseIsTypedArray = baseIsTypedArray;

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */
  function baseUnary(func) {
    return function(value) {
      return func(value);
    };
  }

  var _baseUnary = baseUnary;

  var _nodeUtil = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Detect free variable `process` from Node.js. */
  var freeProcess = moduleExports && _freeGlobal.process;

  /** Used to access faster Node.js helpers. */
  var nodeUtil = (function() {
    try {
      // Use `util.types` for Node.js 10+.
      var types = freeModule && freeModule.require && freeModule.require('util').types;

      if (types) {
        return types;
      }

      // Legacy `process.binding('util')` for Node.js < 10.
      return freeProcess && freeProcess.binding && freeProcess.binding('util');
    } catch (e) {}
  }());

  module.exports = nodeUtil;
  });

  /* Node.js helper references. */
  var nodeIsTypedArray = _nodeUtil && _nodeUtil.isTypedArray;

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray = nodeIsTypedArray ? _baseUnary(nodeIsTypedArray) : _baseIsTypedArray;

  var isTypedArray_1 = isTypedArray;

  /** `Object#toString` result references. */
  var mapTag$2 = '[object Map]',
      setTag$2 = '[object Set]';

  /** Used for built-in method references. */
  var objectProto$6 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$4 = objectProto$6.hasOwnProperty;

  /**
   * Checks if `value` is an empty object, collection, map, or set.
   *
   * Objects are considered empty if they have no own enumerable string keyed
   * properties.
   *
   * Array-like values such as `arguments` objects, arrays, buffers, strings, or
   * jQuery-like collections are considered empty if they have a `length` of `0`.
   * Similarly, maps and sets are considered empty if they have a `size` of `0`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is empty, else `false`.
   * @example
   *
   * _.isEmpty(null);
   * // => true
   *
   * _.isEmpty(true);
   * // => true
   *
   * _.isEmpty(1);
   * // => true
   *
   * _.isEmpty([1, 2, 3]);
   * // => false
   *
   * _.isEmpty({ 'a': 1 });
   * // => false
   */
  function isEmpty(value) {
    if (value == null) {
      return true;
    }
    if (isArrayLike_1(value) &&
        (isArray_1(value) || typeof value == 'string' || typeof value.splice == 'function' ||
          isBuffer_1(value) || isTypedArray_1(value) || isArguments_1(value))) {
      return !value.length;
    }
    var tag = _getTag(value);
    if (tag == mapTag$2 || tag == setTag$2) {
      return !value.size;
    }
    if (_isPrototype(value)) {
      return !_baseKeys(value).length;
    }
    for (var key in value) {
      if (hasOwnProperty$4.call(value, key)) {
        return false;
      }
    }
    return true;
  }

  var isEmpty_1 = isEmpty;

  /** `Object#toString` result references. */
  var numberTag$1 = '[object Number]';

  /**
   * Checks if `value` is classified as a `Number` primitive or object.
   *
   * **Note:** To exclude `Infinity`, `-Infinity`, and `NaN`, which are
   * classified as numbers, use the `_.isFinite` method.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a number, else `false`.
   * @example
   *
   * _.isNumber(3);
   * // => true
   *
   * _.isNumber(Number.MIN_VALUE);
   * // => true
   *
   * _.isNumber(Infinity);
   * // => true
   *
   * _.isNumber('3');
   * // => false
   */
  function isNumber(value) {
    return typeof value == 'number' ||
      (isObjectLike_1(value) && _baseGetTag(value) == numberTag$1);
  }

  var isNumber_1 = isNumber;

  var dayjs_min = createCommonjsModule(function (module, exports) {
  !function(t,e){module.exports=e();}(commonjsGlobal,(function(){var t=1e3,e=6e4,n=36e5,r="millisecond",i="second",s="minute",u="hour",a="day",o="week",c="month",f="quarter",h="year",d="date",l="Invalid Date",$=/^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,y=/\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,M={name:"en",weekdays:"Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),months:"January_February_March_April_May_June_July_August_September_October_November_December".split("_"),ordinal:function(t){var e=["th","st","nd","rd"],n=t%100;return "["+t+(e[(n-20)%10]||e[n]||e[0])+"]"}},m=function(t,e,n){var r=String(t);return !r||r.length>=e?t:""+Array(e+1-r.length).join(n)+t},v={s:m,z:function(t){var e=-t.utcOffset(),n=Math.abs(e),r=Math.floor(n/60),i=n%60;return (e<=0?"+":"-")+m(r,2,"0")+":"+m(i,2,"0")},m:function t(e,n){if(e.date()<n.date())return -t(n,e);var r=12*(n.year()-e.year())+(n.month()-e.month()),i=e.clone().add(r,c),s=n-i<0,u=e.clone().add(r+(s?-1:1),c);return +(-(r+(n-i)/(s?i-u:u-i))||0)},a:function(t){return t<0?Math.ceil(t)||0:Math.floor(t)},p:function(t){return {M:c,y:h,w:o,d:a,D:d,h:u,m:s,s:i,ms:r,Q:f}[t]||String(t||"").toLowerCase().replace(/s$/,"")},u:function(t){return void 0===t}},g="en",D={};D[g]=M;var p="$isDayjsObject",S=function(t){return t instanceof _||!(!t||!t[p])},w=function t(e,n,r){var i;if(!e)return g;if("string"==typeof e){var s=e.toLowerCase();D[s]&&(i=s),n&&(D[s]=n,i=s);var u=e.split("-");if(!i&&u.length>1)return t(u[0])}else{var a=e.name;D[a]=e,i=a;}return !r&&i&&(g=i),i||!r&&g},O=function(t,e){if(S(t))return t.clone();var n="object"==typeof e?e:{};return n.date=t,n.args=arguments,new _(n)},b=v;b.l=w,b.i=S,b.w=function(t,e){return O(t,{locale:e.$L,utc:e.$u,x:e.$x,$offset:e.$offset})};var _=function(){function M(t){this.$L=w(t.locale,null,!0),this.parse(t),this.$x=this.$x||t.x||{},this[p]=!0;}var m=M.prototype;return m.parse=function(t){this.$d=function(t){var e=t.date,n=t.utc;if(null===e)return new Date(NaN);if(b.u(e))return new Date;if(e instanceof Date)return new Date(e);if("string"==typeof e&&!/Z$/i.test(e)){var r=e.match($);if(r){var i=r[2]-1||0,s=(r[7]||"0").substring(0,3);return n?new Date(Date.UTC(r[1],i,r[3]||1,r[4]||0,r[5]||0,r[6]||0,s)):new Date(r[1],i,r[3]||1,r[4]||0,r[5]||0,r[6]||0,s)}}return new Date(e)}(t),this.init();},m.init=function(){var t=this.$d;this.$y=t.getFullYear(),this.$M=t.getMonth(),this.$D=t.getDate(),this.$W=t.getDay(),this.$H=t.getHours(),this.$m=t.getMinutes(),this.$s=t.getSeconds(),this.$ms=t.getMilliseconds();},m.$utils=function(){return b},m.isValid=function(){return !(this.$d.toString()===l)},m.isSame=function(t,e){var n=O(t);return this.startOf(e)<=n&&n<=this.endOf(e)},m.isAfter=function(t,e){return O(t)<this.startOf(e)},m.isBefore=function(t,e){return this.endOf(e)<O(t)},m.$g=function(t,e,n){return b.u(t)?this[e]:this.set(n,t)},m.unix=function(){return Math.floor(this.valueOf()/1e3)},m.valueOf=function(){return this.$d.getTime()},m.startOf=function(t,e){var n=this,r=!!b.u(e)||e,f=b.p(t),l=function(t,e){var i=b.w(n.$u?Date.UTC(n.$y,e,t):new Date(n.$y,e,t),n);return r?i:i.endOf(a)},$=function(t,e){return b.w(n.toDate()[t].apply(n.toDate("s"),(r?[0,0,0,0]:[23,59,59,999]).slice(e)),n)},y=this.$W,M=this.$M,m=this.$D,v="set"+(this.$u?"UTC":"");switch(f){case h:return r?l(1,0):l(31,11);case c:return r?l(1,M):l(0,M+1);case o:var g=this.$locale().weekStart||0,D=(y<g?y+7:y)-g;return l(r?m-D:m+(6-D),M);case a:case d:return $(v+"Hours",0);case u:return $(v+"Minutes",1);case s:return $(v+"Seconds",2);case i:return $(v+"Milliseconds",3);default:return this.clone()}},m.endOf=function(t){return this.startOf(t,!1)},m.$set=function(t,e){var n,o=b.p(t),f="set"+(this.$u?"UTC":""),l=(n={},n[a]=f+"Date",n[d]=f+"Date",n[c]=f+"Month",n[h]=f+"FullYear",n[u]=f+"Hours",n[s]=f+"Minutes",n[i]=f+"Seconds",n[r]=f+"Milliseconds",n)[o],$=o===a?this.$D+(e-this.$W):e;if(o===c||o===h){var y=this.clone().set(d,1);y.$d[l]($),y.init(),this.$d=y.set(d,Math.min(this.$D,y.daysInMonth())).$d;}else l&&this.$d[l]($);return this.init(),this},m.set=function(t,e){return this.clone().$set(t,e)},m.get=function(t){return this[b.p(t)]()},m.add=function(r,f){var d,l=this;r=Number(r);var $=b.p(f),y=function(t){var e=O(l);return b.w(e.date(e.date()+Math.round(t*r)),l)};if($===c)return this.set(c,this.$M+r);if($===h)return this.set(h,this.$y+r);if($===a)return y(1);if($===o)return y(7);var M=(d={},d[s]=e,d[u]=n,d[i]=t,d)[$]||1,m=this.$d.getTime()+r*M;return b.w(m,this)},m.subtract=function(t,e){return this.add(-1*t,e)},m.format=function(t){var e=this,n=this.$locale();if(!this.isValid())return n.invalidDate||l;var r=t||"YYYY-MM-DDTHH:mm:ssZ",i=b.z(this),s=this.$H,u=this.$m,a=this.$M,o=n.weekdays,c=n.months,f=n.meridiem,h=function(t,n,i,s){return t&&(t[n]||t(e,r))||i[n].slice(0,s)},d=function(t){return b.s(s%12||12,t,"0")},$=f||function(t,e,n){var r=t<12?"AM":"PM";return n?r.toLowerCase():r};return r.replace(y,(function(t,r){return r||function(t){switch(t){case"YY":return String(e.$y).slice(-2);case"YYYY":return b.s(e.$y,4,"0");case"M":return a+1;case"MM":return b.s(a+1,2,"0");case"MMM":return h(n.monthsShort,a,c,3);case"MMMM":return h(c,a);case"D":return e.$D;case"DD":return b.s(e.$D,2,"0");case"d":return String(e.$W);case"dd":return h(n.weekdaysMin,e.$W,o,2);case"ddd":return h(n.weekdaysShort,e.$W,o,3);case"dddd":return o[e.$W];case"H":return String(s);case"HH":return b.s(s,2,"0");case"h":return d(1);case"hh":return d(2);case"a":return $(s,u,!0);case"A":return $(s,u,!1);case"m":return String(u);case"mm":return b.s(u,2,"0");case"s":return String(e.$s);case"ss":return b.s(e.$s,2,"0");case"SSS":return b.s(e.$ms,3,"0");case"Z":return i}return null}(t)||i.replace(":","")}))},m.utcOffset=function(){return 15*-Math.round(this.$d.getTimezoneOffset()/15)},m.diff=function(r,d,l){var $,y=this,M=b.p(d),m=O(r),v=(m.utcOffset()-this.utcOffset())*e,g=this-m,D=function(){return b.m(y,m)};switch(M){case h:$=D()/12;break;case c:$=D();break;case f:$=D()/3;break;case o:$=(g-v)/6048e5;break;case a:$=(g-v)/864e5;break;case u:$=g/n;break;case s:$=g/e;break;case i:$=g/t;break;default:$=g;}return l?$:b.a($)},m.daysInMonth=function(){return this.endOf(c).$D},m.$locale=function(){return D[this.$L]},m.locale=function(t,e){if(!t)return this.$L;var n=this.clone(),r=w(t,e,!0);return r&&(n.$L=r),n},m.clone=function(){return b.w(this.$d,this)},m.toDate=function(){return new Date(this.valueOf())},m.toJSON=function(){return this.isValid()?this.toISOString():null},m.toISOString=function(){return this.$d.toISOString()},m.toString=function(){return this.$d.toUTCString()},M}(),k=_.prototype;return O.prototype=k,[["$ms",r],["$s",i],["$m",s],["$H",u],["$W",a],["$M",c],["$y",h],["$D",d]].forEach((function(t){k[t[1]]=function(e){return this.$g(e,t[0],t[1])};})),O.extend=function(t,e){return t.$i||(t(e,_,O),t.$i=!0),O},O.locale=w,O.isDayjs=S,O.unix=function(t){return O(1e3*t)},O.en=D[g],O.Ls=D,O.p={},O}));
  });

  /*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  */
  /* eslint-disable no-unused-vars */
  var getOwnPropertySymbols = Object.getOwnPropertySymbols;
  var hasOwnProperty$5 = Object.prototype.hasOwnProperty;
  var propIsEnumerable = Object.prototype.propertyIsEnumerable;

  function toObject(val) {
  	if (val === null || val === undefined) {
  		throw new TypeError('Object.assign cannot be called with null or undefined');
  	}

  	return Object(val);
  }

  function shouldUseNative() {
  	try {
  		if (!Object.assign) {
  			return false;
  		}

  		// Detect buggy property enumeration order in older V8 versions.

  		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
  		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
  		test1[5] = 'de';
  		if (Object.getOwnPropertyNames(test1)[0] === '5') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test2 = {};
  		for (var i = 0; i < 10; i++) {
  			test2['_' + String.fromCharCode(i)] = i;
  		}
  		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
  			return test2[n];
  		});
  		if (order2.join('') !== '0123456789') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test3 = {};
  		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
  			test3[letter] = letter;
  		});
  		if (Object.keys(Object.assign({}, test3)).join('') !==
  				'abcdefghijklmnopqrst') {
  			return false;
  		}

  		return true;
  	} catch (err) {
  		// We don't expect any of the above to throw, but better to be safe.
  		return false;
  	}
  }

  var objectAssign = shouldUseNative() ? Object.assign : function (target, source) {
  	var from;
  	var to = toObject(target);
  	var symbols;

  	for (var s = 1; s < arguments.length; s++) {
  		from = Object(arguments[s]);

  		for (var key in from) {
  			if (hasOwnProperty$5.call(from, key)) {
  				to[key] = from[key];
  			}
  		}

  		if (getOwnPropertySymbols) {
  			symbols = getOwnPropertySymbols(from);
  			for (var i = 0; i < symbols.length; i++) {
  				if (propIsEnumerable.call(from, symbols[i])) {
  					to[symbols[i]] = from[symbols[i]];
  				}
  			}
  		}
  	}

  	return to;
  };

  var n="function"===typeof Symbol&&Symbol.for,p=n?Symbol.for("react.element"):60103,q=n?Symbol.for("react.portal"):60106,r=n?Symbol.for("react.fragment"):60107,t=n?Symbol.for("react.strict_mode"):60108,u=n?Symbol.for("react.profiler"):60114,v=n?Symbol.for("react.provider"):60109,w=n?Symbol.for("react.context"):60110,x=n?Symbol.for("react.forward_ref"):60112,y=n?Symbol.for("react.suspense"):60113,z=n?Symbol.for("react.memo"):60115,A=n?Symbol.for("react.lazy"):
  60116,B="function"===typeof Symbol&&Symbol.iterator;function C(a){for(var b="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)b+="&args[]="+encodeURIComponent(arguments[c]);return "Minified React error #"+a+"; visit "+b+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}
  var D={isMounted:function(){return !1},enqueueForceUpdate:function(){},enqueueReplaceState:function(){},enqueueSetState:function(){}},E={};function F(a,b,c){this.props=a;this.context=b;this.refs=E;this.updater=c||D;}F.prototype.isReactComponent={};F.prototype.setState=function(a,b){if("object"!==typeof a&&"function"!==typeof a&&null!=a)throw Error(C(85));this.updater.enqueueSetState(this,a,b,"setState");};F.prototype.forceUpdate=function(a){this.updater.enqueueForceUpdate(this,a,"forceUpdate");};
  function G(){}G.prototype=F.prototype;function H(a,b,c){this.props=a;this.context=b;this.refs=E;this.updater=c||D;}var I=H.prototype=new G;I.constructor=H;objectAssign(I,F.prototype);I.isPureReactComponent=!0;var J={current:null},K=Object.prototype.hasOwnProperty,L={key:!0,ref:!0,__self:!0,__source:!0};
  function M(a,b,c){var e,d={},g=null,k=null;if(null!=b)for(e in void 0!==b.ref&&(k=b.ref),void 0!==b.key&&(g=""+b.key),b)K.call(b,e)&&!L.hasOwnProperty(e)&&(d[e]=b[e]);var f=arguments.length-2;if(1===f)d.children=c;else if(1<f){for(var h=Array(f),m=0;m<f;m++)h[m]=arguments[m+2];d.children=h;}if(a&&a.defaultProps)for(e in f=a.defaultProps,f)void 0===d[e]&&(d[e]=f[e]);return {$$typeof:p,type:a,key:g,ref:k,props:d,_owner:J.current}}
  function N(a,b){return {$$typeof:p,type:a.type,key:b,ref:a.ref,props:a.props,_owner:a._owner}}function O(a){return "object"===typeof a&&null!==a&&a.$$typeof===p}function escape(a){var b={"=":"=0",":":"=2"};return "$"+(""+a).replace(/[=:]/g,function(a){return b[a]})}var P=/\/+/g,Q=[];function R(a,b,c,e){if(Q.length){var d=Q.pop();d.result=a;d.keyPrefix=b;d.func=c;d.context=e;d.count=0;return d}return {result:a,keyPrefix:b,func:c,context:e,count:0}}
  function S(a){a.result=null;a.keyPrefix=null;a.func=null;a.context=null;a.count=0;10>Q.length&&Q.push(a);}
  function T(a,b,c,e){var d=typeof a;if("undefined"===d||"boolean"===d)a=null;var g=!1;if(null===a)g=!0;else switch(d){case "string":case "number":g=!0;break;case "object":switch(a.$$typeof){case p:case q:g=!0;}}if(g)return c(e,a,""===b?"."+U(a,0):b),1;g=0;b=""===b?".":b+":";if(Array.isArray(a))for(var k=0;k<a.length;k++){d=a[k];var f=b+U(d,k);g+=T(d,f,c,e);}else if(null===a||"object"!==typeof a?f=null:(f=B&&a[B]||a["@@iterator"],f="function"===typeof f?f:null),"function"===typeof f)for(a=f.call(a),k=
  0;!(d=a.next()).done;)d=d.value,f=b+U(d,k++),g+=T(d,f,c,e);else if("object"===d)throw c=""+a,Error(C(31,"[object Object]"===c?"object with keys {"+Object.keys(a).join(", ")+"}":c,""));return g}function V(a,b,c){return null==a?0:T(a,"",b,c)}function U(a,b){return "object"===typeof a&&null!==a&&null!=a.key?escape(a.key):b.toString(36)}function W(a,b){a.func.call(a.context,b,a.count++);}
  function aa(a,b,c){var e=a.result,d=a.keyPrefix;a=a.func.call(a.context,b,a.count++);Array.isArray(a)?X(a,e,c,function(a){return a}):null!=a&&(O(a)&&(a=N(a,d+(!a.key||b&&b.key===a.key?"":(""+a.key).replace(P,"$&/")+"/")+c)),e.push(a));}function X(a,b,c,e,d){var g="";null!=c&&(g=(""+c).replace(P,"$&/")+"/");b=R(b,g,e,d);V(a,aa,b);S(b);}var Y={current:null};function Z(){var a=Y.current;if(null===a)throw Error(C(321));return a}
  var ba={ReactCurrentDispatcher:Y,ReactCurrentBatchConfig:{suspense:null},ReactCurrentOwner:J,IsSomeRendererActing:{current:!1},assign:objectAssign};var Children={map:function(a,b,c){if(null==a)return a;var e=[];X(a,e,null,b,c);return e},forEach:function(a,b,c){if(null==a)return a;b=R(null,null,b,c);V(a,W,b);S(b);},count:function(a){return V(a,function(){return null},null)},toArray:function(a){var b=[];X(a,b,null,function(a){return a});return b},only:function(a){if(!O(a))throw Error(C(143));return a}};
  var Component=F;var Fragment=r;var Profiler=u;var PureComponent=H;var StrictMode=t;var Suspense=y;var __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED=ba;
  var cloneElement=function(a,b,c){if(null===a||void 0===a)throw Error(C(267,a));var e=objectAssign({},a.props),d=a.key,g=a.ref,k=a._owner;if(null!=b){void 0!==b.ref&&(g=b.ref,k=J.current);void 0!==b.key&&(d=""+b.key);if(a.type&&a.type.defaultProps)var f=a.type.defaultProps;for(h in b)K.call(b,h)&&!L.hasOwnProperty(h)&&(e[h]=void 0===b[h]&&void 0!==f?f[h]:b[h]);}var h=arguments.length-2;if(1===h)e.children=c;else if(1<h){f=Array(h);for(var m=0;m<h;m++)f[m]=arguments[m+2];e.children=f;}return {$$typeof:p,type:a.type,
  key:d,ref:g,props:e,_owner:k}};var createContext=function(a,b){void 0===b&&(b=null);a={$$typeof:w,_calculateChangedBits:b,_currentValue:a,_currentValue2:a,_threadCount:0,Provider:null,Consumer:null};a.Provider={$$typeof:v,_context:a};return a.Consumer=a};var createElement=M;var createFactory=function(a){var b=M.bind(null,a);b.type=a;return b};var createRef=function(){return {current:null}};var forwardRef=function(a){return {$$typeof:x,render:a}};var isValidElement=O;
  var lazy=function(a){return {$$typeof:A,_ctor:a,_status:-1,_result:null}};var memo=function(a,b){return {$$typeof:z,type:a,compare:void 0===b?null:b}};var useCallback=function(a,b){return Z().useCallback(a,b)};var useContext=function(a,b){return Z().useContext(a,b)};var useDebugValue=function(){};var useEffect=function(a,b){return Z().useEffect(a,b)};var useImperativeHandle=function(a,b,c){return Z().useImperativeHandle(a,b,c)};
  var useLayoutEffect=function(a,b){return Z().useLayoutEffect(a,b)};var useMemo=function(a,b){return Z().useMemo(a,b)};var useReducer=function(a,b,c){return Z().useReducer(a,b,c)};var useRef=function(a){return Z().useRef(a)};var useState=function(a){return Z().useState(a)};var version="16.14.0";

  var react_production_min = {
  	Children: Children,
  	Component: Component,
  	Fragment: Fragment,
  	Profiler: Profiler,
  	PureComponent: PureComponent,
  	StrictMode: StrictMode,
  	Suspense: Suspense,
  	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED,
  	cloneElement: cloneElement,
  	createContext: createContext,
  	createElement: createElement,
  	createFactory: createFactory,
  	createRef: createRef,
  	forwardRef: forwardRef,
  	isValidElement: isValidElement,
  	lazy: lazy,
  	memo: memo,
  	useCallback: useCallback,
  	useContext: useContext,
  	useDebugValue: useDebugValue,
  	useEffect: useEffect,
  	useImperativeHandle: useImperativeHandle,
  	useLayoutEffect: useLayoutEffect,
  	useMemo: useMemo,
  	useReducer: useReducer,
  	useRef: useRef,
  	useState: useState,
  	version: version
  };

  var react = createCommonjsModule(function (module) {

  {
    module.exports = react_production_min;
  }
  });
  var react_1 = react.Children;
  var react_2 = react.Component;
  var react_3 = react.PropTypes;
  var react_4 = react.createElement;
  var react_5 = react.createContext;
  var react_6 = react.useState;
  var react_7 = react.useEffect;

  var scheduler_production_min = createCommonjsModule(function (module, exports) {
  var f,g,h,k,l;
  if("undefined"===typeof window||"function"!==typeof MessageChannel){var p=null,q=null,t=function(){if(null!==p)try{var a=exports.unstable_now();p(!0,a);p=null;}catch(b){throw setTimeout(t,0),b;}},u=Date.now();exports.unstable_now=function(){return Date.now()-u};f=function(a){null!==p?setTimeout(f,0,a):(p=a,setTimeout(t,0));};g=function(a,b){q=setTimeout(a,b);};h=function(){clearTimeout(q);};k=function(){return !1};l=exports.unstable_forceFrameRate=function(){};}else{var w=window.performance,x=window.Date,
  y=window.setTimeout,z=window.clearTimeout;if("undefined"!==typeof console){var A=window.cancelAnimationFrame;"function"!==typeof window.requestAnimationFrame&&console.error("This browser doesn't support requestAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills");"function"!==typeof A&&console.error("This browser doesn't support cancelAnimationFrame. Make sure that you load a polyfill in older browsers. https://fb.me/react-polyfills");}if("object"===
  typeof w&&"function"===typeof w.now)exports.unstable_now=function(){return w.now()};else{var B=x.now();exports.unstable_now=function(){return x.now()-B};}var C=!1,D=null,E=-1,F=5,G=0;k=function(){return exports.unstable_now()>=G};l=function(){};exports.unstable_forceFrameRate=function(a){0>a||125<a?console.error("forceFrameRate takes a positive int between 0 and 125, forcing framerates higher than 125 fps is not unsupported"):F=0<a?Math.floor(1E3/a):5;};var H=new MessageChannel,I=H.port2;H.port1.onmessage=
  function(){if(null!==D){var a=exports.unstable_now();G=a+F;try{D(!0,a)?I.postMessage(null):(C=!1,D=null);}catch(b){throw I.postMessage(null),b;}}else C=!1;};f=function(a){D=a;C||(C=!0,I.postMessage(null));};g=function(a,b){E=y(function(){a(exports.unstable_now());},b);};h=function(){z(E);E=-1;};}function J(a,b){var c=a.length;a.push(b);a:for(;;){var d=c-1>>>1,e=a[d];if(void 0!==e&&0<K(e,b))a[d]=b,a[c]=e,c=d;else break a}}function L(a){a=a[0];return void 0===a?null:a}
  function M(a){var b=a[0];if(void 0!==b){var c=a.pop();if(c!==b){a[0]=c;a:for(var d=0,e=a.length;d<e;){var m=2*(d+1)-1,n=a[m],v=m+1,r=a[v];if(void 0!==n&&0>K(n,c))void 0!==r&&0>K(r,n)?(a[d]=r,a[v]=c,d=v):(a[d]=n,a[m]=c,d=m);else if(void 0!==r&&0>K(r,c))a[d]=r,a[v]=c,d=v;else break a}}return b}return null}function K(a,b){var c=a.sortIndex-b.sortIndex;return 0!==c?c:a.id-b.id}var N=[],O=[],P=1,Q=null,R=3,S=!1,T=!1,U=!1;
  function V(a){for(var b=L(O);null!==b;){if(null===b.callback)M(O);else if(b.startTime<=a)M(O),b.sortIndex=b.expirationTime,J(N,b);else break;b=L(O);}}function W(a){U=!1;V(a);if(!T)if(null!==L(N))T=!0,f(X);else{var b=L(O);null!==b&&g(W,b.startTime-a);}}
  function X(a,b){T=!1;U&&(U=!1,h());S=!0;var c=R;try{V(b);for(Q=L(N);null!==Q&&(!(Q.expirationTime>b)||a&&!k());){var d=Q.callback;if(null!==d){Q.callback=null;R=Q.priorityLevel;var e=d(Q.expirationTime<=b);b=exports.unstable_now();"function"===typeof e?Q.callback=e:Q===L(N)&&M(N);V(b);}else M(N);Q=L(N);}if(null!==Q)var m=!0;else{var n=L(O);null!==n&&g(W,n.startTime-b);m=!1;}return m}finally{Q=null,R=c,S=!1;}}
  function Y(a){switch(a){case 1:return -1;case 2:return 250;case 5:return 1073741823;case 4:return 1E4;default:return 5E3}}var Z=l;exports.unstable_IdlePriority=5;exports.unstable_ImmediatePriority=1;exports.unstable_LowPriority=4;exports.unstable_NormalPriority=3;exports.unstable_Profiling=null;exports.unstable_UserBlockingPriority=2;exports.unstable_cancelCallback=function(a){a.callback=null;};exports.unstable_continueExecution=function(){T||S||(T=!0,f(X));};
  exports.unstable_getCurrentPriorityLevel=function(){return R};exports.unstable_getFirstCallbackNode=function(){return L(N)};exports.unstable_next=function(a){switch(R){case 1:case 2:case 3:var b=3;break;default:b=R;}var c=R;R=b;try{return a()}finally{R=c;}};exports.unstable_pauseExecution=function(){};exports.unstable_requestPaint=Z;exports.unstable_runWithPriority=function(a,b){switch(a){case 1:case 2:case 3:case 4:case 5:break;default:a=3;}var c=R;R=a;try{return b()}finally{R=c;}};
  exports.unstable_scheduleCallback=function(a,b,c){var d=exports.unstable_now();if("object"===typeof c&&null!==c){var e=c.delay;e="number"===typeof e&&0<e?d+e:d;c="number"===typeof c.timeout?c.timeout:Y(a);}else c=Y(a),e=d;c=e+c;a={id:P++,callback:b,priorityLevel:a,startTime:e,expirationTime:c,sortIndex:-1};e>d?(a.sortIndex=e,J(O,a),null===L(N)&&a===L(O)&&(U?h():U=!0,g(W,e-d))):(a.sortIndex=c,J(N,a),T||S||(T=!0,f(X)));return a};
  exports.unstable_shouldYield=function(){var a=exports.unstable_now();V(a);var b=L(N);return b!==Q&&null!==Q&&null!==b&&null!==b.callback&&b.startTime<=a&&b.expirationTime<Q.expirationTime||k()};exports.unstable_wrapCallback=function(a){var b=R;return function(){var c=R;R=b;try{return a.apply(this,arguments)}finally{R=c;}}};
  });
  var scheduler_production_min_1 = scheduler_production_min.unstable_now;
  var scheduler_production_min_2 = scheduler_production_min.unstable_forceFrameRate;
  var scheduler_production_min_3 = scheduler_production_min.unstable_IdlePriority;
  var scheduler_production_min_4 = scheduler_production_min.unstable_ImmediatePriority;
  var scheduler_production_min_5 = scheduler_production_min.unstable_LowPriority;
  var scheduler_production_min_6 = scheduler_production_min.unstable_NormalPriority;
  var scheduler_production_min_7 = scheduler_production_min.unstable_Profiling;
  var scheduler_production_min_8 = scheduler_production_min.unstable_UserBlockingPriority;
  var scheduler_production_min_9 = scheduler_production_min.unstable_cancelCallback;
  var scheduler_production_min_10 = scheduler_production_min.unstable_continueExecution;
  var scheduler_production_min_11 = scheduler_production_min.unstable_getCurrentPriorityLevel;
  var scheduler_production_min_12 = scheduler_production_min.unstable_getFirstCallbackNode;
  var scheduler_production_min_13 = scheduler_production_min.unstable_next;
  var scheduler_production_min_14 = scheduler_production_min.unstable_pauseExecution;
  var scheduler_production_min_15 = scheduler_production_min.unstable_requestPaint;
  var scheduler_production_min_16 = scheduler_production_min.unstable_runWithPriority;
  var scheduler_production_min_17 = scheduler_production_min.unstable_scheduleCallback;
  var scheduler_production_min_18 = scheduler_production_min.unstable_shouldYield;
  var scheduler_production_min_19 = scheduler_production_min.unstable_wrapCallback;

  var scheduler = createCommonjsModule(function (module) {

  {
    module.exports = scheduler_production_min;
  }
  });

  function u$1(a){for(var b="https://reactjs.org/docs/error-decoder.html?invariant="+a,c=1;c<arguments.length;c++)b+="&args[]="+encodeURIComponent(arguments[c]);return "Minified React error #"+a+"; visit "+b+" for the full message or use the non-minified dev environment for full errors and additional helpful warnings."}if(!react)throw Error(u$1(227));
  function ba$1(a,b,c,d,e,f,g,h,k){var l=Array.prototype.slice.call(arguments,3);try{b.apply(c,l);}catch(m){this.onError(m);}}var da=!1,ea=null,fa=!1,ha=null,ia={onError:function(a){da=!0;ea=a;}};function ja(a,b,c,d,e,f,g,h,k){da=!1;ea=null;ba$1.apply(ia,arguments);}function ka(a,b,c,d,e,f,g,h,k){ja.apply(this,arguments);if(da){if(da){var l=ea;da=!1;ea=null;}else throw Error(u$1(198));fa||(fa=!0,ha=l);}}var la=null,ma=null,na=null;
  function oa(a,b,c){var d=a.type||"unknown-event";a.currentTarget=na(c);ka(d,b,void 0,a);a.currentTarget=null;}var pa=null,qa={};
  function ra(){if(pa)for(var a in qa){var b=qa[a],c=pa.indexOf(a);if(!(-1<c))throw Error(u$1(96,a));if(!sa[c]){if(!b.extractEvents)throw Error(u$1(97,a));sa[c]=b;c=b.eventTypes;for(var d in c){var e=void 0;var f=c[d],g=b,h=d;if(ta.hasOwnProperty(h))throw Error(u$1(99,h));ta[h]=f;var k=f.phasedRegistrationNames;if(k){for(e in k)k.hasOwnProperty(e)&&ua(k[e],g,h);e=!0;}else f.registrationName?(ua(f.registrationName,g,h),e=!0):e=!1;if(!e)throw Error(u$1(98,d,a));}}}}
  function ua(a,b,c){if(va[a])throw Error(u$1(100,a));va[a]=b;wa[a]=b.eventTypes[c].dependencies;}var sa=[],ta={},va={},wa={};function xa(a){var b=!1,c;for(c in a)if(a.hasOwnProperty(c)){var d=a[c];if(!qa.hasOwnProperty(c)||qa[c]!==d){if(qa[c])throw Error(u$1(102,c));qa[c]=d;b=!0;}}b&&ra();}var ya=!("undefined"===typeof window||"undefined"===typeof window.document||"undefined"===typeof window.document.createElement),za=null,Aa=null,Ba=null;
  function Ca(a){if(a=ma(a)){if("function"!==typeof za)throw Error(u$1(280));var b=a.stateNode;b&&(b=la(b),za(a.stateNode,a.type,b));}}function Da(a){Aa?Ba?Ba.push(a):Ba=[a]:Aa=a;}function Ea(){if(Aa){var a=Aa,b=Ba;Ba=Aa=null;Ca(a);if(b)for(a=0;a<b.length;a++)Ca(b[a]);}}function Fa(a,b){return a(b)}function Ga(a,b,c,d,e){return a(b,c,d,e)}function Ha(){}var Ia=Fa,Ja=!1,Ka=!1;function La(){if(null!==Aa||null!==Ba)Ha(),Ea();}
  function Ma(a,b,c){if(Ka)return a(b,c);Ka=!0;try{return Ia(a,b,c)}finally{Ka=!1,La();}}var Na=/^[:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD][:A-Z_a-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD\-.0-9\u00B7\u0300-\u036F\u203F-\u2040]*$/,Oa=Object.prototype.hasOwnProperty,Pa={},Qa={};
  function Ra(a){if(Oa.call(Qa,a))return !0;if(Oa.call(Pa,a))return !1;if(Na.test(a))return Qa[a]=!0;Pa[a]=!0;return !1}function Sa(a,b,c,d){if(null!==c&&0===c.type)return !1;switch(typeof b){case "function":case "symbol":return !0;case "boolean":if(d)return !1;if(null!==c)return !c.acceptsBooleans;a=a.toLowerCase().slice(0,5);return "data-"!==a&&"aria-"!==a;default:return !1}}
  function Ta(a,b,c,d){if(null===b||"undefined"===typeof b||Sa(a,b,c,d))return !0;if(d)return !1;if(null!==c)switch(c.type){case 3:return !b;case 4:return !1===b;case 5:return isNaN(b);case 6:return isNaN(b)||1>b}return !1}function v$1(a,b,c,d,e,f){this.acceptsBooleans=2===b||3===b||4===b;this.attributeName=d;this.attributeNamespace=e;this.mustUseProperty=c;this.propertyName=a;this.type=b;this.sanitizeURL=f;}var C$1={};
  "children dangerouslySetInnerHTML defaultValue defaultChecked innerHTML suppressContentEditableWarning suppressHydrationWarning style".split(" ").forEach(function(a){C$1[a]=new v$1(a,0,!1,a,null,!1);});[["acceptCharset","accept-charset"],["className","class"],["htmlFor","for"],["httpEquiv","http-equiv"]].forEach(function(a){var b=a[0];C$1[b]=new v$1(b,1,!1,a[1],null,!1);});["contentEditable","draggable","spellCheck","value"].forEach(function(a){C$1[a]=new v$1(a,2,!1,a.toLowerCase(),null,!1);});
  ["autoReverse","externalResourcesRequired","focusable","preserveAlpha"].forEach(function(a){C$1[a]=new v$1(a,2,!1,a,null,!1);});"allowFullScreen async autoFocus autoPlay controls default defer disabled disablePictureInPicture formNoValidate hidden loop noModule noValidate open playsInline readOnly required reversed scoped seamless itemScope".split(" ").forEach(function(a){C$1[a]=new v$1(a,3,!1,a.toLowerCase(),null,!1);});
  ["checked","multiple","muted","selected"].forEach(function(a){C$1[a]=new v$1(a,3,!0,a,null,!1);});["capture","download"].forEach(function(a){C$1[a]=new v$1(a,4,!1,a,null,!1);});["cols","rows","size","span"].forEach(function(a){C$1[a]=new v$1(a,6,!1,a,null,!1);});["rowSpan","start"].forEach(function(a){C$1[a]=new v$1(a,5,!1,a.toLowerCase(),null,!1);});var Ua=/[\-:]([a-z])/g;function Va(a){return a[1].toUpperCase()}
  "accent-height alignment-baseline arabic-form baseline-shift cap-height clip-path clip-rule color-interpolation color-interpolation-filters color-profile color-rendering dominant-baseline enable-background fill-opacity fill-rule flood-color flood-opacity font-family font-size font-size-adjust font-stretch font-style font-variant font-weight glyph-name glyph-orientation-horizontal glyph-orientation-vertical horiz-adv-x horiz-origin-x image-rendering letter-spacing lighting-color marker-end marker-mid marker-start overline-position overline-thickness paint-order panose-1 pointer-events rendering-intent shape-rendering stop-color stop-opacity strikethrough-position strikethrough-thickness stroke-dasharray stroke-dashoffset stroke-linecap stroke-linejoin stroke-miterlimit stroke-opacity stroke-width text-anchor text-decoration text-rendering underline-position underline-thickness unicode-bidi unicode-range units-per-em v-alphabetic v-hanging v-ideographic v-mathematical vector-effect vert-adv-y vert-origin-x vert-origin-y word-spacing writing-mode xmlns:xlink x-height".split(" ").forEach(function(a){var b=a.replace(Ua,
  Va);C$1[b]=new v$1(b,1,!1,a,null,!1);});"xlink:actuate xlink:arcrole xlink:role xlink:show xlink:title xlink:type".split(" ").forEach(function(a){var b=a.replace(Ua,Va);C$1[b]=new v$1(b,1,!1,a,"http://www.w3.org/1999/xlink",!1);});["xml:base","xml:lang","xml:space"].forEach(function(a){var b=a.replace(Ua,Va);C$1[b]=new v$1(b,1,!1,a,"http://www.w3.org/XML/1998/namespace",!1);});["tabIndex","crossOrigin"].forEach(function(a){C$1[a]=new v$1(a,1,!1,a.toLowerCase(),null,!1);});
  C$1.xlinkHref=new v$1("xlinkHref",1,!1,"xlink:href","http://www.w3.org/1999/xlink",!0);["src","href","action","formAction"].forEach(function(a){C$1[a]=new v$1(a,1,!1,a.toLowerCase(),null,!0);});var Wa=react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;Wa.hasOwnProperty("ReactCurrentDispatcher")||(Wa.ReactCurrentDispatcher={current:null});Wa.hasOwnProperty("ReactCurrentBatchConfig")||(Wa.ReactCurrentBatchConfig={suspense:null});
  function Xa(a,b,c,d){var e=C$1.hasOwnProperty(b)?C$1[b]:null;var f=null!==e?0===e.type:d?!1:!(2<b.length)||"o"!==b[0]&&"O"!==b[0]||"n"!==b[1]&&"N"!==b[1]?!1:!0;f||(Ta(b,c,e,d)&&(c=null),d||null===e?Ra(b)&&(null===c?a.removeAttribute(b):a.setAttribute(b,""+c)):e.mustUseProperty?a[e.propertyName]=null===c?3===e.type?!1:"":c:(b=e.attributeName,d=e.attributeNamespace,null===c?a.removeAttribute(b):(e=e.type,c=3===e||4===e&&!0===c?"":""+c,d?a.setAttributeNS(d,b,c):a.setAttribute(b,c))));}
  var Ya=/^(.*)[\\\/]/,E$1="function"===typeof Symbol&&Symbol.for,Za=E$1?Symbol.for("react.element"):60103,$a=E$1?Symbol.for("react.portal"):60106,ab=E$1?Symbol.for("react.fragment"):60107,bb=E$1?Symbol.for("react.strict_mode"):60108,cb=E$1?Symbol.for("react.profiler"):60114,db=E$1?Symbol.for("react.provider"):60109,eb=E$1?Symbol.for("react.context"):60110,fb=E$1?Symbol.for("react.concurrent_mode"):60111,gb=E$1?Symbol.for("react.forward_ref"):60112,hb=E$1?Symbol.for("react.suspense"):60113,ib=E$1?Symbol.for("react.suspense_list"):
  60120,jb=E$1?Symbol.for("react.memo"):60115,kb=E$1?Symbol.for("react.lazy"):60116,lb=E$1?Symbol.for("react.block"):60121,mb="function"===typeof Symbol&&Symbol.iterator;function nb(a){if(null===a||"object"!==typeof a)return null;a=mb&&a[mb]||a["@@iterator"];return "function"===typeof a?a:null}function ob(a){if(-1===a._status){a._status=0;var b=a._ctor;b=b();a._result=b;b.then(function(b){0===a._status&&(b=b.default,a._status=1,a._result=b);},function(b){0===a._status&&(a._status=2,a._result=b);});}}
  function pb(a){if(null==a)return null;if("function"===typeof a)return a.displayName||a.name||null;if("string"===typeof a)return a;switch(a){case ab:return "Fragment";case $a:return "Portal";case cb:return "Profiler";case bb:return "StrictMode";case hb:return "Suspense";case ib:return "SuspenseList"}if("object"===typeof a)switch(a.$$typeof){case eb:return "Context.Consumer";case db:return "Context.Provider";case gb:var b=a.render;b=b.displayName||b.name||"";return a.displayName||(""!==b?"ForwardRef("+b+")":
  "ForwardRef");case jb:return pb(a.type);case lb:return pb(a.render);case kb:if(a=1===a._status?a._result:null)return pb(a)}return null}function qb(a){var b="";do{a:switch(a.tag){case 3:case 4:case 6:case 7:case 10:case 9:var c="";break a;default:var d=a._debugOwner,e=a._debugSource,f=pb(a.type);c=null;d&&(c=pb(d.type));d=f;f="";e?f=" (at "+e.fileName.replace(Ya,"")+":"+e.lineNumber+")":c&&(f=" (created by "+c+")");c="\n    in "+(d||"Unknown")+f;}b+=c;a=a.return;}while(a);return b}
  function rb(a){switch(typeof a){case "boolean":case "number":case "object":case "string":case "undefined":return a;default:return ""}}function sb(a){var b=a.type;return (a=a.nodeName)&&"input"===a.toLowerCase()&&("checkbox"===b||"radio"===b)}
  function tb(a){var b=sb(a)?"checked":"value",c=Object.getOwnPropertyDescriptor(a.constructor.prototype,b),d=""+a[b];if(!a.hasOwnProperty(b)&&"undefined"!==typeof c&&"function"===typeof c.get&&"function"===typeof c.set){var e=c.get,f=c.set;Object.defineProperty(a,b,{configurable:!0,get:function(){return e.call(this)},set:function(a){d=""+a;f.call(this,a);}});Object.defineProperty(a,b,{enumerable:c.enumerable});return {getValue:function(){return d},setValue:function(a){d=""+a;},stopTracking:function(){a._valueTracker=
  null;delete a[b];}}}}function xb(a){a._valueTracker||(a._valueTracker=tb(a));}function yb(a){if(!a)return !1;var b=a._valueTracker;if(!b)return !0;var c=b.getValue();var d="";a&&(d=sb(a)?a.checked?"true":"false":a.value);a=d;return a!==c?(b.setValue(a),!0):!1}function zb(a,b){var c=b.checked;return objectAssign({},b,{defaultChecked:void 0,defaultValue:void 0,value:void 0,checked:null!=c?c:a._wrapperState.initialChecked})}
  function Ab(a,b){var c=null==b.defaultValue?"":b.defaultValue,d=null!=b.checked?b.checked:b.defaultChecked;c=rb(null!=b.value?b.value:c);a._wrapperState={initialChecked:d,initialValue:c,controlled:"checkbox"===b.type||"radio"===b.type?null!=b.checked:null!=b.value};}function Bb(a,b){b=b.checked;null!=b&&Xa(a,"checked",b,!1);}
  function Cb(a,b){Bb(a,b);var c=rb(b.value),d=b.type;if(null!=c)if("number"===d){if(0===c&&""===a.value||a.value!=c)a.value=""+c;}else a.value!==""+c&&(a.value=""+c);else if("submit"===d||"reset"===d){a.removeAttribute("value");return}b.hasOwnProperty("value")?Db(a,b.type,c):b.hasOwnProperty("defaultValue")&&Db(a,b.type,rb(b.defaultValue));null==b.checked&&null!=b.defaultChecked&&(a.defaultChecked=!!b.defaultChecked);}
  function Eb(a,b,c){if(b.hasOwnProperty("value")||b.hasOwnProperty("defaultValue")){var d=b.type;if(!("submit"!==d&&"reset"!==d||void 0!==b.value&&null!==b.value))return;b=""+a._wrapperState.initialValue;c||b===a.value||(a.value=b);a.defaultValue=b;}c=a.name;""!==c&&(a.name="");a.defaultChecked=!!a._wrapperState.initialChecked;""!==c&&(a.name=c);}
  function Db(a,b,c){if("number"!==b||a.ownerDocument.activeElement!==a)null==c?a.defaultValue=""+a._wrapperState.initialValue:a.defaultValue!==""+c&&(a.defaultValue=""+c);}function Fb(a){var b="";react.Children.forEach(a,function(a){null!=a&&(b+=a);});return b}function Gb(a,b){a=objectAssign({children:void 0},b);if(b=Fb(b.children))a.children=b;return a}
  function Hb(a,b,c,d){a=a.options;if(b){b={};for(var e=0;e<c.length;e++)b["$"+c[e]]=!0;for(c=0;c<a.length;c++)e=b.hasOwnProperty("$"+a[c].value),a[c].selected!==e&&(a[c].selected=e),e&&d&&(a[c].defaultSelected=!0);}else{c=""+rb(c);b=null;for(e=0;e<a.length;e++){if(a[e].value===c){a[e].selected=!0;d&&(a[e].defaultSelected=!0);return}null!==b||a[e].disabled||(b=a[e]);}null!==b&&(b.selected=!0);}}
  function Ib(a,b){if(null!=b.dangerouslySetInnerHTML)throw Error(u$1(91));return objectAssign({},b,{value:void 0,defaultValue:void 0,children:""+a._wrapperState.initialValue})}function Jb(a,b){var c=b.value;if(null==c){c=b.children;b=b.defaultValue;if(null!=c){if(null!=b)throw Error(u$1(92));if(Array.isArray(c)){if(!(1>=c.length))throw Error(u$1(93));c=c[0];}b=c;}null==b&&(b="");c=b;}a._wrapperState={initialValue:rb(c)};}
  function Kb(a,b){var c=rb(b.value),d=rb(b.defaultValue);null!=c&&(c=""+c,c!==a.value&&(a.value=c),null==b.defaultValue&&a.defaultValue!==c&&(a.defaultValue=c));null!=d&&(a.defaultValue=""+d);}function Lb(a){var b=a.textContent;b===a._wrapperState.initialValue&&""!==b&&null!==b&&(a.value=b);}var Mb={html:"http://www.w3.org/1999/xhtml",mathml:"http://www.w3.org/1998/Math/MathML",svg:"http://www.w3.org/2000/svg"};
  function Nb(a){switch(a){case "svg":return "http://www.w3.org/2000/svg";case "math":return "http://www.w3.org/1998/Math/MathML";default:return "http://www.w3.org/1999/xhtml"}}function Ob(a,b){return null==a||"http://www.w3.org/1999/xhtml"===a?Nb(b):"http://www.w3.org/2000/svg"===a&&"foreignObject"===b?"http://www.w3.org/1999/xhtml":a}
  var Pb,Qb=function(a){return "undefined"!==typeof MSApp&&MSApp.execUnsafeLocalFunction?function(b,c,d,e){MSApp.execUnsafeLocalFunction(function(){return a(b,c,d,e)});}:a}(function(a,b){if(a.namespaceURI!==Mb.svg||"innerHTML"in a)a.innerHTML=b;else{Pb=Pb||document.createElement("div");Pb.innerHTML="<svg>"+b.valueOf().toString()+"</svg>";for(b=Pb.firstChild;a.firstChild;)a.removeChild(a.firstChild);for(;b.firstChild;)a.appendChild(b.firstChild);}});
  function Rb(a,b){if(b){var c=a.firstChild;if(c&&c===a.lastChild&&3===c.nodeType){c.nodeValue=b;return}}a.textContent=b;}function Sb(a,b){var c={};c[a.toLowerCase()]=b.toLowerCase();c["Webkit"+a]="webkit"+b;c["Moz"+a]="moz"+b;return c}var Tb={animationend:Sb("Animation","AnimationEnd"),animationiteration:Sb("Animation","AnimationIteration"),animationstart:Sb("Animation","AnimationStart"),transitionend:Sb("Transition","TransitionEnd")},Ub={},Vb={};
  ya&&(Vb=document.createElement("div").style,"AnimationEvent"in window||(delete Tb.animationend.animation,delete Tb.animationiteration.animation,delete Tb.animationstart.animation),"TransitionEvent"in window||delete Tb.transitionend.transition);function Wb(a){if(Ub[a])return Ub[a];if(!Tb[a])return a;var b=Tb[a],c;for(c in b)if(b.hasOwnProperty(c)&&c in Vb)return Ub[a]=b[c];return a}
  var Xb=Wb("animationend"),Yb=Wb("animationiteration"),Zb=Wb("animationstart"),$b=Wb("transitionend"),ac="abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange seeked seeking stalled suspend timeupdate volumechange waiting".split(" "),bc=new ("function"===typeof WeakMap?WeakMap:Map);function cc(a){var b=bc.get(a);void 0===b&&(b=new Map,bc.set(a,b));return b}
  function dc(a){var b=a,c=a;if(a.alternate)for(;b.return;)b=b.return;else{a=b;do b=a,0!==(b.effectTag&1026)&&(c=b.return),a=b.return;while(a)}return 3===b.tag?c:null}function ec(a){if(13===a.tag){var b=a.memoizedState;null===b&&(a=a.alternate,null!==a&&(b=a.memoizedState));if(null!==b)return b.dehydrated}return null}function fc(a){if(dc(a)!==a)throw Error(u$1(188));}
  function gc(a){var b=a.alternate;if(!b){b=dc(a);if(null===b)throw Error(u$1(188));return b!==a?null:a}for(var c=a,d=b;;){var e=c.return;if(null===e)break;var f=e.alternate;if(null===f){d=e.return;if(null!==d){c=d;continue}break}if(e.child===f.child){for(f=e.child;f;){if(f===c)return fc(e),a;if(f===d)return fc(e),b;f=f.sibling;}throw Error(u$1(188));}if(c.return!==d.return)c=e,d=f;else{for(var g=!1,h=e.child;h;){if(h===c){g=!0;c=e;d=f;break}if(h===d){g=!0;d=e;c=f;break}h=h.sibling;}if(!g){for(h=f.child;h;){if(h===
  c){g=!0;c=f;d=e;break}if(h===d){g=!0;d=f;c=e;break}h=h.sibling;}if(!g)throw Error(u$1(189));}}if(c.alternate!==d)throw Error(u$1(190));}if(3!==c.tag)throw Error(u$1(188));return c.stateNode.current===c?a:b}function hc(a){a=gc(a);if(!a)return null;for(var b=a;;){if(5===b.tag||6===b.tag)return b;if(b.child)b.child.return=b,b=b.child;else{if(b===a)break;for(;!b.sibling;){if(!b.return||b.return===a)return null;b=b.return;}b.sibling.return=b.return;b=b.sibling;}}return null}
  function ic(a,b){if(null==b)throw Error(u$1(30));if(null==a)return b;if(Array.isArray(a)){if(Array.isArray(b))return a.push.apply(a,b),a;a.push(b);return a}return Array.isArray(b)?[a].concat(b):[a,b]}function jc(a,b,c){Array.isArray(a)?a.forEach(b,c):a&&b.call(c,a);}var kc=null;
  function lc(a){if(a){var b=a._dispatchListeners,c=a._dispatchInstances;if(Array.isArray(b))for(var d=0;d<b.length&&!a.isPropagationStopped();d++)oa(a,b[d],c[d]);else b&&oa(a,b,c);a._dispatchListeners=null;a._dispatchInstances=null;a.isPersistent()||a.constructor.release(a);}}function mc(a){null!==a&&(kc=ic(kc,a));a=kc;kc=null;if(a){jc(a,lc);if(kc)throw Error(u$1(95));if(fa)throw a=ha,fa=!1,ha=null,a;}}
  function nc(a){a=a.target||a.srcElement||window;a.correspondingUseElement&&(a=a.correspondingUseElement);return 3===a.nodeType?a.parentNode:a}function oc(a){if(!ya)return !1;a="on"+a;var b=a in document;b||(b=document.createElement("div"),b.setAttribute(a,"return;"),b="function"===typeof b[a]);return b}var pc=[];function qc(a){a.topLevelType=null;a.nativeEvent=null;a.targetInst=null;a.ancestors.length=0;10>pc.length&&pc.push(a);}
  function rc(a,b,c,d){if(pc.length){var e=pc.pop();e.topLevelType=a;e.eventSystemFlags=d;e.nativeEvent=b;e.targetInst=c;return e}return {topLevelType:a,eventSystemFlags:d,nativeEvent:b,targetInst:c,ancestors:[]}}
  function sc(a){var b=a.targetInst,c=b;do{if(!c){a.ancestors.push(c);break}var d=c;if(3===d.tag)d=d.stateNode.containerInfo;else{for(;d.return;)d=d.return;d=3!==d.tag?null:d.stateNode.containerInfo;}if(!d)break;b=c.tag;5!==b&&6!==b||a.ancestors.push(c);c=tc(d);}while(c);for(c=0;c<a.ancestors.length;c++){b=a.ancestors[c];var e=nc(a.nativeEvent);d=a.topLevelType;var f=a.nativeEvent,g=a.eventSystemFlags;0===c&&(g|=64);for(var h=null,k=0;k<sa.length;k++){var l=sa[k];l&&(l=l.extractEvents(d,b,f,e,g))&&(h=
  ic(h,l));}mc(h);}}function uc(a,b,c){if(!c.has(a)){switch(a){case "scroll":vc(b,"scroll",!0);break;case "focus":case "blur":vc(b,"focus",!0);vc(b,"blur",!0);c.set("blur",null);c.set("focus",null);break;case "cancel":case "close":oc(a)&&vc(b,a,!0);break;case "invalid":case "submit":case "reset":break;default:-1===ac.indexOf(a)&&F$1(a,b);}c.set(a,null);}}
  var wc,xc,yc,zc=!1,Ac=[],Bc=null,Cc=null,Dc=null,Ec=new Map,Fc=new Map,Gc=[],Hc="mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput close cancel copy cut paste click change contextmenu reset submit".split(" "),Ic="focus blur dragenter dragleave mouseover mouseout pointerover pointerout gotpointercapture lostpointercapture".split(" ");
  function Jc(a,b){var c=cc(b);Hc.forEach(function(a){uc(a,b,c);});Ic.forEach(function(a){uc(a,b,c);});}function Kc(a,b,c,d,e){return {blockedOn:a,topLevelType:b,eventSystemFlags:c|32,nativeEvent:e,container:d}}
  function Lc(a,b){switch(a){case "focus":case "blur":Bc=null;break;case "dragenter":case "dragleave":Cc=null;break;case "mouseover":case "mouseout":Dc=null;break;case "pointerover":case "pointerout":Ec.delete(b.pointerId);break;case "gotpointercapture":case "lostpointercapture":Fc.delete(b.pointerId);}}function Mc(a,b,c,d,e,f){if(null===a||a.nativeEvent!==f)return a=Kc(b,c,d,e,f),null!==b&&(b=Nc(b),null!==b&&xc(b)),a;a.eventSystemFlags|=d;return a}
  function Oc(a,b,c,d,e){switch(b){case "focus":return Bc=Mc(Bc,a,b,c,d,e),!0;case "dragenter":return Cc=Mc(Cc,a,b,c,d,e),!0;case "mouseover":return Dc=Mc(Dc,a,b,c,d,e),!0;case "pointerover":var f=e.pointerId;Ec.set(f,Mc(Ec.get(f)||null,a,b,c,d,e));return !0;case "gotpointercapture":return f=e.pointerId,Fc.set(f,Mc(Fc.get(f)||null,a,b,c,d,e)),!0}return !1}
  function Pc(a){var b=tc(a.target);if(null!==b){var c=dc(b);if(null!==c)if(b=c.tag,13===b){if(b=ec(c),null!==b){a.blockedOn=b;scheduler.unstable_runWithPriority(a.priority,function(){yc(c);});return}}else if(3===b&&c.stateNode.hydrate){a.blockedOn=3===c.tag?c.stateNode.containerInfo:null;return}}a.blockedOn=null;}function Qc(a){if(null!==a.blockedOn)return !1;var b=Rc(a.topLevelType,a.eventSystemFlags,a.container,a.nativeEvent);if(null!==b){var c=Nc(b);null!==c&&xc(c);a.blockedOn=b;return !1}return !0}
  function Sc(a,b,c){Qc(a)&&c.delete(b);}function Tc(){for(zc=!1;0<Ac.length;){var a=Ac[0];if(null!==a.blockedOn){a=Nc(a.blockedOn);null!==a&&wc(a);break}var b=Rc(a.topLevelType,a.eventSystemFlags,a.container,a.nativeEvent);null!==b?a.blockedOn=b:Ac.shift();}null!==Bc&&Qc(Bc)&&(Bc=null);null!==Cc&&Qc(Cc)&&(Cc=null);null!==Dc&&Qc(Dc)&&(Dc=null);Ec.forEach(Sc);Fc.forEach(Sc);}function Uc(a,b){a.blockedOn===b&&(a.blockedOn=null,zc||(zc=!0,scheduler.unstable_scheduleCallback(scheduler.unstable_NormalPriority,Tc)));}
  function Vc(a){function b(b){return Uc(b,a)}if(0<Ac.length){Uc(Ac[0],a);for(var c=1;c<Ac.length;c++){var d=Ac[c];d.blockedOn===a&&(d.blockedOn=null);}}null!==Bc&&Uc(Bc,a);null!==Cc&&Uc(Cc,a);null!==Dc&&Uc(Dc,a);Ec.forEach(b);Fc.forEach(b);for(c=0;c<Gc.length;c++)d=Gc[c],d.blockedOn===a&&(d.blockedOn=null);for(;0<Gc.length&&(c=Gc[0],null===c.blockedOn);)Pc(c),null===c.blockedOn&&Gc.shift();}
  var Wc={},Yc=new Map,Zc=new Map,$c=["abort","abort",Xb,"animationEnd",Yb,"animationIteration",Zb,"animationStart","canplay","canPlay","canplaythrough","canPlayThrough","durationchange","durationChange","emptied","emptied","encrypted","encrypted","ended","ended","error","error","gotpointercapture","gotPointerCapture","load","load","loadeddata","loadedData","loadedmetadata","loadedMetadata","loadstart","loadStart","lostpointercapture","lostPointerCapture","playing","playing","progress","progress","seeking",
  "seeking","stalled","stalled","suspend","suspend","timeupdate","timeUpdate",$b,"transitionEnd","waiting","waiting"];function ad(a,b){for(var c=0;c<a.length;c+=2){var d=a[c],e=a[c+1],f="on"+(e[0].toUpperCase()+e.slice(1));f={phasedRegistrationNames:{bubbled:f,captured:f+"Capture"},dependencies:[d],eventPriority:b};Zc.set(d,b);Yc.set(d,f);Wc[e]=f;}}
  ad("blur blur cancel cancel click click close close contextmenu contextMenu copy copy cut cut auxclick auxClick dblclick doubleClick dragend dragEnd dragstart dragStart drop drop focus focus input input invalid invalid keydown keyDown keypress keyPress keyup keyUp mousedown mouseDown mouseup mouseUp paste paste pause pause play play pointercancel pointerCancel pointerdown pointerDown pointerup pointerUp ratechange rateChange reset reset seeked seeked submit submit touchcancel touchCancel touchend touchEnd touchstart touchStart volumechange volumeChange".split(" "),0);
  ad("drag drag dragenter dragEnter dragexit dragExit dragleave dragLeave dragover dragOver mousemove mouseMove mouseout mouseOut mouseover mouseOver pointermove pointerMove pointerout pointerOut pointerover pointerOver scroll scroll toggle toggle touchmove touchMove wheel wheel".split(" "),1);ad($c,2);for(var bd="change selectionchange textInput compositionstart compositionend compositionupdate".split(" "),cd=0;cd<bd.length;cd++)Zc.set(bd[cd],0);
  var dd=scheduler.unstable_UserBlockingPriority,ed=scheduler.unstable_runWithPriority,fd=!0;function F$1(a,b){vc(b,a,!1);}function vc(a,b,c){var d=Zc.get(b);switch(void 0===d?2:d){case 0:d=gd.bind(null,b,1,a);break;case 1:d=hd.bind(null,b,1,a);break;default:d=id.bind(null,b,1,a);}c?a.addEventListener(b,d,!0):a.addEventListener(b,d,!1);}function gd(a,b,c,d){Ja||Ha();var e=id,f=Ja;Ja=!0;try{Ga(e,a,b,c,d);}finally{(Ja=f)||La();}}function hd(a,b,c,d){ed(dd,id.bind(null,a,b,c,d));}
  function id(a,b,c,d){if(fd)if(0<Ac.length&&-1<Hc.indexOf(a))a=Kc(null,a,b,c,d),Ac.push(a);else{var e=Rc(a,b,c,d);if(null===e)Lc(a,d);else if(-1<Hc.indexOf(a))a=Kc(e,a,b,c,d),Ac.push(a);else if(!Oc(e,a,b,c,d)){Lc(a,d);a=rc(a,d,null,b);try{Ma(sc,a);}finally{qc(a);}}}}
  function Rc(a,b,c,d){c=nc(d);c=tc(c);if(null!==c){var e=dc(c);if(null===e)c=null;else{var f=e.tag;if(13===f){c=ec(e);if(null!==c)return c;c=null;}else if(3===f){if(e.stateNode.hydrate)return 3===e.tag?e.stateNode.containerInfo:null;c=null;}else e!==c&&(c=null);}}a=rc(a,d,c,b);try{Ma(sc,a);}finally{qc(a);}return null}
  var jd={animationIterationCount:!0,borderImageOutset:!0,borderImageSlice:!0,borderImageWidth:!0,boxFlex:!0,boxFlexGroup:!0,boxOrdinalGroup:!0,columnCount:!0,columns:!0,flex:!0,flexGrow:!0,flexPositive:!0,flexShrink:!0,flexNegative:!0,flexOrder:!0,gridArea:!0,gridRow:!0,gridRowEnd:!0,gridRowSpan:!0,gridRowStart:!0,gridColumn:!0,gridColumnEnd:!0,gridColumnSpan:!0,gridColumnStart:!0,fontWeight:!0,lineClamp:!0,lineHeight:!0,opacity:!0,order:!0,orphans:!0,tabSize:!0,widows:!0,zIndex:!0,zoom:!0,fillOpacity:!0,
  floodOpacity:!0,stopOpacity:!0,strokeDasharray:!0,strokeDashoffset:!0,strokeMiterlimit:!0,strokeOpacity:!0,strokeWidth:!0},kd=["Webkit","ms","Moz","O"];Object.keys(jd).forEach(function(a){kd.forEach(function(b){b=b+a.charAt(0).toUpperCase()+a.substring(1);jd[b]=jd[a];});});function ld(a,b,c){return null==b||"boolean"===typeof b||""===b?"":c||"number"!==typeof b||0===b||jd.hasOwnProperty(a)&&jd[a]?(""+b).trim():b+"px"}
  function md(a,b){a=a.style;for(var c in b)if(b.hasOwnProperty(c)){var d=0===c.indexOf("--"),e=ld(c,b[c],d);"float"===c&&(c="cssFloat");d?a.setProperty(c,e):a[c]=e;}}var nd=objectAssign({menuitem:!0},{area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,keygen:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0});
  function od(a,b){if(b){if(nd[a]&&(null!=b.children||null!=b.dangerouslySetInnerHTML))throw Error(u$1(137,a,""));if(null!=b.dangerouslySetInnerHTML){if(null!=b.children)throw Error(u$1(60));if(!("object"===typeof b.dangerouslySetInnerHTML&&"__html"in b.dangerouslySetInnerHTML))throw Error(u$1(61));}if(null!=b.style&&"object"!==typeof b.style)throw Error(u$1(62,""));}}
  function pd(a,b){if(-1===a.indexOf("-"))return "string"===typeof b.is;switch(a){case "annotation-xml":case "color-profile":case "font-face":case "font-face-src":case "font-face-uri":case "font-face-format":case "font-face-name":case "missing-glyph":return !1;default:return !0}}var qd=Mb.html;function rd(a,b){a=9===a.nodeType||11===a.nodeType?a:a.ownerDocument;var c=cc(a);b=wa[b];for(var d=0;d<b.length;d++)uc(b[d],a,c);}function sd(){}
  function td(a){a=a||("undefined"!==typeof document?document:void 0);if("undefined"===typeof a)return null;try{return a.activeElement||a.body}catch(b){return a.body}}function ud(a){for(;a&&a.firstChild;)a=a.firstChild;return a}function vd(a,b){var c=ud(a);a=0;for(var d;c;){if(3===c.nodeType){d=a+c.textContent.length;if(a<=b&&d>=b)return {node:c,offset:b-a};a=d;}a:{for(;c;){if(c.nextSibling){c=c.nextSibling;break a}c=c.parentNode;}c=void 0;}c=ud(c);}}
  function wd(a,b){return a&&b?a===b?!0:a&&3===a.nodeType?!1:b&&3===b.nodeType?wd(a,b.parentNode):"contains"in a?a.contains(b):a.compareDocumentPosition?!!(a.compareDocumentPosition(b)&16):!1:!1}function xd(){for(var a=window,b=td();b instanceof a.HTMLIFrameElement;){try{var c="string"===typeof b.contentWindow.location.href;}catch(d){c=!1;}if(c)a=b.contentWindow;else break;b=td(a.document);}return b}
  function yd(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return b&&("input"===b&&("text"===a.type||"search"===a.type||"tel"===a.type||"url"===a.type||"password"===a.type)||"textarea"===b||"true"===a.contentEditable)}var zd="$",Ad="/$",Bd="$?",Cd="$!",Dd=null,Ed=null;function Fd(a,b){switch(a){case "button":case "input":case "select":case "textarea":return !!b.autoFocus}return !1}
  function Gd(a,b){return "textarea"===a||"option"===a||"noscript"===a||"string"===typeof b.children||"number"===typeof b.children||"object"===typeof b.dangerouslySetInnerHTML&&null!==b.dangerouslySetInnerHTML&&null!=b.dangerouslySetInnerHTML.__html}var Hd="function"===typeof setTimeout?setTimeout:void 0,Id="function"===typeof clearTimeout?clearTimeout:void 0;function Jd(a){for(;null!=a;a=a.nextSibling){var b=a.nodeType;if(1===b||3===b)break}return a}
  function Kd(a){a=a.previousSibling;for(var b=0;a;){if(8===a.nodeType){var c=a.data;if(c===zd||c===Cd||c===Bd){if(0===b)return a;b--;}else c===Ad&&b++;}a=a.previousSibling;}return null}var Ld=Math.random().toString(36).slice(2),Md="__reactInternalInstance$"+Ld,Nd="__reactEventHandlers$"+Ld,Od="__reactContainere$"+Ld;
  function tc(a){var b=a[Md];if(b)return b;for(var c=a.parentNode;c;){if(b=c[Od]||c[Md]){c=b.alternate;if(null!==b.child||null!==c&&null!==c.child)for(a=Kd(a);null!==a;){if(c=a[Md])return c;a=Kd(a);}return b}a=c;c=a.parentNode;}return null}function Nc(a){a=a[Md]||a[Od];return !a||5!==a.tag&&6!==a.tag&&13!==a.tag&&3!==a.tag?null:a}function Pd(a){if(5===a.tag||6===a.tag)return a.stateNode;throw Error(u$1(33));}function Qd(a){return a[Nd]||null}
  function Rd(a){do a=a.return;while(a&&5!==a.tag);return a?a:null}
  function Sd(a,b){var c=a.stateNode;if(!c)return null;var d=la(c);if(!d)return null;c=d[b];a:switch(b){case "onClick":case "onClickCapture":case "onDoubleClick":case "onDoubleClickCapture":case "onMouseDown":case "onMouseDownCapture":case "onMouseMove":case "onMouseMoveCapture":case "onMouseUp":case "onMouseUpCapture":case "onMouseEnter":(d=!d.disabled)||(a=a.type,d=!("button"===a||"input"===a||"select"===a||"textarea"===a));a=!d;break a;default:a=!1;}if(a)return null;if(c&&"function"!==typeof c)throw Error(u$1(231,
  b,typeof c));return c}function Td(a,b,c){if(b=Sd(a,c.dispatchConfig.phasedRegistrationNames[b]))c._dispatchListeners=ic(c._dispatchListeners,b),c._dispatchInstances=ic(c._dispatchInstances,a);}function Ud(a){if(a&&a.dispatchConfig.phasedRegistrationNames){for(var b=a._targetInst,c=[];b;)c.push(b),b=Rd(b);for(b=c.length;0<b--;)Td(c[b],"captured",a);for(b=0;b<c.length;b++)Td(c[b],"bubbled",a);}}
  function Vd(a,b,c){a&&c&&c.dispatchConfig.registrationName&&(b=Sd(a,c.dispatchConfig.registrationName))&&(c._dispatchListeners=ic(c._dispatchListeners,b),c._dispatchInstances=ic(c._dispatchInstances,a));}function Wd(a){a&&a.dispatchConfig.registrationName&&Vd(a._targetInst,null,a);}function Xd(a){jc(a,Ud);}var Yd=null,Zd=null,$d=null;
  function ae(){if($d)return $d;var a,b=Zd,c=b.length,d,e="value"in Yd?Yd.value:Yd.textContent,f=e.length;for(a=0;a<c&&b[a]===e[a];a++);var g=c-a;for(d=1;d<=g&&b[c-d]===e[f-d];d++);return $d=e.slice(a,1<d?1-d:void 0)}function be(){return !0}function ce(){return !1}
  function G$1(a,b,c,d){this.dispatchConfig=a;this._targetInst=b;this.nativeEvent=c;a=this.constructor.Interface;for(var e in a)a.hasOwnProperty(e)&&((b=a[e])?this[e]=b(c):"target"===e?this.target=d:this[e]=c[e]);this.isDefaultPrevented=(null!=c.defaultPrevented?c.defaultPrevented:!1===c.returnValue)?be:ce;this.isPropagationStopped=ce;return this}
  objectAssign(G$1.prototype,{preventDefault:function(){this.defaultPrevented=!0;var a=this.nativeEvent;a&&(a.preventDefault?a.preventDefault():"unknown"!==typeof a.returnValue&&(a.returnValue=!1),this.isDefaultPrevented=be);},stopPropagation:function(){var a=this.nativeEvent;a&&(a.stopPropagation?a.stopPropagation():"unknown"!==typeof a.cancelBubble&&(a.cancelBubble=!0),this.isPropagationStopped=be);},persist:function(){this.isPersistent=be;},isPersistent:ce,destructor:function(){var a=this.constructor.Interface,
  b;for(b in a)this[b]=null;this.nativeEvent=this._targetInst=this.dispatchConfig=null;this.isPropagationStopped=this.isDefaultPrevented=ce;this._dispatchInstances=this._dispatchListeners=null;}});G$1.Interface={type:null,target:null,currentTarget:function(){return null},eventPhase:null,bubbles:null,cancelable:null,timeStamp:function(a){return a.timeStamp||Date.now()},defaultPrevented:null,isTrusted:null};
  G$1.extend=function(a){function b(){}function c(){return d.apply(this,arguments)}var d=this;b.prototype=d.prototype;var e=new b;objectAssign(e,c.prototype);c.prototype=e;c.prototype.constructor=c;c.Interface=objectAssign({},d.Interface,a);c.extend=d.extend;de(c);return c};de(G$1);function ee(a,b,c,d){if(this.eventPool.length){var e=this.eventPool.pop();this.call(e,a,b,c,d);return e}return new this(a,b,c,d)}
  function fe(a){if(!(a instanceof this))throw Error(u$1(279));a.destructor();10>this.eventPool.length&&this.eventPool.push(a);}function de(a){a.eventPool=[];a.getPooled=ee;a.release=fe;}var ge=G$1.extend({data:null}),he=G$1.extend({data:null}),ie=[9,13,27,32],je=ya&&"CompositionEvent"in window,ke=null;ya&&"documentMode"in document&&(ke=document.documentMode);
  var le=ya&&"TextEvent"in window&&!ke,me=ya&&(!je||ke&&8<ke&&11>=ke),ne=String.fromCharCode(32),oe={beforeInput:{phasedRegistrationNames:{bubbled:"onBeforeInput",captured:"onBeforeInputCapture"},dependencies:["compositionend","keypress","textInput","paste"]},compositionEnd:{phasedRegistrationNames:{bubbled:"onCompositionEnd",captured:"onCompositionEndCapture"},dependencies:"blur compositionend keydown keypress keyup mousedown".split(" ")},compositionStart:{phasedRegistrationNames:{bubbled:"onCompositionStart",
  captured:"onCompositionStartCapture"},dependencies:"blur compositionstart keydown keypress keyup mousedown".split(" ")},compositionUpdate:{phasedRegistrationNames:{bubbled:"onCompositionUpdate",captured:"onCompositionUpdateCapture"},dependencies:"blur compositionupdate keydown keypress keyup mousedown".split(" ")}},pe=!1;
  function qe(a,b){switch(a){case "keyup":return -1!==ie.indexOf(b.keyCode);case "keydown":return 229!==b.keyCode;case "keypress":case "mousedown":case "blur":return !0;default:return !1}}function re(a){a=a.detail;return "object"===typeof a&&"data"in a?a.data:null}var se=!1;function te(a,b){switch(a){case "compositionend":return re(b);case "keypress":if(32!==b.which)return null;pe=!0;return ne;case "textInput":return a=b.data,a===ne&&pe?null:a;default:return null}}
  function ue(a,b){if(se)return "compositionend"===a||!je&&qe(a,b)?(a=ae(),$d=Zd=Yd=null,se=!1,a):null;switch(a){case "paste":return null;case "keypress":if(!(b.ctrlKey||b.altKey||b.metaKey)||b.ctrlKey&&b.altKey){if(b.char&&1<b.char.length)return b.char;if(b.which)return String.fromCharCode(b.which)}return null;case "compositionend":return me&&"ko"!==b.locale?null:b.data;default:return null}}
  var ve={eventTypes:oe,extractEvents:function(a,b,c,d){var e;if(je)b:{switch(a){case "compositionstart":var f=oe.compositionStart;break b;case "compositionend":f=oe.compositionEnd;break b;case "compositionupdate":f=oe.compositionUpdate;break b}f=void 0;}else se?qe(a,c)&&(f=oe.compositionEnd):"keydown"===a&&229===c.keyCode&&(f=oe.compositionStart);f?(me&&"ko"!==c.locale&&(se||f!==oe.compositionStart?f===oe.compositionEnd&&se&&(e=ae()):(Yd=d,Zd="value"in Yd?Yd.value:Yd.textContent,se=!0)),f=ge.getPooled(f,
  b,c,d),e?f.data=e:(e=re(c),null!==e&&(f.data=e)),Xd(f),e=f):e=null;(a=le?te(a,c):ue(a,c))?(b=he.getPooled(oe.beforeInput,b,c,d),b.data=a,Xd(b)):b=null;return null===e?b:null===b?e:[e,b]}},we={color:!0,date:!0,datetime:!0,"datetime-local":!0,email:!0,month:!0,number:!0,password:!0,range:!0,search:!0,tel:!0,text:!0,time:!0,url:!0,week:!0};function xe(a){var b=a&&a.nodeName&&a.nodeName.toLowerCase();return "input"===b?!!we[a.type]:"textarea"===b?!0:!1}
  var ye={change:{phasedRegistrationNames:{bubbled:"onChange",captured:"onChangeCapture"},dependencies:"blur change click focus input keydown keyup selectionchange".split(" ")}};function ze(a,b,c){a=G$1.getPooled(ye.change,a,b,c);a.type="change";Da(c);Xd(a);return a}var Ae=null,Be=null;function Ce(a){mc(a);}function De(a){var b=Pd(a);if(yb(b))return a}function Ee(a,b){if("change"===a)return b}var Fe=!1;ya&&(Fe=oc("input")&&(!document.documentMode||9<document.documentMode));
  function Ge(){Ae&&(Ae.detachEvent("onpropertychange",He),Be=Ae=null);}function He(a){if("value"===a.propertyName&&De(Be))if(a=ze(Be,a,nc(a)),Ja)mc(a);else{Ja=!0;try{Fa(Ce,a);}finally{Ja=!1,La();}}}function Ie(a,b,c){"focus"===a?(Ge(),Ae=b,Be=c,Ae.attachEvent("onpropertychange",He)):"blur"===a&&Ge();}function Je(a){if("selectionchange"===a||"keyup"===a||"keydown"===a)return De(Be)}function Ke(a,b){if("click"===a)return De(b)}function Le(a,b){if("input"===a||"change"===a)return De(b)}
  var Me={eventTypes:ye,_isInputEventSupported:Fe,extractEvents:function(a,b,c,d){var e=b?Pd(b):window,f=e.nodeName&&e.nodeName.toLowerCase();if("select"===f||"input"===f&&"file"===e.type)var g=Ee;else if(xe(e))if(Fe)g=Le;else{g=Je;var h=Ie;}else(f=e.nodeName)&&"input"===f.toLowerCase()&&("checkbox"===e.type||"radio"===e.type)&&(g=Ke);if(g&&(g=g(a,b)))return ze(g,c,d);h&&h(a,e,b);"blur"===a&&(a=e._wrapperState)&&a.controlled&&"number"===e.type&&Db(e,"number",e.value);}},Ne=G$1.extend({view:null,detail:null}),
  Oe={Alt:"altKey",Control:"ctrlKey",Meta:"metaKey",Shift:"shiftKey"};function Pe(a){var b=this.nativeEvent;return b.getModifierState?b.getModifierState(a):(a=Oe[a])?!!b[a]:!1}function Qe(){return Pe}
  var Re=0,Se=0,Te=!1,Ue=!1,Ve=Ne.extend({screenX:null,screenY:null,clientX:null,clientY:null,pageX:null,pageY:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,getModifierState:Qe,button:null,buttons:null,relatedTarget:function(a){return a.relatedTarget||(a.fromElement===a.srcElement?a.toElement:a.fromElement)},movementX:function(a){if("movementX"in a)return a.movementX;var b=Re;Re=a.screenX;return Te?"mousemove"===a.type?a.screenX-b:0:(Te=!0,0)},movementY:function(a){if("movementY"in a)return a.movementY;
  var b=Se;Se=a.screenY;return Ue?"mousemove"===a.type?a.screenY-b:0:(Ue=!0,0)}}),We=Ve.extend({pointerId:null,width:null,height:null,pressure:null,tangentialPressure:null,tiltX:null,tiltY:null,twist:null,pointerType:null,isPrimary:null}),Xe={mouseEnter:{registrationName:"onMouseEnter",dependencies:["mouseout","mouseover"]},mouseLeave:{registrationName:"onMouseLeave",dependencies:["mouseout","mouseover"]},pointerEnter:{registrationName:"onPointerEnter",dependencies:["pointerout","pointerover"]},pointerLeave:{registrationName:"onPointerLeave",
  dependencies:["pointerout","pointerover"]}},Ye={eventTypes:Xe,extractEvents:function(a,b,c,d,e){var f="mouseover"===a||"pointerover"===a,g="mouseout"===a||"pointerout"===a;if(f&&0===(e&32)&&(c.relatedTarget||c.fromElement)||!g&&!f)return null;f=d.window===d?d:(f=d.ownerDocument)?f.defaultView||f.parentWindow:window;if(g){if(g=b,b=(b=c.relatedTarget||c.toElement)?tc(b):null,null!==b){var h=dc(b);if(b!==h||5!==b.tag&&6!==b.tag)b=null;}}else g=null;if(g===b)return null;if("mouseout"===a||"mouseover"===
  a){var k=Ve;var l=Xe.mouseLeave;var m=Xe.mouseEnter;var p="mouse";}else if("pointerout"===a||"pointerover"===a)k=We,l=Xe.pointerLeave,m=Xe.pointerEnter,p="pointer";a=null==g?f:Pd(g);f=null==b?f:Pd(b);l=k.getPooled(l,g,c,d);l.type=p+"leave";l.target=a;l.relatedTarget=f;c=k.getPooled(m,b,c,d);c.type=p+"enter";c.target=f;c.relatedTarget=a;d=g;p=b;if(d&&p)a:{k=d;m=p;g=0;for(a=k;a;a=Rd(a))g++;a=0;for(b=m;b;b=Rd(b))a++;for(;0<g-a;)k=Rd(k),g--;for(;0<a-g;)m=Rd(m),a--;for(;g--;){if(k===m||k===m.alternate)break a;
  k=Rd(k);m=Rd(m);}k=null;}else k=null;m=k;for(k=[];d&&d!==m;){g=d.alternate;if(null!==g&&g===m)break;k.push(d);d=Rd(d);}for(d=[];p&&p!==m;){g=p.alternate;if(null!==g&&g===m)break;d.push(p);p=Rd(p);}for(p=0;p<k.length;p++)Vd(k[p],"bubbled",l);for(p=d.length;0<p--;)Vd(d[p],"captured",c);return 0===(e&64)?[l]:[l,c]}};function Ze(a,b){return a===b&&(0!==a||1/a===1/b)||a!==a&&b!==b}var $e="function"===typeof Object.is?Object.is:Ze,af=Object.prototype.hasOwnProperty;
  function bf(a,b){if($e(a,b))return !0;if("object"!==typeof a||null===a||"object"!==typeof b||null===b)return !1;var c=Object.keys(a),d=Object.keys(b);if(c.length!==d.length)return !1;for(d=0;d<c.length;d++)if(!af.call(b,c[d])||!$e(a[c[d]],b[c[d]]))return !1;return !0}
  var cf=ya&&"documentMode"in document&&11>=document.documentMode,df={select:{phasedRegistrationNames:{bubbled:"onSelect",captured:"onSelectCapture"},dependencies:"blur contextmenu dragend focus keydown keyup mousedown mouseup selectionchange".split(" ")}},ef=null,ff=null,gf=null,hf=!1;
  function jf(a,b){var c=b.window===b?b.document:9===b.nodeType?b:b.ownerDocument;if(hf||null==ef||ef!==td(c))return null;c=ef;"selectionStart"in c&&yd(c)?c={start:c.selectionStart,end:c.selectionEnd}:(c=(c.ownerDocument&&c.ownerDocument.defaultView||window).getSelection(),c={anchorNode:c.anchorNode,anchorOffset:c.anchorOffset,focusNode:c.focusNode,focusOffset:c.focusOffset});return gf&&bf(gf,c)?null:(gf=c,a=G$1.getPooled(df.select,ff,a,b),a.type="select",a.target=ef,Xd(a),a)}
  var kf={eventTypes:df,extractEvents:function(a,b,c,d,e,f){e=f||(d.window===d?d.document:9===d.nodeType?d:d.ownerDocument);if(!(f=!e)){a:{e=cc(e);f=wa.onSelect;for(var g=0;g<f.length;g++)if(!e.has(f[g])){e=!1;break a}e=!0;}f=!e;}if(f)return null;e=b?Pd(b):window;switch(a){case "focus":if(xe(e)||"true"===e.contentEditable)ef=e,ff=b,gf=null;break;case "blur":gf=ff=ef=null;break;case "mousedown":hf=!0;break;case "contextmenu":case "mouseup":case "dragend":return hf=!1,jf(c,d);case "selectionchange":if(cf)break;
  case "keydown":case "keyup":return jf(c,d)}return null}},lf=G$1.extend({animationName:null,elapsedTime:null,pseudoElement:null}),mf=G$1.extend({clipboardData:function(a){return "clipboardData"in a?a.clipboardData:window.clipboardData}}),nf=Ne.extend({relatedTarget:null});function of(a){var b=a.keyCode;"charCode"in a?(a=a.charCode,0===a&&13===b&&(a=13)):a=b;10===a&&(a=13);return 32<=a||13===a?a:0}
  var pf={Esc:"Escape",Spacebar:" ",Left:"ArrowLeft",Up:"ArrowUp",Right:"ArrowRight",Down:"ArrowDown",Del:"Delete",Win:"OS",Menu:"ContextMenu",Apps:"ContextMenu",Scroll:"ScrollLock",MozPrintableKey:"Unidentified"},qf={8:"Backspace",9:"Tab",12:"Clear",13:"Enter",16:"Shift",17:"Control",18:"Alt",19:"Pause",20:"CapsLock",27:"Escape",32:" ",33:"PageUp",34:"PageDown",35:"End",36:"Home",37:"ArrowLeft",38:"ArrowUp",39:"ArrowRight",40:"ArrowDown",45:"Insert",46:"Delete",112:"F1",113:"F2",114:"F3",115:"F4",
  116:"F5",117:"F6",118:"F7",119:"F8",120:"F9",121:"F10",122:"F11",123:"F12",144:"NumLock",145:"ScrollLock",224:"Meta"},rf=Ne.extend({key:function(a){if(a.key){var b=pf[a.key]||a.key;if("Unidentified"!==b)return b}return "keypress"===a.type?(a=of(a),13===a?"Enter":String.fromCharCode(a)):"keydown"===a.type||"keyup"===a.type?qf[a.keyCode]||"Unidentified":""},location:null,ctrlKey:null,shiftKey:null,altKey:null,metaKey:null,repeat:null,locale:null,getModifierState:Qe,charCode:function(a){return "keypress"===
  a.type?of(a):0},keyCode:function(a){return "keydown"===a.type||"keyup"===a.type?a.keyCode:0},which:function(a){return "keypress"===a.type?of(a):"keydown"===a.type||"keyup"===a.type?a.keyCode:0}}),sf=Ve.extend({dataTransfer:null}),tf=Ne.extend({touches:null,targetTouches:null,changedTouches:null,altKey:null,metaKey:null,ctrlKey:null,shiftKey:null,getModifierState:Qe}),uf=G$1.extend({propertyName:null,elapsedTime:null,pseudoElement:null}),vf=Ve.extend({deltaX:function(a){return "deltaX"in a?a.deltaX:"wheelDeltaX"in
  a?-a.wheelDeltaX:0},deltaY:function(a){return "deltaY"in a?a.deltaY:"wheelDeltaY"in a?-a.wheelDeltaY:"wheelDelta"in a?-a.wheelDelta:0},deltaZ:null,deltaMode:null}),wf={eventTypes:Wc,extractEvents:function(a,b,c,d){var e=Yc.get(a);if(!e)return null;switch(a){case "keypress":if(0===of(c))return null;case "keydown":case "keyup":a=rf;break;case "blur":case "focus":a=nf;break;case "click":if(2===c.button)return null;case "auxclick":case "dblclick":case "mousedown":case "mousemove":case "mouseup":case "mouseout":case "mouseover":case "contextmenu":a=
  Ve;break;case "drag":case "dragend":case "dragenter":case "dragexit":case "dragleave":case "dragover":case "dragstart":case "drop":a=sf;break;case "touchcancel":case "touchend":case "touchmove":case "touchstart":a=tf;break;case Xb:case Yb:case Zb:a=lf;break;case $b:a=uf;break;case "scroll":a=Ne;break;case "wheel":a=vf;break;case "copy":case "cut":case "paste":a=mf;break;case "gotpointercapture":case "lostpointercapture":case "pointercancel":case "pointerdown":case "pointermove":case "pointerout":case "pointerover":case "pointerup":a=
  We;break;default:a=G$1;}b=a.getPooled(e,b,c,d);Xd(b);return b}};if(pa)throw Error(u$1(101));pa=Array.prototype.slice.call("ResponderEventPlugin SimpleEventPlugin EnterLeaveEventPlugin ChangeEventPlugin SelectEventPlugin BeforeInputEventPlugin".split(" "));ra();var xf=Nc;la=Qd;ma=xf;na=Pd;xa({SimpleEventPlugin:wf,EnterLeaveEventPlugin:Ye,ChangeEventPlugin:Me,SelectEventPlugin:kf,BeforeInputEventPlugin:ve});var yf=[],zf=-1;function H$1(a){0>zf||(a.current=yf[zf],yf[zf]=null,zf--);}
  function I$1(a,b){zf++;yf[zf]=a.current;a.current=b;}var Af={},J$1={current:Af},K$1={current:!1},Bf=Af;function Cf(a,b){var c=a.type.contextTypes;if(!c)return Af;var d=a.stateNode;if(d&&d.__reactInternalMemoizedUnmaskedChildContext===b)return d.__reactInternalMemoizedMaskedChildContext;var e={},f;for(f in c)e[f]=b[f];d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=b,a.__reactInternalMemoizedMaskedChildContext=e);return e}function L$1(a){a=a.childContextTypes;return null!==a&&void 0!==a}
  function Df(){H$1(K$1);H$1(J$1);}function Ef(a,b,c){if(J$1.current!==Af)throw Error(u$1(168));I$1(J$1,b);I$1(K$1,c);}function Ff(a,b,c){var d=a.stateNode;a=b.childContextTypes;if("function"!==typeof d.getChildContext)return c;d=d.getChildContext();for(var e in d)if(!(e in a))throw Error(u$1(108,pb(b)||"Unknown",e));return objectAssign({},c,{},d)}function Gf(a){a=(a=a.stateNode)&&a.__reactInternalMemoizedMergedChildContext||Af;Bf=J$1.current;I$1(J$1,a);I$1(K$1,K$1.current);return !0}
  function Hf(a,b,c){var d=a.stateNode;if(!d)throw Error(u$1(169));c?(a=Ff(a,b,Bf),d.__reactInternalMemoizedMergedChildContext=a,H$1(K$1),H$1(J$1),I$1(J$1,a)):H$1(K$1);I$1(K$1,c);}
  var If=scheduler.unstable_runWithPriority,Jf=scheduler.unstable_scheduleCallback,Kf=scheduler.unstable_cancelCallback,Lf=scheduler.unstable_requestPaint,Mf=scheduler.unstable_now,Nf=scheduler.unstable_getCurrentPriorityLevel,Of=scheduler.unstable_ImmediatePriority,Pf=scheduler.unstable_UserBlockingPriority,Qf=scheduler.unstable_NormalPriority,Rf=scheduler.unstable_LowPriority,Sf=scheduler.unstable_IdlePriority,Tf={},Uf=scheduler.unstable_shouldYield,Vf=void 0!==Lf?Lf:function(){},Wf=null,Xf=null,Yf=!1,Zf=Mf(),$f=1E4>Zf?Mf:function(){return Mf()-Zf};
  function ag(){switch(Nf()){case Of:return 99;case Pf:return 98;case Qf:return 97;case Rf:return 96;case Sf:return 95;default:throw Error(u$1(332));}}function bg(a){switch(a){case 99:return Of;case 98:return Pf;case 97:return Qf;case 96:return Rf;case 95:return Sf;default:throw Error(u$1(332));}}function cg(a,b){a=bg(a);return If(a,b)}function dg(a,b,c){a=bg(a);return Jf(a,b,c)}function eg(a){null===Wf?(Wf=[a],Xf=Jf(Of,fg)):Wf.push(a);return Tf}function gg(){if(null!==Xf){var a=Xf;Xf=null;Kf(a);}fg();}
  function fg(){if(!Yf&&null!==Wf){Yf=!0;var a=0;try{var b=Wf;cg(99,function(){for(;a<b.length;a++){var c=b[a];do c=c(!0);while(null!==c)}});Wf=null;}catch(c){throw null!==Wf&&(Wf=Wf.slice(a+1)),Jf(Of,gg),c;}finally{Yf=!1;}}}function hg(a,b,c){c/=10;return 1073741821-(((1073741821-a+b/10)/c|0)+1)*c}function ig(a,b){if(a&&a.defaultProps){b=objectAssign({},b);a=a.defaultProps;for(var c in a)void 0===b[c]&&(b[c]=a[c]);}return b}var jg={current:null},kg=null,lg=null,mg=null;function ng(){mg=lg=kg=null;}
  function og(a){var b=jg.current;H$1(jg);a.type._context._currentValue=b;}function pg(a,b){for(;null!==a;){var c=a.alternate;if(a.childExpirationTime<b)a.childExpirationTime=b,null!==c&&c.childExpirationTime<b&&(c.childExpirationTime=b);else if(null!==c&&c.childExpirationTime<b)c.childExpirationTime=b;else break;a=a.return;}}function qg(a,b){kg=a;mg=lg=null;a=a.dependencies;null!==a&&null!==a.firstContext&&(a.expirationTime>=b&&(rg=!0),a.firstContext=null);}
  function sg(a,b){if(mg!==a&&!1!==b&&0!==b){if("number"!==typeof b||1073741823===b)mg=a,b=1073741823;b={context:a,observedBits:b,next:null};if(null===lg){if(null===kg)throw Error(u$1(308));lg=b;kg.dependencies={expirationTime:0,firstContext:b,responders:null};}else lg=lg.next=b;}return a._currentValue}var tg=!1;function ug(a){a.updateQueue={baseState:a.memoizedState,baseQueue:null,shared:{pending:null},effects:null};}
  function vg(a,b){a=a.updateQueue;b.updateQueue===a&&(b.updateQueue={baseState:a.baseState,baseQueue:a.baseQueue,shared:a.shared,effects:a.effects});}function wg(a,b){a={expirationTime:a,suspenseConfig:b,tag:0,payload:null,callback:null,next:null};return a.next=a}function xg(a,b){a=a.updateQueue;if(null!==a){a=a.shared;var c=a.pending;null===c?b.next=b:(b.next=c.next,c.next=b);a.pending=b;}}
  function yg(a,b){var c=a.alternate;null!==c&&vg(c,a);a=a.updateQueue;c=a.baseQueue;null===c?(a.baseQueue=b.next=b,b.next=b):(b.next=c.next,c.next=b);}
  function zg(a,b,c,d){var e=a.updateQueue;tg=!1;var f=e.baseQueue,g=e.shared.pending;if(null!==g){if(null!==f){var h=f.next;f.next=g.next;g.next=h;}f=g;e.shared.pending=null;h=a.alternate;null!==h&&(h=h.updateQueue,null!==h&&(h.baseQueue=g));}if(null!==f){h=f.next;var k=e.baseState,l=0,m=null,p=null,x=null;if(null!==h){var z=h;do{g=z.expirationTime;if(g<d){var ca={expirationTime:z.expirationTime,suspenseConfig:z.suspenseConfig,tag:z.tag,payload:z.payload,callback:z.callback,next:null};null===x?(p=x=
  ca,m=k):x=x.next=ca;g>l&&(l=g);}else{null!==x&&(x=x.next={expirationTime:1073741823,suspenseConfig:z.suspenseConfig,tag:z.tag,payload:z.payload,callback:z.callback,next:null});Ag(g,z.suspenseConfig);a:{var D=a,t=z;g=b;ca=c;switch(t.tag){case 1:D=t.payload;if("function"===typeof D){k=D.call(ca,k,g);break a}k=D;break a;case 3:D.effectTag=D.effectTag&-4097|64;case 0:D=t.payload;g="function"===typeof D?D.call(ca,k,g):D;if(null===g||void 0===g)break a;k=objectAssign({},k,g);break a;case 2:tg=!0;}}null!==z.callback&&
  (a.effectTag|=32,g=e.effects,null===g?e.effects=[z]:g.push(z));}z=z.next;if(null===z||z===h)if(g=e.shared.pending,null===g)break;else z=f.next=g.next,g.next=h,e.baseQueue=f=g,e.shared.pending=null;}while(1)}null===x?m=k:x.next=p;e.baseState=m;e.baseQueue=x;Bg(l);a.expirationTime=l;a.memoizedState=k;}}
  function Cg(a,b,c){a=b.effects;b.effects=null;if(null!==a)for(b=0;b<a.length;b++){var d=a[b],e=d.callback;if(null!==e){d.callback=null;d=e;e=c;if("function"!==typeof d)throw Error(u$1(191,d));d.call(e);}}}var Dg=Wa.ReactCurrentBatchConfig,Eg=(new react.Component).refs;function Fg(a,b,c,d){b=a.memoizedState;c=c(d,b);c=null===c||void 0===c?b:objectAssign({},b,c);a.memoizedState=c;0===a.expirationTime&&(a.updateQueue.baseState=c);}
  var Jg={isMounted:function(a){return (a=a._reactInternalFiber)?dc(a)===a:!1},enqueueSetState:function(a,b,c){a=a._reactInternalFiber;var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e=wg(d,e);e.payload=b;void 0!==c&&null!==c&&(e.callback=c);xg(a,e);Ig(a,d);},enqueueReplaceState:function(a,b,c){a=a._reactInternalFiber;var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e=wg(d,e);e.tag=1;e.payload=b;void 0!==c&&null!==c&&(e.callback=c);xg(a,e);Ig(a,d);},enqueueForceUpdate:function(a,b){a=a._reactInternalFiber;var c=Gg(),d=Dg.suspense;
  c=Hg(c,a,d);d=wg(c,d);d.tag=2;void 0!==b&&null!==b&&(d.callback=b);xg(a,d);Ig(a,c);}};function Kg(a,b,c,d,e,f,g){a=a.stateNode;return "function"===typeof a.shouldComponentUpdate?a.shouldComponentUpdate(d,f,g):b.prototype&&b.prototype.isPureReactComponent?!bf(c,d)||!bf(e,f):!0}
  function Lg(a,b,c){var d=!1,e=Af;var f=b.contextType;"object"===typeof f&&null!==f?f=sg(f):(e=L$1(b)?Bf:J$1.current,d=b.contextTypes,f=(d=null!==d&&void 0!==d)?Cf(a,e):Af);b=new b(c,f);a.memoizedState=null!==b.state&&void 0!==b.state?b.state:null;b.updater=Jg;a.stateNode=b;b._reactInternalFiber=a;d&&(a=a.stateNode,a.__reactInternalMemoizedUnmaskedChildContext=e,a.__reactInternalMemoizedMaskedChildContext=f);return b}
  function Mg(a,b,c,d){a=b.state;"function"===typeof b.componentWillReceiveProps&&b.componentWillReceiveProps(c,d);"function"===typeof b.UNSAFE_componentWillReceiveProps&&b.UNSAFE_componentWillReceiveProps(c,d);b.state!==a&&Jg.enqueueReplaceState(b,b.state,null);}
  function Ng(a,b,c,d){var e=a.stateNode;e.props=c;e.state=a.memoizedState;e.refs=Eg;ug(a);var f=b.contextType;"object"===typeof f&&null!==f?e.context=sg(f):(f=L$1(b)?Bf:J$1.current,e.context=Cf(a,f));zg(a,c,e,d);e.state=a.memoizedState;f=b.getDerivedStateFromProps;"function"===typeof f&&(Fg(a,b,f,c),e.state=a.memoizedState);"function"===typeof b.getDerivedStateFromProps||"function"===typeof e.getSnapshotBeforeUpdate||"function"!==typeof e.UNSAFE_componentWillMount&&"function"!==typeof e.componentWillMount||
  (b=e.state,"function"===typeof e.componentWillMount&&e.componentWillMount(),"function"===typeof e.UNSAFE_componentWillMount&&e.UNSAFE_componentWillMount(),b!==e.state&&Jg.enqueueReplaceState(e,e.state,null),zg(a,c,e,d),e.state=a.memoizedState);"function"===typeof e.componentDidMount&&(a.effectTag|=4);}var Og=Array.isArray;
  function Pg(a,b,c){a=c.ref;if(null!==a&&"function"!==typeof a&&"object"!==typeof a){if(c._owner){c=c._owner;if(c){if(1!==c.tag)throw Error(u$1(309));var d=c.stateNode;}if(!d)throw Error(u$1(147,a));var e=""+a;if(null!==b&&null!==b.ref&&"function"===typeof b.ref&&b.ref._stringRef===e)return b.ref;b=function(a){var b=d.refs;b===Eg&&(b=d.refs={});null===a?delete b[e]:b[e]=a;};b._stringRef=e;return b}if("string"!==typeof a)throw Error(u$1(284));if(!c._owner)throw Error(u$1(290,a));}return a}
  function Qg(a,b){if("textarea"!==a.type)throw Error(u$1(31,"[object Object]"===Object.prototype.toString.call(b)?"object with keys {"+Object.keys(b).join(", ")+"}":b,""));}
  function Rg(a){function b(b,c){if(a){var d=b.lastEffect;null!==d?(d.nextEffect=c,b.lastEffect=c):b.firstEffect=b.lastEffect=c;c.nextEffect=null;c.effectTag=8;}}function c(c,d){if(!a)return null;for(;null!==d;)b(c,d),d=d.sibling;return null}function d(a,b){for(a=new Map;null!==b;)null!==b.key?a.set(b.key,b):a.set(b.index,b),b=b.sibling;return a}function e(a,b){a=Sg(a,b);a.index=0;a.sibling=null;return a}function f(b,c,d){b.index=d;if(!a)return c;d=b.alternate;if(null!==d)return d=d.index,d<c?(b.effectTag=
  2,c):d;b.effectTag=2;return c}function g(b){a&&null===b.alternate&&(b.effectTag=2);return b}function h(a,b,c,d){if(null===b||6!==b.tag)return b=Tg(c,a.mode,d),b.return=a,b;b=e(b,c);b.return=a;return b}function k(a,b,c,d){if(null!==b&&b.elementType===c.type)return d=e(b,c.props),d.ref=Pg(a,b,c),d.return=a,d;d=Ug(c.type,c.key,c.props,null,a.mode,d);d.ref=Pg(a,b,c);d.return=a;return d}function l(a,b,c,d){if(null===b||4!==b.tag||b.stateNode.containerInfo!==c.containerInfo||b.stateNode.implementation!==
  c.implementation)return b=Vg(c,a.mode,d),b.return=a,b;b=e(b,c.children||[]);b.return=a;return b}function m(a,b,c,d,f){if(null===b||7!==b.tag)return b=Wg(c,a.mode,d,f),b.return=a,b;b=e(b,c);b.return=a;return b}function p(a,b,c){if("string"===typeof b||"number"===typeof b)return b=Tg(""+b,a.mode,c),b.return=a,b;if("object"===typeof b&&null!==b){switch(b.$$typeof){case Za:return c=Ug(b.type,b.key,b.props,null,a.mode,c),c.ref=Pg(a,null,b),c.return=a,c;case $a:return b=Vg(b,a.mode,c),b.return=a,b}if(Og(b)||
  nb(b))return b=Wg(b,a.mode,c,null),b.return=a,b;Qg(a,b);}return null}function x(a,b,c,d){var e=null!==b?b.key:null;if("string"===typeof c||"number"===typeof c)return null!==e?null:h(a,b,""+c,d);if("object"===typeof c&&null!==c){switch(c.$$typeof){case Za:return c.key===e?c.type===ab?m(a,b,c.props.children,d,e):k(a,b,c,d):null;case $a:return c.key===e?l(a,b,c,d):null}if(Og(c)||nb(c))return null!==e?null:m(a,b,c,d,null);Qg(a,c);}return null}function z(a,b,c,d,e){if("string"===typeof d||"number"===typeof d)return a=
  a.get(c)||null,h(b,a,""+d,e);if("object"===typeof d&&null!==d){switch(d.$$typeof){case Za:return a=a.get(null===d.key?c:d.key)||null,d.type===ab?m(b,a,d.props.children,e,d.key):k(b,a,d,e);case $a:return a=a.get(null===d.key?c:d.key)||null,l(b,a,d,e)}if(Og(d)||nb(d))return a=a.get(c)||null,m(b,a,d,e,null);Qg(b,d);}return null}function ca(e,g,h,k){for(var l=null,t=null,m=g,y=g=0,A=null;null!==m&&y<h.length;y++){m.index>y?(A=m,m=null):A=m.sibling;var q=x(e,m,h[y],k);if(null===q){null===m&&(m=A);break}a&&
  m&&null===q.alternate&&b(e,m);g=f(q,g,y);null===t?l=q:t.sibling=q;t=q;m=A;}if(y===h.length)return c(e,m),l;if(null===m){for(;y<h.length;y++)m=p(e,h[y],k),null!==m&&(g=f(m,g,y),null===t?l=m:t.sibling=m,t=m);return l}for(m=d(e,m);y<h.length;y++)A=z(m,e,y,h[y],k),null!==A&&(a&&null!==A.alternate&&m.delete(null===A.key?y:A.key),g=f(A,g,y),null===t?l=A:t.sibling=A,t=A);a&&m.forEach(function(a){return b(e,a)});return l}function D(e,g,h,l){var k=nb(h);if("function"!==typeof k)throw Error(u$1(150));h=k.call(h);
  if(null==h)throw Error(u$1(151));for(var m=k=null,t=g,y=g=0,A=null,q=h.next();null!==t&&!q.done;y++,q=h.next()){t.index>y?(A=t,t=null):A=t.sibling;var D=x(e,t,q.value,l);if(null===D){null===t&&(t=A);break}a&&t&&null===D.alternate&&b(e,t);g=f(D,g,y);null===m?k=D:m.sibling=D;m=D;t=A;}if(q.done)return c(e,t),k;if(null===t){for(;!q.done;y++,q=h.next())q=p(e,q.value,l),null!==q&&(g=f(q,g,y),null===m?k=q:m.sibling=q,m=q);return k}for(t=d(e,t);!q.done;y++,q=h.next())q=z(t,e,y,q.value,l),null!==q&&(a&&null!==
  q.alternate&&t.delete(null===q.key?y:q.key),g=f(q,g,y),null===m?k=q:m.sibling=q,m=q);a&&t.forEach(function(a){return b(e,a)});return k}return function(a,d,f,h){var k="object"===typeof f&&null!==f&&f.type===ab&&null===f.key;k&&(f=f.props.children);var l="object"===typeof f&&null!==f;if(l)switch(f.$$typeof){case Za:a:{l=f.key;for(k=d;null!==k;){if(k.key===l){switch(k.tag){case 7:if(f.type===ab){c(a,k.sibling);d=e(k,f.props.children);d.return=a;a=d;break a}break;default:if(k.elementType===f.type){c(a,
  k.sibling);d=e(k,f.props);d.ref=Pg(a,k,f);d.return=a;a=d;break a}}c(a,k);break}else b(a,k);k=k.sibling;}f.type===ab?(d=Wg(f.props.children,a.mode,h,f.key),d.return=a,a=d):(h=Ug(f.type,f.key,f.props,null,a.mode,h),h.ref=Pg(a,d,f),h.return=a,a=h);}return g(a);case $a:a:{for(k=f.key;null!==d;){if(d.key===k)if(4===d.tag&&d.stateNode.containerInfo===f.containerInfo&&d.stateNode.implementation===f.implementation){c(a,d.sibling);d=e(d,f.children||[]);d.return=a;a=d;break a}else{c(a,d);break}else b(a,d);d=
  d.sibling;}d=Vg(f,a.mode,h);d.return=a;a=d;}return g(a)}if("string"===typeof f||"number"===typeof f)return f=""+f,null!==d&&6===d.tag?(c(a,d.sibling),d=e(d,f),d.return=a,a=d):(c(a,d),d=Tg(f,a.mode,h),d.return=a,a=d),g(a);if(Og(f))return ca(a,d,f,h);if(nb(f))return D(a,d,f,h);l&&Qg(a,f);if("undefined"===typeof f&&!k)switch(a.tag){case 1:case 0:throw a=a.type,Error(u$1(152,a.displayName||a.name||"Component"));}return c(a,d)}}var Xg=Rg(!0),Yg=Rg(!1),Zg={},$g={current:Zg},ah={current:Zg},bh={current:Zg};
  function ch(a){if(a===Zg)throw Error(u$1(174));return a}function dh(a,b){I$1(bh,b);I$1(ah,a);I$1($g,Zg);a=b.nodeType;switch(a){case 9:case 11:b=(b=b.documentElement)?b.namespaceURI:Ob(null,"");break;default:a=8===a?b.parentNode:b,b=a.namespaceURI||null,a=a.tagName,b=Ob(b,a);}H$1($g);I$1($g,b);}function eh(){H$1($g);H$1(ah);H$1(bh);}function fh(a){ch(bh.current);var b=ch($g.current);var c=Ob(b,a.type);b!==c&&(I$1(ah,a),I$1($g,c));}function gh(a){ah.current===a&&(H$1($g),H$1(ah));}var M$1={current:0};
  function hh(a){for(var b=a;null!==b;){if(13===b.tag){var c=b.memoizedState;if(null!==c&&(c=c.dehydrated,null===c||c.data===Bd||c.data===Cd))return b}else if(19===b.tag&&void 0!==b.memoizedProps.revealOrder){if(0!==(b.effectTag&64))return b}else if(null!==b.child){b.child.return=b;b=b.child;continue}if(b===a)break;for(;null===b.sibling;){if(null===b.return||b.return===a)return null;b=b.return;}b.sibling.return=b.return;b=b.sibling;}return null}function ih(a,b){return {responder:a,props:b}}
  var jh=Wa.ReactCurrentDispatcher,kh=Wa.ReactCurrentBatchConfig,lh=0,N$1=null,O$1=null,P$1=null,mh=!1;function Q$1(){throw Error(u$1(321));}function nh(a,b){if(null===b)return !1;for(var c=0;c<b.length&&c<a.length;c++)if(!$e(a[c],b[c]))return !1;return !0}
  function oh(a,b,c,d,e,f){lh=f;N$1=b;b.memoizedState=null;b.updateQueue=null;b.expirationTime=0;jh.current=null===a||null===a.memoizedState?ph:qh;a=c(d,e);if(b.expirationTime===lh){f=0;do{b.expirationTime=0;if(!(25>f))throw Error(u$1(301));f+=1;P$1=O$1=null;b.updateQueue=null;jh.current=rh;a=c(d,e);}while(b.expirationTime===lh)}jh.current=sh;b=null!==O$1&&null!==O$1.next;lh=0;P$1=O$1=N$1=null;mh=!1;if(b)throw Error(u$1(300));return a}
  function th(){var a={memoizedState:null,baseState:null,baseQueue:null,queue:null,next:null};null===P$1?N$1.memoizedState=P$1=a:P$1=P$1.next=a;return P$1}function uh(){if(null===O$1){var a=N$1.alternate;a=null!==a?a.memoizedState:null;}else a=O$1.next;var b=null===P$1?N$1.memoizedState:P$1.next;if(null!==b)P$1=b,O$1=a;else{if(null===a)throw Error(u$1(310));O$1=a;a={memoizedState:O$1.memoizedState,baseState:O$1.baseState,baseQueue:O$1.baseQueue,queue:O$1.queue,next:null};null===P$1?N$1.memoizedState=P$1=a:P$1=P$1.next=a;}return P$1}
  function vh(a,b){return "function"===typeof b?b(a):b}
  function wh(a){var b=uh(),c=b.queue;if(null===c)throw Error(u$1(311));c.lastRenderedReducer=a;var d=O$1,e=d.baseQueue,f=c.pending;if(null!==f){if(null!==e){var g=e.next;e.next=f.next;f.next=g;}d.baseQueue=e=f;c.pending=null;}if(null!==e){e=e.next;d=d.baseState;var h=g=f=null,k=e;do{var l=k.expirationTime;if(l<lh){var m={expirationTime:k.expirationTime,suspenseConfig:k.suspenseConfig,action:k.action,eagerReducer:k.eagerReducer,eagerState:k.eagerState,next:null};null===h?(g=h=m,f=d):h=h.next=m;l>N$1.expirationTime&&
  (N$1.expirationTime=l,Bg(l));}else null!==h&&(h=h.next={expirationTime:1073741823,suspenseConfig:k.suspenseConfig,action:k.action,eagerReducer:k.eagerReducer,eagerState:k.eagerState,next:null}),Ag(l,k.suspenseConfig),d=k.eagerReducer===a?k.eagerState:a(d,k.action);k=k.next;}while(null!==k&&k!==e);null===h?f=d:h.next=g;$e(d,b.memoizedState)||(rg=!0);b.memoizedState=d;b.baseState=f;b.baseQueue=h;c.lastRenderedState=d;}return [b.memoizedState,c.dispatch]}
  function xh(a){var b=uh(),c=b.queue;if(null===c)throw Error(u$1(311));c.lastRenderedReducer=a;var d=c.dispatch,e=c.pending,f=b.memoizedState;if(null!==e){c.pending=null;var g=e=e.next;do f=a(f,g.action),g=g.next;while(g!==e);$e(f,b.memoizedState)||(rg=!0);b.memoizedState=f;null===b.baseQueue&&(b.baseState=f);c.lastRenderedState=f;}return [f,d]}
  function yh(a){var b=th();"function"===typeof a&&(a=a());b.memoizedState=b.baseState=a;a=b.queue={pending:null,dispatch:null,lastRenderedReducer:vh,lastRenderedState:a};a=a.dispatch=zh.bind(null,N$1,a);return [b.memoizedState,a]}function Ah(a,b,c,d){a={tag:a,create:b,destroy:c,deps:d,next:null};b=N$1.updateQueue;null===b?(b={lastEffect:null},N$1.updateQueue=b,b.lastEffect=a.next=a):(c=b.lastEffect,null===c?b.lastEffect=a.next=a:(d=c.next,c.next=a,a.next=d,b.lastEffect=a));return a}
  function Bh(){return uh().memoizedState}function Ch(a,b,c,d){var e=th();N$1.effectTag|=a;e.memoizedState=Ah(1|b,c,void 0,void 0===d?null:d);}function Dh(a,b,c,d){var e=uh();d=void 0===d?null:d;var f=void 0;if(null!==O$1){var g=O$1.memoizedState;f=g.destroy;if(null!==d&&nh(d,g.deps)){Ah(b,c,f,d);return}}N$1.effectTag|=a;e.memoizedState=Ah(1|b,c,f,d);}function Eh(a,b){return Ch(516,4,a,b)}function Fh(a,b){return Dh(516,4,a,b)}function Gh(a,b){return Dh(4,2,a,b)}
  function Hh(a,b){if("function"===typeof b)return a=a(),b(a),function(){b(null);};if(null!==b&&void 0!==b)return a=a(),b.current=a,function(){b.current=null;}}function Ih(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Dh(4,2,Hh.bind(null,b,a),c)}function Jh(){}function Kh(a,b){th().memoizedState=[a,void 0===b?null:b];return a}function Lh(a,b){var c=uh();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&nh(b,d[1]))return d[0];c.memoizedState=[a,b];return a}
  function Mh(a,b){var c=uh();b=void 0===b?null:b;var d=c.memoizedState;if(null!==d&&null!==b&&nh(b,d[1]))return d[0];a=a();c.memoizedState=[a,b];return a}function Nh(a,b,c){var d=ag();cg(98>d?98:d,function(){a(!0);});cg(97<d?97:d,function(){var d=kh.suspense;kh.suspense=void 0===b?null:b;try{a(!1),c();}finally{kh.suspense=d;}});}
  function zh(a,b,c){var d=Gg(),e=Dg.suspense;d=Hg(d,a,e);e={expirationTime:d,suspenseConfig:e,action:c,eagerReducer:null,eagerState:null,next:null};var f=b.pending;null===f?e.next=e:(e.next=f.next,f.next=e);b.pending=e;f=a.alternate;if(a===N$1||null!==f&&f===N$1)mh=!0,e.expirationTime=lh,N$1.expirationTime=lh;else{if(0===a.expirationTime&&(null===f||0===f.expirationTime)&&(f=b.lastRenderedReducer,null!==f))try{var g=b.lastRenderedState,h=f(g,c);e.eagerReducer=f;e.eagerState=h;if($e(h,g))return}catch(k){}finally{}Ig(a,
  d);}}
  var sh={readContext:sg,useCallback:Q$1,useContext:Q$1,useEffect:Q$1,useImperativeHandle:Q$1,useLayoutEffect:Q$1,useMemo:Q$1,useReducer:Q$1,useRef:Q$1,useState:Q$1,useDebugValue:Q$1,useResponder:Q$1,useDeferredValue:Q$1,useTransition:Q$1},ph={readContext:sg,useCallback:Kh,useContext:sg,useEffect:Eh,useImperativeHandle:function(a,b,c){c=null!==c&&void 0!==c?c.concat([a]):null;return Ch(4,2,Hh.bind(null,b,a),c)},useLayoutEffect:function(a,b){return Ch(4,2,a,b)},useMemo:function(a,b){var c=th();b=void 0===b?null:b;a=a();c.memoizedState=[a,
  b];return a},useReducer:function(a,b,c){var d=th();b=void 0!==c?c(b):b;d.memoizedState=d.baseState=b;a=d.queue={pending:null,dispatch:null,lastRenderedReducer:a,lastRenderedState:b};a=a.dispatch=zh.bind(null,N$1,a);return [d.memoizedState,a]},useRef:function(a){var b=th();a={current:a};return b.memoizedState=a},useState:yh,useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=yh(a),d=c[0],e=c[1];Eh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a);}finally{kh.suspense=
  c;}},[a,b]);return d},useTransition:function(a){var b=yh(!1),c=b[0];b=b[1];return [Kh(Nh.bind(null,b,a),[b,a]),c]}},qh={readContext:sg,useCallback:Lh,useContext:sg,useEffect:Fh,useImperativeHandle:Ih,useLayoutEffect:Gh,useMemo:Mh,useReducer:wh,useRef:Bh,useState:function(){return wh(vh)},useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=wh(vh),d=c[0],e=c[1];Fh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a);}finally{kh.suspense=c;}},[a,b]);return d},useTransition:function(a){var b=
  wh(vh),c=b[0];b=b[1];return [Lh(Nh.bind(null,b,a),[b,a]),c]}},rh={readContext:sg,useCallback:Lh,useContext:sg,useEffect:Fh,useImperativeHandle:Ih,useLayoutEffect:Gh,useMemo:Mh,useReducer:xh,useRef:Bh,useState:function(){return xh(vh)},useDebugValue:Jh,useResponder:ih,useDeferredValue:function(a,b){var c=xh(vh),d=c[0],e=c[1];Fh(function(){var c=kh.suspense;kh.suspense=void 0===b?null:b;try{e(a);}finally{kh.suspense=c;}},[a,b]);return d},useTransition:function(a){var b=xh(vh),c=b[0];b=b[1];return [Lh(Nh.bind(null,
  b,a),[b,a]),c]}},Oh=null,Ph=null,Qh=!1;function Rh(a,b){var c=Sh(5,null,null,0);c.elementType="DELETED";c.type="DELETED";c.stateNode=b;c.return=a;c.effectTag=8;null!==a.lastEffect?(a.lastEffect.nextEffect=c,a.lastEffect=c):a.firstEffect=a.lastEffect=c;}
  function Th(a,b){switch(a.tag){case 5:var c=a.type;b=1!==b.nodeType||c.toLowerCase()!==b.nodeName.toLowerCase()?null:b;return null!==b?(a.stateNode=b,!0):!1;case 6:return b=""===a.pendingProps||3!==b.nodeType?null:b,null!==b?(a.stateNode=b,!0):!1;case 13:return !1;default:return !1}}
  function Uh(a){if(Qh){var b=Ph;if(b){var c=b;if(!Th(a,b)){b=Jd(c.nextSibling);if(!b||!Th(a,b)){a.effectTag=a.effectTag&-1025|2;Qh=!1;Oh=a;return}Rh(Oh,c);}Oh=a;Ph=Jd(b.firstChild);}else a.effectTag=a.effectTag&-1025|2,Qh=!1,Oh=a;}}function Vh(a){for(a=a.return;null!==a&&5!==a.tag&&3!==a.tag&&13!==a.tag;)a=a.return;Oh=a;}
  function Wh(a){if(a!==Oh)return !1;if(!Qh)return Vh(a),Qh=!0,!1;var b=a.type;if(5!==a.tag||"head"!==b&&"body"!==b&&!Gd(b,a.memoizedProps))for(b=Ph;b;)Rh(a,b),b=Jd(b.nextSibling);Vh(a);if(13===a.tag){a=a.memoizedState;a=null!==a?a.dehydrated:null;if(!a)throw Error(u$1(317));a:{a=a.nextSibling;for(b=0;a;){if(8===a.nodeType){var c=a.data;if(c===Ad){if(0===b){Ph=Jd(a.nextSibling);break a}b--;}else c!==zd&&c!==Cd&&c!==Bd||b++;}a=a.nextSibling;}Ph=null;}}else Ph=Oh?Jd(a.stateNode.nextSibling):null;return !0}
  function Xh(){Ph=Oh=null;Qh=!1;}var Yh=Wa.ReactCurrentOwner,rg=!1;function R$1(a,b,c,d){b.child=null===a?Yg(b,null,c,d):Xg(b,a.child,c,d);}function Zh(a,b,c,d,e){c=c.render;var f=b.ref;qg(b,e);d=oh(a,b,c,d,f,e);if(null!==a&&!rg)return b.updateQueue=a.updateQueue,b.effectTag&=-517,a.expirationTime<=e&&(a.expirationTime=0),$h(a,b,e);b.effectTag|=1;R$1(a,b,d,e);return b.child}
  function ai(a,b,c,d,e,f){if(null===a){var g=c.type;if("function"===typeof g&&!bi(g)&&void 0===g.defaultProps&&null===c.compare&&void 0===c.defaultProps)return b.tag=15,b.type=g,ci(a,b,g,d,e,f);a=Ug(c.type,null,d,null,b.mode,f);a.ref=b.ref;a.return=b;return b.child=a}g=a.child;if(e<f&&(e=g.memoizedProps,c=c.compare,c=null!==c?c:bf,c(e,d)&&a.ref===b.ref))return $h(a,b,f);b.effectTag|=1;a=Sg(g,d);a.ref=b.ref;a.return=b;return b.child=a}
  function ci(a,b,c,d,e,f){return null!==a&&bf(a.memoizedProps,d)&&a.ref===b.ref&&(rg=!1,e<f)?(b.expirationTime=a.expirationTime,$h(a,b,f)):di(a,b,c,d,f)}function ei(a,b){var c=b.ref;if(null===a&&null!==c||null!==a&&a.ref!==c)b.effectTag|=128;}function di(a,b,c,d,e){var f=L$1(c)?Bf:J$1.current;f=Cf(b,f);qg(b,e);c=oh(a,b,c,d,f,e);if(null!==a&&!rg)return b.updateQueue=a.updateQueue,b.effectTag&=-517,a.expirationTime<=e&&(a.expirationTime=0),$h(a,b,e);b.effectTag|=1;R$1(a,b,c,e);return b.child}
  function fi(a,b,c,d,e){if(L$1(c)){var f=!0;Gf(b);}else f=!1;qg(b,e);if(null===b.stateNode)null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2),Lg(b,c,d),Ng(b,c,d,e),d=!0;else if(null===a){var g=b.stateNode,h=b.memoizedProps;g.props=h;var k=g.context,l=c.contextType;"object"===typeof l&&null!==l?l=sg(l):(l=L$1(c)?Bf:J$1.current,l=Cf(b,l));var m=c.getDerivedStateFromProps,p="function"===typeof m||"function"===typeof g.getSnapshotBeforeUpdate;p||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&
  "function"!==typeof g.componentWillReceiveProps||(h!==d||k!==l)&&Mg(b,g,d,l);tg=!1;var x=b.memoizedState;g.state=x;zg(b,d,g,e);k=b.memoizedState;h!==d||x!==k||K$1.current||tg?("function"===typeof m&&(Fg(b,c,m,d),k=b.memoizedState),(h=tg||Kg(b,c,h,d,x,k,l))?(p||"function"!==typeof g.UNSAFE_componentWillMount&&"function"!==typeof g.componentWillMount||("function"===typeof g.componentWillMount&&g.componentWillMount(),"function"===typeof g.UNSAFE_componentWillMount&&g.UNSAFE_componentWillMount()),"function"===
  typeof g.componentDidMount&&(b.effectTag|=4)):("function"===typeof g.componentDidMount&&(b.effectTag|=4),b.memoizedProps=d,b.memoizedState=k),g.props=d,g.state=k,g.context=l,d=h):("function"===typeof g.componentDidMount&&(b.effectTag|=4),d=!1);}else g=b.stateNode,vg(a,b),h=b.memoizedProps,g.props=b.type===b.elementType?h:ig(b.type,h),k=g.context,l=c.contextType,"object"===typeof l&&null!==l?l=sg(l):(l=L$1(c)?Bf:J$1.current,l=Cf(b,l)),m=c.getDerivedStateFromProps,(p="function"===typeof m||"function"===
  typeof g.getSnapshotBeforeUpdate)||"function"!==typeof g.UNSAFE_componentWillReceiveProps&&"function"!==typeof g.componentWillReceiveProps||(h!==d||k!==l)&&Mg(b,g,d,l),tg=!1,k=b.memoizedState,g.state=k,zg(b,d,g,e),x=b.memoizedState,h!==d||k!==x||K$1.current||tg?("function"===typeof m&&(Fg(b,c,m,d),x=b.memoizedState),(m=tg||Kg(b,c,h,d,k,x,l))?(p||"function"!==typeof g.UNSAFE_componentWillUpdate&&"function"!==typeof g.componentWillUpdate||("function"===typeof g.componentWillUpdate&&g.componentWillUpdate(d,
  x,l),"function"===typeof g.UNSAFE_componentWillUpdate&&g.UNSAFE_componentWillUpdate(d,x,l)),"function"===typeof g.componentDidUpdate&&(b.effectTag|=4),"function"===typeof g.getSnapshotBeforeUpdate&&(b.effectTag|=256)):("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=256),b.memoizedProps=d,b.memoizedState=x),g.props=d,g.state=x,g.context=l,d=m):
  ("function"!==typeof g.componentDidUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=4),"function"!==typeof g.getSnapshotBeforeUpdate||h===a.memoizedProps&&k===a.memoizedState||(b.effectTag|=256),d=!1);return gi(a,b,c,d,f,e)}
  function gi(a,b,c,d,e,f){ei(a,b);var g=0!==(b.effectTag&64);if(!d&&!g)return e&&Hf(b,c,!1),$h(a,b,f);d=b.stateNode;Yh.current=b;var h=g&&"function"!==typeof c.getDerivedStateFromError?null:d.render();b.effectTag|=1;null!==a&&g?(b.child=Xg(b,a.child,null,f),b.child=Xg(b,null,h,f)):R$1(a,b,h,f);b.memoizedState=d.state;e&&Hf(b,c,!0);return b.child}function hi(a){var b=a.stateNode;b.pendingContext?Ef(a,b.pendingContext,b.pendingContext!==b.context):b.context&&Ef(a,b.context,!1);dh(a,b.containerInfo);}
  var ii={dehydrated:null,retryTime:0};
  function ji(a,b,c){var d=b.mode,e=b.pendingProps,f=M$1.current,g=!1,h;(h=0!==(b.effectTag&64))||(h=0!==(f&2)&&(null===a||null!==a.memoizedState));h?(g=!0,b.effectTag&=-65):null!==a&&null===a.memoizedState||void 0===e.fallback||!0===e.unstable_avoidThisFallback||(f|=1);I$1(M$1,f&1);if(null===a){void 0!==e.fallback&&Uh(b);if(g){g=e.fallback;e=Wg(null,d,0,null);e.return=b;if(0===(b.mode&2))for(a=null!==b.memoizedState?b.child.child:b.child,e.child=a;null!==a;)a.return=e,a=a.sibling;c=Wg(g,d,c,null);c.return=
  b;e.sibling=c;b.memoizedState=ii;b.child=e;return c}d=e.children;b.memoizedState=null;return b.child=Yg(b,null,d,c)}if(null!==a.memoizedState){a=a.child;d=a.sibling;if(g){e=e.fallback;c=Sg(a,a.pendingProps);c.return=b;if(0===(b.mode&2)&&(g=null!==b.memoizedState?b.child.child:b.child,g!==a.child))for(c.child=g;null!==g;)g.return=c,g=g.sibling;d=Sg(d,e);d.return=b;c.sibling=d;c.childExpirationTime=0;b.memoizedState=ii;b.child=c;return d}c=Xg(b,a.child,e.children,c);b.memoizedState=null;return b.child=
  c}a=a.child;if(g){g=e.fallback;e=Wg(null,d,0,null);e.return=b;e.child=a;null!==a&&(a.return=e);if(0===(b.mode&2))for(a=null!==b.memoizedState?b.child.child:b.child,e.child=a;null!==a;)a.return=e,a=a.sibling;c=Wg(g,d,c,null);c.return=b;e.sibling=c;c.effectTag|=2;e.childExpirationTime=0;b.memoizedState=ii;b.child=e;return c}b.memoizedState=null;return b.child=Xg(b,a,e.children,c)}
  function ki(a,b){a.expirationTime<b&&(a.expirationTime=b);var c=a.alternate;null!==c&&c.expirationTime<b&&(c.expirationTime=b);pg(a.return,b);}function li(a,b,c,d,e,f){var g=a.memoizedState;null===g?a.memoizedState={isBackwards:b,rendering:null,renderingStartTime:0,last:d,tail:c,tailExpiration:0,tailMode:e,lastEffect:f}:(g.isBackwards=b,g.rendering=null,g.renderingStartTime=0,g.last=d,g.tail=c,g.tailExpiration=0,g.tailMode=e,g.lastEffect=f);}
  function mi(a,b,c){var d=b.pendingProps,e=d.revealOrder,f=d.tail;R$1(a,b,d.children,c);d=M$1.current;if(0!==(d&2))d=d&1|2,b.effectTag|=64;else{if(null!==a&&0!==(a.effectTag&64))a:for(a=b.child;null!==a;){if(13===a.tag)null!==a.memoizedState&&ki(a,c);else if(19===a.tag)ki(a,c);else if(null!==a.child){a.child.return=a;a=a.child;continue}if(a===b)break a;for(;null===a.sibling;){if(null===a.return||a.return===b)break a;a=a.return;}a.sibling.return=a.return;a=a.sibling;}d&=1;}I$1(M$1,d);if(0===(b.mode&2))b.memoizedState=
  null;else switch(e){case "forwards":c=b.child;for(e=null;null!==c;)a=c.alternate,null!==a&&null===hh(a)&&(e=c),c=c.sibling;c=e;null===c?(e=b.child,b.child=null):(e=c.sibling,c.sibling=null);li(b,!1,e,c,f,b.lastEffect);break;case "backwards":c=null;e=b.child;for(b.child=null;null!==e;){a=e.alternate;if(null!==a&&null===hh(a)){b.child=e;break}a=e.sibling;e.sibling=c;c=e;e=a;}li(b,!0,c,null,f,b.lastEffect);break;case "together":li(b,!1,null,null,void 0,b.lastEffect);break;default:b.memoizedState=null;}return b.child}
  function $h(a,b,c){null!==a&&(b.dependencies=a.dependencies);var d=b.expirationTime;0!==d&&Bg(d);if(b.childExpirationTime<c)return null;if(null!==a&&b.child!==a.child)throw Error(u$1(153));if(null!==b.child){a=b.child;c=Sg(a,a.pendingProps);b.child=c;for(c.return=b;null!==a.sibling;)a=a.sibling,c=c.sibling=Sg(a,a.pendingProps),c.return=b;c.sibling=null;}return b.child}var ni,oi,pi,qi;
  ni=function(a,b){for(var c=b.child;null!==c;){if(5===c.tag||6===c.tag)a.appendChild(c.stateNode);else if(4!==c.tag&&null!==c.child){c.child.return=c;c=c.child;continue}if(c===b)break;for(;null===c.sibling;){if(null===c.return||c.return===b)return;c=c.return;}c.sibling.return=c.return;c=c.sibling;}};oi=function(){};
  pi=function(a,b,c,d,e){var f=a.memoizedProps;if(f!==d){var g=b.stateNode;ch($g.current);a=null;switch(c){case "input":f=zb(g,f);d=zb(g,d);a=[];break;case "option":f=Gb(g,f);d=Gb(g,d);a=[];break;case "select":f=objectAssign({},f,{value:void 0});d=objectAssign({},d,{value:void 0});a=[];break;case "textarea":f=Ib(g,f);d=Ib(g,d);a=[];break;default:"function"!==typeof f.onClick&&"function"===typeof d.onClick&&(g.onclick=sd);}od(c,d);var h,k;c=null;for(h in f)if(!d.hasOwnProperty(h)&&f.hasOwnProperty(h)&&null!=f[h])if("style"===
  h)for(k in g=f[h],g)g.hasOwnProperty(k)&&(c||(c={}),c[k]="");else"dangerouslySetInnerHTML"!==h&&"children"!==h&&"suppressContentEditableWarning"!==h&&"suppressHydrationWarning"!==h&&"autoFocus"!==h&&(va.hasOwnProperty(h)?a||(a=[]):(a=a||[]).push(h,null));for(h in d){var l=d[h];g=null!=f?f[h]:void 0;if(d.hasOwnProperty(h)&&l!==g&&(null!=l||null!=g))if("style"===h)if(g){for(k in g)!g.hasOwnProperty(k)||l&&l.hasOwnProperty(k)||(c||(c={}),c[k]="");for(k in l)l.hasOwnProperty(k)&&g[k]!==l[k]&&(c||(c={}),
  c[k]=l[k]);}else c||(a||(a=[]),a.push(h,c)),c=l;else"dangerouslySetInnerHTML"===h?(l=l?l.__html:void 0,g=g?g.__html:void 0,null!=l&&g!==l&&(a=a||[]).push(h,l)):"children"===h?g===l||"string"!==typeof l&&"number"!==typeof l||(a=a||[]).push(h,""+l):"suppressContentEditableWarning"!==h&&"suppressHydrationWarning"!==h&&(va.hasOwnProperty(h)?(null!=l&&rd(e,h),a||g===l||(a=[])):(a=a||[]).push(h,l));}c&&(a=a||[]).push("style",c);e=a;if(b.updateQueue=e)b.effectTag|=4;}};
  qi=function(a,b,c,d){c!==d&&(b.effectTag|=4);};function ri(a,b){switch(a.tailMode){case "hidden":b=a.tail;for(var c=null;null!==b;)null!==b.alternate&&(c=b),b=b.sibling;null===c?a.tail=null:c.sibling=null;break;case "collapsed":c=a.tail;for(var d=null;null!==c;)null!==c.alternate&&(d=c),c=c.sibling;null===d?b||null===a.tail?a.tail=null:a.tail.sibling=null:d.sibling=null;}}
  function si(a,b,c){var d=b.pendingProps;switch(b.tag){case 2:case 16:case 15:case 0:case 11:case 7:case 8:case 12:case 9:case 14:return null;case 1:return L$1(b.type)&&Df(),null;case 3:return eh(),H$1(K$1),H$1(J$1),c=b.stateNode,c.pendingContext&&(c.context=c.pendingContext,c.pendingContext=null),null!==a&&null!==a.child||!Wh(b)||(b.effectTag|=4),oi(b),null;case 5:gh(b);c=ch(bh.current);var e=b.type;if(null!==a&&null!=b.stateNode)pi(a,b,e,d,c),a.ref!==b.ref&&(b.effectTag|=128);else{if(!d){if(null===b.stateNode)throw Error(u$1(166));
  return null}a=ch($g.current);if(Wh(b)){d=b.stateNode;e=b.type;var f=b.memoizedProps;d[Md]=b;d[Nd]=f;switch(e){case "iframe":case "object":case "embed":F$1("load",d);break;case "video":case "audio":for(a=0;a<ac.length;a++)F$1(ac[a],d);break;case "source":F$1("error",d);break;case "img":case "image":case "link":F$1("error",d);F$1("load",d);break;case "form":F$1("reset",d);F$1("submit",d);break;case "details":F$1("toggle",d);break;case "input":Ab(d,f);F$1("invalid",d);rd(c,"onChange");break;case "select":d._wrapperState=
  {wasMultiple:!!f.multiple};F$1("invalid",d);rd(c,"onChange");break;case "textarea":Jb(d,f),F$1("invalid",d),rd(c,"onChange");}od(e,f);a=null;for(var g in f)if(f.hasOwnProperty(g)){var h=f[g];"children"===g?"string"===typeof h?d.textContent!==h&&(a=["children",h]):"number"===typeof h&&d.textContent!==""+h&&(a=["children",""+h]):va.hasOwnProperty(g)&&null!=h&&rd(c,g);}switch(e){case "input":xb(d);Eb(d,f,!0);break;case "textarea":xb(d);Lb(d);break;case "select":case "option":break;default:"function"===typeof f.onClick&&
  (d.onclick=sd);}c=a;b.updateQueue=c;null!==c&&(b.effectTag|=4);}else{g=9===c.nodeType?c:c.ownerDocument;a===qd&&(a=Nb(e));a===qd?"script"===e?(a=g.createElement("div"),a.innerHTML="<script>\x3c/script>",a=a.removeChild(a.firstChild)):"string"===typeof d.is?a=g.createElement(e,{is:d.is}):(a=g.createElement(e),"select"===e&&(g=a,d.multiple?g.multiple=!0:d.size&&(g.size=d.size))):a=g.createElementNS(a,e);a[Md]=b;a[Nd]=d;ni(a,b,!1,!1);b.stateNode=a;g=pd(e,d);switch(e){case "iframe":case "object":case "embed":F$1("load",
  a);h=d;break;case "video":case "audio":for(h=0;h<ac.length;h++)F$1(ac[h],a);h=d;break;case "source":F$1("error",a);h=d;break;case "img":case "image":case "link":F$1("error",a);F$1("load",a);h=d;break;case "form":F$1("reset",a);F$1("submit",a);h=d;break;case "details":F$1("toggle",a);h=d;break;case "input":Ab(a,d);h=zb(a,d);F$1("invalid",a);rd(c,"onChange");break;case "option":h=Gb(a,d);break;case "select":a._wrapperState={wasMultiple:!!d.multiple};h=objectAssign({},d,{value:void 0});F$1("invalid",a);rd(c,"onChange");break;case "textarea":Jb(a,
  d);h=Ib(a,d);F$1("invalid",a);rd(c,"onChange");break;default:h=d;}od(e,h);var k=h;for(f in k)if(k.hasOwnProperty(f)){var l=k[f];"style"===f?md(a,l):"dangerouslySetInnerHTML"===f?(l=l?l.__html:void 0,null!=l&&Qb(a,l)):"children"===f?"string"===typeof l?("textarea"!==e||""!==l)&&Rb(a,l):"number"===typeof l&&Rb(a,""+l):"suppressContentEditableWarning"!==f&&"suppressHydrationWarning"!==f&&"autoFocus"!==f&&(va.hasOwnProperty(f)?null!=l&&rd(c,f):null!=l&&Xa(a,f,l,g));}switch(e){case "input":xb(a);Eb(a,d,!1);
  break;case "textarea":xb(a);Lb(a);break;case "option":null!=d.value&&a.setAttribute("value",""+rb(d.value));break;case "select":a.multiple=!!d.multiple;c=d.value;null!=c?Hb(a,!!d.multiple,c,!1):null!=d.defaultValue&&Hb(a,!!d.multiple,d.defaultValue,!0);break;default:"function"===typeof h.onClick&&(a.onclick=sd);}Fd(e,d)&&(b.effectTag|=4);}null!==b.ref&&(b.effectTag|=128);}return null;case 6:if(a&&null!=b.stateNode)qi(a,b,a.memoizedProps,d);else{if("string"!==typeof d&&null===b.stateNode)throw Error(u$1(166));
  c=ch(bh.current);ch($g.current);Wh(b)?(c=b.stateNode,d=b.memoizedProps,c[Md]=b,c.nodeValue!==d&&(b.effectTag|=4)):(c=(9===c.nodeType?c:c.ownerDocument).createTextNode(d),c[Md]=b,b.stateNode=c);}return null;case 13:H$1(M$1);d=b.memoizedState;if(0!==(b.effectTag&64))return b.expirationTime=c,b;c=null!==d;d=!1;null===a?void 0!==b.memoizedProps.fallback&&Wh(b):(e=a.memoizedState,d=null!==e,c||null===e||(e=a.child.sibling,null!==e&&(f=b.firstEffect,null!==f?(b.firstEffect=e,e.nextEffect=f):(b.firstEffect=b.lastEffect=
  e,e.nextEffect=null),e.effectTag=8)));if(c&&!d&&0!==(b.mode&2))if(null===a&&!0!==b.memoizedProps.unstable_avoidThisFallback||0!==(M$1.current&1))S$1===ti&&(S$1=ui);else{if(S$1===ti||S$1===ui)S$1=vi;0!==wi&&null!==T$1&&(xi(T$1,U$1),yi(T$1,wi));}if(c||d)b.effectTag|=4;return null;case 4:return eh(),oi(b),null;case 10:return og(b),null;case 17:return L$1(b.type)&&Df(),null;case 19:H$1(M$1);d=b.memoizedState;if(null===d)return null;e=0!==(b.effectTag&64);f=d.rendering;if(null===f)if(e)ri(d,!1);else{if(S$1!==ti||null!==a&&0!==(a.effectTag&
  64))for(f=b.child;null!==f;){a=hh(f);if(null!==a){b.effectTag|=64;ri(d,!1);e=a.updateQueue;null!==e&&(b.updateQueue=e,b.effectTag|=4);null===d.lastEffect&&(b.firstEffect=null);b.lastEffect=d.lastEffect;for(d=b.child;null!==d;)e=d,f=c,e.effectTag&=2,e.nextEffect=null,e.firstEffect=null,e.lastEffect=null,a=e.alternate,null===a?(e.childExpirationTime=0,e.expirationTime=f,e.child=null,e.memoizedProps=null,e.memoizedState=null,e.updateQueue=null,e.dependencies=null):(e.childExpirationTime=a.childExpirationTime,
  e.expirationTime=a.expirationTime,e.child=a.child,e.memoizedProps=a.memoizedProps,e.memoizedState=a.memoizedState,e.updateQueue=a.updateQueue,f=a.dependencies,e.dependencies=null===f?null:{expirationTime:f.expirationTime,firstContext:f.firstContext,responders:f.responders}),d=d.sibling;I$1(M$1,M$1.current&1|2);return b.child}f=f.sibling;}}else{if(!e)if(a=hh(f),null!==a){if(b.effectTag|=64,e=!0,c=a.updateQueue,null!==c&&(b.updateQueue=c,b.effectTag|=4),ri(d,!0),null===d.tail&&"hidden"===d.tailMode&&!f.alternate)return b=
  b.lastEffect=d.lastEffect,null!==b&&(b.nextEffect=null),null}else 2*$f()-d.renderingStartTime>d.tailExpiration&&1<c&&(b.effectTag|=64,e=!0,ri(d,!1),b.expirationTime=b.childExpirationTime=c-1);d.isBackwards?(f.sibling=b.child,b.child=f):(c=d.last,null!==c?c.sibling=f:b.child=f,d.last=f);}return null!==d.tail?(0===d.tailExpiration&&(d.tailExpiration=$f()+500),c=d.tail,d.rendering=c,d.tail=c.sibling,d.lastEffect=b.lastEffect,d.renderingStartTime=$f(),c.sibling=null,b=M$1.current,I$1(M$1,e?b&1|2:b&1),c):null}throw Error(u$1(156,
  b.tag));}function zi(a){switch(a.tag){case 1:L$1(a.type)&&Df();var b=a.effectTag;return b&4096?(a.effectTag=b&-4097|64,a):null;case 3:eh();H$1(K$1);H$1(J$1);b=a.effectTag;if(0!==(b&64))throw Error(u$1(285));a.effectTag=b&-4097|64;return a;case 5:return gh(a),null;case 13:return H$1(M$1),b=a.effectTag,b&4096?(a.effectTag=b&-4097|64,a):null;case 19:return H$1(M$1),null;case 4:return eh(),null;case 10:return og(a),null;default:return null}}function Ai(a,b){return {value:a,source:b,stack:qb(b)}}
  var Bi="function"===typeof WeakSet?WeakSet:Set;function Ci(a,b){var c=b.source,d=b.stack;null===d&&null!==c&&(d=qb(c));null!==c&&pb(c.type);b=b.value;null!==a&&1===a.tag&&pb(a.type);try{console.error(b);}catch(e){setTimeout(function(){throw e;});}}function Di(a,b){try{b.props=a.memoizedProps,b.state=a.memoizedState,b.componentWillUnmount();}catch(c){Ei(a,c);}}function Fi(a){var b=a.ref;if(null!==b)if("function"===typeof b)try{b(null);}catch(c){Ei(a,c);}else b.current=null;}
  function Gi(a,b){switch(b.tag){case 0:case 11:case 15:case 22:return;case 1:if(b.effectTag&256&&null!==a){var c=a.memoizedProps,d=a.memoizedState;a=b.stateNode;b=a.getSnapshotBeforeUpdate(b.elementType===b.type?c:ig(b.type,c),d);a.__reactInternalSnapshotBeforeUpdate=b;}return;case 3:case 5:case 6:case 4:case 17:return}throw Error(u$1(163));}
  function Hi(a,b){b=b.updateQueue;b=null!==b?b.lastEffect:null;if(null!==b){var c=b=b.next;do{if((c.tag&a)===a){var d=c.destroy;c.destroy=void 0;void 0!==d&&d();}c=c.next;}while(c!==b)}}function Ii(a,b){b=b.updateQueue;b=null!==b?b.lastEffect:null;if(null!==b){var c=b=b.next;do{if((c.tag&a)===a){var d=c.create;c.destroy=d();}c=c.next;}while(c!==b)}}
  function Ji(a,b,c){switch(c.tag){case 0:case 11:case 15:case 22:Ii(3,c);return;case 1:a=c.stateNode;if(c.effectTag&4)if(null===b)a.componentDidMount();else{var d=c.elementType===c.type?b.memoizedProps:ig(c.type,b.memoizedProps);a.componentDidUpdate(d,b.memoizedState,a.__reactInternalSnapshotBeforeUpdate);}b=c.updateQueue;null!==b&&Cg(c,b,a);return;case 3:b=c.updateQueue;if(null!==b){a=null;if(null!==c.child)switch(c.child.tag){case 5:a=c.child.stateNode;break;case 1:a=c.child.stateNode;}Cg(c,b,a);}return;
  case 5:a=c.stateNode;null===b&&c.effectTag&4&&Fd(c.type,c.memoizedProps)&&a.focus();return;case 6:return;case 4:return;case 12:return;case 13:null===c.memoizedState&&(c=c.alternate,null!==c&&(c=c.memoizedState,null!==c&&(c=c.dehydrated,null!==c&&Vc(c))));return;case 19:case 17:case 20:case 21:return}throw Error(u$1(163));}
  function Ki(a,b,c){"function"===typeof Li&&Li(b);switch(b.tag){case 0:case 11:case 14:case 15:case 22:a=b.updateQueue;if(null!==a&&(a=a.lastEffect,null!==a)){var d=a.next;cg(97<c?97:c,function(){var a=d;do{var c=a.destroy;if(void 0!==c){var g=b;try{c();}catch(h){Ei(g,h);}}a=a.next;}while(a!==d)});}break;case 1:Fi(b);c=b.stateNode;"function"===typeof c.componentWillUnmount&&Di(b,c);break;case 5:Fi(b);break;case 4:Mi(a,b,c);}}
  function Ni(a){var b=a.alternate;a.return=null;a.child=null;a.memoizedState=null;a.updateQueue=null;a.dependencies=null;a.alternate=null;a.firstEffect=null;a.lastEffect=null;a.pendingProps=null;a.memoizedProps=null;a.stateNode=null;null!==b&&Ni(b);}function Oi(a){return 5===a.tag||3===a.tag||4===a.tag}
  function Pi(a){a:{for(var b=a.return;null!==b;){if(Oi(b)){var c=b;break a}b=b.return;}throw Error(u$1(160));}b=c.stateNode;switch(c.tag){case 5:var d=!1;break;case 3:b=b.containerInfo;d=!0;break;case 4:b=b.containerInfo;d=!0;break;default:throw Error(u$1(161));}c.effectTag&16&&(Rb(b,""),c.effectTag&=-17);a:b:for(c=a;;){for(;null===c.sibling;){if(null===c.return||Oi(c.return)){c=null;break a}c=c.return;}c.sibling.return=c.return;for(c=c.sibling;5!==c.tag&&6!==c.tag&&18!==c.tag;){if(c.effectTag&2)continue b;
  if(null===c.child||4===c.tag)continue b;else c.child.return=c,c=c.child;}if(!(c.effectTag&2)){c=c.stateNode;break a}}d?Qi(a,c,b):Ri(a,c,b);}
  function Qi(a,b,c){var d=a.tag,e=5===d||6===d;if(e)a=e?a.stateNode:a.stateNode.instance,b?8===c.nodeType?c.parentNode.insertBefore(a,b):c.insertBefore(a,b):(8===c.nodeType?(b=c.parentNode,b.insertBefore(a,c)):(b=c,b.appendChild(a)),c=c._reactRootContainer,null!==c&&void 0!==c||null!==b.onclick||(b.onclick=sd));else if(4!==d&&(a=a.child,null!==a))for(Qi(a,b,c),a=a.sibling;null!==a;)Qi(a,b,c),a=a.sibling;}
  function Ri(a,b,c){var d=a.tag,e=5===d||6===d;if(e)a=e?a.stateNode:a.stateNode.instance,b?c.insertBefore(a,b):c.appendChild(a);else if(4!==d&&(a=a.child,null!==a))for(Ri(a,b,c),a=a.sibling;null!==a;)Ri(a,b,c),a=a.sibling;}
  function Mi(a,b,c){for(var d=b,e=!1,f,g;;){if(!e){e=d.return;a:for(;;){if(null===e)throw Error(u$1(160));f=e.stateNode;switch(e.tag){case 5:g=!1;break a;case 3:f=f.containerInfo;g=!0;break a;case 4:f=f.containerInfo;g=!0;break a}e=e.return;}e=!0;}if(5===d.tag||6===d.tag){a:for(var h=a,k=d,l=c,m=k;;)if(Ki(h,m,l),null!==m.child&&4!==m.tag)m.child.return=m,m=m.child;else{if(m===k)break a;for(;null===m.sibling;){if(null===m.return||m.return===k)break a;m=m.return;}m.sibling.return=m.return;m=m.sibling;}g?(h=
  f,k=d.stateNode,8===h.nodeType?h.parentNode.removeChild(k):h.removeChild(k)):f.removeChild(d.stateNode);}else if(4===d.tag){if(null!==d.child){f=d.stateNode.containerInfo;g=!0;d.child.return=d;d=d.child;continue}}else if(Ki(a,d,c),null!==d.child){d.child.return=d;d=d.child;continue}if(d===b)break;for(;null===d.sibling;){if(null===d.return||d.return===b)return;d=d.return;4===d.tag&&(e=!1);}d.sibling.return=d.return;d=d.sibling;}}
  function Si(a,b){switch(b.tag){case 0:case 11:case 14:case 15:case 22:Hi(3,b);return;case 1:return;case 5:var c=b.stateNode;if(null!=c){var d=b.memoizedProps,e=null!==a?a.memoizedProps:d;a=b.type;var f=b.updateQueue;b.updateQueue=null;if(null!==f){c[Nd]=d;"input"===a&&"radio"===d.type&&null!=d.name&&Bb(c,d);pd(a,e);b=pd(a,d);for(e=0;e<f.length;e+=2){var g=f[e],h=f[e+1];"style"===g?md(c,h):"dangerouslySetInnerHTML"===g?Qb(c,h):"children"===g?Rb(c,h):Xa(c,g,h,b);}switch(a){case "input":Cb(c,d);break;
  case "textarea":Kb(c,d);break;case "select":b=c._wrapperState.wasMultiple,c._wrapperState.wasMultiple=!!d.multiple,a=d.value,null!=a?Hb(c,!!d.multiple,a,!1):b!==!!d.multiple&&(null!=d.defaultValue?Hb(c,!!d.multiple,d.defaultValue,!0):Hb(c,!!d.multiple,d.multiple?[]:"",!1));}}}return;case 6:if(null===b.stateNode)throw Error(u$1(162));b.stateNode.nodeValue=b.memoizedProps;return;case 3:b=b.stateNode;b.hydrate&&(b.hydrate=!1,Vc(b.containerInfo));return;case 12:return;case 13:c=b;null===b.memoizedState?
  d=!1:(d=!0,c=b.child,Ti=$f());if(null!==c)a:for(a=c;;){if(5===a.tag)f=a.stateNode,d?(f=f.style,"function"===typeof f.setProperty?f.setProperty("display","none","important"):f.display="none"):(f=a.stateNode,e=a.memoizedProps.style,e=void 0!==e&&null!==e&&e.hasOwnProperty("display")?e.display:null,f.style.display=ld("display",e));else if(6===a.tag)a.stateNode.nodeValue=d?"":a.memoizedProps;else if(13===a.tag&&null!==a.memoizedState&&null===a.memoizedState.dehydrated){f=a.child.sibling;f.return=a;a=
  f;continue}else if(null!==a.child){a.child.return=a;a=a.child;continue}if(a===c)break;for(;null===a.sibling;){if(null===a.return||a.return===c)break a;a=a.return;}a.sibling.return=a.return;a=a.sibling;}Ui(b);return;case 19:Ui(b);return;case 17:return}throw Error(u$1(163));}function Ui(a){var b=a.updateQueue;if(null!==b){a.updateQueue=null;var c=a.stateNode;null===c&&(c=a.stateNode=new Bi);b.forEach(function(b){var d=Vi.bind(null,a,b);c.has(b)||(c.add(b),b.then(d,d));});}}
  var Wi="function"===typeof WeakMap?WeakMap:Map;function Xi(a,b,c){c=wg(c,null);c.tag=3;c.payload={element:null};var d=b.value;c.callback=function(){Yi||(Yi=!0,Zi=d);Ci(a,b);};return c}
  function $i(a,b,c){c=wg(c,null);c.tag=3;var d=a.type.getDerivedStateFromError;if("function"===typeof d){var e=b.value;c.payload=function(){Ci(a,b);return d(e)};}var f=a.stateNode;null!==f&&"function"===typeof f.componentDidCatch&&(c.callback=function(){"function"!==typeof d&&(null===aj?aj=new Set([this]):aj.add(this),Ci(a,b));var c=b.stack;this.componentDidCatch(b.value,{componentStack:null!==c?c:""});});return c}
  var bj=Math.ceil,cj=Wa.ReactCurrentDispatcher,dj=Wa.ReactCurrentOwner,V$1=0,ej=8,fj=16,gj=32,ti=0,hj=1,ij=2,ui=3,vi=4,jj=5,W$1=V$1,T$1=null,X$1=null,U$1=0,S$1=ti,kj=null,lj=1073741823,mj=1073741823,nj=null,wi=0,oj=!1,Ti=0,pj=500,Y$1=null,Yi=!1,Zi=null,aj=null,qj=!1,rj=null,sj=90,tj=null,uj=0,vj=null,wj=0;function Gg(){return (W$1&(fj|gj))!==V$1?1073741821-($f()/10|0):0!==wj?wj:wj=1073741821-($f()/10|0)}
  function Hg(a,b,c){b=b.mode;if(0===(b&2))return 1073741823;var d=ag();if(0===(b&4))return 99===d?1073741823:1073741822;if((W$1&fj)!==V$1)return U$1;if(null!==c)a=hg(a,c.timeoutMs|0||5E3,250);else switch(d){case 99:a=1073741823;break;case 98:a=hg(a,150,100);break;case 97:case 96:a=hg(a,5E3,250);break;case 95:a=2;break;default:throw Error(u$1(326));}null!==T$1&&a===U$1&&--a;return a}
  function Ig(a,b){if(50<uj)throw uj=0,vj=null,Error(u$1(185));a=xj(a,b);if(null!==a){var c=ag();1073741823===b?(W$1&ej)!==V$1&&(W$1&(fj|gj))===V$1?yj(a):(Z$1(a),W$1===V$1&&gg()):Z$1(a);(W$1&4)===V$1||98!==c&&99!==c||(null===tj?tj=new Map([[a,b]]):(c=tj.get(a),(void 0===c||c>b)&&tj.set(a,b)));}}
  function xj(a,b){a.expirationTime<b&&(a.expirationTime=b);var c=a.alternate;null!==c&&c.expirationTime<b&&(c.expirationTime=b);var d=a.return,e=null;if(null===d&&3===a.tag)e=a.stateNode;else for(;null!==d;){c=d.alternate;d.childExpirationTime<b&&(d.childExpirationTime=b);null!==c&&c.childExpirationTime<b&&(c.childExpirationTime=b);if(null===d.return&&3===d.tag){e=d.stateNode;break}d=d.return;}null!==e&&(T$1===e&&(Bg(b),S$1===vi&&xi(e,U$1)),yi(e,b));return e}
  function zj(a){var b=a.lastExpiredTime;if(0!==b)return b;b=a.firstPendingTime;if(!Aj(a,b))return b;var c=a.lastPingedTime;a=a.nextKnownPendingLevel;a=c>a?c:a;return 2>=a&&b!==a?0:a}
  function Z$1(a){if(0!==a.lastExpiredTime)a.callbackExpirationTime=1073741823,a.callbackPriority=99,a.callbackNode=eg(yj.bind(null,a));else{var b=zj(a),c=a.callbackNode;if(0===b)null!==c&&(a.callbackNode=null,a.callbackExpirationTime=0,a.callbackPriority=90);else{var d=Gg();1073741823===b?d=99:1===b||2===b?d=95:(d=10*(1073741821-b)-10*(1073741821-d),d=0>=d?99:250>=d?98:5250>=d?97:95);if(null!==c){var e=a.callbackPriority;if(a.callbackExpirationTime===b&&e>=d)return;c!==Tf&&Kf(c);}a.callbackExpirationTime=
  b;a.callbackPriority=d;b=1073741823===b?eg(yj.bind(null,a)):dg(d,Bj.bind(null,a),{timeout:10*(1073741821-b)-$f()});a.callbackNode=b;}}}
  function Bj(a,b){wj=0;if(b)return b=Gg(),Cj(a,b),Z$1(a),null;var c=zj(a);if(0!==c){b=a.callbackNode;if((W$1&(fj|gj))!==V$1)throw Error(u$1(327));Dj();a===T$1&&c===U$1||Ej(a,c);if(null!==X$1){var d=W$1;W$1|=fj;var e=Fj();do try{Gj();break}catch(h){Hj(a,h);}while(1);ng();W$1=d;cj.current=e;if(S$1===hj)throw b=kj,Ej(a,c),xi(a,c),Z$1(a),b;if(null===X$1)switch(e=a.finishedWork=a.current.alternate,a.finishedExpirationTime=c,d=S$1,T$1=null,d){case ti:case hj:throw Error(u$1(345));case ij:Cj(a,2<c?2:c);break;case ui:xi(a,c);d=a.lastSuspendedTime;
  c===d&&(a.nextKnownPendingLevel=Ij(e));if(1073741823===lj&&(e=Ti+pj-$f(),10<e)){if(oj){var f=a.lastPingedTime;if(0===f||f>=c){a.lastPingedTime=c;Ej(a,c);break}}f=zj(a);if(0!==f&&f!==c)break;if(0!==d&&d!==c){a.lastPingedTime=d;break}a.timeoutHandle=Hd(Jj.bind(null,a),e);break}Jj(a);break;case vi:xi(a,c);d=a.lastSuspendedTime;c===d&&(a.nextKnownPendingLevel=Ij(e));if(oj&&(e=a.lastPingedTime,0===e||e>=c)){a.lastPingedTime=c;Ej(a,c);break}e=zj(a);if(0!==e&&e!==c)break;if(0!==d&&d!==c){a.lastPingedTime=
  d;break}1073741823!==mj?d=10*(1073741821-mj)-$f():1073741823===lj?d=0:(d=10*(1073741821-lj)-5E3,e=$f(),c=10*(1073741821-c)-e,d=e-d,0>d&&(d=0),d=(120>d?120:480>d?480:1080>d?1080:1920>d?1920:3E3>d?3E3:4320>d?4320:1960*bj(d/1960))-d,c<d&&(d=c));if(10<d){a.timeoutHandle=Hd(Jj.bind(null,a),d);break}Jj(a);break;case jj:if(1073741823!==lj&&null!==nj){f=lj;var g=nj;d=g.busyMinDurationMs|0;0>=d?d=0:(e=g.busyDelayMs|0,f=$f()-(10*(1073741821-f)-(g.timeoutMs|0||5E3)),d=f<=e?0:e+d-f);if(10<d){xi(a,c);a.timeoutHandle=
  Hd(Jj.bind(null,a),d);break}}Jj(a);break;default:throw Error(u$1(329));}Z$1(a);if(a.callbackNode===b)return Bj.bind(null,a)}}return null}
  function yj(a){var b=a.lastExpiredTime;b=0!==b?b:1073741823;if((W$1&(fj|gj))!==V$1)throw Error(u$1(327));Dj();a===T$1&&b===U$1||Ej(a,b);if(null!==X$1){var c=W$1;W$1|=fj;var d=Fj();do try{Kj();break}catch(e){Hj(a,e);}while(1);ng();W$1=c;cj.current=d;if(S$1===hj)throw c=kj,Ej(a,b),xi(a,b),Z$1(a),c;if(null!==X$1)throw Error(u$1(261));a.finishedWork=a.current.alternate;a.finishedExpirationTime=b;T$1=null;Jj(a);Z$1(a);}return null}function Lj(){if(null!==tj){var a=tj;tj=null;a.forEach(function(a,c){Cj(c,a);Z$1(c);});gg();}}
  function Mj(a,b){var c=W$1;W$1|=1;try{return a(b)}finally{W$1=c,W$1===V$1&&gg();}}function Nj(a,b){var c=W$1;W$1&=-2;W$1|=ej;try{return a(b)}finally{W$1=c,W$1===V$1&&gg();}}
  function Ej(a,b){a.finishedWork=null;a.finishedExpirationTime=0;var c=a.timeoutHandle;-1!==c&&(a.timeoutHandle=-1,Id(c));if(null!==X$1)for(c=X$1.return;null!==c;){var d=c;switch(d.tag){case 1:d=d.type.childContextTypes;null!==d&&void 0!==d&&Df();break;case 3:eh();H$1(K$1);H$1(J$1);break;case 5:gh(d);break;case 4:eh();break;case 13:H$1(M$1);break;case 19:H$1(M$1);break;case 10:og(d);}c=c.return;}T$1=a;X$1=Sg(a.current,null);U$1=b;S$1=ti;kj=null;mj=lj=1073741823;nj=null;wi=0;oj=!1;}
  function Hj(a,b){do{try{ng();jh.current=sh;if(mh)for(var c=N$1.memoizedState;null!==c;){var d=c.queue;null!==d&&(d.pending=null);c=c.next;}lh=0;P$1=O$1=N$1=null;mh=!1;if(null===X$1||null===X$1.return)return S$1=hj,kj=b,X$1=null;a:{var e=a,f=X$1.return,g=X$1,h=b;b=U$1;g.effectTag|=2048;g.firstEffect=g.lastEffect=null;if(null!==h&&"object"===typeof h&&"function"===typeof h.then){var k=h;if(0===(g.mode&2)){var l=g.alternate;l?(g.updateQueue=l.updateQueue,g.memoizedState=l.memoizedState,g.expirationTime=l.expirationTime):(g.updateQueue=
  null,g.memoizedState=null);}var m=0!==(M$1.current&1),p=f;do{var x;if(x=13===p.tag){var z=p.memoizedState;if(null!==z)x=null!==z.dehydrated?!0:!1;else{var ca=p.memoizedProps;x=void 0===ca.fallback?!1:!0!==ca.unstable_avoidThisFallback?!0:m?!1:!0;}}if(x){var D=p.updateQueue;if(null===D){var t=new Set;t.add(k);p.updateQueue=t;}else D.add(k);if(0===(p.mode&2)){p.effectTag|=64;g.effectTag&=-2981;if(1===g.tag)if(null===g.alternate)g.tag=17;else{var y=wg(1073741823,null);y.tag=2;xg(g,y);}g.expirationTime=1073741823;
  break a}h=void 0;g=b;var A=e.pingCache;null===A?(A=e.pingCache=new Wi,h=new Set,A.set(k,h)):(h=A.get(k),void 0===h&&(h=new Set,A.set(k,h)));if(!h.has(g)){h.add(g);var q=Oj.bind(null,e,k,g);k.then(q,q);}p.effectTag|=4096;p.expirationTime=b;break a}p=p.return;}while(null!==p);h=Error((pb(g.type)||"A React component")+" suspended while rendering, but no fallback UI was specified.\n\nAdd a <Suspense fallback=...> component higher in the tree to provide a loading indicator or placeholder to display."+qb(g));}S$1!==
  jj&&(S$1=ij);h=Ai(h,g);p=f;do{switch(p.tag){case 3:k=h;p.effectTag|=4096;p.expirationTime=b;var B=Xi(p,k,b);yg(p,B);break a;case 1:k=h;var w=p.type,ub=p.stateNode;if(0===(p.effectTag&64)&&("function"===typeof w.getDerivedStateFromError||null!==ub&&"function"===typeof ub.componentDidCatch&&(null===aj||!aj.has(ub)))){p.effectTag|=4096;p.expirationTime=b;var vb=$i(p,k,b);yg(p,vb);break a}}p=p.return;}while(null!==p)}X$1=Pj(X$1);}catch(Xc){b=Xc;continue}break}while(1)}
  function Fj(){var a=cj.current;cj.current=sh;return null===a?sh:a}function Ag(a,b){a<lj&&2<a&&(lj=a);null!==b&&a<mj&&2<a&&(mj=a,nj=b);}function Bg(a){a>wi&&(wi=a);}function Kj(){for(;null!==X$1;)X$1=Qj(X$1);}function Gj(){for(;null!==X$1&&!Uf();)X$1=Qj(X$1);}function Qj(a){var b=Rj(a.alternate,a,U$1);a.memoizedProps=a.pendingProps;null===b&&(b=Pj(a));dj.current=null;return b}
  function Pj(a){X$1=a;do{var b=X$1.alternate;a=X$1.return;if(0===(X$1.effectTag&2048)){b=si(b,X$1,U$1);if(1===U$1||1!==X$1.childExpirationTime){for(var c=0,d=X$1.child;null!==d;){var e=d.expirationTime,f=d.childExpirationTime;e>c&&(c=e);f>c&&(c=f);d=d.sibling;}X$1.childExpirationTime=c;}if(null!==b)return b;null!==a&&0===(a.effectTag&2048)&&(null===a.firstEffect&&(a.firstEffect=X$1.firstEffect),null!==X$1.lastEffect&&(null!==a.lastEffect&&(a.lastEffect.nextEffect=X$1.firstEffect),a.lastEffect=X$1.lastEffect),1<X$1.effectTag&&(null!==
  a.lastEffect?a.lastEffect.nextEffect=X$1:a.firstEffect=X$1,a.lastEffect=X$1));}else{b=zi(X$1);if(null!==b)return b.effectTag&=2047,b;null!==a&&(a.firstEffect=a.lastEffect=null,a.effectTag|=2048);}b=X$1.sibling;if(null!==b)return b;X$1=a;}while(null!==X$1);S$1===ti&&(S$1=jj);return null}function Ij(a){var b=a.expirationTime;a=a.childExpirationTime;return b>a?b:a}function Jj(a){var b=ag();cg(99,Sj.bind(null,a,b));return null}
  function Sj(a,b){do Dj();while(null!==rj);if((W$1&(fj|gj))!==V$1)throw Error(u$1(327));var c=a.finishedWork,d=a.finishedExpirationTime;if(null===c)return null;a.finishedWork=null;a.finishedExpirationTime=0;if(c===a.current)throw Error(u$1(177));a.callbackNode=null;a.callbackExpirationTime=0;a.callbackPriority=90;a.nextKnownPendingLevel=0;var e=Ij(c);a.firstPendingTime=e;d<=a.lastSuspendedTime?a.firstSuspendedTime=a.lastSuspendedTime=a.nextKnownPendingLevel=0:d<=a.firstSuspendedTime&&(a.firstSuspendedTime=
  d-1);d<=a.lastPingedTime&&(a.lastPingedTime=0);d<=a.lastExpiredTime&&(a.lastExpiredTime=0);a===T$1&&(X$1=T$1=null,U$1=0);1<c.effectTag?null!==c.lastEffect?(c.lastEffect.nextEffect=c,e=c.firstEffect):e=c:e=c.firstEffect;if(null!==e){var f=W$1;W$1|=gj;dj.current=null;Dd=fd;var g=xd();if(yd(g)){if("selectionStart"in g)var h={start:g.selectionStart,end:g.selectionEnd};else a:{h=(h=g.ownerDocument)&&h.defaultView||window;var k=h.getSelection&&h.getSelection();if(k&&0!==k.rangeCount){h=k.anchorNode;var l=k.anchorOffset,
  m=k.focusNode;k=k.focusOffset;try{h.nodeType,m.nodeType;}catch(wb){h=null;break a}var p=0,x=-1,z=-1,ca=0,D=0,t=g,y=null;b:for(;;){for(var A;;){t!==h||0!==l&&3!==t.nodeType||(x=p+l);t!==m||0!==k&&3!==t.nodeType||(z=p+k);3===t.nodeType&&(p+=t.nodeValue.length);if(null===(A=t.firstChild))break;y=t;t=A;}for(;;){if(t===g)break b;y===h&&++ca===l&&(x=p);y===m&&++D===k&&(z=p);if(null!==(A=t.nextSibling))break;t=y;y=t.parentNode;}t=A;}h=-1===x||-1===z?null:{start:x,end:z};}else h=null;}h=h||{start:0,end:0};}else h=
  null;Ed={activeElementDetached:null,focusedElem:g,selectionRange:h};fd=!1;Y$1=e;do try{Tj();}catch(wb){if(null===Y$1)throw Error(u$1(330));Ei(Y$1,wb);Y$1=Y$1.nextEffect;}while(null!==Y$1);Y$1=e;do try{for(g=a,h=b;null!==Y$1;){var q=Y$1.effectTag;q&16&&Rb(Y$1.stateNode,"");if(q&128){var B=Y$1.alternate;if(null!==B){var w=B.ref;null!==w&&("function"===typeof w?w(null):w.current=null);}}switch(q&1038){case 2:Pi(Y$1);Y$1.effectTag&=-3;break;case 6:Pi(Y$1);Y$1.effectTag&=-3;Si(Y$1.alternate,Y$1);break;case 1024:Y$1.effectTag&=-1025;break;case 1028:Y$1.effectTag&=
  -1025;Si(Y$1.alternate,Y$1);break;case 4:Si(Y$1.alternate,Y$1);break;case 8:l=Y$1,Mi(g,l,h),Ni(l);}Y$1=Y$1.nextEffect;}}catch(wb){if(null===Y$1)throw Error(u$1(330));Ei(Y$1,wb);Y$1=Y$1.nextEffect;}while(null!==Y$1);w=Ed;B=xd();q=w.focusedElem;h=w.selectionRange;if(B!==q&&q&&q.ownerDocument&&wd(q.ownerDocument.documentElement,q)){null!==h&&yd(q)&&(B=h.start,w=h.end,void 0===w&&(w=B),"selectionStart"in q?(q.selectionStart=B,q.selectionEnd=Math.min(w,q.value.length)):(w=(B=q.ownerDocument||document)&&B.defaultView||window,w.getSelection&&
  (w=w.getSelection(),l=q.textContent.length,g=Math.min(h.start,l),h=void 0===h.end?g:Math.min(h.end,l),!w.extend&&g>h&&(l=h,h=g,g=l),l=vd(q,g),m=vd(q,h),l&&m&&(1!==w.rangeCount||w.anchorNode!==l.node||w.anchorOffset!==l.offset||w.focusNode!==m.node||w.focusOffset!==m.offset)&&(B=B.createRange(),B.setStart(l.node,l.offset),w.removeAllRanges(),g>h?(w.addRange(B),w.extend(m.node,m.offset)):(B.setEnd(m.node,m.offset),w.addRange(B))))));B=[];for(w=q;w=w.parentNode;)1===w.nodeType&&B.push({element:w,left:w.scrollLeft,
  top:w.scrollTop});"function"===typeof q.focus&&q.focus();for(q=0;q<B.length;q++)w=B[q],w.element.scrollLeft=w.left,w.element.scrollTop=w.top;}fd=!!Dd;Ed=Dd=null;a.current=c;Y$1=e;do try{for(q=a;null!==Y$1;){var ub=Y$1.effectTag;ub&36&&Ji(q,Y$1.alternate,Y$1);if(ub&128){B=void 0;var vb=Y$1.ref;if(null!==vb){var Xc=Y$1.stateNode;switch(Y$1.tag){case 5:B=Xc;break;default:B=Xc;}"function"===typeof vb?vb(B):vb.current=B;}}Y$1=Y$1.nextEffect;}}catch(wb){if(null===Y$1)throw Error(u$1(330));Ei(Y$1,wb);Y$1=Y$1.nextEffect;}while(null!==Y$1);Y$1=
  null;Vf();W$1=f;}else a.current=c;if(qj)qj=!1,rj=a,sj=b;else for(Y$1=e;null!==Y$1;)b=Y$1.nextEffect,Y$1.nextEffect=null,Y$1=b;b=a.firstPendingTime;0===b&&(aj=null);1073741823===b?a===vj?uj++:(uj=0,vj=a):uj=0;"function"===typeof Uj&&Uj(c.stateNode,d);Z$1(a);if(Yi)throw Yi=!1,a=Zi,Zi=null,a;if((W$1&ej)!==V$1)return null;gg();return null}function Tj(){for(;null!==Y$1;){var a=Y$1.effectTag;0!==(a&256)&&Gi(Y$1.alternate,Y$1);0===(a&512)||qj||(qj=!0,dg(97,function(){Dj();return null}));Y$1=Y$1.nextEffect;}}
  function Dj(){if(90!==sj){var a=97<sj?97:sj;sj=90;return cg(a,Vj)}}function Vj(){if(null===rj)return !1;var a=rj;rj=null;if((W$1&(fj|gj))!==V$1)throw Error(u$1(331));var b=W$1;W$1|=gj;for(a=a.current.firstEffect;null!==a;){try{var c=a;if(0!==(c.effectTag&512))switch(c.tag){case 0:case 11:case 15:case 22:Hi(5,c),Ii(5,c);}}catch(d){if(null===a)throw Error(u$1(330));Ei(a,d);}c=a.nextEffect;a.nextEffect=null;a=c;}W$1=b;gg();return !0}
  function Wj(a,b,c){b=Ai(c,b);b=Xi(a,b,1073741823);xg(a,b);a=xj(a,1073741823);null!==a&&Z$1(a);}function Ei(a,b){if(3===a.tag)Wj(a,a,b);else for(var c=a.return;null!==c;){if(3===c.tag){Wj(c,a,b);break}else if(1===c.tag){var d=c.stateNode;if("function"===typeof c.type.getDerivedStateFromError||"function"===typeof d.componentDidCatch&&(null===aj||!aj.has(d))){a=Ai(b,a);a=$i(c,a,1073741823);xg(c,a);c=xj(c,1073741823);null!==c&&Z$1(c);break}}c=c.return;}}
  function Oj(a,b,c){var d=a.pingCache;null!==d&&d.delete(b);T$1===a&&U$1===c?S$1===vi||S$1===ui&&1073741823===lj&&$f()-Ti<pj?Ej(a,U$1):oj=!0:Aj(a,c)&&(b=a.lastPingedTime,0!==b&&b<c||(a.lastPingedTime=c,Z$1(a)));}function Vi(a,b){var c=a.stateNode;null!==c&&c.delete(b);b=0;0===b&&(b=Gg(),b=Hg(b,a,null));a=xj(a,b);null!==a&&Z$1(a);}var Rj;
  Rj=function(a,b,c){var d=b.expirationTime;if(null!==a){var e=b.pendingProps;if(a.memoizedProps!==e||K$1.current)rg=!0;else{if(d<c){rg=!1;switch(b.tag){case 3:hi(b);Xh();break;case 5:fh(b);if(b.mode&4&&1!==c&&e.hidden)return b.expirationTime=b.childExpirationTime=1,null;break;case 1:L$1(b.type)&&Gf(b);break;case 4:dh(b,b.stateNode.containerInfo);break;case 10:d=b.memoizedProps.value;e=b.type._context;I$1(jg,e._currentValue);e._currentValue=d;break;case 13:if(null!==b.memoizedState){d=b.child.childExpirationTime;
  if(0!==d&&d>=c)return ji(a,b,c);I$1(M$1,M$1.current&1);b=$h(a,b,c);return null!==b?b.sibling:null}I$1(M$1,M$1.current&1);break;case 19:d=b.childExpirationTime>=c;if(0!==(a.effectTag&64)){if(d)return mi(a,b,c);b.effectTag|=64;}e=b.memoizedState;null!==e&&(e.rendering=null,e.tail=null);I$1(M$1,M$1.current);if(!d)return null}return $h(a,b,c)}rg=!1;}}else rg=!1;b.expirationTime=0;switch(b.tag){case 2:d=b.type;null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2);a=b.pendingProps;e=Cf(b,J$1.current);qg(b,c);e=oh(null,
  b,d,a,e,c);b.effectTag|=1;if("object"===typeof e&&null!==e&&"function"===typeof e.render&&void 0===e.$$typeof){b.tag=1;b.memoizedState=null;b.updateQueue=null;if(L$1(d)){var f=!0;Gf(b);}else f=!1;b.memoizedState=null!==e.state&&void 0!==e.state?e.state:null;ug(b);var g=d.getDerivedStateFromProps;"function"===typeof g&&Fg(b,d,g,a);e.updater=Jg;b.stateNode=e;e._reactInternalFiber=b;Ng(b,d,a,c);b=gi(null,b,d,!0,f,c);}else b.tag=0,R$1(null,b,e,c),b=b.child;return b;case 16:a:{e=b.elementType;null!==a&&(a.alternate=
  null,b.alternate=null,b.effectTag|=2);a=b.pendingProps;ob(e);if(1!==e._status)throw e._result;e=e._result;b.type=e;f=b.tag=Xj(e);a=ig(e,a);switch(f){case 0:b=di(null,b,e,a,c);break a;case 1:b=fi(null,b,e,a,c);break a;case 11:b=Zh(null,b,e,a,c);break a;case 14:b=ai(null,b,e,ig(e.type,a),d,c);break a}throw Error(u$1(306,e,""));}return b;case 0:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),di(a,b,d,e,c);case 1:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),fi(a,b,d,e,c);
  case 3:hi(b);d=b.updateQueue;if(null===a||null===d)throw Error(u$1(282));d=b.pendingProps;e=b.memoizedState;e=null!==e?e.element:null;vg(a,b);zg(b,d,null,c);d=b.memoizedState.element;if(d===e)Xh(),b=$h(a,b,c);else{if(e=b.stateNode.hydrate)Ph=Jd(b.stateNode.containerInfo.firstChild),Oh=b,e=Qh=!0;if(e)for(c=Yg(b,null,d,c),b.child=c;c;)c.effectTag=c.effectTag&-3|1024,c=c.sibling;else R$1(a,b,d,c),Xh();b=b.child;}return b;case 5:return fh(b),null===a&&Uh(b),d=b.type,e=b.pendingProps,f=null!==a?a.memoizedProps:
  null,g=e.children,Gd(d,e)?g=null:null!==f&&Gd(d,f)&&(b.effectTag|=16),ei(a,b),b.mode&4&&1!==c&&e.hidden?(b.expirationTime=b.childExpirationTime=1,b=null):(R$1(a,b,g,c),b=b.child),b;case 6:return null===a&&Uh(b),null;case 13:return ji(a,b,c);case 4:return dh(b,b.stateNode.containerInfo),d=b.pendingProps,null===a?b.child=Xg(b,null,d,c):R$1(a,b,d,c),b.child;case 11:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),Zh(a,b,d,e,c);case 7:return R$1(a,b,b.pendingProps,c),b.child;case 8:return R$1(a,
  b,b.pendingProps.children,c),b.child;case 12:return R$1(a,b,b.pendingProps.children,c),b.child;case 10:a:{d=b.type._context;e=b.pendingProps;g=b.memoizedProps;f=e.value;var h=b.type._context;I$1(jg,h._currentValue);h._currentValue=f;if(null!==g)if(h=g.value,f=$e(h,f)?0:("function"===typeof d._calculateChangedBits?d._calculateChangedBits(h,f):1073741823)|0,0===f){if(g.children===e.children&&!K$1.current){b=$h(a,b,c);break a}}else for(h=b.child,null!==h&&(h.return=b);null!==h;){var k=h.dependencies;if(null!==
  k){g=h.child;for(var l=k.firstContext;null!==l;){if(l.context===d&&0!==(l.observedBits&f)){1===h.tag&&(l=wg(c,null),l.tag=2,xg(h,l));h.expirationTime<c&&(h.expirationTime=c);l=h.alternate;null!==l&&l.expirationTime<c&&(l.expirationTime=c);pg(h.return,c);k.expirationTime<c&&(k.expirationTime=c);break}l=l.next;}}else g=10===h.tag?h.type===b.type?null:h.child:h.child;if(null!==g)g.return=h;else for(g=h;null!==g;){if(g===b){g=null;break}h=g.sibling;if(null!==h){h.return=g.return;g=h;break}g=g.return;}h=
  g;}R$1(a,b,e.children,c);b=b.child;}return b;case 9:return e=b.type,f=b.pendingProps,d=f.children,qg(b,c),e=sg(e,f.unstable_observedBits),d=d(e),b.effectTag|=1,R$1(a,b,d,c),b.child;case 14:return e=b.type,f=ig(e,b.pendingProps),f=ig(e.type,f),ai(a,b,e,f,d,c);case 15:return ci(a,b,b.type,b.pendingProps,d,c);case 17:return d=b.type,e=b.pendingProps,e=b.elementType===d?e:ig(d,e),null!==a&&(a.alternate=null,b.alternate=null,b.effectTag|=2),b.tag=1,L$1(d)?(a=!0,Gf(b)):a=!1,qg(b,c),Lg(b,d,e),Ng(b,d,e,c),gi(null,
  b,d,!0,a,c);case 19:return mi(a,b,c)}throw Error(u$1(156,b.tag));};var Uj=null,Li=null;function Yj(a){if("undefined"===typeof __REACT_DEVTOOLS_GLOBAL_HOOK__)return !1;var b=__REACT_DEVTOOLS_GLOBAL_HOOK__;if(b.isDisabled||!b.supportsFiber)return !0;try{var c=b.inject(a);Uj=function(a){try{b.onCommitFiberRoot(c,a,void 0,64===(a.current.effectTag&64));}catch(e){}};Li=function(a){try{b.onCommitFiberUnmount(c,a);}catch(e){}};}catch(d){}return !0}
  function Zj(a,b,c,d){this.tag=a;this.key=c;this.sibling=this.child=this.return=this.stateNode=this.type=this.elementType=null;this.index=0;this.ref=null;this.pendingProps=b;this.dependencies=this.memoizedState=this.updateQueue=this.memoizedProps=null;this.mode=d;this.effectTag=0;this.lastEffect=this.firstEffect=this.nextEffect=null;this.childExpirationTime=this.expirationTime=0;this.alternate=null;}function Sh(a,b,c,d){return new Zj(a,b,c,d)}
  function bi(a){a=a.prototype;return !(!a||!a.isReactComponent)}function Xj(a){if("function"===typeof a)return bi(a)?1:0;if(void 0!==a&&null!==a){a=a.$$typeof;if(a===gb)return 11;if(a===jb)return 14}return 2}
  function Sg(a,b){var c=a.alternate;null===c?(c=Sh(a.tag,b,a.key,a.mode),c.elementType=a.elementType,c.type=a.type,c.stateNode=a.stateNode,c.alternate=a,a.alternate=c):(c.pendingProps=b,c.effectTag=0,c.nextEffect=null,c.firstEffect=null,c.lastEffect=null);c.childExpirationTime=a.childExpirationTime;c.expirationTime=a.expirationTime;c.child=a.child;c.memoizedProps=a.memoizedProps;c.memoizedState=a.memoizedState;c.updateQueue=a.updateQueue;b=a.dependencies;c.dependencies=null===b?null:{expirationTime:b.expirationTime,
  firstContext:b.firstContext,responders:b.responders};c.sibling=a.sibling;c.index=a.index;c.ref=a.ref;return c}
  function Ug(a,b,c,d,e,f){var g=2;d=a;if("function"===typeof a)bi(a)&&(g=1);else if("string"===typeof a)g=5;else a:switch(a){case ab:return Wg(c.children,e,f,b);case fb:g=8;e|=7;break;case bb:g=8;e|=1;break;case cb:return a=Sh(12,c,b,e|8),a.elementType=cb,a.type=cb,a.expirationTime=f,a;case hb:return a=Sh(13,c,b,e),a.type=hb,a.elementType=hb,a.expirationTime=f,a;case ib:return a=Sh(19,c,b,e),a.elementType=ib,a.expirationTime=f,a;default:if("object"===typeof a&&null!==a)switch(a.$$typeof){case db:g=
  10;break a;case eb:g=9;break a;case gb:g=11;break a;case jb:g=14;break a;case kb:g=16;d=null;break a;case lb:g=22;break a}throw Error(u$1(130,null==a?a:typeof a,""));}b=Sh(g,c,b,e);b.elementType=a;b.type=d;b.expirationTime=f;return b}function Wg(a,b,c,d){a=Sh(7,a,d,b);a.expirationTime=c;return a}function Tg(a,b,c){a=Sh(6,a,null,b);a.expirationTime=c;return a}
  function Vg(a,b,c){b=Sh(4,null!==a.children?a.children:[],a.key,b);b.expirationTime=c;b.stateNode={containerInfo:a.containerInfo,pendingChildren:null,implementation:a.implementation};return b}
  function ak(a,b,c){this.tag=b;this.current=null;this.containerInfo=a;this.pingCache=this.pendingChildren=null;this.finishedExpirationTime=0;this.finishedWork=null;this.timeoutHandle=-1;this.pendingContext=this.context=null;this.hydrate=c;this.callbackNode=null;this.callbackPriority=90;this.lastExpiredTime=this.lastPingedTime=this.nextKnownPendingLevel=this.lastSuspendedTime=this.firstSuspendedTime=this.firstPendingTime=0;}
  function Aj(a,b){var c=a.firstSuspendedTime;a=a.lastSuspendedTime;return 0!==c&&c>=b&&a<=b}function xi(a,b){var c=a.firstSuspendedTime,d=a.lastSuspendedTime;c<b&&(a.firstSuspendedTime=b);if(d>b||0===c)a.lastSuspendedTime=b;b<=a.lastPingedTime&&(a.lastPingedTime=0);b<=a.lastExpiredTime&&(a.lastExpiredTime=0);}
  function yi(a,b){b>a.firstPendingTime&&(a.firstPendingTime=b);var c=a.firstSuspendedTime;0!==c&&(b>=c?a.firstSuspendedTime=a.lastSuspendedTime=a.nextKnownPendingLevel=0:b>=a.lastSuspendedTime&&(a.lastSuspendedTime=b+1),b>a.nextKnownPendingLevel&&(a.nextKnownPendingLevel=b));}function Cj(a,b){var c=a.lastExpiredTime;if(0===c||c>b)a.lastExpiredTime=b;}
  function bk(a,b,c,d){var e=b.current,f=Gg(),g=Dg.suspense;f=Hg(f,e,g);a:if(c){c=c._reactInternalFiber;b:{if(dc(c)!==c||1!==c.tag)throw Error(u$1(170));var h=c;do{switch(h.tag){case 3:h=h.stateNode.context;break b;case 1:if(L$1(h.type)){h=h.stateNode.__reactInternalMemoizedMergedChildContext;break b}}h=h.return;}while(null!==h);throw Error(u$1(171));}if(1===c.tag){var k=c.type;if(L$1(k)){c=Ff(c,k,h);break a}}c=h;}else c=Af;null===b.context?b.context=c:b.pendingContext=c;b=wg(f,g);b.payload={element:a};d=void 0===
  d?null:d;null!==d&&(b.callback=d);xg(e,b);Ig(e,f);return f}function ck(a){a=a.current;if(!a.child)return null;switch(a.child.tag){case 5:return a.child.stateNode;default:return a.child.stateNode}}function dk(a,b){a=a.memoizedState;null!==a&&null!==a.dehydrated&&a.retryTime<b&&(a.retryTime=b);}function ek(a,b){dk(a,b);(a=a.alternate)&&dk(a,b);}
  function fk(a,b,c){c=null!=c&&!0===c.hydrate;var d=new ak(a,b,c),e=Sh(3,null,null,2===b?7:1===b?3:0);d.current=e;e.stateNode=d;ug(e);a[Od]=d.current;c&&0!==b&&Jc(a,9===a.nodeType?a:a.ownerDocument);this._internalRoot=d;}fk.prototype.render=function(a){bk(a,this._internalRoot,null,null);};fk.prototype.unmount=function(){var a=this._internalRoot,b=a.containerInfo;bk(null,a,null,function(){b[Od]=null;});};
  function gk(a){return !(!a||1!==a.nodeType&&9!==a.nodeType&&11!==a.nodeType&&(8!==a.nodeType||" react-mount-point-unstable "!==a.nodeValue))}function hk(a,b){b||(b=a?9===a.nodeType?a.documentElement:a.firstChild:null,b=!(!b||1!==b.nodeType||!b.hasAttribute("data-reactroot")));if(!b)for(var c;c=a.lastChild;)a.removeChild(c);return new fk(a,0,b?{hydrate:!0}:void 0)}
  function ik(a,b,c,d,e){var f=c._reactRootContainer;if(f){var g=f._internalRoot;if("function"===typeof e){var h=e;e=function(){var a=ck(g);h.call(a);};}bk(b,g,a,e);}else{f=c._reactRootContainer=hk(c,d);g=f._internalRoot;if("function"===typeof e){var k=e;e=function(){var a=ck(g);k.call(a);};}Nj(function(){bk(b,g,a,e);});}return ck(g)}function jk(a,b,c){var d=3<arguments.length&&void 0!==arguments[3]?arguments[3]:null;return {$$typeof:$a,key:null==d?null:""+d,children:a,containerInfo:b,implementation:c}}
  wc=function(a){if(13===a.tag){var b=hg(Gg(),150,100);Ig(a,b);ek(a,b);}};xc=function(a){13===a.tag&&(Ig(a,3),ek(a,3));};yc=function(a){if(13===a.tag){var b=Gg();b=Hg(b,a,null);Ig(a,b);ek(a,b);}};
  za=function(a,b,c){switch(b){case "input":Cb(a,c);b=c.name;if("radio"===c.type&&null!=b){for(c=a;c.parentNode;)c=c.parentNode;c=c.querySelectorAll("input[name="+JSON.stringify(""+b)+'][type="radio"]');for(b=0;b<c.length;b++){var d=c[b];if(d!==a&&d.form===a.form){var e=Qd(d);if(!e)throw Error(u$1(90));yb(d);Cb(d,e);}}}break;case "textarea":Kb(a,c);break;case "select":b=c.value,null!=b&&Hb(a,!!c.multiple,b,!1);}};Fa=Mj;
  Ga=function(a,b,c,d,e){var f=W$1;W$1|=4;try{return cg(98,a.bind(null,b,c,d,e))}finally{W$1=f,W$1===V$1&&gg();}};Ha=function(){(W$1&(1|fj|gj))===V$1&&(Lj(),Dj());};Ia=function(a,b){var c=W$1;W$1|=2;try{return a(b)}finally{W$1=c,W$1===V$1&&gg();}};function kk(a,b){var c=2<arguments.length&&void 0!==arguments[2]?arguments[2]:null;if(!gk(b))throw Error(u$1(200));return jk(a,b,null,c)}var lk={Events:[Nc,Pd,Qd,xa,ta,Xd,function(a){jc(a,Wd);},Da,Ea,id,mc,Dj,{current:!1}]};
  (function(a){var b=a.findFiberByHostInstance;return Yj(objectAssign({},a,{overrideHookState:null,overrideProps:null,setSuspenseHandler:null,scheduleUpdate:null,currentDispatcherRef:Wa.ReactCurrentDispatcher,findHostInstanceByFiber:function(a){a=hc(a);return null===a?null:a.stateNode},findFiberByHostInstance:function(a){return b?b(a):null},findHostInstancesForRefresh:null,scheduleRefresh:null,scheduleRoot:null,setRefreshHandler:null,getCurrentFiber:null}))})({findFiberByHostInstance:tc,bundleType:0,version:"16.14.0",
  rendererPackageName:"react-dom"});var __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED$1=lk;var createPortal=kk;var findDOMNode=function(a){if(null==a)return null;if(1===a.nodeType)return a;var b=a._reactInternalFiber;if(void 0===b){if("function"===typeof a.render)throw Error(u$1(188));throw Error(u$1(268,Object.keys(a)));}a=hc(b);a=null===a?null:a.stateNode;return a};
  var flushSync=function(a,b){if((W$1&(fj|gj))!==V$1)throw Error(u$1(187));var c=W$1;W$1|=1;try{return cg(99,a.bind(null,b))}finally{W$1=c,gg();}};var hydrate=function(a,b,c){if(!gk(b))throw Error(u$1(200));return ik(null,a,b,!0,c)};var render$1=function(a,b,c){if(!gk(b))throw Error(u$1(200));return ik(null,a,b,!1,c)};
  var unmountComponentAtNode=function(a){if(!gk(a))throw Error(u$1(40));return a._reactRootContainer?(Nj(function(){ik(null,null,a,!1,function(){a._reactRootContainer=null;a[Od]=null;});}),!0):!1};var unstable_batchedUpdates=Mj;var unstable_createPortal=function(a,b){return kk(a,b,2<arguments.length&&void 0!==arguments[2]?arguments[2]:null)};
  var unstable_renderSubtreeIntoContainer=function(a,b,c,d){if(!gk(c))throw Error(u$1(200));if(null==a||void 0===a._reactInternalFiber)throw Error(u$1(38));return ik(a,b,c,!1,d)};var version$1="16.14.0";

  var reactDom_production_min = {
  	__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED$1,
  	createPortal: createPortal,
  	findDOMNode: findDOMNode,
  	flushSync: flushSync,
  	hydrate: hydrate,
  	render: render$1,
  	unmountComponentAtNode: unmountComponentAtNode,
  	unstable_batchedUpdates: unstable_batchedUpdates,
  	unstable_createPortal: unstable_createPortal,
  	unstable_renderSubtreeIntoContainer: unstable_renderSubtreeIntoContainer,
  	version: version$1
  };

  var reactDom = createCommonjsModule(function (module) {

  function checkDCE() {
    /* global __REACT_DEVTOOLS_GLOBAL_HOOK__ */
    if (
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ === 'undefined' ||
      typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE !== 'function'
    ) {
      return;
    }
    try {
      // Verify that the code above has been dead code eliminated (DCE'd).
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(checkDCE);
    } catch (err) {
      // DevTools shouldn't crash React, no matter what.
      // We should still report in case we break this code.
      console.error(err);
    }
  }

  {
    // DCE check should happen before ReactDOM bundle executes so that
    // DevTools can report bad minification during injection.
    checkDCE();
    module.exports = reactDom_production_min;
  }
  });
  var reactDom_1 = reactDom.render;

  var _typeof_1 = createCommonjsModule(function (module) {
  function _typeof(o) {
    "@babel/helpers - typeof";

    return module.exports = _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) {
      return typeof o;
    } : function (o) {
      return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
    }, module.exports.__esModule = true, module.exports["default"] = module.exports, _typeof(o);
  }
  module.exports = _typeof, module.exports.__esModule = true, module.exports["default"] = module.exports;
  });

  unwrapExports(_typeof_1);

  var toPrimitive_1 = createCommonjsModule(function (module) {
  var _typeof = _typeof_1["default"];
  function toPrimitive(t, r) {
    if ("object" != _typeof(t) || !t) return t;
    var e = t[Symbol.toPrimitive];
    if (void 0 !== e) {
      var i = e.call(t, r || "default");
      if ("object" != _typeof(i)) return i;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return ("string" === r ? String : Number)(t);
  }
  module.exports = toPrimitive, module.exports.__esModule = true, module.exports["default"] = module.exports;
  });

  unwrapExports(toPrimitive_1);

  var toPropertyKey_1 = createCommonjsModule(function (module) {
  var _typeof = _typeof_1["default"];

  function toPropertyKey(t) {
    var i = toPrimitive_1(t, "string");
    return "symbol" == _typeof(i) ? i : i + "";
  }
  module.exports = toPropertyKey, module.exports.__esModule = true, module.exports["default"] = module.exports;
  });

  unwrapExports(toPropertyKey_1);

  var defineProperty = createCommonjsModule(function (module) {
  function _defineProperty(e, r, t) {
    return (r = toPropertyKey_1(r)) in e ? Object.defineProperty(e, r, {
      value: t,
      enumerable: !0,
      configurable: !0,
      writable: !0
    }) : e[r] = t, e;
  }
  module.exports = _defineProperty, module.exports.__esModule = true, module.exports["default"] = module.exports;
  });

  var _defineProperty = unwrapExports(defineProperty);

  /**
   * Copyright (c) 2013-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  var ReactPropTypesSecret = 'SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED';

  var ReactPropTypesSecret_1 = ReactPropTypesSecret;

  function emptyFunction() {}
  function emptyFunctionWithReset() {}
  emptyFunctionWithReset.resetWarningCache = emptyFunction;

  var factoryWithThrowingShims = function() {
    function shim(props, propName, componentName, location, propFullName, secret) {
      if (secret === ReactPropTypesSecret_1) {
        // It is still safe when called from React.
        return;
      }
      var err = new Error(
        'Calling PropTypes validators directly is not supported by the `prop-types` package. ' +
        'Use PropTypes.checkPropTypes() to call them. ' +
        'Read more at http://fb.me/use-check-prop-types'
      );
      err.name = 'Invariant Violation';
      throw err;
    }  shim.isRequired = shim;
    function getShim() {
      return shim;
    }  // Important!
    // Keep this list in sync with production version in `./factoryWithTypeCheckers.js`.
    var ReactPropTypes = {
      array: shim,
      bigint: shim,
      bool: shim,
      func: shim,
      number: shim,
      object: shim,
      string: shim,
      symbol: shim,

      any: shim,
      arrayOf: getShim,
      element: shim,
      elementType: shim,
      instanceOf: getShim,
      node: shim,
      objectOf: getShim,
      oneOf: getShim,
      oneOfType: getShim,
      shape: getShim,
      exact: getShim,

      checkPropTypes: emptyFunctionWithReset,
      resetWarningCache: emptyFunction
    };

    ReactPropTypes.PropTypes = ReactPropTypes;

    return ReactPropTypes;
  };

  var propTypes = createCommonjsModule(function (module) {
  /**
   * Copyright (c) 2013-present, Facebook, Inc.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   */

  {
    // By explicitly using `prop-types` you are opting into new production behavior.
    // http://fb.me/prop-types-in-prod
    module.exports = factoryWithThrowingShims();
  }
  });

  /**
   * Removes all key-value entries from the list cache.
   *
   * @private
   * @name clear
   * @memberOf ListCache
   */
  function listCacheClear() {
    this.__data__ = [];
    this.size = 0;
  }

  var _listCacheClear = listCacheClear;

  /**
   * Performs a
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * comparison between two values to determine if they are equivalent.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.eq(object, object);
   * // => true
   *
   * _.eq(object, other);
   * // => false
   *
   * _.eq('a', 'a');
   * // => true
   *
   * _.eq('a', Object('a'));
   * // => false
   *
   * _.eq(NaN, NaN);
   * // => true
   */
  function eq(value, other) {
    return value === other || (value !== value && other !== other);
  }

  var eq_1 = eq;

  /**
   * Gets the index at which the `key` is found in `array` of key-value pairs.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} key The key to search for.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function assocIndexOf(array, key) {
    var length = array.length;
    while (length--) {
      if (eq_1(array[length][0], key)) {
        return length;
      }
    }
    return -1;
  }

  var _assocIndexOf = assocIndexOf;

  /** Used for built-in method references. */
  var arrayProto = Array.prototype;

  /** Built-in value references. */
  var splice = arrayProto.splice;

  /**
   * Removes `key` and its value from the list cache.
   *
   * @private
   * @name delete
   * @memberOf ListCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function listCacheDelete(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      return false;
    }
    var lastIndex = data.length - 1;
    if (index == lastIndex) {
      data.pop();
    } else {
      splice.call(data, index, 1);
    }
    --this.size;
    return true;
  }

  var _listCacheDelete = listCacheDelete;

  /**
   * Gets the list cache value for `key`.
   *
   * @private
   * @name get
   * @memberOf ListCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function listCacheGet(key) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    return index < 0 ? undefined : data[index][1];
  }

  var _listCacheGet = listCacheGet;

  /**
   * Checks if a list cache value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf ListCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function listCacheHas(key) {
    return _assocIndexOf(this.__data__, key) > -1;
  }

  var _listCacheHas = listCacheHas;

  /**
   * Sets the list cache `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf ListCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the list cache instance.
   */
  function listCacheSet(key, value) {
    var data = this.__data__,
        index = _assocIndexOf(data, key);

    if (index < 0) {
      ++this.size;
      data.push([key, value]);
    } else {
      data[index][1] = value;
    }
    return this;
  }

  var _listCacheSet = listCacheSet;

  /**
   * Creates an list cache object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function ListCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `ListCache`.
  ListCache.prototype.clear = _listCacheClear;
  ListCache.prototype['delete'] = _listCacheDelete;
  ListCache.prototype.get = _listCacheGet;
  ListCache.prototype.has = _listCacheHas;
  ListCache.prototype.set = _listCacheSet;

  var _ListCache = ListCache;

  /**
   * Removes all key-value entries from the stack.
   *
   * @private
   * @name clear
   * @memberOf Stack
   */
  function stackClear() {
    this.__data__ = new _ListCache;
    this.size = 0;
  }

  var _stackClear = stackClear;

  /**
   * Removes `key` and its value from the stack.
   *
   * @private
   * @name delete
   * @memberOf Stack
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function stackDelete(key) {
    var data = this.__data__,
        result = data['delete'](key);

    this.size = data.size;
    return result;
  }

  var _stackDelete = stackDelete;

  /**
   * Gets the stack value for `key`.
   *
   * @private
   * @name get
   * @memberOf Stack
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function stackGet(key) {
    return this.__data__.get(key);
  }

  var _stackGet = stackGet;

  /**
   * Checks if a stack value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Stack
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function stackHas(key) {
    return this.__data__.has(key);
  }

  var _stackHas = stackHas;

  /* Built-in method references that are verified to be native. */
  var nativeCreate = _getNative(Object, 'create');

  var _nativeCreate = nativeCreate;

  /**
   * Removes all key-value entries from the hash.
   *
   * @private
   * @name clear
   * @memberOf Hash
   */
  function hashClear() {
    this.__data__ = _nativeCreate ? _nativeCreate(null) : {};
    this.size = 0;
  }

  var _hashClear = hashClear;

  /**
   * Removes `key` and its value from the hash.
   *
   * @private
   * @name delete
   * @memberOf Hash
   * @param {Object} hash The hash to modify.
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function hashDelete(key) {
    var result = this.has(key) && delete this.__data__[key];
    this.size -= result ? 1 : 0;
    return result;
  }

  var _hashDelete = hashDelete;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED = '__lodash_hash_undefined__';

  /** Used for built-in method references. */
  var objectProto$7 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$6 = objectProto$7.hasOwnProperty;

  /**
   * Gets the hash value for `key`.
   *
   * @private
   * @name get
   * @memberOf Hash
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function hashGet(key) {
    var data = this.__data__;
    if (_nativeCreate) {
      var result = data[key];
      return result === HASH_UNDEFINED ? undefined : result;
    }
    return hasOwnProperty$6.call(data, key) ? data[key] : undefined;
  }

  var _hashGet = hashGet;

  /** Used for built-in method references. */
  var objectProto$8 = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$7 = objectProto$8.hasOwnProperty;

  /**
   * Checks if a hash value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Hash
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function hashHas(key) {
    var data = this.__data__;
    return _nativeCreate ? (data[key] !== undefined) : hasOwnProperty$7.call(data, key);
  }

  var _hashHas = hashHas;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

  /**
   * Sets the hash `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Hash
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the hash instance.
   */
  function hashSet(key, value) {
    var data = this.__data__;
    this.size += this.has(key) ? 0 : 1;
    data[key] = (_nativeCreate && value === undefined) ? HASH_UNDEFINED$1 : value;
    return this;
  }

  var _hashSet = hashSet;

  /**
   * Creates a hash object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Hash(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `Hash`.
  Hash.prototype.clear = _hashClear;
  Hash.prototype['delete'] = _hashDelete;
  Hash.prototype.get = _hashGet;
  Hash.prototype.has = _hashHas;
  Hash.prototype.set = _hashSet;

  var _Hash = Hash;

  /**
   * Removes all key-value entries from the map.
   *
   * @private
   * @name clear
   * @memberOf MapCache
   */
  function mapCacheClear() {
    this.size = 0;
    this.__data__ = {
      'hash': new _Hash,
      'map': new (_Map || _ListCache),
      'string': new _Hash
    };
  }

  var _mapCacheClear = mapCacheClear;

  /**
   * Checks if `value` is suitable for use as unique object key.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
   */
  function isKeyable(value) {
    var type = typeof value;
    return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
      ? (value !== '__proto__')
      : (value === null);
  }

  var _isKeyable = isKeyable;

  /**
   * Gets the data for `map`.
   *
   * @private
   * @param {Object} map The map to query.
   * @param {string} key The reference key.
   * @returns {*} Returns the map data.
   */
  function getMapData(map, key) {
    var data = map.__data__;
    return _isKeyable(key)
      ? data[typeof key == 'string' ? 'string' : 'hash']
      : data.map;
  }

  var _getMapData = getMapData;

  /**
   * Removes `key` and its value from the map.
   *
   * @private
   * @name delete
   * @memberOf MapCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function mapCacheDelete(key) {
    var result = _getMapData(this, key)['delete'](key);
    this.size -= result ? 1 : 0;
    return result;
  }

  var _mapCacheDelete = mapCacheDelete;

  /**
   * Gets the map value for `key`.
   *
   * @private
   * @name get
   * @memberOf MapCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function mapCacheGet(key) {
    return _getMapData(this, key).get(key);
  }

  var _mapCacheGet = mapCacheGet;

  /**
   * Checks if a map value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf MapCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function mapCacheHas(key) {
    return _getMapData(this, key).has(key);
  }

  var _mapCacheHas = mapCacheHas;

  /**
   * Sets the map `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf MapCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the map cache instance.
   */
  function mapCacheSet(key, value) {
    var data = _getMapData(this, key),
        size = data.size;

    data.set(key, value);
    this.size += data.size == size ? 0 : 1;
    return this;
  }

  var _mapCacheSet = mapCacheSet;

  /**
   * Creates a map cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function MapCache(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `MapCache`.
  MapCache.prototype.clear = _mapCacheClear;
  MapCache.prototype['delete'] = _mapCacheDelete;
  MapCache.prototype.get = _mapCacheGet;
  MapCache.prototype.has = _mapCacheHas;
  MapCache.prototype.set = _mapCacheSet;

  var _MapCache = MapCache;

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE = 200;

  /**
   * Sets the stack `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Stack
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the stack cache instance.
   */
  function stackSet(key, value) {
    var data = this.__data__;
    if (data instanceof _ListCache) {
      var pairs = data.__data__;
      if (!_Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
        pairs.push([key, value]);
        this.size = ++data.size;
        return this;
      }
      data = this.__data__ = new _MapCache(pairs);
    }
    data.set(key, value);
    this.size = data.size;
    return this;
  }

  var _stackSet = stackSet;

  /**
   * Creates a stack cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Stack(entries) {
    var data = this.__data__ = new _ListCache(entries);
    this.size = data.size;
  }

  // Add methods to `Stack`.
  Stack.prototype.clear = _stackClear;
  Stack.prototype['delete'] = _stackDelete;
  Stack.prototype.get = _stackGet;
  Stack.prototype.has = _stackHas;
  Stack.prototype.set = _stackSet;

  var _Stack = Stack;

  var defineProperty$1 = (function() {
    try {
      var func = _getNative(Object, 'defineProperty');
      func({}, '', {});
      return func;
    } catch (e) {}
  }());

  var _defineProperty$1 = defineProperty$1;

  /**
   * The base implementation of `assignValue` and `assignMergeValue` without
   * value checks.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function baseAssignValue(object, key, value) {
    if (key == '__proto__' && _defineProperty$1) {
      _defineProperty$1(object, key, {
        'configurable': true,
        'enumerable': true,
        'value': value,
        'writable': true
      });
    } else {
      object[key] = value;
    }
  }

  var _baseAssignValue = baseAssignValue;

  /**
   * This function is like `assignValue` except that it doesn't assign
   * `undefined` values.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function assignMergeValue(object, key, value) {
    if ((value !== undefined && !eq_1(object[key], value)) ||
        (value === undefined && !(key in object))) {
      _baseAssignValue(object, key, value);
    }
  }

  var _assignMergeValue = assignMergeValue;

  /**
   * Creates a base function for methods like `_.forIn` and `_.forOwn`.
   *
   * @private
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {Function} Returns the new base function.
   */
  function createBaseFor(fromRight) {
    return function(object, iteratee, keysFunc) {
      var index = -1,
          iterable = Object(object),
          props = keysFunc(object),
          length = props.length;

      while (length--) {
        var key = props[fromRight ? length : ++index];
        if (iteratee(iterable[key], key, iterable) === false) {
          break;
        }
      }
      return object;
    };
  }

  var _createBaseFor = createBaseFor;

  /**
   * The base implementation of `baseForOwn` which iterates over `object`
   * properties returned by `keysFunc` and invokes `iteratee` for each property.
   * Iteratee functions may exit iteration early by explicitly returning `false`.
   *
   * @private
   * @param {Object} object The object to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @returns {Object} Returns `object`.
   */
  var baseFor = _createBaseFor();

  var _baseFor = baseFor;

  var _cloneBuffer = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root.Buffer : undefined,
      allocUnsafe = Buffer ? Buffer.allocUnsafe : undefined;

  /**
   * Creates a clone of  `buffer`.
   *
   * @private
   * @param {Buffer} buffer The buffer to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Buffer} Returns the cloned buffer.
   */
  function cloneBuffer(buffer, isDeep) {
    if (isDeep) {
      return buffer.slice();
    }
    var length = buffer.length,
        result = allocUnsafe ? allocUnsafe(length) : new buffer.constructor(length);

    buffer.copy(result);
    return result;
  }

  module.exports = cloneBuffer;
  });

  /** Built-in value references. */
  var Uint8Array$1 = _root.Uint8Array;

  var _Uint8Array = Uint8Array$1;

  /**
   * Creates a clone of `arrayBuffer`.
   *
   * @private
   * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
   * @returns {ArrayBuffer} Returns the cloned array buffer.
   */
  function cloneArrayBuffer(arrayBuffer) {
    var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
    new _Uint8Array(result).set(new _Uint8Array(arrayBuffer));
    return result;
  }

  var _cloneArrayBuffer = cloneArrayBuffer;

  /**
   * Creates a clone of `typedArray`.
   *
   * @private
   * @param {Object} typedArray The typed array to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned typed array.
   */
  function cloneTypedArray(typedArray, isDeep) {
    var buffer = isDeep ? _cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
    return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
  }

  var _cloneTypedArray = cloneTypedArray;

  /**
   * Copies the values of `source` to `array`.
   *
   * @private
   * @param {Array} source The array to copy values from.
   * @param {Array} [array=[]] The array to copy values to.
   * @returns {Array} Returns `array`.
   */
  function copyArray(source, array) {
    var index = -1,
        length = source.length;

    array || (array = Array(length));
    while (++index < length) {
      array[index] = source[index];
    }
    return array;
  }

  var _copyArray = copyArray;

  /** Built-in value references. */
  var objectCreate = Object.create;

  /**
   * The base implementation of `_.create` without support for assigning
   * properties to the created object.
   *
   * @private
   * @param {Object} proto The object to inherit from.
   * @returns {Object} Returns the new object.
   */
  var baseCreate = (function() {
    function object() {}
    return function(proto) {
      if (!isObject_1(proto)) {
        return {};
      }
      if (objectCreate) {
        return objectCreate(proto);
      }
      object.prototype = proto;
      var result = new object;
      object.prototype = undefined;
      return result;
    };
  }());

  var _baseCreate = baseCreate;

  /** Built-in value references. */
  var getPrototype = _overArg(Object.getPrototypeOf, Object);

  var _getPrototype = getPrototype;

  /**
   * Initializes an object clone.
   *
   * @private
   * @param {Object} object The object to clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneObject(object) {
    return (typeof object.constructor == 'function' && !_isPrototype(object))
      ? _baseCreate(_getPrototype(object))
      : {};
  }

  var _initCloneObject = initCloneObject;

  /**
   * This method is like `_.isArrayLike` except that it also checks if `value`
   * is an object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array-like object,
   *  else `false`.
   * @example
   *
   * _.isArrayLikeObject([1, 2, 3]);
   * // => true
   *
   * _.isArrayLikeObject(document.body.children);
   * // => true
   *
   * _.isArrayLikeObject('abc');
   * // => false
   *
   * _.isArrayLikeObject(_.noop);
   * // => false
   */
  function isArrayLikeObject(value) {
    return isObjectLike_1(value) && isArrayLike_1(value);
  }

  var isArrayLikeObject_1 = isArrayLikeObject;

  /** `Object#toString` result references. */
  var objectTag$2 = '[object Object]';

  /** Used for built-in method references. */
  var funcProto$2 = Function.prototype,
      objectProto$9 = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$2 = funcProto$2.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty$8 = objectProto$9.hasOwnProperty;

  /** Used to infer the `Object` constructor. */
  var objectCtorString = funcToString$2.call(Object);

  /**
   * Checks if `value` is a plain object, that is, an object created by the
   * `Object` constructor or one with a `[[Prototype]]` of `null`.
   *
   * @static
   * @memberOf _
   * @since 0.8.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a plain object, else `false`.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   * }
   *
   * _.isPlainObject(new Foo);
   * // => false
   *
   * _.isPlainObject([1, 2, 3]);
   * // => false
   *
   * _.isPlainObject({ 'x': 0, 'y': 0 });
   * // => true
   *
   * _.isPlainObject(Object.create(null));
   * // => true
   */
  function isPlainObject(value) {
    if (!isObjectLike_1(value) || _baseGetTag(value) != objectTag$2) {
      return false;
    }
    var proto = _getPrototype(value);
    if (proto === null) {
      return true;
    }
    var Ctor = hasOwnProperty$8.call(proto, 'constructor') && proto.constructor;
    return typeof Ctor == 'function' && Ctor instanceof Ctor &&
      funcToString$2.call(Ctor) == objectCtorString;
  }

  var isPlainObject_1 = isPlainObject;

  /**
   * Gets the value at `key`, unless `key` is "__proto__" or "constructor".
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function safeGet(object, key) {
    if (key === 'constructor' && typeof object[key] === 'function') {
      return;
    }

    if (key == '__proto__') {
      return;
    }

    return object[key];
  }

  var _safeGet = safeGet;

  /** Used for built-in method references. */
  var objectProto$a = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$9 = objectProto$a.hasOwnProperty;

  /**
   * Assigns `value` to `key` of `object` if the existing value is not equivalent
   * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * for equality comparisons.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function assignValue(object, key, value) {
    var objValue = object[key];
    if (!(hasOwnProperty$9.call(object, key) && eq_1(objValue, value)) ||
        (value === undefined && !(key in object))) {
      _baseAssignValue(object, key, value);
    }
  }

  var _assignValue = assignValue;

  /**
   * Copies properties of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy properties from.
   * @param {Array} props The property identifiers to copy.
   * @param {Object} [object={}] The object to copy properties to.
   * @param {Function} [customizer] The function to customize copied values.
   * @returns {Object} Returns `object`.
   */
  function copyObject(source, props, object, customizer) {
    var isNew = !object;
    object || (object = {});

    var index = -1,
        length = props.length;

    while (++index < length) {
      var key = props[index];

      var newValue = customizer
        ? customizer(object[key], source[key], key, object, source)
        : undefined;

      if (newValue === undefined) {
        newValue = source[key];
      }
      if (isNew) {
        _baseAssignValue(object, key, newValue);
      } else {
        _assignValue(object, key, newValue);
      }
    }
    return object;
  }

  var _copyObject = copyObject;

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */
  function baseTimes(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  var _baseTimes = baseTimes;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$1 = 9007199254740991;

  /** Used to detect unsigned integer values. */
  var reIsUint = /^(?:0|[1-9]\d*)$/;

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex(value, length) {
    var type = typeof value;
    length = length == null ? MAX_SAFE_INTEGER$1 : length;

    return !!length &&
      (type == 'number' ||
        (type != 'symbol' && reIsUint.test(value))) &&
          (value > -1 && value % 1 == 0 && value < length);
  }

  var _isIndex = isIndex;

  /** Used for built-in method references. */
  var objectProto$b = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$a = objectProto$b.hasOwnProperty;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys(value, inherited) {
    var isArr = isArray_1(value),
        isArg = !isArr && isArguments_1(value),
        isBuff = !isArr && !isArg && isBuffer_1(value),
        isType = !isArr && !isArg && !isBuff && isTypedArray_1(value),
        skipIndexes = isArr || isArg || isBuff || isType,
        result = skipIndexes ? _baseTimes(value.length, String) : [],
        length = result.length;

    for (var key in value) {
      if ((inherited || hasOwnProperty$a.call(value, key)) &&
          !(skipIndexes && (
             // Safari 9 has enumerable `arguments.length` in strict mode.
             key == 'length' ||
             // Node.js 0.10 has enumerable non-index properties on buffers.
             (isBuff && (key == 'offset' || key == 'parent')) ||
             // PhantomJS 2 has enumerable non-index properties on typed arrays.
             (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
             // Skip index properties.
             _isIndex(key, length)
          ))) {
        result.push(key);
      }
    }
    return result;
  }

  var _arrayLikeKeys = arrayLikeKeys;

  /**
   * This function is like
   * [`Object.keys`](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * except that it includes inherited enumerable properties.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function nativeKeysIn(object) {
    var result = [];
    if (object != null) {
      for (var key in Object(object)) {
        result.push(key);
      }
    }
    return result;
  }

  var _nativeKeysIn = nativeKeysIn;

  /** Used for built-in method references. */
  var objectProto$c = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$b = objectProto$c.hasOwnProperty;

  /**
   * The base implementation of `_.keysIn` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeysIn(object) {
    if (!isObject_1(object)) {
      return _nativeKeysIn(object);
    }
    var isProto = _isPrototype(object),
        result = [];

    for (var key in object) {
      if (!(key == 'constructor' && (isProto || !hasOwnProperty$b.call(object, key)))) {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeysIn = baseKeysIn;

  /**
   * Creates an array of the own and inherited enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keysIn(new Foo);
   * // => ['a', 'b', 'c'] (iteration order is not guaranteed)
   */
  function keysIn(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object, true) : _baseKeysIn(object);
  }

  var keysIn_1 = keysIn;

  /**
   * Converts `value` to a plain object flattening inherited enumerable string
   * keyed properties of `value` to own properties of the plain object.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {Object} Returns the converted plain object.
   * @example
   *
   * function Foo() {
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.assign({ 'a': 1 }, new Foo);
   * // => { 'a': 1, 'b': 2 }
   *
   * _.assign({ 'a': 1 }, _.toPlainObject(new Foo));
   * // => { 'a': 1, 'b': 2, 'c': 3 }
   */
  function toPlainObject(value) {
    return _copyObject(value, keysIn_1(value));
  }

  var toPlainObject_1 = toPlainObject;

  /**
   * A specialized version of `baseMerge` for arrays and objects which performs
   * deep merges and tracks traversed objects enabling objects with circular
   * references to be merged.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @param {string} key The key of the value to merge.
   * @param {number} srcIndex The index of `source`.
   * @param {Function} mergeFunc The function to merge values.
   * @param {Function} [customizer] The function to customize assigned values.
   * @param {Object} [stack] Tracks traversed source values and their merged
   *  counterparts.
   */
  function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
    var objValue = _safeGet(object, key),
        srcValue = _safeGet(source, key),
        stacked = stack.get(srcValue);

    if (stacked) {
      _assignMergeValue(object, key, stacked);
      return;
    }
    var newValue = customizer
      ? customizer(objValue, srcValue, (key + ''), object, source, stack)
      : undefined;

    var isCommon = newValue === undefined;

    if (isCommon) {
      var isArr = isArray_1(srcValue),
          isBuff = !isArr && isBuffer_1(srcValue),
          isTyped = !isArr && !isBuff && isTypedArray_1(srcValue);

      newValue = srcValue;
      if (isArr || isBuff || isTyped) {
        if (isArray_1(objValue)) {
          newValue = objValue;
        }
        else if (isArrayLikeObject_1(objValue)) {
          newValue = _copyArray(objValue);
        }
        else if (isBuff) {
          isCommon = false;
          newValue = _cloneBuffer(srcValue, true);
        }
        else if (isTyped) {
          isCommon = false;
          newValue = _cloneTypedArray(srcValue, true);
        }
        else {
          newValue = [];
        }
      }
      else if (isPlainObject_1(srcValue) || isArguments_1(srcValue)) {
        newValue = objValue;
        if (isArguments_1(objValue)) {
          newValue = toPlainObject_1(objValue);
        }
        else if (!isObject_1(objValue) || isFunction_1(objValue)) {
          newValue = _initCloneObject(srcValue);
        }
      }
      else {
        isCommon = false;
      }
    }
    if (isCommon) {
      // Recursively merge objects and arrays (susceptible to call stack limits).
      stack.set(srcValue, newValue);
      mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
      stack['delete'](srcValue);
    }
    _assignMergeValue(object, key, newValue);
  }

  var _baseMergeDeep = baseMergeDeep;

  /**
   * The base implementation of `_.merge` without support for multiple sources.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @param {number} srcIndex The index of `source`.
   * @param {Function} [customizer] The function to customize merged values.
   * @param {Object} [stack] Tracks traversed source values and their merged
   *  counterparts.
   */
  function baseMerge(object, source, srcIndex, customizer, stack) {
    if (object === source) {
      return;
    }
    _baseFor(source, function(srcValue, key) {
      stack || (stack = new _Stack);
      if (isObject_1(srcValue)) {
        _baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
      }
      else {
        var newValue = customizer
          ? customizer(_safeGet(object, key), srcValue, (key + ''), object, source, stack)
          : undefined;

        if (newValue === undefined) {
          newValue = srcValue;
        }
        _assignMergeValue(object, key, newValue);
      }
    }, keysIn_1);
  }

  var _baseMerge = baseMerge;

  /**
   * This method returns the first argument it receives.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {*} value Any value.
   * @returns {*} Returns `value`.
   * @example
   *
   * var object = { 'a': 1 };
   *
   * console.log(_.identity(object) === object);
   * // => true
   */
  function identity(value) {
    return value;
  }

  var identity_1 = identity;

  /**
   * A faster alternative to `Function#apply`, this function invokes `func`
   * with the `this` binding of `thisArg` and the arguments of `args`.
   *
   * @private
   * @param {Function} func The function to invoke.
   * @param {*} thisArg The `this` binding of `func`.
   * @param {Array} args The arguments to invoke `func` with.
   * @returns {*} Returns the result of `func`.
   */
  function apply(func, thisArg, args) {
    switch (args.length) {
      case 0: return func.call(thisArg);
      case 1: return func.call(thisArg, args[0]);
      case 2: return func.call(thisArg, args[0], args[1]);
      case 3: return func.call(thisArg, args[0], args[1], args[2]);
    }
    return func.apply(thisArg, args);
  }

  var _apply = apply;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeMax = Math.max;

  /**
   * A specialized version of `baseRest` which transforms the rest array.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @param {Function} transform The rest array transform.
   * @returns {Function} Returns the new function.
   */
  function overRest(func, start, transform) {
    start = nativeMax(start === undefined ? (func.length - 1) : start, 0);
    return function() {
      var args = arguments,
          index = -1,
          length = nativeMax(args.length - start, 0),
          array = Array(length);

      while (++index < length) {
        array[index] = args[start + index];
      }
      index = -1;
      var otherArgs = Array(start + 1);
      while (++index < start) {
        otherArgs[index] = args[index];
      }
      otherArgs[start] = transform(array);
      return _apply(func, this, otherArgs);
    };
  }

  var _overRest = overRest;

  /**
   * Creates a function that returns `value`.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {*} value The value to return from the new function.
   * @returns {Function} Returns the new constant function.
   * @example
   *
   * var objects = _.times(2, _.constant({ 'a': 1 }));
   *
   * console.log(objects);
   * // => [{ 'a': 1 }, { 'a': 1 }]
   *
   * console.log(objects[0] === objects[1]);
   * // => true
   */
  function constant(value) {
    return function() {
      return value;
    };
  }

  var constant_1 = constant;

  /**
   * The base implementation of `setToString` without support for hot loop shorting.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var baseSetToString = !_defineProperty$1 ? identity_1 : function(func, string) {
    return _defineProperty$1(func, 'toString', {
      'configurable': true,
      'enumerable': false,
      'value': constant_1(string),
      'writable': true
    });
  };

  var _baseSetToString = baseSetToString;

  /** Used to detect hot functions by number of calls within a span of milliseconds. */
  var HOT_COUNT = 800,
      HOT_SPAN = 16;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeNow = Date.now;

  /**
   * Creates a function that'll short out and invoke `identity` instead
   * of `func` when it's called `HOT_COUNT` or more times in `HOT_SPAN`
   * milliseconds.
   *
   * @private
   * @param {Function} func The function to restrict.
   * @returns {Function} Returns the new shortable function.
   */
  function shortOut(func) {
    var count = 0,
        lastCalled = 0;

    return function() {
      var stamp = nativeNow(),
          remaining = HOT_SPAN - (stamp - lastCalled);

      lastCalled = stamp;
      if (remaining > 0) {
        if (++count >= HOT_COUNT) {
          return arguments[0];
        }
      } else {
        count = 0;
      }
      return func.apply(undefined, arguments);
    };
  }

  var _shortOut = shortOut;

  /**
   * Sets the `toString` method of `func` to return `string`.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var setToString = _shortOut(_baseSetToString);

  var _setToString = setToString;

  /**
   * The base implementation of `_.rest` which doesn't validate or coerce arguments.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @returns {Function} Returns the new function.
   */
  function baseRest(func, start) {
    return _setToString(_overRest(func, start, identity_1), func + '');
  }

  var _baseRest = baseRest;

  /**
   * Checks if the given arguments are from an iteratee call.
   *
   * @private
   * @param {*} value The potential iteratee value argument.
   * @param {*} index The potential iteratee index or key argument.
   * @param {*} object The potential iteratee object argument.
   * @returns {boolean} Returns `true` if the arguments are from an iteratee call,
   *  else `false`.
   */
  function isIterateeCall(value, index, object) {
    if (!isObject_1(object)) {
      return false;
    }
    var type = typeof index;
    if (type == 'number'
          ? (isArrayLike_1(object) && _isIndex(index, object.length))
          : (type == 'string' && index in object)
        ) {
      return eq_1(object[index], value);
    }
    return false;
  }

  var _isIterateeCall = isIterateeCall;

  /**
   * Creates a function like `_.assign`.
   *
   * @private
   * @param {Function} assigner The function to assign values.
   * @returns {Function} Returns the new assigner function.
   */
  function createAssigner(assigner) {
    return _baseRest(function(object, sources) {
      var index = -1,
          length = sources.length,
          customizer = length > 1 ? sources[length - 1] : undefined,
          guard = length > 2 ? sources[2] : undefined;

      customizer = (assigner.length > 3 && typeof customizer == 'function')
        ? (length--, customizer)
        : undefined;

      if (guard && _isIterateeCall(sources[0], sources[1], guard)) {
        customizer = length < 3 ? undefined : customizer;
        length = 1;
      }
      object = Object(object);
      while (++index < length) {
        var source = sources[index];
        if (source) {
          assigner(object, source, index, customizer);
        }
      }
      return object;
    });
  }

  var _createAssigner = createAssigner;

  /**
   * This method is like `_.assign` except that it recursively merges own and
   * inherited enumerable string keyed properties of source objects into the
   * destination object. Source properties that resolve to `undefined` are
   * skipped if a destination value exists. Array and plain object properties
   * are merged recursively. Other objects and value types are overridden by
   * assignment. Source objects are applied from left to right. Subsequent
   * sources overwrite property assignments of previous sources.
   *
   * **Note:** This method mutates `object`.
   *
   * @static
   * @memberOf _
   * @since 0.5.0
   * @category Object
   * @param {Object} object The destination object.
   * @param {...Object} [sources] The source objects.
   * @returns {Object} Returns `object`.
   * @example
   *
   * var object = {
   *   'a': [{ 'b': 2 }, { 'd': 4 }]
   * };
   *
   * var other = {
   *   'a': [{ 'c': 3 }, { 'e': 5 }]
   * };
   *
   * _.merge(object, other);
   * // => { 'a': [{ 'b': 2, 'c': 3 }, { 'd': 4, 'e': 5 }] }
   */
  var merge = _createAssigner(function(object, source, srcIndex) {
    _baseMerge(object, source, srcIndex);
  });

  var merge_1 = merge;

  /** `Object#toString` result references. */
  var symbolTag = '[object Symbol]';

  /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
  function isSymbol(value) {
    return typeof value == 'symbol' ||
      (isObjectLike_1(value) && _baseGetTag(value) == symbolTag);
  }

  var isSymbol_1 = isSymbol;

  /** Used to match property names within property paths. */
  var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
      reIsPlainProp = /^\w*$/;

  /**
   * Checks if `value` is a property name and not a property path.
   *
   * @private
   * @param {*} value The value to check.
   * @param {Object} [object] The object to query keys on.
   * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
   */
  function isKey(value, object) {
    if (isArray_1(value)) {
      return false;
    }
    var type = typeof value;
    if (type == 'number' || type == 'symbol' || type == 'boolean' ||
        value == null || isSymbol_1(value)) {
      return true;
    }
    return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
      (object != null && value in Object(object));
  }

  var _isKey = isKey;

  /** Error message constants. */
  var FUNC_ERROR_TEXT = 'Expected a function';

  /**
   * Creates a function that memoizes the result of `func`. If `resolver` is
   * provided, it determines the cache key for storing the result based on the
   * arguments provided to the memoized function. By default, the first argument
   * provided to the memoized function is used as the map cache key. The `func`
   * is invoked with the `this` binding of the memoized function.
   *
   * **Note:** The cache is exposed as the `cache` property on the memoized
   * function. Its creation may be customized by replacing the `_.memoize.Cache`
   * constructor with one whose instances implement the
   * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
   * method interface of `clear`, `delete`, `get`, `has`, and `set`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Function
   * @param {Function} func The function to have its output memoized.
   * @param {Function} [resolver] The function to resolve the cache key.
   * @returns {Function} Returns the new memoized function.
   * @example
   *
   * var object = { 'a': 1, 'b': 2 };
   * var other = { 'c': 3, 'd': 4 };
   *
   * var values = _.memoize(_.values);
   * values(object);
   * // => [1, 2]
   *
   * values(other);
   * // => [3, 4]
   *
   * object.a = 2;
   * values(object);
   * // => [1, 2]
   *
   * // Modify the result cache.
   * values.cache.set(object, ['a', 'b']);
   * values(object);
   * // => ['a', 'b']
   *
   * // Replace `_.memoize.Cache`.
   * _.memoize.Cache = WeakMap;
   */
  function memoize(func, resolver) {
    if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    var memoized = function() {
      var args = arguments,
          key = resolver ? resolver.apply(this, args) : args[0],
          cache = memoized.cache;

      if (cache.has(key)) {
        return cache.get(key);
      }
      var result = func.apply(this, args);
      memoized.cache = cache.set(key, result) || cache;
      return result;
    };
    memoized.cache = new (memoize.Cache || _MapCache);
    return memoized;
  }

  // Expose `MapCache`.
  memoize.Cache = _MapCache;

  var memoize_1 = memoize;

  /** Used as the maximum memoize cache size. */
  var MAX_MEMOIZE_SIZE = 500;

  /**
   * A specialized version of `_.memoize` which clears the memoized function's
   * cache when it exceeds `MAX_MEMOIZE_SIZE`.
   *
   * @private
   * @param {Function} func The function to have its output memoized.
   * @returns {Function} Returns the new memoized function.
   */
  function memoizeCapped(func) {
    var result = memoize_1(func, function(key) {
      if (cache.size === MAX_MEMOIZE_SIZE) {
        cache.clear();
      }
      return key;
    });

    var cache = result.cache;
    return result;
  }

  var _memoizeCapped = memoizeCapped;

  /** Used to match property names within property paths. */
  var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

  /** Used to match backslashes in property paths. */
  var reEscapeChar = /\\(\\)?/g;

  /**
   * Converts `string` to a property path array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the property path array.
   */
  var stringToPath = _memoizeCapped(function(string) {
    var result = [];
    if (string.charCodeAt(0) === 46 /* . */) {
      result.push('');
    }
    string.replace(rePropName, function(match, number, quote, subString) {
      result.push(quote ? subString.replace(reEscapeChar, '$1') : (number || match));
    });
    return result;
  });

  var _stringToPath = stringToPath;

  /**
   * A specialized version of `_.map` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   */
  function arrayMap(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length,
        result = Array(length);

    while (++index < length) {
      result[index] = iteratee(array[index], index, array);
    }
    return result;
  }

  var _arrayMap = arrayMap;

  /** Used as references for various `Number` constants. */
  var INFINITY = 1 / 0;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto = _Symbol ? _Symbol.prototype : undefined,
      symbolToString = symbolProto ? symbolProto.toString : undefined;

  /**
   * The base implementation of `_.toString` which doesn't convert nullish
   * values to empty strings.
   *
   * @private
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   */
  function baseToString(value) {
    // Exit early for strings to avoid a performance hit in some environments.
    if (typeof value == 'string') {
      return value;
    }
    if (isArray_1(value)) {
      // Recursively convert values (susceptible to call stack limits).
      return _arrayMap(value, baseToString) + '';
    }
    if (isSymbol_1(value)) {
      return symbolToString ? symbolToString.call(value) : '';
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
  }

  var _baseToString = baseToString;

  /**
   * Converts `value` to a string. An empty string is returned for `null`
   * and `undefined` values. The sign of `-0` is preserved.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   * @example
   *
   * _.toString(null);
   * // => ''
   *
   * _.toString(-0);
   * // => '-0'
   *
   * _.toString([1, 2, 3]);
   * // => '1,2,3'
   */
  function toString(value) {
    return value == null ? '' : _baseToString(value);
  }

  var toString_1 = toString;

  /**
   * Casts `value` to a path array if it's not one.
   *
   * @private
   * @param {*} value The value to inspect.
   * @param {Object} [object] The object to query keys on.
   * @returns {Array} Returns the cast property path array.
   */
  function castPath(value, object) {
    if (isArray_1(value)) {
      return value;
    }
    return _isKey(value, object) ? [value] : _stringToPath(toString_1(value));
  }

  var _castPath = castPath;

  /** Used as references for various `Number` constants. */
  var INFINITY$1 = 1 / 0;

  /**
   * Converts `value` to a string key if it's not a string or symbol.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {string|symbol} Returns the key.
   */
  function toKey(value) {
    if (typeof value == 'string' || isSymbol_1(value)) {
      return value;
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY$1) ? '-0' : result;
  }

  var _toKey = toKey;

  /**
   * The base implementation of `_.get` without support for default values.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @returns {*} Returns the resolved value.
   */
  function baseGet(object, path) {
    path = _castPath(path, object);

    var index = 0,
        length = path.length;

    while (object != null && index < length) {
      object = object[_toKey(path[index++])];
    }
    return (index && index == length) ? object : undefined;
  }

  var _baseGet = baseGet;

  /**
   * Gets the value at `path` of `object`. If the resolved value is
   * `undefined`, the `defaultValue` is returned in its place.
   *
   * @static
   * @memberOf _
   * @since 3.7.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @param {*} [defaultValue] The value returned for `undefined` resolved values.
   * @returns {*} Returns the resolved value.
   * @example
   *
   * var object = { 'a': [{ 'b': { 'c': 3 } }] };
   *
   * _.get(object, 'a[0].b.c');
   * // => 3
   *
   * _.get(object, ['a', '0', 'b', 'c']);
   * // => 3
   *
   * _.get(object, 'a.b.c', 'default');
   * // => 'default'
   */
  function get$1(object, path, defaultValue) {
    var result = object == null ? undefined : _baseGet(object, path);
    return result === undefined ? defaultValue : result;
  }

  var get_1 = get$1;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$2 = '__lodash_hash_undefined__';

  /**
   * Adds `value` to the array cache.
   *
   * @private
   * @name add
   * @memberOf SetCache
   * @alias push
   * @param {*} value The value to cache.
   * @returns {Object} Returns the cache instance.
   */
  function setCacheAdd(value) {
    this.__data__.set(value, HASH_UNDEFINED$2);
    return this;
  }

  var _setCacheAdd = setCacheAdd;

  /**
   * Checks if `value` is in the array cache.
   *
   * @private
   * @name has
   * @memberOf SetCache
   * @param {*} value The value to search for.
   * @returns {number} Returns `true` if `value` is found, else `false`.
   */
  function setCacheHas(value) {
    return this.__data__.has(value);
  }

  var _setCacheHas = setCacheHas;

  /**
   *
   * Creates an array cache object to store unique values.
   *
   * @private
   * @constructor
   * @param {Array} [values] The values to cache.
   */
  function SetCache(values) {
    var index = -1,
        length = values == null ? 0 : values.length;

    this.__data__ = new _MapCache;
    while (++index < length) {
      this.add(values[index]);
    }
  }

  // Add methods to `SetCache`.
  SetCache.prototype.add = SetCache.prototype.push = _setCacheAdd;
  SetCache.prototype.has = _setCacheHas;

  var _SetCache = SetCache;

  /**
   * A specialized version of `_.some` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {boolean} Returns `true` if any element passes the predicate check,
   *  else `false`.
   */
  function arraySome(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (predicate(array[index], index, array)) {
        return true;
      }
    }
    return false;
  }

  var _arraySome = arraySome;

  /**
   * Checks if a `cache` value for `key` exists.
   *
   * @private
   * @param {Object} cache The cache to query.
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function cacheHas(cache, key) {
    return cache.has(key);
  }

  var _cacheHas = cacheHas;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG = 1,
      COMPARE_UNORDERED_FLAG = 2;

  /**
   * A specialized version of `baseIsEqualDeep` for arrays with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Array} array The array to compare.
   * @param {Array} other The other array to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `array` and `other` objects.
   * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
   */
  function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG,
        arrLength = array.length,
        othLength = other.length;

    if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
      return false;
    }
    // Check that cyclic values are equal.
    var arrStacked = stack.get(array);
    var othStacked = stack.get(other);
    if (arrStacked && othStacked) {
      return arrStacked == other && othStacked == array;
    }
    var index = -1,
        result = true,
        seen = (bitmask & COMPARE_UNORDERED_FLAG) ? new _SetCache : undefined;

    stack.set(array, other);
    stack.set(other, array);

    // Ignore non-index properties.
    while (++index < arrLength) {
      var arrValue = array[index],
          othValue = other[index];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, arrValue, index, other, array, stack)
          : customizer(arrValue, othValue, index, array, other, stack);
      }
      if (compared !== undefined) {
        if (compared) {
          continue;
        }
        result = false;
        break;
      }
      // Recursively compare arrays (susceptible to call stack limits).
      if (seen) {
        if (!_arraySome(other, function(othValue, othIndex) {
              if (!_cacheHas(seen, othIndex) &&
                  (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
                return seen.push(othIndex);
              }
            })) {
          result = false;
          break;
        }
      } else if (!(
            arrValue === othValue ||
              equalFunc(arrValue, othValue, bitmask, customizer, stack)
          )) {
        result = false;
        break;
      }
    }
    stack['delete'](array);
    stack['delete'](other);
    return result;
  }

  var _equalArrays = equalArrays;

  /**
   * Converts `map` to its key-value pairs.
   *
   * @private
   * @param {Object} map The map to convert.
   * @returns {Array} Returns the key-value pairs.
   */
  function mapToArray(map) {
    var index = -1,
        result = Array(map.size);

    map.forEach(function(value, key) {
      result[++index] = [key, value];
    });
    return result;
  }

  var _mapToArray = mapToArray;

  /**
   * Converts `set` to an array of its values.
   *
   * @private
   * @param {Object} set The set to convert.
   * @returns {Array} Returns the values.
   */
  function setToArray(set) {
    var index = -1,
        result = Array(set.size);

    set.forEach(function(value) {
      result[++index] = value;
    });
    return result;
  }

  var _setToArray = setToArray;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$1 = 1,
      COMPARE_UNORDERED_FLAG$1 = 2;

  /** `Object#toString` result references. */
  var boolTag$1 = '[object Boolean]',
      dateTag$1 = '[object Date]',
      errorTag$1 = '[object Error]',
      mapTag$3 = '[object Map]',
      numberTag$2 = '[object Number]',
      regexpTag$1 = '[object RegExp]',
      setTag$3 = '[object Set]',
      stringTag$1 = '[object String]',
      symbolTag$1 = '[object Symbol]';

  var arrayBufferTag$1 = '[object ArrayBuffer]',
      dataViewTag$2 = '[object DataView]';

  /** Used to convert symbols to primitives and strings. */
  var symbolProto$1 = _Symbol ? _Symbol.prototype : undefined,
      symbolValueOf = symbolProto$1 ? symbolProto$1.valueOf : undefined;

  /**
   * A specialized version of `baseIsEqualDeep` for comparing objects of
   * the same `toStringTag`.
   *
   * **Note:** This function only supports comparing values with tags of
   * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {string} tag The `toStringTag` of the objects to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
    switch (tag) {
      case dataViewTag$2:
        if ((object.byteLength != other.byteLength) ||
            (object.byteOffset != other.byteOffset)) {
          return false;
        }
        object = object.buffer;
        other = other.buffer;

      case arrayBufferTag$1:
        if ((object.byteLength != other.byteLength) ||
            !equalFunc(new _Uint8Array(object), new _Uint8Array(other))) {
          return false;
        }
        return true;

      case boolTag$1:
      case dateTag$1:
      case numberTag$2:
        // Coerce booleans to `1` or `0` and dates to milliseconds.
        // Invalid dates are coerced to `NaN`.
        return eq_1(+object, +other);

      case errorTag$1:
        return object.name == other.name && object.message == other.message;

      case regexpTag$1:
      case stringTag$1:
        // Coerce regexes to strings and treat strings, primitives and objects,
        // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
        // for more details.
        return object == (other + '');

      case mapTag$3:
        var convert = _mapToArray;

      case setTag$3:
        var isPartial = bitmask & COMPARE_PARTIAL_FLAG$1;
        convert || (convert = _setToArray);

        if (object.size != other.size && !isPartial) {
          return false;
        }
        // Assume cyclic values are equal.
        var stacked = stack.get(object);
        if (stacked) {
          return stacked == other;
        }
        bitmask |= COMPARE_UNORDERED_FLAG$1;

        // Recursively compare objects (susceptible to call stack limits).
        stack.set(object, other);
        var result = _equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
        stack['delete'](object);
        return result;

      case symbolTag$1:
        if (symbolValueOf) {
          return symbolValueOf.call(object) == symbolValueOf.call(other);
        }
    }
    return false;
  }

  var _equalByTag = equalByTag;

  /**
   * Appends the elements of `values` to `array`.
   *
   * @private
   * @param {Array} array The array to modify.
   * @param {Array} values The values to append.
   * @returns {Array} Returns `array`.
   */
  function arrayPush(array, values) {
    var index = -1,
        length = values.length,
        offset = array.length;

    while (++index < length) {
      array[offset + index] = values[index];
    }
    return array;
  }

  var _arrayPush = arrayPush;

  /**
   * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
   * `keysFunc` and `symbolsFunc` to get the enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @param {Function} symbolsFunc The function to get the symbols of `object`.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function baseGetAllKeys(object, keysFunc, symbolsFunc) {
    var result = keysFunc(object);
    return isArray_1(object) ? result : _arrayPush(result, symbolsFunc(object));
  }

  var _baseGetAllKeys = baseGetAllKeys;

  /**
   * A specialized version of `_.filter` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   */
  function arrayFilter(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length,
        resIndex = 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (predicate(value, index, array)) {
        result[resIndex++] = value;
      }
    }
    return result;
  }

  var _arrayFilter = arrayFilter;

  /**
   * This method returns a new empty array.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {Array} Returns the new empty array.
   * @example
   *
   * var arrays = _.times(2, _.stubArray);
   *
   * console.log(arrays);
   * // => [[], []]
   *
   * console.log(arrays[0] === arrays[1]);
   * // => false
   */
  function stubArray() {
    return [];
  }

  var stubArray_1 = stubArray;

  /** Used for built-in method references. */
  var objectProto$d = Object.prototype;

  /** Built-in value references. */
  var propertyIsEnumerable$1 = objectProto$d.propertyIsEnumerable;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbols = !nativeGetSymbols ? stubArray_1 : function(object) {
    if (object == null) {
      return [];
    }
    object = Object(object);
    return _arrayFilter(nativeGetSymbols(object), function(symbol) {
      return propertyIsEnumerable$1.call(object, symbol);
    });
  };

  var _getSymbols = getSymbols;

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys(object) {
    return isArrayLike_1(object) ? _arrayLikeKeys(object) : _baseKeys(object);
  }

  var keys_1 = keys;

  /**
   * Creates an array of own enumerable property names and symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeys(object) {
    return _baseGetAllKeys(object, keys_1, _getSymbols);
  }

  var _getAllKeys = getAllKeys;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$2 = 1;

  /** Used for built-in method references. */
  var objectProto$e = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$c = objectProto$e.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqualDeep` for objects with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG$2,
        objProps = _getAllKeys(object),
        objLength = objProps.length,
        othProps = _getAllKeys(other),
        othLength = othProps.length;

    if (objLength != othLength && !isPartial) {
      return false;
    }
    var index = objLength;
    while (index--) {
      var key = objProps[index];
      if (!(isPartial ? key in other : hasOwnProperty$c.call(other, key))) {
        return false;
      }
    }
    // Check that cyclic values are equal.
    var objStacked = stack.get(object);
    var othStacked = stack.get(other);
    if (objStacked && othStacked) {
      return objStacked == other && othStacked == object;
    }
    var result = true;
    stack.set(object, other);
    stack.set(other, object);

    var skipCtor = isPartial;
    while (++index < objLength) {
      key = objProps[index];
      var objValue = object[key],
          othValue = other[key];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, objValue, key, other, object, stack)
          : customizer(objValue, othValue, key, object, other, stack);
      }
      // Recursively compare objects (susceptible to call stack limits).
      if (!(compared === undefined
            ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
            : compared
          )) {
        result = false;
        break;
      }
      skipCtor || (skipCtor = key == 'constructor');
    }
    if (result && !skipCtor) {
      var objCtor = object.constructor,
          othCtor = other.constructor;

      // Non `Object` object instances with different constructors are not equal.
      if (objCtor != othCtor &&
          ('constructor' in object && 'constructor' in other) &&
          !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
            typeof othCtor == 'function' && othCtor instanceof othCtor)) {
        result = false;
      }
    }
    stack['delete'](object);
    stack['delete'](other);
    return result;
  }

  var _equalObjects = equalObjects;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$3 = 1;

  /** `Object#toString` result references. */
  var argsTag$2 = '[object Arguments]',
      arrayTag$1 = '[object Array]',
      objectTag$3 = '[object Object]';

  /** Used for built-in method references. */
  var objectProto$f = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$d = objectProto$f.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqual` for arrays and objects which performs
   * deep comparisons and tracks traversed objects enabling objects with circular
   * references to be compared.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} [stack] Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
    var objIsArr = isArray_1(object),
        othIsArr = isArray_1(other),
        objTag = objIsArr ? arrayTag$1 : _getTag(object),
        othTag = othIsArr ? arrayTag$1 : _getTag(other);

    objTag = objTag == argsTag$2 ? objectTag$3 : objTag;
    othTag = othTag == argsTag$2 ? objectTag$3 : othTag;

    var objIsObj = objTag == objectTag$3,
        othIsObj = othTag == objectTag$3,
        isSameTag = objTag == othTag;

    if (isSameTag && isBuffer_1(object)) {
      if (!isBuffer_1(other)) {
        return false;
      }
      objIsArr = true;
      objIsObj = false;
    }
    if (isSameTag && !objIsObj) {
      stack || (stack = new _Stack);
      return (objIsArr || isTypedArray_1(object))
        ? _equalArrays(object, other, bitmask, customizer, equalFunc, stack)
        : _equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
    }
    if (!(bitmask & COMPARE_PARTIAL_FLAG$3)) {
      var objIsWrapped = objIsObj && hasOwnProperty$d.call(object, '__wrapped__'),
          othIsWrapped = othIsObj && hasOwnProperty$d.call(other, '__wrapped__');

      if (objIsWrapped || othIsWrapped) {
        var objUnwrapped = objIsWrapped ? object.value() : object,
            othUnwrapped = othIsWrapped ? other.value() : other;

        stack || (stack = new _Stack);
        return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
      }
    }
    if (!isSameTag) {
      return false;
    }
    stack || (stack = new _Stack);
    return _equalObjects(object, other, bitmask, customizer, equalFunc, stack);
  }

  var _baseIsEqualDeep = baseIsEqualDeep;

  /**
   * The base implementation of `_.isEqual` which supports partial comparisons
   * and tracks traversed objects.
   *
   * @private
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @param {boolean} bitmask The bitmask flags.
   *  1 - Unordered comparison
   *  2 - Partial comparison
   * @param {Function} [customizer] The function to customize comparisons.
   * @param {Object} [stack] Tracks traversed `value` and `other` objects.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   */
  function baseIsEqual(value, other, bitmask, customizer, stack) {
    if (value === other) {
      return true;
    }
    if (value == null || other == null || (!isObjectLike_1(value) && !isObjectLike_1(other))) {
      return value !== value && other !== other;
    }
    return _baseIsEqualDeep(value, other, bitmask, customizer, baseIsEqual, stack);
  }

  var _baseIsEqual = baseIsEqual;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$4 = 1,
      COMPARE_UNORDERED_FLAG$2 = 2;

  /**
   * The base implementation of `_.isMatch` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to inspect.
   * @param {Object} source The object of property values to match.
   * @param {Array} matchData The property names, values, and compare flags to match.
   * @param {Function} [customizer] The function to customize comparisons.
   * @returns {boolean} Returns `true` if `object` is a match, else `false`.
   */
  function baseIsMatch(object, source, matchData, customizer) {
    var index = matchData.length,
        length = index,
        noCustomizer = !customizer;

    if (object == null) {
      return !length;
    }
    object = Object(object);
    while (index--) {
      var data = matchData[index];
      if ((noCustomizer && data[2])
            ? data[1] !== object[data[0]]
            : !(data[0] in object)
          ) {
        return false;
      }
    }
    while (++index < length) {
      data = matchData[index];
      var key = data[0],
          objValue = object[key],
          srcValue = data[1];

      if (noCustomizer && data[2]) {
        if (objValue === undefined && !(key in object)) {
          return false;
        }
      } else {
        var stack = new _Stack;
        if (customizer) {
          var result = customizer(objValue, srcValue, key, object, source, stack);
        }
        if (!(result === undefined
              ? _baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG$4 | COMPARE_UNORDERED_FLAG$2, customizer, stack)
              : result
            )) {
          return false;
        }
      }
    }
    return true;
  }

  var _baseIsMatch = baseIsMatch;

  /**
   * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` if suitable for strict
   *  equality comparisons, else `false`.
   */
  function isStrictComparable(value) {
    return value === value && !isObject_1(value);
  }

  var _isStrictComparable = isStrictComparable;

  /**
   * Gets the property names, values, and compare flags of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the match data of `object`.
   */
  function getMatchData(object) {
    var result = keys_1(object),
        length = result.length;

    while (length--) {
      var key = result[length],
          value = object[key];

      result[length] = [key, value, _isStrictComparable(value)];
    }
    return result;
  }

  var _getMatchData = getMatchData;

  /**
   * A specialized version of `matchesProperty` for source values suitable
   * for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function matchesStrictComparable(key, srcValue) {
    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === srcValue &&
        (srcValue !== undefined || (key in Object(object)));
    };
  }

  var _matchesStrictComparable = matchesStrictComparable;

  /**
   * The base implementation of `_.matches` which doesn't clone `source`.
   *
   * @private
   * @param {Object} source The object of property values to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatches(source) {
    var matchData = _getMatchData(source);
    if (matchData.length == 1 && matchData[0][2]) {
      return _matchesStrictComparable(matchData[0][0], matchData[0][1]);
    }
    return function(object) {
      return object === source || _baseIsMatch(object, source, matchData);
    };
  }

  var _baseMatches = baseMatches;

  /**
   * The base implementation of `_.hasIn` without support for deep paths.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {Array|string} key The key to check.
   * @returns {boolean} Returns `true` if `key` exists, else `false`.
   */
  function baseHasIn(object, key) {
    return object != null && key in Object(object);
  }

  var _baseHasIn = baseHasIn;

  /**
   * Checks if `path` exists on `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @param {Function} hasFunc The function to check properties.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   */
  function hasPath(object, path, hasFunc) {
    path = _castPath(path, object);

    var index = -1,
        length = path.length,
        result = false;

    while (++index < length) {
      var key = _toKey(path[index]);
      if (!(result = object != null && hasFunc(object, key))) {
        break;
      }
      object = object[key];
    }
    if (result || ++index != length) {
      return result;
    }
    length = object == null ? 0 : object.length;
    return !!length && isLength_1(length) && _isIndex(key, length) &&
      (isArray_1(object) || isArguments_1(object));
  }

  var _hasPath = hasPath;

  /**
   * Checks if `path` is a direct or inherited property of `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   * @example
   *
   * var object = _.create({ 'a': _.create({ 'b': 2 }) });
   *
   * _.hasIn(object, 'a');
   * // => true
   *
   * _.hasIn(object, 'a.b');
   * // => true
   *
   * _.hasIn(object, ['a', 'b']);
   * // => true
   *
   * _.hasIn(object, 'b');
   * // => false
   */
  function hasIn(object, path) {
    return object != null && _hasPath(object, path, _baseHasIn);
  }

  var hasIn_1 = hasIn;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$5 = 1,
      COMPARE_UNORDERED_FLAG$3 = 2;

  /**
   * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
   *
   * @private
   * @param {string} path The path of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatchesProperty(path, srcValue) {
    if (_isKey(path) && _isStrictComparable(srcValue)) {
      return _matchesStrictComparable(_toKey(path), srcValue);
    }
    return function(object) {
      var objValue = get_1(object, path);
      return (objValue === undefined && objValue === srcValue)
        ? hasIn_1(object, path)
        : _baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG$5 | COMPARE_UNORDERED_FLAG$3);
    };
  }

  var _baseMatchesProperty = baseMatchesProperty;

  /**
   * The base implementation of `_.property` without support for deep paths.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function baseProperty(key) {
    return function(object) {
      return object == null ? undefined : object[key];
    };
  }

  var _baseProperty = baseProperty;

  /**
   * A specialized version of `baseProperty` which supports deep paths.
   *
   * @private
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function basePropertyDeep(path) {
    return function(object) {
      return _baseGet(object, path);
    };
  }

  var _basePropertyDeep = basePropertyDeep;

  /**
   * Creates a function that returns the value at `path` of a given object.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   * @example
   *
   * var objects = [
   *   { 'a': { 'b': 2 } },
   *   { 'a': { 'b': 1 } }
   * ];
   *
   * _.map(objects, _.property('a.b'));
   * // => [2, 1]
   *
   * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
   * // => [1, 2]
   */
  function property$1(path) {
    return _isKey(path) ? _baseProperty(_toKey(path)) : _basePropertyDeep(path);
  }

  var property_1 = property$1;

  /**
   * The base implementation of `_.iteratee`.
   *
   * @private
   * @param {*} [value=_.identity] The value to convert to an iteratee.
   * @returns {Function} Returns the iteratee.
   */
  function baseIteratee(value) {
    // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
    // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
    if (typeof value == 'function') {
      return value;
    }
    if (value == null) {
      return identity_1;
    }
    if (typeof value == 'object') {
      return isArray_1(value)
        ? _baseMatchesProperty(value[0], value[1])
        : _baseMatches(value);
    }
    return property_1(value);
  }

  var _baseIteratee = baseIteratee;

  /**
   * Creates a `_.find` or `_.findLast` function.
   *
   * @private
   * @param {Function} findIndexFunc The function to find the collection index.
   * @returns {Function} Returns the new find function.
   */
  function createFind(findIndexFunc) {
    return function(collection, predicate, fromIndex) {
      var iterable = Object(collection);
      if (!isArrayLike_1(collection)) {
        var iteratee = _baseIteratee(predicate);
        collection = keys_1(collection);
        predicate = function(key) { return iteratee(iterable[key], key, iterable); };
      }
      var index = findIndexFunc(collection, predicate, fromIndex);
      return index > -1 ? iterable[iteratee ? collection[index] : index] : undefined;
    };
  }

  var _createFind = createFind;

  /**
   * The base implementation of `_.findIndex` and `_.findLastIndex` without
   * support for iteratee shorthands.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {Function} predicate The function invoked per iteration.
   * @param {number} fromIndex The index to search from.
   * @param {boolean} [fromRight] Specify iterating from right to left.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function baseFindIndex(array, predicate, fromIndex, fromRight) {
    var length = array.length,
        index = fromIndex + (fromRight ? 1 : -1);

    while ((fromRight ? index-- : ++index < length)) {
      if (predicate(array[index], index, array)) {
        return index;
      }
    }
    return -1;
  }

  var _baseFindIndex = baseFindIndex;

  /** Used to match a single whitespace character. */
  var reWhitespace = /\s/;

  /**
   * Used by `_.trim` and `_.trimEnd` to get the index of the last non-whitespace
   * character of `string`.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {number} Returns the index of the last non-whitespace character.
   */
  function trimmedEndIndex(string) {
    var index = string.length;

    while (index-- && reWhitespace.test(string.charAt(index))) {}
    return index;
  }

  var _trimmedEndIndex = trimmedEndIndex;

  /** Used to match leading whitespace. */
  var reTrimStart = /^\s+/;

  /**
   * The base implementation of `_.trim`.
   *
   * @private
   * @param {string} string The string to trim.
   * @returns {string} Returns the trimmed string.
   */
  function baseTrim(string) {
    return string
      ? string.slice(0, _trimmedEndIndex(string) + 1).replace(reTrimStart, '')
      : string;
  }

  var _baseTrim = baseTrim;

  /** Used as references for various `Number` constants. */
  var NAN = 0 / 0;

  /** Used to detect bad signed hexadecimal string values. */
  var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;

  /** Used to detect binary string values. */
  var reIsBinary = /^0b[01]+$/i;

  /** Used to detect octal string values. */
  var reIsOctal = /^0o[0-7]+$/i;

  /** Built-in method references without a dependency on `root`. */
  var freeParseInt = parseInt;

  /**
   * Converts `value` to a number.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to process.
   * @returns {number} Returns the number.
   * @example
   *
   * _.toNumber(3.2);
   * // => 3.2
   *
   * _.toNumber(Number.MIN_VALUE);
   * // => 5e-324
   *
   * _.toNumber(Infinity);
   * // => Infinity
   *
   * _.toNumber('3.2');
   * // => 3.2
   */
  function toNumber(value) {
    if (typeof value == 'number') {
      return value;
    }
    if (isSymbol_1(value)) {
      return NAN;
    }
    if (isObject_1(value)) {
      var other = typeof value.valueOf == 'function' ? value.valueOf() : value;
      value = isObject_1(other) ? (other + '') : other;
    }
    if (typeof value != 'string') {
      return value === 0 ? value : +value;
    }
    value = _baseTrim(value);
    var isBinary = reIsBinary.test(value);
    return (isBinary || reIsOctal.test(value))
      ? freeParseInt(value.slice(2), isBinary ? 2 : 8)
      : (reIsBadHex.test(value) ? NAN : +value);
  }

  var toNumber_1 = toNumber;

  /** Used as references for various `Number` constants. */
  var INFINITY$2 = 1 / 0,
      MAX_INTEGER = 1.7976931348623157e+308;

  /**
   * Converts `value` to a finite number.
   *
   * @static
   * @memberOf _
   * @since 4.12.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {number} Returns the converted number.
   * @example
   *
   * _.toFinite(3.2);
   * // => 3.2
   *
   * _.toFinite(Number.MIN_VALUE);
   * // => 5e-324
   *
   * _.toFinite(Infinity);
   * // => 1.7976931348623157e+308
   *
   * _.toFinite('3.2');
   * // => 3.2
   */
  function toFinite(value) {
    if (!value) {
      return value === 0 ? value : 0;
    }
    value = toNumber_1(value);
    if (value === INFINITY$2 || value === -INFINITY$2) {
      var sign = (value < 0 ? -1 : 1);
      return sign * MAX_INTEGER;
    }
    return value === value ? value : 0;
  }

  var toFinite_1 = toFinite;

  /**
   * Converts `value` to an integer.
   *
   * **Note:** This method is loosely based on
   * [`ToInteger`](http://www.ecma-international.org/ecma-262/7.0/#sec-tointeger).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {number} Returns the converted integer.
   * @example
   *
   * _.toInteger(3.2);
   * // => 3
   *
   * _.toInteger(Number.MIN_VALUE);
   * // => 0
   *
   * _.toInteger(Infinity);
   * // => 1.7976931348623157e+308
   *
   * _.toInteger('3.2');
   * // => 3
   */
  function toInteger(value) {
    var result = toFinite_1(value),
        remainder = result % 1;

    return result === result ? (remainder ? result - remainder : result) : 0;
  }

  var toInteger_1 = toInteger;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeMax$1 = Math.max;

  /**
   * This method is like `_.find` except that it returns the index of the first
   * element `predicate` returns truthy for instead of the element itself.
   *
   * @static
   * @memberOf _
   * @since 1.1.0
   * @category Array
   * @param {Array} array The array to inspect.
   * @param {Function} [predicate=_.identity] The function invoked per iteration.
   * @param {number} [fromIndex=0] The index to search from.
   * @returns {number} Returns the index of the found element, else `-1`.
   * @example
   *
   * var users = [
   *   { 'user': 'barney',  'active': false },
   *   { 'user': 'fred',    'active': false },
   *   { 'user': 'pebbles', 'active': true }
   * ];
   *
   * _.findIndex(users, function(o) { return o.user == 'barney'; });
   * // => 0
   *
   * // The `_.matches` iteratee shorthand.
   * _.findIndex(users, { 'user': 'fred', 'active': false });
   * // => 1
   *
   * // The `_.matchesProperty` iteratee shorthand.
   * _.findIndex(users, ['active', false]);
   * // => 0
   *
   * // The `_.property` iteratee shorthand.
   * _.findIndex(users, 'active');
   * // => 2
   */
  function findIndex(array, predicate, fromIndex) {
    var length = array == null ? 0 : array.length;
    if (!length) {
      return -1;
    }
    var index = fromIndex == null ? 0 : toInteger_1(fromIndex);
    if (index < 0) {
      index = nativeMax$1(length + index, 0);
    }
    return _baseFindIndex(array, _baseIteratee(predicate), index);
  }

  var findIndex_1 = findIndex;

  /**
   * Iterates over elements of `collection`, returning the first element
   * `predicate` returns truthy for. The predicate is invoked with three
   * arguments: (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Collection
   * @param {Array|Object} collection The collection to inspect.
   * @param {Function} [predicate=_.identity] The function invoked per iteration.
   * @param {number} [fromIndex=0] The index to search from.
   * @returns {*} Returns the matched element, else `undefined`.
   * @example
   *
   * var users = [
   *   { 'user': 'barney',  'age': 36, 'active': true },
   *   { 'user': 'fred',    'age': 40, 'active': false },
   *   { 'user': 'pebbles', 'age': 1,  'active': true }
   * ];
   *
   * _.find(users, function(o) { return o.age < 40; });
   * // => object for 'barney'
   *
   * // The `_.matches` iteratee shorthand.
   * _.find(users, { 'age': 1, 'active': true });
   * // => object for 'pebbles'
   *
   * // The `_.matchesProperty` iteratee shorthand.
   * _.find(users, ['active', false]);
   * // => object for 'fred'
   *
   * // The `_.property` iteratee shorthand.
   * _.find(users, 'active');
   * // => object for 'barney'
   */
  var find = _createFind(findIndex_1);

  var find_1 = find;

  /**
   * Performs a deep comparison between two values to determine if they are
   * equivalent.
   *
   * **Note:** This method supports comparing arrays, array buffers, booleans,
   * date objects, error objects, maps, numbers, `Object` objects, regexes,
   * sets, strings, symbols, and typed arrays. `Object` objects are compared
   * by their own, not inherited, enumerable properties. Functions and DOM
   * nodes are compared by strict equality, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.isEqual(object, other);
   * // => true
   *
   * object === other;
   * // => false
   */
  function isEqual(value, other) {
    return _baseIsEqual(value, other);
  }

  var isEqual_1 = isEqual;

  /** `Object#toString` result references. */
  var stringTag$2 = '[object String]';

  /**
   * Checks if `value` is classified as a `String` primitive or object.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a string, else `false`.
   * @example
   *
   * _.isString('abc');
   * // => true
   *
   * _.isString(1);
   * // => false
   */
  function isString(value) {
    return typeof value == 'string' ||
      (!isArray_1(value) && isObjectLike_1(value) && _baseGetTag(value) == stringTag$2);
  }

  var isString_1 = isString;

  /**
   * Converts `iterator` to an array.
   *
   * @private
   * @param {Object} iterator The iterator to convert.
   * @returns {Array} Returns the converted array.
   */
  function iteratorToArray(iterator) {
    var data,
        result = [];

    while (!(data = iterator.next()).done) {
      result.push(data.value);
    }
    return result;
  }

  var _iteratorToArray = iteratorToArray;

  /**
   * Converts an ASCII `string` to an array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the converted array.
   */
  function asciiToArray(string) {
    return string.split('');
  }

  var _asciiToArray = asciiToArray;

  /** Used to compose unicode character classes. */
  var rsAstralRange = '\\ud800-\\udfff',
      rsComboMarksRange = '\\u0300-\\u036f',
      reComboHalfMarksRange = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange = '\\u20d0-\\u20ff',
      rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange,
      rsVarRange = '\\ufe0e\\ufe0f';

  /** Used to compose unicode capture groups. */
  var rsZWJ = '\\u200d';

  /** Used to detect strings with [zero-width joiners or code points from the astral planes](http://eev.ee/blog/2015/09/12/dark-corners-of-unicode/). */
  var reHasUnicode = RegExp('[' + rsZWJ + rsAstralRange  + rsComboRange + rsVarRange + ']');

  /**
   * Checks if `string` contains Unicode symbols.
   *
   * @private
   * @param {string} string The string to inspect.
   * @returns {boolean} Returns `true` if a symbol is found, else `false`.
   */
  function hasUnicode(string) {
    return reHasUnicode.test(string);
  }

  var _hasUnicode = hasUnicode;

  /** Used to compose unicode character classes. */
  var rsAstralRange$1 = '\\ud800-\\udfff',
      rsComboMarksRange$1 = '\\u0300-\\u036f',
      reComboHalfMarksRange$1 = '\\ufe20-\\ufe2f',
      rsComboSymbolsRange$1 = '\\u20d0-\\u20ff',
      rsComboRange$1 = rsComboMarksRange$1 + reComboHalfMarksRange$1 + rsComboSymbolsRange$1,
      rsVarRange$1 = '\\ufe0e\\ufe0f';

  /** Used to compose unicode capture groups. */
  var rsAstral = '[' + rsAstralRange$1 + ']',
      rsCombo = '[' + rsComboRange$1 + ']',
      rsFitz = '\\ud83c[\\udffb-\\udfff]',
      rsModifier = '(?:' + rsCombo + '|' + rsFitz + ')',
      rsNonAstral = '[^' + rsAstralRange$1 + ']',
      rsRegional = '(?:\\ud83c[\\udde6-\\uddff]){2}',
      rsSurrPair = '[\\ud800-\\udbff][\\udc00-\\udfff]',
      rsZWJ$1 = '\\u200d';

  /** Used to compose unicode regexes. */
  var reOptMod = rsModifier + '?',
      rsOptVar = '[' + rsVarRange$1 + ']?',
      rsOptJoin = '(?:' + rsZWJ$1 + '(?:' + [rsNonAstral, rsRegional, rsSurrPair].join('|') + ')' + rsOptVar + reOptMod + ')*',
      rsSeq = rsOptVar + reOptMod + rsOptJoin,
      rsSymbol = '(?:' + [rsNonAstral + rsCombo + '?', rsCombo, rsRegional, rsSurrPair, rsAstral].join('|') + ')';

  /** Used to match [string symbols](https://mathiasbynens.be/notes/javascript-unicode). */
  var reUnicode = RegExp(rsFitz + '(?=' + rsFitz + ')|' + rsSymbol + rsSeq, 'g');

  /**
   * Converts a Unicode `string` to an array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the converted array.
   */
  function unicodeToArray(string) {
    return string.match(reUnicode) || [];
  }

  var _unicodeToArray = unicodeToArray;

  /**
   * Converts `string` to an array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the converted array.
   */
  function stringToArray(string) {
    return _hasUnicode(string)
      ? _unicodeToArray(string)
      : _asciiToArray(string);
  }

  var _stringToArray = stringToArray;

  /**
   * The base implementation of `_.values` and `_.valuesIn` which creates an
   * array of `object` property values corresponding to the property names
   * of `props`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array} props The property names to get values for.
   * @returns {Object} Returns the array of property values.
   */
  function baseValues(object, props) {
    return _arrayMap(props, function(key) {
      return object[key];
    });
  }

  var _baseValues = baseValues;

  /**
   * Creates an array of the own enumerable string keyed property values of `object`.
   *
   * **Note:** Non-object values are coerced to objects.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property values.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.values(new Foo);
   * // => [1, 2] (iteration order is not guaranteed)
   *
   * _.values('hi');
   * // => ['h', 'i']
   */
  function values(object) {
    return object == null ? [] : _baseValues(object, keys_1(object));
  }

  var values_1 = values;

  /** `Object#toString` result references. */
  var mapTag$4 = '[object Map]',
      setTag$4 = '[object Set]';

  /** Built-in value references. */
  var symIterator = _Symbol ? _Symbol.iterator : undefined;

  /**
   * Converts `value` to an array.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {Array} Returns the converted array.
   * @example
   *
   * _.toArray({ 'a': 1, 'b': 2 });
   * // => [1, 2]
   *
   * _.toArray('abc');
   * // => ['a', 'b', 'c']
   *
   * _.toArray(1);
   * // => []
   *
   * _.toArray(null);
   * // => []
   */
  function toArray(value) {
    if (!value) {
      return [];
    }
    if (isArrayLike_1(value)) {
      return isString_1(value) ? _stringToArray(value) : _copyArray(value);
    }
    if (symIterator && value[symIterator]) {
      return _iteratorToArray(value[symIterator]());
    }
    var tag = _getTag(value),
        func = tag == mapTag$4 ? _mapToArray : (tag == setTag$4 ? _setToArray : values_1);

    return func(value);
  }

  var toArray_1 = toArray;

  /**
   * Gets the last element of `array`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Array
   * @param {Array} array The array to query.
   * @returns {*} Returns the last element of `array`.
   * @example
   *
   * _.last([1, 2, 3]);
   * // => 3
   */
  function last(array) {
    var length = array == null ? 0 : array.length;
    return length ? array[length - 1] : undefined;
  }

  var last_1 = last;

  /**
   * The base implementation of `_.slice` without an iteratee call guard.
   *
   * @private
   * @param {Array} array The array to slice.
   * @param {number} [start=0] The start position.
   * @param {number} [end=array.length] The end position.
   * @returns {Array} Returns the slice of `array`.
   */
  function baseSlice(array, start, end) {
    var index = -1,
        length = array.length;

    if (start < 0) {
      start = -start > length ? 0 : (length + start);
    }
    end = end > length ? length : end;
    if (end < 0) {
      end += length;
    }
    length = start > end ? 0 : ((end - start) >>> 0);
    start >>>= 0;

    var result = Array(length);
    while (++index < length) {
      result[index] = array[index + start];
    }
    return result;
  }

  var _baseSlice = baseSlice;

  /**
   * Gets the parent value at `path` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array} path The path to get the parent value of.
   * @returns {*} Returns the parent value.
   */
  function parent(object, path) {
    return path.length < 2 ? object : _baseGet(object, _baseSlice(path, 0, -1));
  }

  var _parent = parent;

  /**
   * The base implementation of `_.invoke` without support for individual
   * method arguments.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the method to invoke.
   * @param {Array} args The arguments to invoke the method with.
   * @returns {*} Returns the result of the invoked method.
   */
  function baseInvoke(object, path, args) {
    path = _castPath(path, object);
    object = _parent(object, path);
    var func = object == null ? object : object[_toKey(last_1(path))];
    return func == null ? undefined : _apply(func, object, args);
  }

  var _baseInvoke = baseInvoke;

  /**
   * Invokes the method at `path` of `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the method to invoke.
   * @param {...*} [args] The arguments to invoke the method with.
   * @returns {*} Returns the result of the invoked method.
   * @example
   *
   * var object = { 'a': [{ 'b': { 'c': [1, 2, 3, 4] } }] };
   *
   * _.invoke(object, 'a[0].b.c.slice', 1, 3);
   * // => [2, 3]
   */
  var invoke = _baseRest(_baseInvoke);

  var invoke_1 = invoke;

  /** Error message constants. */
  var FUNC_ERROR_TEXT$1 = 'Expected a function';

  /**
   * Creates a function that iterates over `pairs` and invokes the corresponding
   * function of the first predicate to return truthy. The predicate-function
   * pairs are invoked with the `this` binding and arguments of the created
   * function.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Util
   * @param {Array} pairs The predicate-function pairs.
   * @returns {Function} Returns the new composite function.
   * @example
   *
   * var func = _.cond([
   *   [_.matches({ 'a': 1 }),           _.constant('matches A')],
   *   [_.conforms({ 'b': _.isNumber }), _.constant('matches B')],
   *   [_.stubTrue,                      _.constant('no match')]
   * ]);
   *
   * func({ 'a': 1, 'b': 2 });
   * // => 'matches A'
   *
   * func({ 'a': 0, 'b': 1 });
   * // => 'matches B'
   *
   * func({ 'a': '1', 'b': '2' });
   * // => 'no match'
   */
  function cond(pairs) {
    var length = pairs == null ? 0 : pairs.length,
        toIteratee = _baseIteratee;

    pairs = !length ? [] : _arrayMap(pairs, function(pair) {
      if (typeof pair[1] != 'function') {
        throw new TypeError(FUNC_ERROR_TEXT$1);
      }
      return [toIteratee(pair[0]), pair[1]];
    });

    return _baseRest(function(args) {
      var index = -1;
      while (++index < length) {
        var pair = pairs[index];
        if (_apply(pair[0], this, args)) {
          return _apply(pair[1], this, args);
        }
      }
    });
  }

  var cond_1 = cond;

  /**
   * This method returns `true`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `true`.
   * @example
   *
   * _.times(2, _.stubTrue);
   * // => [true, true]
   */
  function stubTrue() {
    return true;
  }

  var stubTrue_1 = stubTrue;

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */
  var isArray$1 = Array.isArray;

  var isArray_1$1 = isArray$1;

  /** Detect free variable `global` from Node.js. */
  var freeGlobal$1 = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

  var _freeGlobal$1 = freeGlobal$1;

  /** Detect free variable `self`. */
  var freeSelf$1 = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root$1 = _freeGlobal$1 || freeSelf$1 || Function('return this')();

  var _root$1 = root$1;

  /** Built-in value references. */
  var Symbol$2 = _root$1.Symbol;

  var _Symbol$1 = Symbol$2;

  /** Used for built-in method references. */
  var objectProto$g = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$e = objectProto$g.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$2 = objectProto$g.toString;

  /** Built-in value references. */
  var symToStringTag$2 = _Symbol$1 ? _Symbol$1.toStringTag : undefined;

  /**
   * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the raw `toStringTag`.
   */
  function getRawTag$1(value) {
    var isOwn = hasOwnProperty$e.call(value, symToStringTag$2),
        tag = value[symToStringTag$2];

    try {
      value[symToStringTag$2] = undefined;
      var unmasked = true;
    } catch (e) {}

    var result = nativeObjectToString$2.call(value);
    if (unmasked) {
      if (isOwn) {
        value[symToStringTag$2] = tag;
      } else {
        delete value[symToStringTag$2];
      }
    }
    return result;
  }

  var _getRawTag$1 = getRawTag$1;

  /** Used for built-in method references. */
  var objectProto$h = Object.prototype;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var nativeObjectToString$3 = objectProto$h.toString;

  /**
   * Converts `value` to a string using `Object.prototype.toString`.
   *
   * @private
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   */
  function objectToString$1(value) {
    return nativeObjectToString$3.call(value);
  }

  var _objectToString$1 = objectToString$1;

  /** `Object#toString` result references. */
  var nullTag$1 = '[object Null]',
      undefinedTag$1 = '[object Undefined]';

  /** Built-in value references. */
  var symToStringTag$3 = _Symbol$1 ? _Symbol$1.toStringTag : undefined;

  /**
   * The base implementation of `getTag` without fallbacks for buggy environments.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag$1(value) {
    if (value == null) {
      return value === undefined ? undefinedTag$1 : nullTag$1;
    }
    return (symToStringTag$3 && symToStringTag$3 in Object(value))
      ? _getRawTag$1(value)
      : _objectToString$1(value);
  }

  var _baseGetTag$1 = baseGetTag$1;

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
  function isObjectLike$1(value) {
    return value != null && typeof value == 'object';
  }

  var isObjectLike_1$1 = isObjectLike$1;

  /** `Object#toString` result references. */
  var symbolTag$2 = '[object Symbol]';

  /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
  function isSymbol$1(value) {
    return typeof value == 'symbol' ||
      (isObjectLike_1$1(value) && _baseGetTag$1(value) == symbolTag$2);
  }

  var isSymbol_1$1 = isSymbol$1;

  /** Used to match property names within property paths. */
  var reIsDeepProp$1 = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
      reIsPlainProp$1 = /^\w*$/;

  /**
   * Checks if `value` is a property name and not a property path.
   *
   * @private
   * @param {*} value The value to check.
   * @param {Object} [object] The object to query keys on.
   * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
   */
  function isKey$1(value, object) {
    if (isArray_1$1(value)) {
      return false;
    }
    var type = typeof value;
    if (type == 'number' || type == 'symbol' || type == 'boolean' ||
        value == null || isSymbol_1$1(value)) {
      return true;
    }
    return reIsPlainProp$1.test(value) || !reIsDeepProp$1.test(value) ||
      (object != null && value in Object(object));
  }

  var _isKey$1 = isKey$1;

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
  function isObject$1(value) {
    var type = typeof value;
    return value != null && (type == 'object' || type == 'function');
  }

  var isObject_1$1 = isObject$1;

  /** `Object#toString` result references. */
  var asyncTag$1 = '[object AsyncFunction]',
      funcTag$2 = '[object Function]',
      genTag$1 = '[object GeneratorFunction]',
      proxyTag$1 = '[object Proxy]';

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction$1(value) {
    if (!isObject_1$1(value)) {
      return false;
    }
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 9 which returns 'object' for typed arrays and other constructors.
    var tag = _baseGetTag$1(value);
    return tag == funcTag$2 || tag == genTag$1 || tag == asyncTag$1 || tag == proxyTag$1;
  }

  var isFunction_1$1 = isFunction$1;

  /** Used to detect overreaching core-js shims. */
  var coreJsData$1 = _root$1['__core-js_shared__'];

  var _coreJsData$1 = coreJsData$1;

  /** Used to detect methods masquerading as native. */
  var maskSrcKey$1 = (function() {
    var uid = /[^.]+$/.exec(_coreJsData$1 && _coreJsData$1.keys && _coreJsData$1.keys.IE_PROTO || '');
    return uid ? ('Symbol(src)_1.' + uid) : '';
  }());

  /**
   * Checks if `func` has its source masked.
   *
   * @private
   * @param {Function} func The function to check.
   * @returns {boolean} Returns `true` if `func` is masked, else `false`.
   */
  function isMasked$1(func) {
    return !!maskSrcKey$1 && (maskSrcKey$1 in func);
  }

  var _isMasked$1 = isMasked$1;

  /** Used for built-in method references. */
  var funcProto$3 = Function.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$3 = funcProto$3.toString;

  /**
   * Converts `func` to its source code.
   *
   * @private
   * @param {Function} func The function to convert.
   * @returns {string} Returns the source code.
   */
  function toSource$1(func) {
    if (func != null) {
      try {
        return funcToString$3.call(func);
      } catch (e) {}
      try {
        return (func + '');
      } catch (e) {}
    }
    return '';
  }

  var _toSource$1 = toSource$1;

  /**
   * Used to match `RegExp`
   * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
   */
  var reRegExpChar$1 = /[\\^$.*+?()[\]{}|]/g;

  /** Used to detect host constructors (Safari). */
  var reIsHostCtor$1 = /^\[object .+?Constructor\]$/;

  /** Used for built-in method references. */
  var funcProto$4 = Function.prototype,
      objectProto$i = Object.prototype;

  /** Used to resolve the decompiled source of functions. */
  var funcToString$4 = funcProto$4.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty$f = objectProto$i.hasOwnProperty;

  /** Used to detect if a method is native. */
  var reIsNative$1 = RegExp('^' +
    funcToString$4.call(hasOwnProperty$f).replace(reRegExpChar$1, '\\$&')
    .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  );

  /**
   * The base implementation of `_.isNative` without bad shim checks.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a native function,
   *  else `false`.
   */
  function baseIsNative$1(value) {
    if (!isObject_1$1(value) || _isMasked$1(value)) {
      return false;
    }
    var pattern = isFunction_1$1(value) ? reIsNative$1 : reIsHostCtor$1;
    return pattern.test(_toSource$1(value));
  }

  var _baseIsNative$1 = baseIsNative$1;

  /**
   * Gets the value at `key` of `object`.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function getValue$1(object, key) {
    return object == null ? undefined : object[key];
  }

  var _getValue$1 = getValue$1;

  /**
   * Gets the native function at `key` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the method to get.
   * @returns {*} Returns the function if it's native, else `undefined`.
   */
  function getNative$1(object, key) {
    var value = _getValue$1(object, key);
    return _baseIsNative$1(value) ? value : undefined;
  }

  var _getNative$1 = getNative$1;

  /* Built-in method references that are verified to be native. */
  var nativeCreate$1 = _getNative$1(Object, 'create');

  var _nativeCreate$1 = nativeCreate$1;

  /**
   * Removes all key-value entries from the hash.
   *
   * @private
   * @name clear
   * @memberOf Hash
   */
  function hashClear$1() {
    this.__data__ = _nativeCreate$1 ? _nativeCreate$1(null) : {};
    this.size = 0;
  }

  var _hashClear$1 = hashClear$1;

  /**
   * Removes `key` and its value from the hash.
   *
   * @private
   * @name delete
   * @memberOf Hash
   * @param {Object} hash The hash to modify.
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function hashDelete$1(key) {
    var result = this.has(key) && delete this.__data__[key];
    this.size -= result ? 1 : 0;
    return result;
  }

  var _hashDelete$1 = hashDelete$1;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$3 = '__lodash_hash_undefined__';

  /** Used for built-in method references. */
  var objectProto$j = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$g = objectProto$j.hasOwnProperty;

  /**
   * Gets the hash value for `key`.
   *
   * @private
   * @name get
   * @memberOf Hash
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function hashGet$1(key) {
    var data = this.__data__;
    if (_nativeCreate$1) {
      var result = data[key];
      return result === HASH_UNDEFINED$3 ? undefined : result;
    }
    return hasOwnProperty$g.call(data, key) ? data[key] : undefined;
  }

  var _hashGet$1 = hashGet$1;

  /** Used for built-in method references. */
  var objectProto$k = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$h = objectProto$k.hasOwnProperty;

  /**
   * Checks if a hash value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Hash
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function hashHas$1(key) {
    var data = this.__data__;
    return _nativeCreate$1 ? (data[key] !== undefined) : hasOwnProperty$h.call(data, key);
  }

  var _hashHas$1 = hashHas$1;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$4 = '__lodash_hash_undefined__';

  /**
   * Sets the hash `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Hash
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the hash instance.
   */
  function hashSet$1(key, value) {
    var data = this.__data__;
    this.size += this.has(key) ? 0 : 1;
    data[key] = (_nativeCreate$1 && value === undefined) ? HASH_UNDEFINED$4 : value;
    return this;
  }

  var _hashSet$1 = hashSet$1;

  /**
   * Creates a hash object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Hash$1(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `Hash`.
  Hash$1.prototype.clear = _hashClear$1;
  Hash$1.prototype['delete'] = _hashDelete$1;
  Hash$1.prototype.get = _hashGet$1;
  Hash$1.prototype.has = _hashHas$1;
  Hash$1.prototype.set = _hashSet$1;

  var _Hash$1 = Hash$1;

  /**
   * Removes all key-value entries from the list cache.
   *
   * @private
   * @name clear
   * @memberOf ListCache
   */
  function listCacheClear$1() {
    this.__data__ = [];
    this.size = 0;
  }

  var _listCacheClear$1 = listCacheClear$1;

  /**
   * Performs a
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * comparison between two values to determine if they are equivalent.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.eq(object, object);
   * // => true
   *
   * _.eq(object, other);
   * // => false
   *
   * _.eq('a', 'a');
   * // => true
   *
   * _.eq('a', Object('a'));
   * // => false
   *
   * _.eq(NaN, NaN);
   * // => true
   */
  function eq$1(value, other) {
    return value === other || (value !== value && other !== other);
  }

  var eq_1$1 = eq$1;

  /**
   * Gets the index at which the `key` is found in `array` of key-value pairs.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} key The key to search for.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function assocIndexOf$1(array, key) {
    var length = array.length;
    while (length--) {
      if (eq_1$1(array[length][0], key)) {
        return length;
      }
    }
    return -1;
  }

  var _assocIndexOf$1 = assocIndexOf$1;

  /** Used for built-in method references. */
  var arrayProto$1 = Array.prototype;

  /** Built-in value references. */
  var splice$1 = arrayProto$1.splice;

  /**
   * Removes `key` and its value from the list cache.
   *
   * @private
   * @name delete
   * @memberOf ListCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function listCacheDelete$1(key) {
    var data = this.__data__,
        index = _assocIndexOf$1(data, key);

    if (index < 0) {
      return false;
    }
    var lastIndex = data.length - 1;
    if (index == lastIndex) {
      data.pop();
    } else {
      splice$1.call(data, index, 1);
    }
    --this.size;
    return true;
  }

  var _listCacheDelete$1 = listCacheDelete$1;

  /**
   * Gets the list cache value for `key`.
   *
   * @private
   * @name get
   * @memberOf ListCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function listCacheGet$1(key) {
    var data = this.__data__,
        index = _assocIndexOf$1(data, key);

    return index < 0 ? undefined : data[index][1];
  }

  var _listCacheGet$1 = listCacheGet$1;

  /**
   * Checks if a list cache value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf ListCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function listCacheHas$1(key) {
    return _assocIndexOf$1(this.__data__, key) > -1;
  }

  var _listCacheHas$1 = listCacheHas$1;

  /**
   * Sets the list cache `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf ListCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the list cache instance.
   */
  function listCacheSet$1(key, value) {
    var data = this.__data__,
        index = _assocIndexOf$1(data, key);

    if (index < 0) {
      ++this.size;
      data.push([key, value]);
    } else {
      data[index][1] = value;
    }
    return this;
  }

  var _listCacheSet$1 = listCacheSet$1;

  /**
   * Creates an list cache object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function ListCache$1(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `ListCache`.
  ListCache$1.prototype.clear = _listCacheClear$1;
  ListCache$1.prototype['delete'] = _listCacheDelete$1;
  ListCache$1.prototype.get = _listCacheGet$1;
  ListCache$1.prototype.has = _listCacheHas$1;
  ListCache$1.prototype.set = _listCacheSet$1;

  var _ListCache$1 = ListCache$1;

  /* Built-in method references that are verified to be native. */
  var Map$2 = _getNative$1(_root$1, 'Map');

  var _Map$1 = Map$2;

  /**
   * Removes all key-value entries from the map.
   *
   * @private
   * @name clear
   * @memberOf MapCache
   */
  function mapCacheClear$1() {
    this.size = 0;
    this.__data__ = {
      'hash': new _Hash$1,
      'map': new (_Map$1 || _ListCache$1),
      'string': new _Hash$1
    };
  }

  var _mapCacheClear$1 = mapCacheClear$1;

  /**
   * Checks if `value` is suitable for use as unique object key.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
   */
  function isKeyable$1(value) {
    var type = typeof value;
    return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
      ? (value !== '__proto__')
      : (value === null);
  }

  var _isKeyable$1 = isKeyable$1;

  /**
   * Gets the data for `map`.
   *
   * @private
   * @param {Object} map The map to query.
   * @param {string} key The reference key.
   * @returns {*} Returns the map data.
   */
  function getMapData$1(map, key) {
    var data = map.__data__;
    return _isKeyable$1(key)
      ? data[typeof key == 'string' ? 'string' : 'hash']
      : data.map;
  }

  var _getMapData$1 = getMapData$1;

  /**
   * Removes `key` and its value from the map.
   *
   * @private
   * @name delete
   * @memberOf MapCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function mapCacheDelete$1(key) {
    var result = _getMapData$1(this, key)['delete'](key);
    this.size -= result ? 1 : 0;
    return result;
  }

  var _mapCacheDelete$1 = mapCacheDelete$1;

  /**
   * Gets the map value for `key`.
   *
   * @private
   * @name get
   * @memberOf MapCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function mapCacheGet$1(key) {
    return _getMapData$1(this, key).get(key);
  }

  var _mapCacheGet$1 = mapCacheGet$1;

  /**
   * Checks if a map value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf MapCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function mapCacheHas$1(key) {
    return _getMapData$1(this, key).has(key);
  }

  var _mapCacheHas$1 = mapCacheHas$1;

  /**
   * Sets the map `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf MapCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the map cache instance.
   */
  function mapCacheSet$1(key, value) {
    var data = _getMapData$1(this, key),
        size = data.size;

    data.set(key, value);
    this.size += data.size == size ? 0 : 1;
    return this;
  }

  var _mapCacheSet$1 = mapCacheSet$1;

  /**
   * Creates a map cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function MapCache$1(entries) {
    var index = -1,
        length = entries == null ? 0 : entries.length;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  // Add methods to `MapCache`.
  MapCache$1.prototype.clear = _mapCacheClear$1;
  MapCache$1.prototype['delete'] = _mapCacheDelete$1;
  MapCache$1.prototype.get = _mapCacheGet$1;
  MapCache$1.prototype.has = _mapCacheHas$1;
  MapCache$1.prototype.set = _mapCacheSet$1;

  var _MapCache$1 = MapCache$1;

  /** Error message constants. */
  var FUNC_ERROR_TEXT$2 = 'Expected a function';

  /**
   * Creates a function that memoizes the result of `func`. If `resolver` is
   * provided, it determines the cache key for storing the result based on the
   * arguments provided to the memoized function. By default, the first argument
   * provided to the memoized function is used as the map cache key. The `func`
   * is invoked with the `this` binding of the memoized function.
   *
   * **Note:** The cache is exposed as the `cache` property on the memoized
   * function. Its creation may be customized by replacing the `_.memoize.Cache`
   * constructor with one whose instances implement the
   * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
   * method interface of `clear`, `delete`, `get`, `has`, and `set`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Function
   * @param {Function} func The function to have its output memoized.
   * @param {Function} [resolver] The function to resolve the cache key.
   * @returns {Function} Returns the new memoized function.
   * @example
   *
   * var object = { 'a': 1, 'b': 2 };
   * var other = { 'c': 3, 'd': 4 };
   *
   * var values = _.memoize(_.values);
   * values(object);
   * // => [1, 2]
   *
   * values(other);
   * // => [3, 4]
   *
   * object.a = 2;
   * values(object);
   * // => [1, 2]
   *
   * // Modify the result cache.
   * values.cache.set(object, ['a', 'b']);
   * values(object);
   * // => ['a', 'b']
   *
   * // Replace `_.memoize.Cache`.
   * _.memoize.Cache = WeakMap;
   */
  function memoize$1(func, resolver) {
    if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
      throw new TypeError(FUNC_ERROR_TEXT$2);
    }
    var memoized = function() {
      var args = arguments,
          key = resolver ? resolver.apply(this, args) : args[0],
          cache = memoized.cache;

      if (cache.has(key)) {
        return cache.get(key);
      }
      var result = func.apply(this, args);
      memoized.cache = cache.set(key, result) || cache;
      return result;
    };
    memoized.cache = new (memoize$1.Cache || _MapCache$1);
    return memoized;
  }

  // Expose `MapCache`.
  memoize$1.Cache = _MapCache$1;

  var memoize_1$1 = memoize$1;

  /** Used as the maximum memoize cache size. */
  var MAX_MEMOIZE_SIZE$1 = 500;

  /**
   * A specialized version of `_.memoize` which clears the memoized function's
   * cache when it exceeds `MAX_MEMOIZE_SIZE`.
   *
   * @private
   * @param {Function} func The function to have its output memoized.
   * @returns {Function} Returns the new memoized function.
   */
  function memoizeCapped$1(func) {
    var result = memoize_1$1(func, function(key) {
      if (cache.size === MAX_MEMOIZE_SIZE$1) {
        cache.clear();
      }
      return key;
    });

    var cache = result.cache;
    return result;
  }

  var _memoizeCapped$1 = memoizeCapped$1;

  /** Used to match property names within property paths. */
  var rePropName$1 = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

  /** Used to match backslashes in property paths. */
  var reEscapeChar$1 = /\\(\\)?/g;

  /**
   * Converts `string` to a property path array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the property path array.
   */
  var stringToPath$1 = _memoizeCapped$1(function(string) {
    var result = [];
    if (string.charCodeAt(0) === 46 /* . */) {
      result.push('');
    }
    string.replace(rePropName$1, function(match, number, quote, subString) {
      result.push(quote ? subString.replace(reEscapeChar$1, '$1') : (number || match));
    });
    return result;
  });

  var _stringToPath$1 = stringToPath$1;

  /**
   * A specialized version of `_.map` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the new mapped array.
   */
  function arrayMap$1(array, iteratee) {
    var index = -1,
        length = array == null ? 0 : array.length,
        result = Array(length);

    while (++index < length) {
      result[index] = iteratee(array[index], index, array);
    }
    return result;
  }

  var _arrayMap$1 = arrayMap$1;

  /** Used as references for various `Number` constants. */
  var INFINITY$3 = 1 / 0;

  /** Used to convert symbols to primitives and strings. */
  var symbolProto$2 = _Symbol$1 ? _Symbol$1.prototype : undefined,
      symbolToString$1 = symbolProto$2 ? symbolProto$2.toString : undefined;

  /**
   * The base implementation of `_.toString` which doesn't convert nullish
   * values to empty strings.
   *
   * @private
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   */
  function baseToString$1(value) {
    // Exit early for strings to avoid a performance hit in some environments.
    if (typeof value == 'string') {
      return value;
    }
    if (isArray_1$1(value)) {
      // Recursively convert values (susceptible to call stack limits).
      return _arrayMap$1(value, baseToString$1) + '';
    }
    if (isSymbol_1$1(value)) {
      return symbolToString$1 ? symbolToString$1.call(value) : '';
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY$3) ? '-0' : result;
  }

  var _baseToString$1 = baseToString$1;

  /**
   * Converts `value` to a string. An empty string is returned for `null`
   * and `undefined` values. The sign of `-0` is preserved.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to convert.
   * @returns {string} Returns the converted string.
   * @example
   *
   * _.toString(null);
   * // => ''
   *
   * _.toString(-0);
   * // => '-0'
   *
   * _.toString([1, 2, 3]);
   * // => '1,2,3'
   */
  function toString$1(value) {
    return value == null ? '' : _baseToString$1(value);
  }

  var toString_1$1 = toString$1;

  /**
   * Casts `value` to a path array if it's not one.
   *
   * @private
   * @param {*} value The value to inspect.
   * @param {Object} [object] The object to query keys on.
   * @returns {Array} Returns the cast property path array.
   */
  function castPath$1(value, object) {
    if (isArray_1$1(value)) {
      return value;
    }
    return _isKey$1(value, object) ? [value] : _stringToPath$1(toString_1$1(value));
  }

  var _castPath$1 = castPath$1;

  /** Used as references for various `Number` constants. */
  var INFINITY$4 = 1 / 0;

  /**
   * Converts `value` to a string key if it's not a string or symbol.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {string|symbol} Returns the key.
   */
  function toKey$1(value) {
    if (typeof value == 'string' || isSymbol_1$1(value)) {
      return value;
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY$4) ? '-0' : result;
  }

  var _toKey$1 = toKey$1;

  /**
   * The base implementation of `_.get` without support for default values.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @returns {*} Returns the resolved value.
   */
  function baseGet$1(object, path) {
    path = _castPath$1(path, object);

    var index = 0,
        length = path.length;

    while (object != null && index < length) {
      object = object[_toKey$1(path[index++])];
    }
    return (index && index == length) ? object : undefined;
  }

  var _baseGet$1 = baseGet$1;

  /**
   * Gets the value at `path` of `object`. If the resolved value is
   * `undefined`, the `defaultValue` is returned in its place.
   *
   * @static
   * @memberOf _
   * @since 3.7.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @param {*} [defaultValue] The value returned for `undefined` resolved values.
   * @returns {*} Returns the resolved value.
   * @example
   *
   * var object = { 'a': [{ 'b': { 'c': 3 } }] };
   *
   * _.get(object, 'a[0].b.c');
   * // => 3
   *
   * _.get(object, ['a', '0', 'b', 'c']);
   * // => 3
   *
   * _.get(object, 'a.b.c', 'default');
   * // => 'default'
   */
  function get$2(object, path, defaultValue) {
    var result = object == null ? undefined : _baseGet$1(object, path);
    return result === undefined ? defaultValue : result;
  }

  var get_1$1 = get$2;

  /** Used for built-in method references. */
  var objectProto$l = Object.prototype;

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype$1(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto$l;

    return value === proto;
  }

  var _isPrototype$1 = isPrototype$1;

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */
  function overArg$1(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  var _overArg$1 = overArg$1;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeKeys$1 = _overArg$1(Object.keys, Object);

  var _nativeKeys$1 = nativeKeys$1;

  /** Used for built-in method references. */
  var objectProto$m = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$i = objectProto$m.hasOwnProperty;

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys$1(object) {
    if (!_isPrototype$1(object)) {
      return _nativeKeys$1(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty$i.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  var _baseKeys$1 = baseKeys$1;

  /* Built-in method references that are verified to be native. */
  var DataView$2 = _getNative$1(_root$1, 'DataView');

  var _DataView$1 = DataView$2;

  /* Built-in method references that are verified to be native. */
  var Promise$2 = _getNative$1(_root$1, 'Promise');

  var _Promise$1 = Promise$2;

  /* Built-in method references that are verified to be native. */
  var Set$2 = _getNative$1(_root$1, 'Set');

  var _Set$1 = Set$2;

  /* Built-in method references that are verified to be native. */
  var WeakMap$2 = _getNative$1(_root$1, 'WeakMap');

  var _WeakMap$1 = WeakMap$2;

  /** `Object#toString` result references. */
  var mapTag$5 = '[object Map]',
      objectTag$4 = '[object Object]',
      promiseTag$1 = '[object Promise]',
      setTag$5 = '[object Set]',
      weakMapTag$2 = '[object WeakMap]';

  var dataViewTag$3 = '[object DataView]';

  /** Used to detect maps, sets, and weakmaps. */
  var dataViewCtorString$1 = _toSource$1(_DataView$1),
      mapCtorString$1 = _toSource$1(_Map$1),
      promiseCtorString$1 = _toSource$1(_Promise$1),
      setCtorString$1 = _toSource$1(_Set$1),
      weakMapCtorString$1 = _toSource$1(_WeakMap$1);

  /**
   * Gets the `toStringTag` of `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  var getTag$1 = _baseGetTag$1;

  // Fallback for data views, maps, sets, and weak maps in IE 11 and promises in Node.js < 6.
  if ((_DataView$1 && getTag$1(new _DataView$1(new ArrayBuffer(1))) != dataViewTag$3) ||
      (_Map$1 && getTag$1(new _Map$1) != mapTag$5) ||
      (_Promise$1 && getTag$1(_Promise$1.resolve()) != promiseTag$1) ||
      (_Set$1 && getTag$1(new _Set$1) != setTag$5) ||
      (_WeakMap$1 && getTag$1(new _WeakMap$1) != weakMapTag$2)) {
    getTag$1 = function(value) {
      var result = _baseGetTag$1(value),
          Ctor = result == objectTag$4 ? value.constructor : undefined,
          ctorString = Ctor ? _toSource$1(Ctor) : '';

      if (ctorString) {
        switch (ctorString) {
          case dataViewCtorString$1: return dataViewTag$3;
          case mapCtorString$1: return mapTag$5;
          case promiseCtorString$1: return promiseTag$1;
          case setCtorString$1: return setTag$5;
          case weakMapCtorString$1: return weakMapTag$2;
        }
      }
      return result;
    };
  }

  var _getTag$1 = getTag$1;

  /** `Object#toString` result references. */
  var argsTag$3 = '[object Arguments]';

  /**
   * The base implementation of `_.isArguments`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   */
  function baseIsArguments$1(value) {
    return isObjectLike_1$1(value) && _baseGetTag$1(value) == argsTag$3;
  }

  var _baseIsArguments$1 = baseIsArguments$1;

  /** Used for built-in method references. */
  var objectProto$n = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$j = objectProto$n.hasOwnProperty;

  /** Built-in value references. */
  var propertyIsEnumerable$2 = objectProto$n.propertyIsEnumerable;

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  var isArguments$1 = _baseIsArguments$1(function() { return arguments; }()) ? _baseIsArguments$1 : function(value) {
    return isObjectLike_1$1(value) && hasOwnProperty$j.call(value, 'callee') &&
      !propertyIsEnumerable$2.call(value, 'callee');
  };

  var isArguments_1$1 = isArguments$1;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$2 = 9007199254740991;

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength$1(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER$2;
  }

  var isLength_1$1 = isLength$1;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike$1(value) {
    return value != null && isLength_1$1(value.length) && !isFunction_1$1(value);
  }

  var isArrayLike_1$1 = isArrayLike$1;

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */
  function stubFalse$1() {
    return false;
  }

  var stubFalse_1$1 = stubFalse$1;

  var isBuffer_1$1 = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Built-in value references. */
  var Buffer = moduleExports ? _root$1.Buffer : undefined;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined;

  /**
   * Checks if `value` is a buffer.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
   * @example
   *
   * _.isBuffer(new Buffer(2));
   * // => true
   *
   * _.isBuffer(new Uint8Array(2));
   * // => false
   */
  var isBuffer = nativeIsBuffer || stubFalse_1$1;

  module.exports = isBuffer;
  });

  /** `Object#toString` result references. */
  var argsTag$4 = '[object Arguments]',
      arrayTag$2 = '[object Array]',
      boolTag$2 = '[object Boolean]',
      dateTag$2 = '[object Date]',
      errorTag$2 = '[object Error]',
      funcTag$3 = '[object Function]',
      mapTag$6 = '[object Map]',
      numberTag$3 = '[object Number]',
      objectTag$5 = '[object Object]',
      regexpTag$2 = '[object RegExp]',
      setTag$6 = '[object Set]',
      stringTag$3 = '[object String]',
      weakMapTag$3 = '[object WeakMap]';

  var arrayBufferTag$2 = '[object ArrayBuffer]',
      dataViewTag$4 = '[object DataView]',
      float32Tag$1 = '[object Float32Array]',
      float64Tag$1 = '[object Float64Array]',
      int8Tag$1 = '[object Int8Array]',
      int16Tag$1 = '[object Int16Array]',
      int32Tag$1 = '[object Int32Array]',
      uint8Tag$1 = '[object Uint8Array]',
      uint8ClampedTag$1 = '[object Uint8ClampedArray]',
      uint16Tag$1 = '[object Uint16Array]',
      uint32Tag$1 = '[object Uint32Array]';

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags$1 = {};
  typedArrayTags$1[float32Tag$1] = typedArrayTags$1[float64Tag$1] =
  typedArrayTags$1[int8Tag$1] = typedArrayTags$1[int16Tag$1] =
  typedArrayTags$1[int32Tag$1] = typedArrayTags$1[uint8Tag$1] =
  typedArrayTags$1[uint8ClampedTag$1] = typedArrayTags$1[uint16Tag$1] =
  typedArrayTags$1[uint32Tag$1] = true;
  typedArrayTags$1[argsTag$4] = typedArrayTags$1[arrayTag$2] =
  typedArrayTags$1[arrayBufferTag$2] = typedArrayTags$1[boolTag$2] =
  typedArrayTags$1[dataViewTag$4] = typedArrayTags$1[dateTag$2] =
  typedArrayTags$1[errorTag$2] = typedArrayTags$1[funcTag$3] =
  typedArrayTags$1[mapTag$6] = typedArrayTags$1[numberTag$3] =
  typedArrayTags$1[objectTag$5] = typedArrayTags$1[regexpTag$2] =
  typedArrayTags$1[setTag$6] = typedArrayTags$1[stringTag$3] =
  typedArrayTags$1[weakMapTag$3] = false;

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray$1(value) {
    return isObjectLike_1$1(value) &&
      isLength_1$1(value.length) && !!typedArrayTags$1[_baseGetTag$1(value)];
  }

  var _baseIsTypedArray$1 = baseIsTypedArray$1;

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */
  function baseUnary$1(func) {
    return function(value) {
      return func(value);
    };
  }

  var _baseUnary$1 = baseUnary$1;

  var _nodeUtil$1 = createCommonjsModule(function (module, exports) {
  /** Detect free variable `exports`. */
  var freeExports =  exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && 'object' == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Detect free variable `process` from Node.js. */
  var freeProcess = moduleExports && _freeGlobal$1.process;

  /** Used to access faster Node.js helpers. */
  var nodeUtil = (function() {
    try {
      // Use `util.types` for Node.js 10+.
      var types = freeModule && freeModule.require && freeModule.require('util').types;

      if (types) {
        return types;
      }

      // Legacy `process.binding('util')` for Node.js < 10.
      return freeProcess && freeProcess.binding && freeProcess.binding('util');
    } catch (e) {}
  }());

  module.exports = nodeUtil;
  });

  /* Node.js helper references. */
  var nodeIsTypedArray$1 = _nodeUtil$1 && _nodeUtil$1.isTypedArray;

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray$1 = nodeIsTypedArray$1 ? _baseUnary$1(nodeIsTypedArray$1) : _baseIsTypedArray$1;

  var isTypedArray_1$1 = isTypedArray$1;

  /** `Object#toString` result references. */
  var mapTag$7 = '[object Map]',
      setTag$7 = '[object Set]';

  /** Used for built-in method references. */
  var objectProto$o = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$k = objectProto$o.hasOwnProperty;

  /**
   * Checks if `value` is an empty object, collection, map, or set.
   *
   * Objects are considered empty if they have no own enumerable string keyed
   * properties.
   *
   * Array-like values such as `arguments` objects, arrays, buffers, strings, or
   * jQuery-like collections are considered empty if they have a `length` of `0`.
   * Similarly, maps and sets are considered empty if they have a `size` of `0`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is empty, else `false`.
   * @example
   *
   * _.isEmpty(null);
   * // => true
   *
   * _.isEmpty(true);
   * // => true
   *
   * _.isEmpty(1);
   * // => true
   *
   * _.isEmpty([1, 2, 3]);
   * // => false
   *
   * _.isEmpty({ 'a': 1 });
   * // => false
   */
  function isEmpty$1(value) {
    if (value == null) {
      return true;
    }
    if (isArrayLike_1$1(value) &&
        (isArray_1$1(value) || typeof value == 'string' || typeof value.splice == 'function' ||
          isBuffer_1$1(value) || isTypedArray_1$1(value) || isArguments_1$1(value))) {
      return !value.length;
    }
    var tag = _getTag$1(value);
    if (tag == mapTag$7 || tag == setTag$7) {
      return !value.size;
    }
    if (_isPrototype$1(value)) {
      return !_baseKeys$1(value).length;
    }
    for (var key in value) {
      if (hasOwnProperty$k.call(value, key)) {
        return false;
      }
    }
    return true;
  }

  var isEmpty_1$1 = isEmpty$1;

  /**
   * Removes all key-value entries from the stack.
   *
   * @private
   * @name clear
   * @memberOf Stack
   */
  function stackClear$1() {
    this.__data__ = new _ListCache$1;
    this.size = 0;
  }

  var _stackClear$1 = stackClear$1;

  /**
   * Removes `key` and its value from the stack.
   *
   * @private
   * @name delete
   * @memberOf Stack
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function stackDelete$1(key) {
    var data = this.__data__,
        result = data['delete'](key);

    this.size = data.size;
    return result;
  }

  var _stackDelete$1 = stackDelete$1;

  /**
   * Gets the stack value for `key`.
   *
   * @private
   * @name get
   * @memberOf Stack
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function stackGet$1(key) {
    return this.__data__.get(key);
  }

  var _stackGet$1 = stackGet$1;

  /**
   * Checks if a stack value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Stack
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function stackHas$1(key) {
    return this.__data__.has(key);
  }

  var _stackHas$1 = stackHas$1;

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE$1 = 200;

  /**
   * Sets the stack `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Stack
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the stack cache instance.
   */
  function stackSet$1(key, value) {
    var data = this.__data__;
    if (data instanceof _ListCache$1) {
      var pairs = data.__data__;
      if (!_Map$1 || (pairs.length < LARGE_ARRAY_SIZE$1 - 1)) {
        pairs.push([key, value]);
        this.size = ++data.size;
        return this;
      }
      data = this.__data__ = new _MapCache$1(pairs);
    }
    data.set(key, value);
    this.size = data.size;
    return this;
  }

  var _stackSet$1 = stackSet$1;

  /**
   * Creates a stack cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Stack$1(entries) {
    var data = this.__data__ = new _ListCache$1(entries);
    this.size = data.size;
  }

  // Add methods to `Stack`.
  Stack$1.prototype.clear = _stackClear$1;
  Stack$1.prototype['delete'] = _stackDelete$1;
  Stack$1.prototype.get = _stackGet$1;
  Stack$1.prototype.has = _stackHas$1;
  Stack$1.prototype.set = _stackSet$1;

  var _Stack$1 = Stack$1;

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED$5 = '__lodash_hash_undefined__';

  /**
   * Adds `value` to the array cache.
   *
   * @private
   * @name add
   * @memberOf SetCache
   * @alias push
   * @param {*} value The value to cache.
   * @returns {Object} Returns the cache instance.
   */
  function setCacheAdd$1(value) {
    this.__data__.set(value, HASH_UNDEFINED$5);
    return this;
  }

  var _setCacheAdd$1 = setCacheAdd$1;

  /**
   * Checks if `value` is in the array cache.
   *
   * @private
   * @name has
   * @memberOf SetCache
   * @param {*} value The value to search for.
   * @returns {number} Returns `true` if `value` is found, else `false`.
   */
  function setCacheHas$1(value) {
    return this.__data__.has(value);
  }

  var _setCacheHas$1 = setCacheHas$1;

  /**
   *
   * Creates an array cache object to store unique values.
   *
   * @private
   * @constructor
   * @param {Array} [values] The values to cache.
   */
  function SetCache$1(values) {
    var index = -1,
        length = values == null ? 0 : values.length;

    this.__data__ = new _MapCache$1;
    while (++index < length) {
      this.add(values[index]);
    }
  }

  // Add methods to `SetCache`.
  SetCache$1.prototype.add = SetCache$1.prototype.push = _setCacheAdd$1;
  SetCache$1.prototype.has = _setCacheHas$1;

  var _SetCache$1 = SetCache$1;

  /**
   * A specialized version of `_.some` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {boolean} Returns `true` if any element passes the predicate check,
   *  else `false`.
   */
  function arraySome$1(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length;

    while (++index < length) {
      if (predicate(array[index], index, array)) {
        return true;
      }
    }
    return false;
  }

  var _arraySome$1 = arraySome$1;

  /**
   * Checks if a `cache` value for `key` exists.
   *
   * @private
   * @param {Object} cache The cache to query.
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function cacheHas$1(cache, key) {
    return cache.has(key);
  }

  var _cacheHas$1 = cacheHas$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$6 = 1,
      COMPARE_UNORDERED_FLAG$4 = 2;

  /**
   * A specialized version of `baseIsEqualDeep` for arrays with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Array} array The array to compare.
   * @param {Array} other The other array to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `array` and `other` objects.
   * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
   */
  function equalArrays$1(array, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG$6,
        arrLength = array.length,
        othLength = other.length;

    if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
      return false;
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(array);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var index = -1,
        result = true,
        seen = (bitmask & COMPARE_UNORDERED_FLAG$4) ? new _SetCache$1 : undefined;

    stack.set(array, other);
    stack.set(other, array);

    // Ignore non-index properties.
    while (++index < arrLength) {
      var arrValue = array[index],
          othValue = other[index];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, arrValue, index, other, array, stack)
          : customizer(arrValue, othValue, index, array, other, stack);
      }
      if (compared !== undefined) {
        if (compared) {
          continue;
        }
        result = false;
        break;
      }
      // Recursively compare arrays (susceptible to call stack limits).
      if (seen) {
        if (!_arraySome$1(other, function(othValue, othIndex) {
              if (!_cacheHas$1(seen, othIndex) &&
                  (arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
                return seen.push(othIndex);
              }
            })) {
          result = false;
          break;
        }
      } else if (!(
            arrValue === othValue ||
              equalFunc(arrValue, othValue, bitmask, customizer, stack)
          )) {
        result = false;
        break;
      }
    }
    stack['delete'](array);
    stack['delete'](other);
    return result;
  }

  var _equalArrays$1 = equalArrays$1;

  /** Built-in value references. */
  var Uint8Array$2 = _root$1.Uint8Array;

  var _Uint8Array$1 = Uint8Array$2;

  /**
   * Converts `map` to its key-value pairs.
   *
   * @private
   * @param {Object} map The map to convert.
   * @returns {Array} Returns the key-value pairs.
   */
  function mapToArray$1(map) {
    var index = -1,
        result = Array(map.size);

    map.forEach(function(value, key) {
      result[++index] = [key, value];
    });
    return result;
  }

  var _mapToArray$1 = mapToArray$1;

  /**
   * Converts `set` to an array of its values.
   *
   * @private
   * @param {Object} set The set to convert.
   * @returns {Array} Returns the values.
   */
  function setToArray$1(set) {
    var index = -1,
        result = Array(set.size);

    set.forEach(function(value) {
      result[++index] = value;
    });
    return result;
  }

  var _setToArray$1 = setToArray$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$7 = 1,
      COMPARE_UNORDERED_FLAG$5 = 2;

  /** `Object#toString` result references. */
  var boolTag$3 = '[object Boolean]',
      dateTag$3 = '[object Date]',
      errorTag$3 = '[object Error]',
      mapTag$8 = '[object Map]',
      numberTag$4 = '[object Number]',
      regexpTag$3 = '[object RegExp]',
      setTag$8 = '[object Set]',
      stringTag$4 = '[object String]',
      symbolTag$3 = '[object Symbol]';

  var arrayBufferTag$3 = '[object ArrayBuffer]',
      dataViewTag$5 = '[object DataView]';

  /** Used to convert symbols to primitives and strings. */
  var symbolProto$3 = _Symbol$1 ? _Symbol$1.prototype : undefined,
      symbolValueOf$1 = symbolProto$3 ? symbolProto$3.valueOf : undefined;

  /**
   * A specialized version of `baseIsEqualDeep` for comparing objects of
   * the same `toStringTag`.
   *
   * **Note:** This function only supports comparing values with tags of
   * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {string} tag The `toStringTag` of the objects to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalByTag$1(object, other, tag, bitmask, customizer, equalFunc, stack) {
    switch (tag) {
      case dataViewTag$5:
        if ((object.byteLength != other.byteLength) ||
            (object.byteOffset != other.byteOffset)) {
          return false;
        }
        object = object.buffer;
        other = other.buffer;

      case arrayBufferTag$3:
        if ((object.byteLength != other.byteLength) ||
            !equalFunc(new _Uint8Array$1(object), new _Uint8Array$1(other))) {
          return false;
        }
        return true;

      case boolTag$3:
      case dateTag$3:
      case numberTag$4:
        // Coerce booleans to `1` or `0` and dates to milliseconds.
        // Invalid dates are coerced to `NaN`.
        return eq_1$1(+object, +other);

      case errorTag$3:
        return object.name == other.name && object.message == other.message;

      case regexpTag$3:
      case stringTag$4:
        // Coerce regexes to strings and treat strings, primitives and objects,
        // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
        // for more details.
        return object == (other + '');

      case mapTag$8:
        var convert = _mapToArray$1;

      case setTag$8:
        var isPartial = bitmask & COMPARE_PARTIAL_FLAG$7;
        convert || (convert = _setToArray$1);

        if (object.size != other.size && !isPartial) {
          return false;
        }
        // Assume cyclic values are equal.
        var stacked = stack.get(object);
        if (stacked) {
          return stacked == other;
        }
        bitmask |= COMPARE_UNORDERED_FLAG$5;

        // Recursively compare objects (susceptible to call stack limits).
        stack.set(object, other);
        var result = _equalArrays$1(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
        stack['delete'](object);
        return result;

      case symbolTag$3:
        if (symbolValueOf$1) {
          return symbolValueOf$1.call(object) == symbolValueOf$1.call(other);
        }
    }
    return false;
  }

  var _equalByTag$1 = equalByTag$1;

  /**
   * Appends the elements of `values` to `array`.
   *
   * @private
   * @param {Array} array The array to modify.
   * @param {Array} values The values to append.
   * @returns {Array} Returns `array`.
   */
  function arrayPush$1(array, values) {
    var index = -1,
        length = values.length,
        offset = array.length;

    while (++index < length) {
      array[offset + index] = values[index];
    }
    return array;
  }

  var _arrayPush$1 = arrayPush$1;

  /**
   * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
   * `keysFunc` and `symbolsFunc` to get the enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @param {Function} symbolsFunc The function to get the symbols of `object`.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function baseGetAllKeys$1(object, keysFunc, symbolsFunc) {
    var result = keysFunc(object);
    return isArray_1$1(object) ? result : _arrayPush$1(result, symbolsFunc(object));
  }

  var _baseGetAllKeys$1 = baseGetAllKeys$1;

  /**
   * A specialized version of `_.filter` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {Array} Returns the new filtered array.
   */
  function arrayFilter$1(array, predicate) {
    var index = -1,
        length = array == null ? 0 : array.length,
        resIndex = 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (predicate(value, index, array)) {
        result[resIndex++] = value;
      }
    }
    return result;
  }

  var _arrayFilter$1 = arrayFilter$1;

  /**
   * This method returns a new empty array.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {Array} Returns the new empty array.
   * @example
   *
   * var arrays = _.times(2, _.stubArray);
   *
   * console.log(arrays);
   * // => [[], []]
   *
   * console.log(arrays[0] === arrays[1]);
   * // => false
   */
  function stubArray$1() {
    return [];
  }

  var stubArray_1$1 = stubArray$1;

  /** Used for built-in method references. */
  var objectProto$p = Object.prototype;

  /** Built-in value references. */
  var propertyIsEnumerable$3 = objectProto$p.propertyIsEnumerable;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols$1 = Object.getOwnPropertySymbols;

  /**
   * Creates an array of the own enumerable symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbols$1 = !nativeGetSymbols$1 ? stubArray_1$1 : function(object) {
    if (object == null) {
      return [];
    }
    object = Object(object);
    return _arrayFilter$1(nativeGetSymbols$1(object), function(symbol) {
      return propertyIsEnumerable$3.call(object, symbol);
    });
  };

  var _getSymbols$1 = getSymbols$1;

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */
  function baseTimes$1(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  var _baseTimes$1 = baseTimes$1;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$3 = 9007199254740991;

  /** Used to detect unsigned integer values. */
  var reIsUint$1 = /^(?:0|[1-9]\d*)$/;

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex$1(value, length) {
    var type = typeof value;
    length = length == null ? MAX_SAFE_INTEGER$3 : length;

    return !!length &&
      (type == 'number' ||
        (type != 'symbol' && reIsUint$1.test(value))) &&
          (value > -1 && value % 1 == 0 && value < length);
  }

  var _isIndex$1 = isIndex$1;

  /** Used for built-in method references. */
  var objectProto$q = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$l = objectProto$q.hasOwnProperty;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys$1(value, inherited) {
    var isArr = isArray_1$1(value),
        isArg = !isArr && isArguments_1$1(value),
        isBuff = !isArr && !isArg && isBuffer_1$1(value),
        isType = !isArr && !isArg && !isBuff && isTypedArray_1$1(value),
        skipIndexes = isArr || isArg || isBuff || isType,
        result = skipIndexes ? _baseTimes$1(value.length, String) : [],
        length = result.length;

    for (var key in value) {
      if ((inherited || hasOwnProperty$l.call(value, key)) &&
          !(skipIndexes && (
             // Safari 9 has enumerable `arguments.length` in strict mode.
             key == 'length' ||
             // Node.js 0.10 has enumerable non-index properties on buffers.
             (isBuff && (key == 'offset' || key == 'parent')) ||
             // PhantomJS 2 has enumerable non-index properties on typed arrays.
             (isType && (key == 'buffer' || key == 'byteLength' || key == 'byteOffset')) ||
             // Skip index properties.
             _isIndex$1(key, length)
          ))) {
        result.push(key);
      }
    }
    return result;
  }

  var _arrayLikeKeys$1 = arrayLikeKeys$1;

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys$1(object) {
    return isArrayLike_1$1(object) ? _arrayLikeKeys$1(object) : _baseKeys$1(object);
  }

  var keys_1$1 = keys$1;

  /**
   * Creates an array of own enumerable property names and symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeys$1(object) {
    return _baseGetAllKeys$1(object, keys_1$1, _getSymbols$1);
  }

  var _getAllKeys$1 = getAllKeys$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$8 = 1;

  /** Used for built-in method references. */
  var objectProto$r = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$m = objectProto$r.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqualDeep` for objects with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalObjects$1(object, other, bitmask, customizer, equalFunc, stack) {
    var isPartial = bitmask & COMPARE_PARTIAL_FLAG$8,
        objProps = _getAllKeys$1(object),
        objLength = objProps.length,
        othProps = _getAllKeys$1(other),
        othLength = othProps.length;

    if (objLength != othLength && !isPartial) {
      return false;
    }
    var index = objLength;
    while (index--) {
      var key = objProps[index];
      if (!(isPartial ? key in other : hasOwnProperty$m.call(other, key))) {
        return false;
      }
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(object);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var result = true;
    stack.set(object, other);
    stack.set(other, object);

    var skipCtor = isPartial;
    while (++index < objLength) {
      key = objProps[index];
      var objValue = object[key],
          othValue = other[key];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, objValue, key, other, object, stack)
          : customizer(objValue, othValue, key, object, other, stack);
      }
      // Recursively compare objects (susceptible to call stack limits).
      if (!(compared === undefined
            ? (objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack))
            : compared
          )) {
        result = false;
        break;
      }
      skipCtor || (skipCtor = key == 'constructor');
    }
    if (result && !skipCtor) {
      var objCtor = object.constructor,
          othCtor = other.constructor;

      // Non `Object` object instances with different constructors are not equal.
      if (objCtor != othCtor &&
          ('constructor' in object && 'constructor' in other) &&
          !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
            typeof othCtor == 'function' && othCtor instanceof othCtor)) {
        result = false;
      }
    }
    stack['delete'](object);
    stack['delete'](other);
    return result;
  }

  var _equalObjects$1 = equalObjects$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$9 = 1;

  /** `Object#toString` result references. */
  var argsTag$5 = '[object Arguments]',
      arrayTag$3 = '[object Array]',
      objectTag$6 = '[object Object]';

  /** Used for built-in method references. */
  var objectProto$s = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$n = objectProto$s.hasOwnProperty;

  /**
   * A specialized version of `baseIsEqual` for arrays and objects which performs
   * deep comparisons and tracks traversed objects enabling objects with circular
   * references to be compared.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {number} bitmask The bitmask flags. See `baseIsEqual` for more details.
   * @param {Function} customizer The function to customize comparisons.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Object} [stack] Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function baseIsEqualDeep$1(object, other, bitmask, customizer, equalFunc, stack) {
    var objIsArr = isArray_1$1(object),
        othIsArr = isArray_1$1(other),
        objTag = objIsArr ? arrayTag$3 : _getTag$1(object),
        othTag = othIsArr ? arrayTag$3 : _getTag$1(other);

    objTag = objTag == argsTag$5 ? objectTag$6 : objTag;
    othTag = othTag == argsTag$5 ? objectTag$6 : othTag;

    var objIsObj = objTag == objectTag$6,
        othIsObj = othTag == objectTag$6,
        isSameTag = objTag == othTag;

    if (isSameTag && isBuffer_1$1(object)) {
      if (!isBuffer_1$1(other)) {
        return false;
      }
      objIsArr = true;
      objIsObj = false;
    }
    if (isSameTag && !objIsObj) {
      stack || (stack = new _Stack$1);
      return (objIsArr || isTypedArray_1$1(object))
        ? _equalArrays$1(object, other, bitmask, customizer, equalFunc, stack)
        : _equalByTag$1(object, other, objTag, bitmask, customizer, equalFunc, stack);
    }
    if (!(bitmask & COMPARE_PARTIAL_FLAG$9)) {
      var objIsWrapped = objIsObj && hasOwnProperty$n.call(object, '__wrapped__'),
          othIsWrapped = othIsObj && hasOwnProperty$n.call(other, '__wrapped__');

      if (objIsWrapped || othIsWrapped) {
        var objUnwrapped = objIsWrapped ? object.value() : object,
            othUnwrapped = othIsWrapped ? other.value() : other;

        stack || (stack = new _Stack$1);
        return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
      }
    }
    if (!isSameTag) {
      return false;
    }
    stack || (stack = new _Stack$1);
    return _equalObjects$1(object, other, bitmask, customizer, equalFunc, stack);
  }

  var _baseIsEqualDeep$1 = baseIsEqualDeep$1;

  /**
   * The base implementation of `_.isEqual` which supports partial comparisons
   * and tracks traversed objects.
   *
   * @private
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @param {boolean} bitmask The bitmask flags.
   *  1 - Unordered comparison
   *  2 - Partial comparison
   * @param {Function} [customizer] The function to customize comparisons.
   * @param {Object} [stack] Tracks traversed `value` and `other` objects.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   */
  function baseIsEqual$1(value, other, bitmask, customizer, stack) {
    if (value === other) {
      return true;
    }
    if (value == null || other == null || (!isObjectLike_1$1(value) && !isObjectLike_1$1(other))) {
      return value !== value && other !== other;
    }
    return _baseIsEqualDeep$1(value, other, bitmask, customizer, baseIsEqual$1, stack);
  }

  var _baseIsEqual$1 = baseIsEqual$1;

  /**
   * Performs a deep comparison between two values to determine if they are
   * equivalent.
   *
   * **Note:** This method supports comparing arrays, array buffers, booleans,
   * date objects, error objects, maps, numbers, `Object` objects, regexes,
   * sets, strings, symbols, and typed arrays. `Object` objects are compared
   * by their own, not inherited, enumerable properties. Functions and DOM
   * nodes are compared by strict equality, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.isEqual(object, other);
   * // => true
   *
   * object === other;
   * // => false
   */
  function isEqual$1(value, other) {
    return _baseIsEqual$1(value, other);
  }

  var isEqual_1$1 = isEqual$1;

  var support = {
    searchParams: 'URLSearchParams' in self,
    iterable: 'Symbol' in self && 'iterator' in Symbol,
    blob:
      'FileReader' in self &&
      'Blob' in self &&
      (function() {
        try {
          new Blob();
          return true
        } catch (e) {
          return false
        }
      })(),
    formData: 'FormData' in self,
    arrayBuffer: 'ArrayBuffer' in self
  };

  function isDataView(obj) {
    return obj && DataView.prototype.isPrototypeOf(obj)
  }

  if (support.arrayBuffer) {
    var viewClasses = [
      '[object Int8Array]',
      '[object Uint8Array]',
      '[object Uint8ClampedArray]',
      '[object Int16Array]',
      '[object Uint16Array]',
      '[object Int32Array]',
      '[object Uint32Array]',
      '[object Float32Array]',
      '[object Float64Array]'
    ];

    var isArrayBufferView =
      ArrayBuffer.isView ||
      function(obj) {
        return obj && viewClasses.indexOf(Object.prototype.toString.call(obj)) > -1
      };
  }

  function normalizeName(name) {
    if (typeof name !== 'string') {
      name = String(name);
    }
    if (/[^a-z0-9\-#$%&'*+.^_`|~]/i.test(name)) {
      throw new TypeError('Invalid character in header field name')
    }
    return name.toLowerCase()
  }

  function normalizeValue(value) {
    if (typeof value !== 'string') {
      value = String(value);
    }
    return value
  }

  // Build a destructive iterator for the value list
  function iteratorFor(items) {
    var iterator = {
      next: function() {
        var value = items.shift();
        return {done: value === undefined, value: value}
      }
    };

    if (support.iterable) {
      iterator[Symbol.iterator] = function() {
        return iterator
      };
    }

    return iterator
  }

  function Headers(headers) {
    this.map = {};

    if (headers instanceof Headers) {
      headers.forEach(function(value, name) {
        this.append(name, value);
      }, this);
    } else if (Array.isArray(headers)) {
      headers.forEach(function(header) {
        this.append(header[0], header[1]);
      }, this);
    } else if (headers) {
      Object.getOwnPropertyNames(headers).forEach(function(name) {
        this.append(name, headers[name]);
      }, this);
    }
  }

  Headers.prototype.append = function(name, value) {
    name = normalizeName(name);
    value = normalizeValue(value);
    var oldValue = this.map[name];
    this.map[name] = oldValue ? oldValue + ', ' + value : value;
  };

  Headers.prototype['delete'] = function(name) {
    delete this.map[normalizeName(name)];
  };

  Headers.prototype.get = function(name) {
    name = normalizeName(name);
    return this.has(name) ? this.map[name] : null
  };

  Headers.prototype.has = function(name) {
    return this.map.hasOwnProperty(normalizeName(name))
  };

  Headers.prototype.set = function(name, value) {
    this.map[normalizeName(name)] = normalizeValue(value);
  };

  Headers.prototype.forEach = function(callback, thisArg) {
    for (var name in this.map) {
      if (this.map.hasOwnProperty(name)) {
        callback.call(thisArg, this.map[name], name, this);
      }
    }
  };

  Headers.prototype.keys = function() {
    var items = [];
    this.forEach(function(value, name) {
      items.push(name);
    });
    return iteratorFor(items)
  };

  Headers.prototype.values = function() {
    var items = [];
    this.forEach(function(value) {
      items.push(value);
    });
    return iteratorFor(items)
  };

  Headers.prototype.entries = function() {
    var items = [];
    this.forEach(function(value, name) {
      items.push([name, value]);
    });
    return iteratorFor(items)
  };

  if (support.iterable) {
    Headers.prototype[Symbol.iterator] = Headers.prototype.entries;
  }

  function consumed(body) {
    if (body.bodyUsed) {
      return Promise.reject(new TypeError('Already read'))
    }
    body.bodyUsed = true;
  }

  function fileReaderReady(reader) {
    return new Promise(function(resolve, reject) {
      reader.onload = function() {
        resolve(reader.result);
      };
      reader.onerror = function() {
        reject(reader.error);
      };
    })
  }

  function readBlobAsArrayBuffer(blob) {
    var reader = new FileReader();
    var promise = fileReaderReady(reader);
    reader.readAsArrayBuffer(blob);
    return promise
  }

  function readBlobAsText(blob) {
    var reader = new FileReader();
    var promise = fileReaderReady(reader);
    reader.readAsText(blob);
    return promise
  }

  function readArrayBufferAsText(buf) {
    var view = new Uint8Array(buf);
    var chars = new Array(view.length);

    for (var i = 0; i < view.length; i++) {
      chars[i] = String.fromCharCode(view[i]);
    }
    return chars.join('')
  }

  function bufferClone(buf) {
    if (buf.slice) {
      return buf.slice(0)
    } else {
      var view = new Uint8Array(buf.byteLength);
      view.set(new Uint8Array(buf));
      return view.buffer
    }
  }

  function Body() {
    this.bodyUsed = false;

    this._initBody = function(body) {
      this._bodyInit = body;
      if (!body) {
        this._bodyText = '';
      } else if (typeof body === 'string') {
        this._bodyText = body;
      } else if (support.blob && Blob.prototype.isPrototypeOf(body)) {
        this._bodyBlob = body;
      } else if (support.formData && FormData.prototype.isPrototypeOf(body)) {
        this._bodyFormData = body;
      } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
        this._bodyText = body.toString();
      } else if (support.arrayBuffer && support.blob && isDataView(body)) {
        this._bodyArrayBuffer = bufferClone(body.buffer);
        // IE 10-11 can't handle a DataView body.
        this._bodyInit = new Blob([this._bodyArrayBuffer]);
      } else if (support.arrayBuffer && (ArrayBuffer.prototype.isPrototypeOf(body) || isArrayBufferView(body))) {
        this._bodyArrayBuffer = bufferClone(body);
      } else {
        this._bodyText = body = Object.prototype.toString.call(body);
      }

      if (!this.headers.get('content-type')) {
        if (typeof body === 'string') {
          this.headers.set('content-type', 'text/plain;charset=UTF-8');
        } else if (this._bodyBlob && this._bodyBlob.type) {
          this.headers.set('content-type', this._bodyBlob.type);
        } else if (support.searchParams && URLSearchParams.prototype.isPrototypeOf(body)) {
          this.headers.set('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
        }
      }
    };

    if (support.blob) {
      this.blob = function() {
        var rejected = consumed(this);
        if (rejected) {
          return rejected
        }

        if (this._bodyBlob) {
          return Promise.resolve(this._bodyBlob)
        } else if (this._bodyArrayBuffer) {
          return Promise.resolve(new Blob([this._bodyArrayBuffer]))
        } else if (this._bodyFormData) {
          throw new Error('could not read FormData body as blob')
        } else {
          return Promise.resolve(new Blob([this._bodyText]))
        }
      };

      this.arrayBuffer = function() {
        if (this._bodyArrayBuffer) {
          return consumed(this) || Promise.resolve(this._bodyArrayBuffer)
        } else {
          return this.blob().then(readBlobAsArrayBuffer)
        }
      };
    }

    this.text = function() {
      var rejected = consumed(this);
      if (rejected) {
        return rejected
      }

      if (this._bodyBlob) {
        return readBlobAsText(this._bodyBlob)
      } else if (this._bodyArrayBuffer) {
        return Promise.resolve(readArrayBufferAsText(this._bodyArrayBuffer))
      } else if (this._bodyFormData) {
        throw new Error('could not read FormData body as text')
      } else {
        return Promise.resolve(this._bodyText)
      }
    };

    if (support.formData) {
      this.formData = function() {
        return this.text().then(decode)
      };
    }

    this.json = function() {
      return this.text().then(JSON.parse)
    };

    return this
  }

  // HTTP methods whose capitalization should be normalized
  var methods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'POST', 'PUT'];

  function normalizeMethod(method) {
    var upcased = method.toUpperCase();
    return methods.indexOf(upcased) > -1 ? upcased : method
  }

  function Request(input, options) {
    options = options || {};
    var body = options.body;

    if (input instanceof Request) {
      if (input.bodyUsed) {
        throw new TypeError('Already read')
      }
      this.url = input.url;
      this.credentials = input.credentials;
      if (!options.headers) {
        this.headers = new Headers(input.headers);
      }
      this.method = input.method;
      this.mode = input.mode;
      this.signal = input.signal;
      if (!body && input._bodyInit != null) {
        body = input._bodyInit;
        input.bodyUsed = true;
      }
    } else {
      this.url = String(input);
    }

    this.credentials = options.credentials || this.credentials || 'same-origin';
    if (options.headers || !this.headers) {
      this.headers = new Headers(options.headers);
    }
    this.method = normalizeMethod(options.method || this.method || 'GET');
    this.mode = options.mode || this.mode || null;
    this.signal = options.signal || this.signal;
    this.referrer = null;

    if ((this.method === 'GET' || this.method === 'HEAD') && body) {
      throw new TypeError('Body not allowed for GET or HEAD requests')
    }
    this._initBody(body);
  }

  Request.prototype.clone = function() {
    return new Request(this, {body: this._bodyInit})
  };

  function decode(body) {
    var form = new FormData();
    body
      .trim()
      .split('&')
      .forEach(function(bytes) {
        if (bytes) {
          var split = bytes.split('=');
          var name = split.shift().replace(/\+/g, ' ');
          var value = split.join('=').replace(/\+/g, ' ');
          form.append(decodeURIComponent(name), decodeURIComponent(value));
        }
      });
    return form
  }

  function parseHeaders(rawHeaders) {
    var headers = new Headers();
    // Replace instances of \r\n and \n followed by at least one space or horizontal tab with a space
    // https://tools.ietf.org/html/rfc7230#section-3.2
    var preProcessedHeaders = rawHeaders.replace(/\r?\n[\t ]+/g, ' ');
    preProcessedHeaders.split(/\r?\n/).forEach(function(line) {
      var parts = line.split(':');
      var key = parts.shift().trim();
      if (key) {
        var value = parts.join(':').trim();
        headers.append(key, value);
      }
    });
    return headers
  }

  Body.call(Request.prototype);

  function Response(bodyInit, options) {
    if (!options) {
      options = {};
    }

    this.type = 'default';
    this.status = options.status === undefined ? 200 : options.status;
    this.ok = this.status >= 200 && this.status < 300;
    this.statusText = 'statusText' in options ? options.statusText : 'OK';
    this.headers = new Headers(options.headers);
    this.url = options.url || '';
    this._initBody(bodyInit);
  }

  Body.call(Response.prototype);

  Response.prototype.clone = function() {
    return new Response(this._bodyInit, {
      status: this.status,
      statusText: this.statusText,
      headers: new Headers(this.headers),
      url: this.url
    })
  };

  Response.error = function() {
    var response = new Response(null, {status: 0, statusText: ''});
    response.type = 'error';
    return response
  };

  var redirectStatuses = [301, 302, 303, 307, 308];

  Response.redirect = function(url, status) {
    if (redirectStatuses.indexOf(status) === -1) {
      throw new RangeError('Invalid status code')
    }

    return new Response(null, {status: status, headers: {location: url}})
  };

  var DOMException = self.DOMException;
  try {
    new DOMException();
  } catch (err) {
    DOMException = function(message, name) {
      this.message = message;
      this.name = name;
      var error = Error(message);
      this.stack = error.stack;
    };
    DOMException.prototype = Object.create(Error.prototype);
    DOMException.prototype.constructor = DOMException;
  }

  function fetch$1(input, init) {
    return new Promise(function(resolve, reject) {
      var request = new Request(input, init);

      if (request.signal && request.signal.aborted) {
        return reject(new DOMException('Aborted', 'AbortError'))
      }

      var xhr = new XMLHttpRequest();

      function abortXhr() {
        xhr.abort();
      }

      xhr.onload = function() {
        var options = {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: parseHeaders(xhr.getAllResponseHeaders() || '')
        };
        options.url = 'responseURL' in xhr ? xhr.responseURL : options.headers.get('X-Request-URL');
        var body = 'response' in xhr ? xhr.response : xhr.responseText;
        resolve(new Response(body, options));
      };

      xhr.onerror = function() {
        reject(new TypeError('Network request failed'));
      };

      xhr.ontimeout = function() {
        reject(new TypeError('Network request failed'));
      };

      xhr.onabort = function() {
        reject(new DOMException('Aborted', 'AbortError'));
      };

      xhr.open(request.method, request.url, true);

      if (request.credentials === 'include') {
        xhr.withCredentials = true;
      } else if (request.credentials === 'omit') {
        xhr.withCredentials = false;
      }

      if ('responseType' in xhr && support.blob) {
        xhr.responseType = 'blob';
      }

      request.headers.forEach(function(value, name) {
        xhr.setRequestHeader(name, value);
      });

      if (request.signal) {
        request.signal.addEventListener('abort', abortXhr);

        xhr.onreadystatechange = function() {
          // DONE (success or failure)
          if (xhr.readyState === 4) {
            request.signal.removeEventListener('abort', abortXhr);
          }
        };
      }

      xhr.send(typeof request._bodyInit === 'undefined' ? null : request._bodyInit);
    })
  }

  fetch$1.polyfill = true;

  if (!self.fetch) {
    self.fetch = fetch$1;
    self.Headers = Headers;
    self.Request = Request;
    self.Response = Response;
  }

  // the whatwg-fetch polyfill installs the fetch() function
  // on the global object (window or self)
  //
  // Return that as the export for use in Webpack, Browserify etc.

  var fetchNpmBrowserify = self.fetch.bind(self);

  var strictUriEncode = function (str) {
  	return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
  		return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  	});
  };

  /*
  object-assign
  (c) Sindre Sorhus
  @license MIT
  */
  /* eslint-disable no-unused-vars */
  var getOwnPropertySymbols$1 = Object.getOwnPropertySymbols;
  var hasOwnProperty$o = Object.prototype.hasOwnProperty;
  var propIsEnumerable$1 = Object.prototype.propertyIsEnumerable;

  function toObject$1(val) {
  	if (val === null || val === undefined) {
  		throw new TypeError('Object.assign cannot be called with null or undefined');
  	}

  	return Object(val);
  }

  function shouldUseNative$1() {
  	try {
  		if (!Object.assign) {
  			return false;
  		}

  		// Detect buggy property enumeration order in older V8 versions.

  		// https://bugs.chromium.org/p/v8/issues/detail?id=4118
  		var test1 = new String('abc');  // eslint-disable-line no-new-wrappers
  		test1[5] = 'de';
  		if (Object.getOwnPropertyNames(test1)[0] === '5') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test2 = {};
  		for (var i = 0; i < 10; i++) {
  			test2['_' + String.fromCharCode(i)] = i;
  		}
  		var order2 = Object.getOwnPropertyNames(test2).map(function (n) {
  			return test2[n];
  		});
  		if (order2.join('') !== '0123456789') {
  			return false;
  		}

  		// https://bugs.chromium.org/p/v8/issues/detail?id=3056
  		var test3 = {};
  		'abcdefghijklmnopqrst'.split('').forEach(function (letter) {
  			test3[letter] = letter;
  		});
  		if (Object.keys(Object.assign({}, test3)).join('') !==
  				'abcdefghijklmnopqrst') {
  			return false;
  		}

  		return true;
  	} catch (err) {
  		// We don't expect any of the above to throw, but better to be safe.
  		return false;
  	}
  }

  var objectAssign$1 = shouldUseNative$1() ? Object.assign : function (target, source) {
  	var from;
  	var to = toObject$1(target);
  	var symbols;

  	for (var s = 1; s < arguments.length; s++) {
  		from = Object(arguments[s]);

  		for (var key in from) {
  			if (hasOwnProperty$o.call(from, key)) {
  				to[key] = from[key];
  			}
  		}

  		if (getOwnPropertySymbols$1) {
  			symbols = getOwnPropertySymbols$1(from);
  			for (var i = 0; i < symbols.length; i++) {
  				if (propIsEnumerable$1.call(from, symbols[i])) {
  					to[symbols[i]] = from[symbols[i]];
  				}
  			}
  		}
  	}

  	return to;
  };

  var token = '%[a-f0-9]{2}';
  var singleMatcher = new RegExp(token, 'gi');
  var multiMatcher = new RegExp('(' + token + ')+', 'gi');

  function decodeComponents(components, split) {
  	try {
  		// Try to decode the entire string first
  		return decodeURIComponent(components.join(''));
  	} catch (err) {
  		// Do nothing
  	}

  	if (components.length === 1) {
  		return components;
  	}

  	split = split || 1;

  	// Split the array in 2 parts
  	var left = components.slice(0, split);
  	var right = components.slice(split);

  	return Array.prototype.concat.call([], decodeComponents(left), decodeComponents(right));
  }

  function decode$1(input) {
  	try {
  		return decodeURIComponent(input);
  	} catch (err) {
  		var tokens = input.match(singleMatcher);

  		for (var i = 1; i < tokens.length; i++) {
  			input = decodeComponents(tokens, i).join('');

  			tokens = input.match(singleMatcher);
  		}

  		return input;
  	}
  }

  function customDecodeURIComponent(input) {
  	// Keep track of all the replacements and prefill the map with the `BOM`
  	var replaceMap = {
  		'%FE%FF': '\uFFFD\uFFFD',
  		'%FF%FE': '\uFFFD\uFFFD'
  	};

  	var match = multiMatcher.exec(input);
  	while (match) {
  		try {
  			// Decode as big chunks as possible
  			replaceMap[match[0]] = decodeURIComponent(match[0]);
  		} catch (err) {
  			var result = decode$1(match[0]);

  			if (result !== match[0]) {
  				replaceMap[match[0]] = result;
  			}
  		}

  		match = multiMatcher.exec(input);
  	}

  	// Add `%C2` at the end of the map to make sure it does not replace the combinator before everything else
  	replaceMap['%C2'] = '\uFFFD';

  	var entries = Object.keys(replaceMap);

  	for (var i = 0; i < entries.length; i++) {
  		// Replace all decoded components
  		var key = entries[i];
  		input = input.replace(new RegExp(key, 'g'), replaceMap[key]);
  	}

  	return input;
  }

  var decodeUriComponent = function (encodedURI) {
  	if (typeof encodedURI !== 'string') {
  		throw new TypeError('Expected `encodedURI` to be of type `string`, got `' + typeof encodedURI + '`');
  	}

  	try {
  		encodedURI = encodedURI.replace(/\+/g, ' ');

  		// Try the built in decoder first
  		return decodeURIComponent(encodedURI);
  	} catch (err) {
  		// Fallback to a more advanced decoder
  		return customDecodeURIComponent(encodedURI);
  	}
  };

  function encoderForArrayFormat(opts) {
  	switch (opts.arrayFormat) {
  		case 'index':
  			return function (key, value, index) {
  				return value === null ? [
  					encode(key, opts),
  					'[',
  					index,
  					']'
  				].join('') : [
  					encode(key, opts),
  					'[',
  					encode(index, opts),
  					']=',
  					encode(value, opts)
  				].join('');
  			};

  		case 'bracket':
  			return function (key, value) {
  				return value === null ? encode(key, opts) : [
  					encode(key, opts),
  					'[]=',
  					encode(value, opts)
  				].join('');
  			};

  		default:
  			return function (key, value) {
  				return value === null ? encode(key, opts) : [
  					encode(key, opts),
  					'=',
  					encode(value, opts)
  				].join('');
  			};
  	}
  }

  function parserForArrayFormat(opts) {
  	var result;

  	switch (opts.arrayFormat) {
  		case 'index':
  			return function (key, value, accumulator) {
  				result = /\[(\d*)\]$/.exec(key);

  				key = key.replace(/\[\d*\]$/, '');

  				if (!result) {
  					accumulator[key] = value;
  					return;
  				}

  				if (accumulator[key] === undefined) {
  					accumulator[key] = {};
  				}

  				accumulator[key][result[1]] = value;
  			};

  		case 'bracket':
  			return function (key, value, accumulator) {
  				result = /(\[\])$/.exec(key);
  				key = key.replace(/\[\]$/, '');

  				if (!result) {
  					accumulator[key] = value;
  					return;
  				} else if (accumulator[key] === undefined) {
  					accumulator[key] = [value];
  					return;
  				}

  				accumulator[key] = [].concat(accumulator[key], value);
  			};

  		default:
  			return function (key, value, accumulator) {
  				if (accumulator[key] === undefined) {
  					accumulator[key] = value;
  					return;
  				}

  				accumulator[key] = [].concat(accumulator[key], value);
  			};
  	}
  }

  function encode(value, opts) {
  	if (opts.encode) {
  		return opts.strict ? strictUriEncode(value) : encodeURIComponent(value);
  	}

  	return value;
  }

  function keysSorter(input) {
  	if (Array.isArray(input)) {
  		return input.sort();
  	} else if (typeof input === 'object') {
  		return keysSorter(Object.keys(input)).sort(function (a, b) {
  			return Number(a) - Number(b);
  		}).map(function (key) {
  			return input[key];
  		});
  	}

  	return input;
  }

  var extract = function (str) {
  	return str.split('?')[1] || '';
  };

  var parse = function (str, opts) {
  	opts = objectAssign$1({arrayFormat: 'none'}, opts);

  	var formatter = parserForArrayFormat(opts);

  	// Create an object with no prototype
  	// https://github.com/sindresorhus/query-string/issues/47
  	var ret = Object.create(null);

  	if (typeof str !== 'string') {
  		return ret;
  	}

  	str = str.trim().replace(/^(\?|#|&)/, '');

  	if (!str) {
  		return ret;
  	}

  	str.split('&').forEach(function (param) {
  		var parts = param.replace(/\+/g, ' ').split('=');
  		// Firefox (pre 40) decodes `%3D` to `=`
  		// https://github.com/sindresorhus/query-string/pull/37
  		var key = parts.shift();
  		var val = parts.length > 0 ? parts.join('=') : undefined;

  		// missing `=` should be `null`:
  		// http://w3.org/TR/2012/WD-url-20120524/#collect-url-parameters
  		val = val === undefined ? null : decodeUriComponent(val);

  		formatter(decodeUriComponent(key), val, ret);
  	});

  	return Object.keys(ret).sort().reduce(function (result, key) {
  		var val = ret[key];
  		if (Boolean(val) && typeof val === 'object' && !Array.isArray(val)) {
  			// Sort object keys, not values
  			result[key] = keysSorter(val);
  		} else {
  			result[key] = val;
  		}

  		return result;
  	}, Object.create(null));
  };

  var stringify = function (obj, opts) {
  	var defaults = {
  		encode: true,
  		strict: true,
  		arrayFormat: 'none'
  	};

  	opts = objectAssign$1(defaults, opts);

  	var formatter = encoderForArrayFormat(opts);

  	return obj ? Object.keys(obj).sort().map(function (key) {
  		var val = obj[key];

  		if (val === undefined) {
  			return '';
  		}

  		if (val === null) {
  			return encode(key, opts);
  		}

  		if (Array.isArray(val)) {
  			var result = [];

  			val.slice().forEach(function (val2) {
  				if (val2 === undefined) {
  					return;
  				}

  				result.push(formatter(key, val2, result.length));
  			});

  			return result.join('&');
  		}

  		return encode(key, opts) + '=' + encode(val, opts);
  	}).filter(function (x) {
  		return x.length > 0;
  	}).join('&') : '';
  };

  var queryString = {
  	extract: extract,
  	parse: parse,
  	stringify: stringify
  };

  /**
   * A faster alternative to `Function#apply`, this function invokes `func`
   * with the `this` binding of `thisArg` and the arguments of `args`.
   *
   * @private
   * @param {Function} func The function to invoke.
   * @param {*} thisArg The `this` binding of `func`.
   * @param {Array} args The arguments to invoke `func` with.
   * @returns {*} Returns the result of `func`.
   */
  function apply$1(func, thisArg, args) {
    switch (args.length) {
      case 0: return func.call(thisArg);
      case 1: return func.call(thisArg, args[0]);
      case 2: return func.call(thisArg, args[0], args[1]);
      case 3: return func.call(thisArg, args[0], args[1], args[2]);
    }
    return func.apply(thisArg, args);
  }

  var _apply$1 = apply$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$a = 1,
      COMPARE_UNORDERED_FLAG$6 = 2;

  /**
   * The base implementation of `_.isMatch` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to inspect.
   * @param {Object} source The object of property values to match.
   * @param {Array} matchData The property names, values, and compare flags to match.
   * @param {Function} [customizer] The function to customize comparisons.
   * @returns {boolean} Returns `true` if `object` is a match, else `false`.
   */
  function baseIsMatch$1(object, source, matchData, customizer) {
    var index = matchData.length,
        length = index,
        noCustomizer = !customizer;

    if (object == null) {
      return !length;
    }
    object = Object(object);
    while (index--) {
      var data = matchData[index];
      if ((noCustomizer && data[2])
            ? data[1] !== object[data[0]]
            : !(data[0] in object)
          ) {
        return false;
      }
    }
    while (++index < length) {
      data = matchData[index];
      var key = data[0],
          objValue = object[key],
          srcValue = data[1];

      if (noCustomizer && data[2]) {
        if (objValue === undefined && !(key in object)) {
          return false;
        }
      } else {
        var stack = new _Stack$1;
        if (customizer) {
          var result = customizer(objValue, srcValue, key, object, source, stack);
        }
        if (!(result === undefined
              ? _baseIsEqual$1(srcValue, objValue, COMPARE_PARTIAL_FLAG$a | COMPARE_UNORDERED_FLAG$6, customizer, stack)
              : result
            )) {
          return false;
        }
      }
    }
    return true;
  }

  var _baseIsMatch$1 = baseIsMatch$1;

  /**
   * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` if suitable for strict
   *  equality comparisons, else `false`.
   */
  function isStrictComparable$1(value) {
    return value === value && !isObject_1$1(value);
  }

  var _isStrictComparable$1 = isStrictComparable$1;

  /**
   * Gets the property names, values, and compare flags of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the match data of `object`.
   */
  function getMatchData$1(object) {
    var result = keys_1$1(object),
        length = result.length;

    while (length--) {
      var key = result[length],
          value = object[key];

      result[length] = [key, value, _isStrictComparable$1(value)];
    }
    return result;
  }

  var _getMatchData$1 = getMatchData$1;

  /**
   * A specialized version of `matchesProperty` for source values suitable
   * for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function matchesStrictComparable$1(key, srcValue) {
    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === srcValue &&
        (srcValue !== undefined || (key in Object(object)));
    };
  }

  var _matchesStrictComparable$1 = matchesStrictComparable$1;

  /**
   * The base implementation of `_.matches` which doesn't clone `source`.
   *
   * @private
   * @param {Object} source The object of property values to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatches$1(source) {
    var matchData = _getMatchData$1(source);
    if (matchData.length == 1 && matchData[0][2]) {
      return _matchesStrictComparable$1(matchData[0][0], matchData[0][1]);
    }
    return function(object) {
      return object === source || _baseIsMatch$1(object, source, matchData);
    };
  }

  var _baseMatches$1 = baseMatches$1;

  /**
   * The base implementation of `_.hasIn` without support for deep paths.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {Array|string} key The key to check.
   * @returns {boolean} Returns `true` if `key` exists, else `false`.
   */
  function baseHasIn$1(object, key) {
    return object != null && key in Object(object);
  }

  var _baseHasIn$1 = baseHasIn$1;

  /**
   * Checks if `path` exists on `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @param {Function} hasFunc The function to check properties.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   */
  function hasPath$1(object, path, hasFunc) {
    path = _castPath$1(path, object);

    var index = -1,
        length = path.length,
        result = false;

    while (++index < length) {
      var key = _toKey$1(path[index]);
      if (!(result = object != null && hasFunc(object, key))) {
        break;
      }
      object = object[key];
    }
    if (result || ++index != length) {
      return result;
    }
    length = object == null ? 0 : object.length;
    return !!length && isLength_1$1(length) && _isIndex$1(key, length) &&
      (isArray_1$1(object) || isArguments_1$1(object));
  }

  var _hasPath$1 = hasPath$1;

  /**
   * Checks if `path` is a direct or inherited property of `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   * @example
   *
   * var object = _.create({ 'a': _.create({ 'b': 2 }) });
   *
   * _.hasIn(object, 'a');
   * // => true
   *
   * _.hasIn(object, 'a.b');
   * // => true
   *
   * _.hasIn(object, ['a', 'b']);
   * // => true
   *
   * _.hasIn(object, 'b');
   * // => false
   */
  function hasIn$1(object, path) {
    return object != null && _hasPath$1(object, path, _baseHasIn$1);
  }

  var hasIn_1$1 = hasIn$1;

  /** Used to compose bitmasks for value comparisons. */
  var COMPARE_PARTIAL_FLAG$b = 1,
      COMPARE_UNORDERED_FLAG$7 = 2;

  /**
   * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
   *
   * @private
   * @param {string} path The path of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatchesProperty$1(path, srcValue) {
    if (_isKey$1(path) && _isStrictComparable$1(srcValue)) {
      return _matchesStrictComparable$1(_toKey$1(path), srcValue);
    }
    return function(object) {
      var objValue = get_1$1(object, path);
      return (objValue === undefined && objValue === srcValue)
        ? hasIn_1$1(object, path)
        : _baseIsEqual$1(srcValue, objValue, COMPARE_PARTIAL_FLAG$b | COMPARE_UNORDERED_FLAG$7);
    };
  }

  var _baseMatchesProperty$1 = baseMatchesProperty$1;

  /**
   * This method returns the first argument it receives.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {*} value Any value.
   * @returns {*} Returns `value`.
   * @example
   *
   * var object = { 'a': 1 };
   *
   * console.log(_.identity(object) === object);
   * // => true
   */
  function identity$1(value) {
    return value;
  }

  var identity_1$1 = identity$1;

  /**
   * The base implementation of `_.property` without support for deep paths.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function baseProperty$1(key) {
    return function(object) {
      return object == null ? undefined : object[key];
    };
  }

  var _baseProperty$1 = baseProperty$1;

  /**
   * A specialized version of `baseProperty` which supports deep paths.
   *
   * @private
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function basePropertyDeep$1(path) {
    return function(object) {
      return _baseGet$1(object, path);
    };
  }

  var _basePropertyDeep$1 = basePropertyDeep$1;

  /**
   * Creates a function that returns the value at `path` of a given object.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   * @example
   *
   * var objects = [
   *   { 'a': { 'b': 2 } },
   *   { 'a': { 'b': 1 } }
   * ];
   *
   * _.map(objects, _.property('a.b'));
   * // => [2, 1]
   *
   * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
   * // => [1, 2]
   */
  function property$2(path) {
    return _isKey$1(path) ? _baseProperty$1(_toKey$1(path)) : _basePropertyDeep$1(path);
  }

  var property_1$1 = property$2;

  /**
   * The base implementation of `_.iteratee`.
   *
   * @private
   * @param {*} [value=_.identity] The value to convert to an iteratee.
   * @returns {Function} Returns the iteratee.
   */
  function baseIteratee$1(value) {
    // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
    // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
    if (typeof value == 'function') {
      return value;
    }
    if (value == null) {
      return identity_1$1;
    }
    if (typeof value == 'object') {
      return isArray_1$1(value)
        ? _baseMatchesProperty$1(value[0], value[1])
        : _baseMatches$1(value);
    }
    return property_1$1(value);
  }

  var _baseIteratee$1 = baseIteratee$1;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeMax$2 = Math.max;

  /**
   * A specialized version of `baseRest` which transforms the rest array.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @param {Function} transform The rest array transform.
   * @returns {Function} Returns the new function.
   */
  function overRest$1(func, start, transform) {
    start = nativeMax$2(start === undefined ? (func.length - 1) : start, 0);
    return function() {
      var args = arguments,
          index = -1,
          length = nativeMax$2(args.length - start, 0),
          array = Array(length);

      while (++index < length) {
        array[index] = args[start + index];
      }
      index = -1;
      var otherArgs = Array(start + 1);
      while (++index < start) {
        otherArgs[index] = args[index];
      }
      otherArgs[start] = transform(array);
      return _apply$1(func, this, otherArgs);
    };
  }

  var _overRest$1 = overRest$1;

  /**
   * Creates a function that returns `value`.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {*} value The value to return from the new function.
   * @returns {Function} Returns the new constant function.
   * @example
   *
   * var objects = _.times(2, _.constant({ 'a': 1 }));
   *
   * console.log(objects);
   * // => [{ 'a': 1 }, { 'a': 1 }]
   *
   * console.log(objects[0] === objects[1]);
   * // => true
   */
  function constant$1(value) {
    return function() {
      return value;
    };
  }

  var constant_1$1 = constant$1;

  var defineProperty$2 = (function() {
    try {
      var func = _getNative$1(Object, 'defineProperty');
      func({}, '', {});
      return func;
    } catch (e) {}
  }());

  var _defineProperty$2 = defineProperty$2;

  /**
   * The base implementation of `setToString` without support for hot loop shorting.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var baseSetToString$1 = !_defineProperty$2 ? identity_1$1 : function(func, string) {
    return _defineProperty$2(func, 'toString', {
      'configurable': true,
      'enumerable': false,
      'value': constant_1$1(string),
      'writable': true
    });
  };

  var _baseSetToString$1 = baseSetToString$1;

  /** Used to detect hot functions by number of calls within a span of milliseconds. */
  var HOT_COUNT$1 = 800,
      HOT_SPAN$1 = 16;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeNow$1 = Date.now;

  /**
   * Creates a function that'll short out and invoke `identity` instead
   * of `func` when it's called `HOT_COUNT` or more times in `HOT_SPAN`
   * milliseconds.
   *
   * @private
   * @param {Function} func The function to restrict.
   * @returns {Function} Returns the new shortable function.
   */
  function shortOut$1(func) {
    var count = 0,
        lastCalled = 0;

    return function() {
      var stamp = nativeNow$1(),
          remaining = HOT_SPAN$1 - (stamp - lastCalled);

      lastCalled = stamp;
      if (remaining > 0) {
        if (++count >= HOT_COUNT$1) {
          return arguments[0];
        }
      } else {
        count = 0;
      }
      return func.apply(undefined, arguments);
    };
  }

  var _shortOut$1 = shortOut$1;

  /**
   * Sets the `toString` method of `func` to return `string`.
   *
   * @private
   * @param {Function} func The function to modify.
   * @param {Function} string The `toString` result.
   * @returns {Function} Returns `func`.
   */
  var setToString$1 = _shortOut$1(_baseSetToString$1);

  var _setToString$1 = setToString$1;

  /**
   * The base implementation of `_.rest` which doesn't validate or coerce arguments.
   *
   * @private
   * @param {Function} func The function to apply a rest parameter to.
   * @param {number} [start=func.length-1] The start position of the rest parameter.
   * @returns {Function} Returns the new function.
   */
  function baseRest$1(func, start) {
    return _setToString$1(_overRest$1(func, start, identity_1$1), func + '');
  }

  var _baseRest$1 = baseRest$1;

  /** Error message constants. */
  var FUNC_ERROR_TEXT$3 = 'Expected a function';

  /**
   * Creates a function that iterates over `pairs` and invokes the corresponding
   * function of the first predicate to return truthy. The predicate-function
   * pairs are invoked with the `this` binding and arguments of the created
   * function.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Util
   * @param {Array} pairs The predicate-function pairs.
   * @returns {Function} Returns the new composite function.
   * @example
   *
   * var func = _.cond([
   *   [_.matches({ 'a': 1 }),           _.constant('matches A')],
   *   [_.conforms({ 'b': _.isNumber }), _.constant('matches B')],
   *   [_.stubTrue,                      _.constant('no match')]
   * ]);
   *
   * func({ 'a': 1, 'b': 2 });
   * // => 'matches A'
   *
   * func({ 'a': 0, 'b': 1 });
   * // => 'matches B'
   *
   * func({ 'a': '1', 'b': '2' });
   * // => 'no match'
   */
  function cond$1(pairs) {
    var length = pairs == null ? 0 : pairs.length,
        toIteratee = _baseIteratee$1;

    pairs = !length ? [] : _arrayMap$1(pairs, function(pair) {
      if (typeof pair[1] != 'function') {
        throw new TypeError(FUNC_ERROR_TEXT$3);
      }
      return [toIteratee(pair[0]), pair[1]];
    });

    return _baseRest$1(function(args) {
      var index = -1;
      while (++index < length) {
        var pair = pairs[index];
        if (_apply$1(pair[0], this, args)) {
          return _apply$1(pair[1], this, args);
        }
      }
    });
  }

  var cond_1$1 = cond$1;

  /**
   * This method returns `true`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `true`.
   * @example
   *
   * _.times(2, _.stubTrue);
   * // => [true, true]
   */
  function stubTrue$1() {
    return true;
  }

  var stubTrue_1$1 = stubTrue$1;

  function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);
    if (Object.getOwnPropertySymbols) {
      var symbols = Object.getOwnPropertySymbols(object);
      enumerableOnly && (symbols = symbols.filter(function (sym) {
        return Object.getOwnPropertyDescriptor(object, sym).enumerable;
      })), keys.push.apply(keys, symbols);
    }
    return keys;
  }
  function _objectSpread2(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = null != arguments[i] ? arguments[i] : {};
      i % 2 ? ownKeys(Object(source), !0).forEach(function (key) {
        _defineProperty$3(target, key, source[key]);
      }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) {
        Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
      });
    }
    return target;
  }
  function _regeneratorRuntime() {
    _regeneratorRuntime = function () {
      return exports;
    };
    var exports = {},
      Op = Object.prototype,
      hasOwn = Op.hasOwnProperty,
      defineProperty = Object.defineProperty || function (obj, key, desc) {
        obj[key] = desc.value;
      },
      $Symbol = "function" == typeof Symbol ? Symbol : {},
      iteratorSymbol = $Symbol.iterator || "@@iterator",
      asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator",
      toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";
    function define(obj, key, value) {
      return Object.defineProperty(obj, key, {
        value: value,
        enumerable: !0,
        configurable: !0,
        writable: !0
      }), obj[key];
    }
    try {
      define({}, "");
    } catch (err) {
      define = function (obj, key, value) {
        return obj[key] = value;
      };
    }
    function wrap(innerFn, outerFn, self, tryLocsList) {
      var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator,
        generator = Object.create(protoGenerator.prototype),
        context = new Context(tryLocsList || []);
      return defineProperty(generator, "_invoke", {
        value: makeInvokeMethod(innerFn, self, context)
      }), generator;
    }
    function tryCatch(fn, obj, arg) {
      try {
        return {
          type: "normal",
          arg: fn.call(obj, arg)
        };
      } catch (err) {
        return {
          type: "throw",
          arg: err
        };
      }
    }
    exports.wrap = wrap;
    var ContinueSentinel = {};
    function Generator() {}
    function GeneratorFunction() {}
    function GeneratorFunctionPrototype() {}
    var IteratorPrototype = {};
    define(IteratorPrototype, iteratorSymbol, function () {
      return this;
    });
    var getProto = Object.getPrototypeOf,
      NativeIteratorPrototype = getProto && getProto(getProto(values([])));
    NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype);
    var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype);
    function defineIteratorMethods(prototype) {
      ["next", "throw", "return"].forEach(function (method) {
        define(prototype, method, function (arg) {
          return this._invoke(method, arg);
        });
      });
    }
    function AsyncIterator(generator, PromiseImpl) {
      function invoke(method, arg, resolve, reject) {
        var record = tryCatch(generator[method], generator, arg);
        if ("throw" !== record.type) {
          var result = record.arg,
            value = result.value;
          return value && "object" == typeof value && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) {
            invoke("next", value, resolve, reject);
          }, function (err) {
            invoke("throw", err, resolve, reject);
          }) : PromiseImpl.resolve(value).then(function (unwrapped) {
            result.value = unwrapped, resolve(result);
          }, function (error) {
            return invoke("throw", error, resolve, reject);
          });
        }
        reject(record.arg);
      }
      var previousPromise;
      defineProperty(this, "_invoke", {
        value: function (method, arg) {
          function callInvokeWithMethodAndArg() {
            return new PromiseImpl(function (resolve, reject) {
              invoke(method, arg, resolve, reject);
            });
          }
          return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg();
        }
      });
    }
    function makeInvokeMethod(innerFn, self, context) {
      var state = "suspendedStart";
      return function (method, arg) {
        if ("executing" === state) throw new Error("Generator is already running");
        if ("completed" === state) {
          if ("throw" === method) throw arg;
          return doneResult();
        }
        for (context.method = method, context.arg = arg;;) {
          var delegate = context.delegate;
          if (delegate) {
            var delegateResult = maybeInvokeDelegate(delegate, context);
            if (delegateResult) {
              if (delegateResult === ContinueSentinel) continue;
              return delegateResult;
            }
          }
          if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) {
            if ("suspendedStart" === state) throw state = "completed", context.arg;
            context.dispatchException(context.arg);
          } else "return" === context.method && context.abrupt("return", context.arg);
          state = "executing";
          var record = tryCatch(innerFn, self, context);
          if ("normal" === record.type) {
            if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue;
            return {
              value: record.arg,
              done: context.done
            };
          }
          "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg);
        }
      };
    }
    function maybeInvokeDelegate(delegate, context) {
      var methodName = context.method,
        method = delegate.iterator[methodName];
      if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel;
      var record = tryCatch(method, delegate.iterator, context.arg);
      if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel;
      var info = record.arg;
      return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel);
    }
    function pushTryEntry(locs) {
      var entry = {
        tryLoc: locs[0]
      };
      1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry);
    }
    function resetTryEntry(entry) {
      var record = entry.completion || {};
      record.type = "normal", delete record.arg, entry.completion = record;
    }
    function Context(tryLocsList) {
      this.tryEntries = [{
        tryLoc: "root"
      }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0);
    }
    function values(iterable) {
      if (iterable) {
        var iteratorMethod = iterable[iteratorSymbol];
        if (iteratorMethod) return iteratorMethod.call(iterable);
        if ("function" == typeof iterable.next) return iterable;
        if (!isNaN(iterable.length)) {
          var i = -1,
            next = function next() {
              for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next;
              return next.value = undefined, next.done = !0, next;
            };
          return next.next = next;
        }
      }
      return {
        next: doneResult
      };
    }
    function doneResult() {
      return {
        value: undefined,
        done: !0
      };
    }
    return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", {
      value: GeneratorFunctionPrototype,
      configurable: !0
    }), defineProperty(GeneratorFunctionPrototype, "constructor", {
      value: GeneratorFunction,
      configurable: !0
    }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) {
      var ctor = "function" == typeof genFun && genFun.constructor;
      return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name));
    }, exports.mark = function (genFun) {
      return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun;
    }, exports.awrap = function (arg) {
      return {
        __await: arg
      };
    }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () {
      return this;
    }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) {
      void 0 === PromiseImpl && (PromiseImpl = Promise);
      var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl);
      return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) {
        return result.done ? result.value : iter.next();
      });
    }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () {
      return this;
    }), define(Gp, "toString", function () {
      return "[object Generator]";
    }), exports.keys = function (val) {
      var object = Object(val),
        keys = [];
      for (var key in object) keys.push(key);
      return keys.reverse(), function next() {
        for (; keys.length;) {
          var key = keys.pop();
          if (key in object) return next.value = key, next.done = !1, next;
        }
        return next.done = !0, next;
      };
    }, exports.values = values, Context.prototype = {
      constructor: Context,
      reset: function (skipTempReset) {
        if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined);
      },
      stop: function () {
        this.done = !0;
        var rootRecord = this.tryEntries[0].completion;
        if ("throw" === rootRecord.type) throw rootRecord.arg;
        return this.rval;
      },
      dispatchException: function (exception) {
        if (this.done) throw exception;
        var context = this;
        function handle(loc, caught) {
          return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught;
        }
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i],
            record = entry.completion;
          if ("root" === entry.tryLoc) return handle("end");
          if (entry.tryLoc <= this.prev) {
            var hasCatch = hasOwn.call(entry, "catchLoc"),
              hasFinally = hasOwn.call(entry, "finallyLoc");
            if (hasCatch && hasFinally) {
              if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
              if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
            } else if (hasCatch) {
              if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0);
            } else {
              if (!hasFinally) throw new Error("try statement without catch or finally");
              if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc);
            }
          }
        }
      },
      abrupt: function (type, arg) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) {
            var finallyEntry = entry;
            break;
          }
        }
        finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null);
        var record = finallyEntry ? finallyEntry.completion : {};
        return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record);
      },
      complete: function (record, afterLoc) {
        if ("throw" === record.type) throw record.arg;
        return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel;
      },
      finish: function (finallyLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel;
        }
      },
      catch: function (tryLoc) {
        for (var i = this.tryEntries.length - 1; i >= 0; --i) {
          var entry = this.tryEntries[i];
          if (entry.tryLoc === tryLoc) {
            var record = entry.completion;
            if ("throw" === record.type) {
              var thrown = record.arg;
              resetTryEntry(entry);
            }
            return thrown;
          }
        }
        throw new Error("illegal catch attempt");
      },
      delegateYield: function (iterable, resultName, nextLoc) {
        return this.delegate = {
          iterator: values(iterable),
          resultName: resultName,
          nextLoc: nextLoc
        }, "next" === this.method && (this.arg = undefined), ContinueSentinel;
      }
    }, exports;
  }
  function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
      var info = gen[key](arg);
      var value = info.value;
    } catch (error) {
      reject(error);
      return;
    }
    if (info.done) {
      resolve(value);
    } else {
      Promise.resolve(value).then(_next, _throw);
    }
  }
  function _asyncToGenerator(fn) {
    return function () {
      var self = this,
        args = arguments;
      return new Promise(function (resolve, reject) {
        var gen = fn.apply(self, args);
        function _next(value) {
          asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
        }
        function _throw(err) {
          asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
        }
        _next(undefined);
      });
    };
  }
  function _defineProperty$3(obj, key, value) {
    key = _toPropertyKey(key);
    if (key in obj) {
      Object.defineProperty(obj, key, {
        value: value,
        enumerable: true,
        configurable: true,
        writable: true
      });
    } else {
      obj[key] = value;
    }
    return obj;
  }
  function _toPrimitive(input, hint) {
    if (typeof input !== "object" || input === null) return input;
    var prim = input[Symbol.toPrimitive];
    if (prim !== undefined) {
      var res = prim.call(input, hint || "default");
      if (typeof res !== "object") return res;
      throw new TypeError("@@toPrimitive must return a primitive value.");
    }
    return (hint === "string" ? String : Number)(input);
  }
  function _toPropertyKey(arg) {
    var key = _toPrimitive(arg, "string");
    return typeof key === "symbol" ? key : String(key);
  }
  var commonjsGlobal$1 = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};
  function createCommonjsModule$1(fn, module) {
    return module = {
      exports: {}
    }, fn(module, module.exports), module.exports;
  }
  var axios = createCommonjsModule$1(function (module, exports) {
    /* axios v0.19.2 | (c) 2020 by Matt Zabriskie */
    (function webpackUniversalModuleDefinition(root, factory) {
      module.exports = factory();
    })(commonjsGlobal$1, function () {
      return /******/function (modules) {
        // webpackBootstrap
        /******/ // The module cache
        /******/
        var installedModules = {};
        /******/
        /******/ // The require function
        /******/
        function __webpack_require__(moduleId) {
          /******/
          /******/ // Check if module is in cache
          /******/if (installedModules[moduleId]) /******/return installedModules[moduleId].exports;
          /******/
          /******/ // Create a new module (and put it into the cache)
          /******/
          var module = installedModules[moduleId] = {
            /******/exports: {},
            /******/id: moduleId,
            /******/loaded: false
            /******/
          };
          /******/
          /******/ // Execute the module function
          /******/
          modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
          /******/
          /******/ // Flag the module as loaded
          /******/
          module.loaded = true;
          /******/
          /******/ // Return the exports of the module
          /******/
          return module.exports;
          /******/
        }
        /******/
        /******/
        /******/ // expose the modules object (__webpack_modules__)
        /******/
        __webpack_require__.m = modules;
        /******/
        /******/ // expose the module cache
        /******/
        __webpack_require__.c = installedModules;
        /******/
        /******/ // __webpack_public_path__
        /******/
        __webpack_require__.p = "";
        /******/
        /******/ // Load entry module and return exports
        /******/
        return __webpack_require__(0);
        /******/
      }
      /************************************************************************/
      /******/([/* 0 */
      /***/function (module, exports, __webpack_require__) {
        module.exports = __webpack_require__(1);

        /***/
      }, /* 1 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        var bind = __webpack_require__(3);
        var Axios = __webpack_require__(4);
        var mergeConfig = __webpack_require__(22);
        var defaults = __webpack_require__(10);

        /**
         * Create an instance of Axios
         *
         * @param {Object} defaultConfig The default config for the instance
         * @return {Axios} A new instance of Axios
         */
        function createInstance(defaultConfig) {
          var context = new Axios(defaultConfig);
          var instance = bind(Axios.prototype.request, context);

          // Copy axios.prototype to instance
          utils.extend(instance, Axios.prototype, context);

          // Copy context to instance
          utils.extend(instance, context);
          return instance;
        }

        // Create the default instance to be exported
        var axios = createInstance(defaults);

        // Expose Axios class to allow class inheritance
        axios.Axios = Axios;

        // Factory for creating new instances
        axios.create = function create(instanceConfig) {
          return createInstance(mergeConfig(axios.defaults, instanceConfig));
        };

        // Expose Cancel & CancelToken
        axios.Cancel = __webpack_require__(23);
        axios.CancelToken = __webpack_require__(24);
        axios.isCancel = __webpack_require__(9);

        // Expose all/spread
        axios.all = function all(promises) {
          return Promise.all(promises);
        };
        axios.spread = __webpack_require__(25);
        module.exports = axios;

        // Allow use of default import syntax in TypeScript
        module.exports.default = axios;

        /***/
      }, /* 2 */
      /***/function (module, exports, __webpack_require__) {
        var bind = __webpack_require__(3);

        /*global toString:true*/

        // utils is a library of generic helper functions non-specific to axios

        var toString = Object.prototype.toString;

        /**
         * Determine if a value is an Array
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is an Array, otherwise false
         */
        function isArray(val) {
          return toString.call(val) === '[object Array]';
        }

        /**
         * Determine if a value is undefined
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if the value is undefined, otherwise false
         */
        function isUndefined(val) {
          return typeof val === 'undefined';
        }

        /**
         * Determine if a value is a Buffer
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Buffer, otherwise false
         */
        function isBuffer(val) {
          return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
        }

        /**
         * Determine if a value is an ArrayBuffer
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is an ArrayBuffer, otherwise false
         */
        function isArrayBuffer(val) {
          return toString.call(val) === '[object ArrayBuffer]';
        }

        /**
         * Determine if a value is a FormData
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is an FormData, otherwise false
         */
        function isFormData(val) {
          return typeof FormData !== 'undefined' && val instanceof FormData;
        }

        /**
         * Determine if a value is a view on an ArrayBuffer
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
         */
        function isArrayBufferView(val) {
          var result;
          if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
            result = ArrayBuffer.isView(val);
          } else {
            result = val && val.buffer && val.buffer instanceof ArrayBuffer;
          }
          return result;
        }

        /**
         * Determine if a value is a String
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a String, otherwise false
         */
        function isString(val) {
          return typeof val === 'string';
        }

        /**
         * Determine if a value is a Number
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Number, otherwise false
         */
        function isNumber(val) {
          return typeof val === 'number';
        }

        /**
         * Determine if a value is an Object
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is an Object, otherwise false
         */
        function isObject(val) {
          return val !== null && typeof val === 'object';
        }

        /**
         * Determine if a value is a Date
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Date, otherwise false
         */
        function isDate(val) {
          return toString.call(val) === '[object Date]';
        }

        /**
         * Determine if a value is a File
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a File, otherwise false
         */
        function isFile(val) {
          return toString.call(val) === '[object File]';
        }

        /**
         * Determine if a value is a Blob
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Blob, otherwise false
         */
        function isBlob(val) {
          return toString.call(val) === '[object Blob]';
        }

        /**
         * Determine if a value is a Function
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Function, otherwise false
         */
        function isFunction(val) {
          return toString.call(val) === '[object Function]';
        }

        /**
         * Determine if a value is a Stream
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a Stream, otherwise false
         */
        function isStream(val) {
          return isObject(val) && isFunction(val.pipe);
        }

        /**
         * Determine if a value is a URLSearchParams object
         *
         * @param {Object} val The value to test
         * @returns {boolean} True if value is a URLSearchParams object, otherwise false
         */
        function isURLSearchParams(val) {
          return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
        }

        /**
         * Trim excess whitespace off the beginning and end of a string
         *
         * @param {String} str The String to trim
         * @returns {String} The String freed of excess whitespace
         */
        function trim(str) {
          return str.replace(/^\s*/, '').replace(/\s*$/, '');
        }

        /**
         * Determine if we're running in a standard browser environment
         *
         * This allows axios to run in a web worker, and react-native.
         * Both environments support XMLHttpRequest, but not fully standard globals.
         *
         * web workers:
         *  typeof window -> undefined
         *  typeof document -> undefined
         *
         * react-native:
         *  navigator.product -> 'ReactNative'
         * nativescript
         *  navigator.product -> 'NativeScript' or 'NS'
         */
        function isStandardBrowserEnv() {
          if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' || navigator.product === 'NativeScript' || navigator.product === 'NS')) {
            return false;
          }
          return typeof window !== 'undefined' && typeof document !== 'undefined';
        }

        /**
         * Iterate over an Array or an Object invoking a function for each item.
         *
         * If `obj` is an Array callback will be called passing
         * the value, index, and complete array for each item.
         *
         * If 'obj' is an Object callback will be called passing
         * the value, key, and complete object for each property.
         *
         * @param {Object|Array} obj The object to iterate
         * @param {Function} fn The callback to invoke for each item
         */
        function forEach(obj, fn) {
          // Don't bother if no value provided
          if (obj === null || typeof obj === 'undefined') {
            return;
          }

          // Force an array if not already something iterable
          if (typeof obj !== 'object') {
            /*eslint no-param-reassign:0*/
            obj = [obj];
          }
          if (isArray(obj)) {
            // Iterate over array values
            for (var i = 0, l = obj.length; i < l; i++) {
              fn.call(null, obj[i], i, obj);
            }
          } else {
            // Iterate over object keys
            for (var key in obj) {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                fn.call(null, obj[key], key, obj);
              }
            }
          }
        }

        /**
         * Accepts varargs expecting each argument to be an object, then
         * immutably merges the properties of each object and returns result.
         *
         * When multiple objects contain the same key the later object in
         * the arguments list will take precedence.
         *
         * Example:
         *
         * ```js
         * var result = merge({foo: 123}, {foo: 456});
         * console.log(result.foo); // outputs 456
         * ```
         *
         * @param {Object} obj1 Object to merge
         * @returns {Object} Result of all merge properties
         */
        function merge(/* obj1, obj2, obj3, ... */
        ) {
          var result = {};
          function assignValue(val, key) {
            if (typeof result[key] === 'object' && typeof val === 'object') {
              result[key] = merge(result[key], val);
            } else {
              result[key] = val;
            }
          }
          for (var i = 0, l = arguments.length; i < l; i++) {
            forEach(arguments[i], assignValue);
          }
          return result;
        }

        /**
         * Function equal to merge with the difference being that no reference
         * to original objects is kept.
         *
         * @see merge
         * @param {Object} obj1 Object to merge
         * @returns {Object} Result of all merge properties
         */
        function deepMerge(/* obj1, obj2, obj3, ... */
        ) {
          var result = {};
          function assignValue(val, key) {
            if (typeof result[key] === 'object' && typeof val === 'object') {
              result[key] = deepMerge(result[key], val);
            } else if (typeof val === 'object') {
              result[key] = deepMerge({}, val);
            } else {
              result[key] = val;
            }
          }
          for (var i = 0, l = arguments.length; i < l; i++) {
            forEach(arguments[i], assignValue);
          }
          return result;
        }

        /**
         * Extends object a by mutably adding to it the properties of object b.
         *
         * @param {Object} a The object to be extended
         * @param {Object} b The object to copy properties from
         * @param {Object} thisArg The object to bind function to
         * @return {Object} The resulting value of object a
         */
        function extend(a, b, thisArg) {
          forEach(b, function assignValue(val, key) {
            if (thisArg && typeof val === 'function') {
              a[key] = bind(val, thisArg);
            } else {
              a[key] = val;
            }
          });
          return a;
        }
        module.exports = {
          isArray: isArray,
          isArrayBuffer: isArrayBuffer,
          isBuffer: isBuffer,
          isFormData: isFormData,
          isArrayBufferView: isArrayBufferView,
          isString: isString,
          isNumber: isNumber,
          isObject: isObject,
          isUndefined: isUndefined,
          isDate: isDate,
          isFile: isFile,
          isBlob: isBlob,
          isFunction: isFunction,
          isStream: isStream,
          isURLSearchParams: isURLSearchParams,
          isStandardBrowserEnv: isStandardBrowserEnv,
          forEach: forEach,
          merge: merge,
          deepMerge: deepMerge,
          extend: extend,
          trim: trim
        };

        /***/
      }, /* 3 */
      /***/function (module, exports) {
        module.exports = function bind(fn, thisArg) {
          return function wrap() {
            var args = new Array(arguments.length);
            for (var i = 0; i < args.length; i++) {
              args[i] = arguments[i];
            }
            return fn.apply(thisArg, args);
          };
        };

        /***/
      }, /* 4 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        var buildURL = __webpack_require__(5);
        var InterceptorManager = __webpack_require__(6);
        var dispatchRequest = __webpack_require__(7);
        var mergeConfig = __webpack_require__(22);

        /**
         * Create a new instance of Axios
         *
         * @param {Object} instanceConfig The default config for the instance
         */
        function Axios(instanceConfig) {
          this.defaults = instanceConfig;
          this.interceptors = {
            request: new InterceptorManager(),
            response: new InterceptorManager()
          };
        }

        /**
         * Dispatch a request
         *
         * @param {Object} config The config specific for this request (merged with this.defaults)
         */
        Axios.prototype.request = function request(config) {
          /*eslint no-param-reassign:0*/
          // Allow for axios('example/url'[, config]) a la fetch API
          if (typeof config === 'string') {
            config = arguments[1] || {};
            config.url = arguments[0];
          } else {
            config = config || {};
          }
          config = mergeConfig(this.defaults, config);

          // Set config.method
          if (config.method) {
            config.method = config.method.toLowerCase();
          } else if (this.defaults.method) {
            config.method = this.defaults.method.toLowerCase();
          } else {
            config.method = 'get';
          }

          // Hook up interceptors middleware
          var chain = [dispatchRequest, undefined];
          var promise = Promise.resolve(config);
          this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
            chain.unshift(interceptor.fulfilled, interceptor.rejected);
          });
          this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
            chain.push(interceptor.fulfilled, interceptor.rejected);
          });
          while (chain.length) {
            promise = promise.then(chain.shift(), chain.shift());
          }
          return promise;
        };
        Axios.prototype.getUri = function getUri(config) {
          config = mergeConfig(this.defaults, config);
          return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
        };

        // Provide aliases for supported request methods
        utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
          /*eslint func-names:0*/
          Axios.prototype[method] = function (url, config) {
            return this.request(utils.merge(config || {}, {
              method: method,
              url: url
            }));
          };
        });
        utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
          /*eslint func-names:0*/
          Axios.prototype[method] = function (url, data, config) {
            return this.request(utils.merge(config || {}, {
              method: method,
              url: url,
              data: data
            }));
          };
        });
        module.exports = Axios;

        /***/
      }, /* 5 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        function encode(val) {
          return encodeURIComponent(val).replace(/%40/gi, '@').replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+').replace(/%5B/gi, '[').replace(/%5D/gi, ']');
        }

        /**
         * Build a URL by appending params to the end
         *
         * @param {string} url The base of the url (e.g., http://www.google.com)
         * @param {object} [params] The params to be appended
         * @returns {string} The formatted url
         */
        module.exports = function buildURL(url, params, paramsSerializer) {
          /*eslint no-param-reassign:0*/
          if (!params) {
            return url;
          }
          var serializedParams;
          if (paramsSerializer) {
            serializedParams = paramsSerializer(params);
          } else if (utils.isURLSearchParams(params)) {
            serializedParams = params.toString();
          } else {
            var parts = [];
            utils.forEach(params, function serialize(val, key) {
              if (val === null || typeof val === 'undefined') {
                return;
              }
              if (utils.isArray(val)) {
                key = key + '[]';
              } else {
                val = [val];
              }
              utils.forEach(val, function parseValue(v) {
                if (utils.isDate(v)) {
                  v = v.toISOString();
                } else if (utils.isObject(v)) {
                  v = JSON.stringify(v);
                }
                parts.push(encode(key) + '=' + encode(v));
              });
            });
            serializedParams = parts.join('&');
          }
          if (serializedParams) {
            var hashmarkIndex = url.indexOf('#');
            if (hashmarkIndex !== -1) {
              url = url.slice(0, hashmarkIndex);
            }
            url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
          }
          return url;
        };

        /***/
      }, /* 6 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        function InterceptorManager() {
          this.handlers = [];
        }

        /**
         * Add a new interceptor to the stack
         *
         * @param {Function} fulfilled The function to handle `then` for a `Promise`
         * @param {Function} rejected The function to handle `reject` for a `Promise`
         *
         * @return {Number} An ID used to remove interceptor later
         */
        InterceptorManager.prototype.use = function use(fulfilled, rejected) {
          this.handlers.push({
            fulfilled: fulfilled,
            rejected: rejected
          });
          return this.handlers.length - 1;
        };

        /**
         * Remove an interceptor from the stack
         *
         * @param {Number} id The ID that was returned by `use`
         */
        InterceptorManager.prototype.eject = function eject(id) {
          if (this.handlers[id]) {
            this.handlers[id] = null;
          }
        };

        /**
         * Iterate over all the registered interceptors
         *
         * This method is particularly useful for skipping over any
         * interceptors that may have become `null` calling `eject`.
         *
         * @param {Function} fn The function to call for each interceptor
         */
        InterceptorManager.prototype.forEach = function forEach(fn) {
          utils.forEach(this.handlers, function forEachHandler(h) {
            if (h !== null) {
              fn(h);
            }
          });
        };
        module.exports = InterceptorManager;

        /***/
      }, /* 7 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        var transformData = __webpack_require__(8);
        var isCancel = __webpack_require__(9);
        var defaults = __webpack_require__(10);

        /**
         * Throws a `Cancel` if cancellation has been requested.
         */
        function throwIfCancellationRequested(config) {
          if (config.cancelToken) {
            config.cancelToken.throwIfRequested();
          }
        }

        /**
         * Dispatch a request to the server using the configured adapter.
         *
         * @param {object} config The config that is to be used for the request
         * @returns {Promise} The Promise to be fulfilled
         */
        module.exports = function dispatchRequest(config) {
          throwIfCancellationRequested(config);

          // Ensure headers exist
          config.headers = config.headers || {};

          // Transform request data
          config.data = transformData(config.data, config.headers, config.transformRequest);

          // Flatten headers
          config.headers = utils.merge(config.headers.common || {}, config.headers[config.method] || {}, config.headers);
          utils.forEach(['delete', 'get', 'head', 'post', 'put', 'patch', 'common'], function cleanHeaderConfig(method) {
            delete config.headers[method];
          });
          var adapter = config.adapter || defaults.adapter;
          return adapter(config).then(function onAdapterResolution(response) {
            throwIfCancellationRequested(config);

            // Transform response data
            response.data = transformData(response.data, response.headers, config.transformResponse);
            return response;
          }, function onAdapterRejection(reason) {
            if (!isCancel(reason)) {
              throwIfCancellationRequested(config);

              // Transform response data
              if (reason && reason.response) {
                reason.response.data = transformData(reason.response.data, reason.response.headers, config.transformResponse);
              }
            }
            return Promise.reject(reason);
          });
        };

        /***/
      }, /* 8 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);

        /**
         * Transform the data for a request or a response
         *
         * @param {Object|String} data The data to be transformed
         * @param {Array} headers The headers for the request or response
         * @param {Array|Function} fns A single function or Array of functions
         * @returns {*} The resulting transformed data
         */
        module.exports = function transformData(data, headers, fns) {
          /*eslint no-param-reassign:0*/
          utils.forEach(fns, function transform(fn) {
            data = fn(data, headers);
          });
          return data;
        };

        /***/
      }, /* 9 */
      /***/function (module, exports) {
        module.exports = function isCancel(value) {
          return !!(value && value.__CANCEL__);
        };

        /***/
      }, /* 10 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        var normalizeHeaderName = __webpack_require__(11);
        var DEFAULT_CONTENT_TYPE = {
          'Content-Type': 'application/x-www-form-urlencoded'
        };
        function setContentTypeIfUnset(headers, value) {
          if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
            headers['Content-Type'] = value;
          }
        }
        function getDefaultAdapter() {
          var adapter;
          if (typeof XMLHttpRequest !== 'undefined') {
            // For browsers use XHR adapter
            adapter = __webpack_require__(12);
          } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
            // For node use HTTP adapter
            adapter = __webpack_require__(12);
          }
          return adapter;
        }
        var defaults = {
          adapter: getDefaultAdapter(),
          transformRequest: [function transformRequest(data, headers) {
            normalizeHeaderName(headers, 'Accept');
            normalizeHeaderName(headers, 'Content-Type');
            if (utils.isFormData(data) || utils.isArrayBuffer(data) || utils.isBuffer(data) || utils.isStream(data) || utils.isFile(data) || utils.isBlob(data)) {
              return data;
            }
            if (utils.isArrayBufferView(data)) {
              return data.buffer;
            }
            if (utils.isURLSearchParams(data)) {
              setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
              return data.toString();
            }
            if (utils.isObject(data)) {
              setContentTypeIfUnset(headers, 'application/json;charset=utf-8');
              return JSON.stringify(data);
            }
            return data;
          }],
          transformResponse: [function transformResponse(data) {
            /*eslint no-param-reassign:0*/
            if (typeof data === 'string') {
              try {
                data = JSON.parse(data);
              } catch (e) {/* Ignore */}
            }
            return data;
          }],
          /**
           * A timeout in milliseconds to abort a request. If set to 0 (default) a
           * timeout is not created.
           */
          timeout: 0,
          xsrfCookieName: 'XSRF-TOKEN',
          xsrfHeaderName: 'X-XSRF-TOKEN',
          maxContentLength: -1,
          validateStatus: function validateStatus(status) {
            return status >= 200 && status < 300;
          }
        };
        defaults.headers = {
          common: {
            'Accept': 'application/json, text/plain, */*'
          }
        };
        utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
          defaults.headers[method] = {};
        });
        utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
          defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
        });
        module.exports = defaults;

        /***/
      }, /* 11 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        module.exports = function normalizeHeaderName(headers, normalizedName) {
          utils.forEach(headers, function processHeader(value, name) {
            if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
              headers[normalizedName] = value;
              delete headers[name];
            }
          });
        };

        /***/
      }, /* 12 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        var settle = __webpack_require__(13);
        var buildURL = __webpack_require__(5);
        var buildFullPath = __webpack_require__(16);
        var parseHeaders = __webpack_require__(19);
        var isURLSameOrigin = __webpack_require__(20);
        var createError = __webpack_require__(14);
        module.exports = function xhrAdapter(config) {
          return new Promise(function dispatchXhrRequest(resolve, reject) {
            var requestData = config.data;
            var requestHeaders = config.headers;
            if (utils.isFormData(requestData)) {
              delete requestHeaders['Content-Type']; // Let the browser set it
            }
            var request = new XMLHttpRequest();

            // HTTP basic authentication
            if (config.auth) {
              var username = config.auth.username || '';
              var password = config.auth.password || '';
              requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
            }
            var fullPath = buildFullPath(config.baseURL, config.url);
            request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

            // Set the request timeout in MS
            request.timeout = config.timeout;

            // Listen for ready state
            request.onreadystatechange = function handleLoad() {
              if (!request || request.readyState !== 4) {
                return;
              }

              // The request errored out and we didn't get a response, this will be
              // handled by onerror instead
              // With one exception: request that using file: protocol, most browsers
              // will return status as 0 even though it's a successful request
              if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
                return;
              }

              // Prepare the response
              var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
              var responseData = !config.responseType || config.responseType === 'text' ? request.responseText : request.response;
              var response = {
                data: responseData,
                status: request.status,
                statusText: request.statusText,
                headers: responseHeaders,
                config: config,
                request: request
              };
              settle(resolve, reject, response);

              // Clean up request
              request = null;
            };

            // Handle browser request cancellation (as opposed to a manual cancellation)
            request.onabort = function handleAbort() {
              if (!request) {
                return;
              }
              reject(createError('Request aborted', config, 'ECONNABORTED', request));

              // Clean up request
              request = null;
            };

            // Handle low level network errors
            request.onerror = function handleError() {
              // Real errors are hidden from us by the browser
              // onerror should only fire if it's a network error
              reject(createError('Network Error', config, null, request));

              // Clean up request
              request = null;
            };

            // Handle timeout
            request.ontimeout = function handleTimeout() {
              var timeoutErrorMessage = 'timeout of ' + config.timeout + 'ms exceeded';
              if (config.timeoutErrorMessage) {
                timeoutErrorMessage = config.timeoutErrorMessage;
              }
              reject(createError(timeoutErrorMessage, config, 'ECONNABORTED', request));

              // Clean up request
              request = null;
            };

            // Add xsrf header
            // This is only done if running in a standard browser environment.
            // Specifically not if we're in a web worker, or react-native.
            if (utils.isStandardBrowserEnv()) {
              var cookies = __webpack_require__(21);

              // Add xsrf header
              var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ? cookies.read(config.xsrfCookieName) : undefined;
              if (xsrfValue) {
                requestHeaders[config.xsrfHeaderName] = xsrfValue;
              }
            }

            // Add headers to the request
            if ('setRequestHeader' in request) {
              utils.forEach(requestHeaders, function setRequestHeader(val, key) {
                if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
                  // Remove Content-Type if data is undefined
                  delete requestHeaders[key];
                } else {
                  // Otherwise add header to the request
                  request.setRequestHeader(key, val);
                }
              });
            }

            // Add withCredentials to request if needed
            if (!utils.isUndefined(config.withCredentials)) {
              request.withCredentials = !!config.withCredentials;
            }

            // Add responseType to request if needed
            if (config.responseType) {
              try {
                request.responseType = config.responseType;
              } catch (e) {
                // Expected DOMException thrown by browsers not compatible XMLHttpRequest Level 2.
                // But, this can be suppressed for 'json' type as it can be parsed by default 'transformResponse' function.
                if (config.responseType !== 'json') {
                  throw e;
                }
              }
            }

            // Handle progress if needed
            if (typeof config.onDownloadProgress === 'function') {
              request.addEventListener('progress', config.onDownloadProgress);
            }

            // Not all browsers support upload events
            if (typeof config.onUploadProgress === 'function' && request.upload) {
              request.upload.addEventListener('progress', config.onUploadProgress);
            }
            if (config.cancelToken) {
              // Handle cancellation
              config.cancelToken.promise.then(function onCanceled(cancel) {
                if (!request) {
                  return;
                }
                request.abort();
                reject(cancel);
                // Clean up request
                request = null;
              });
            }
            if (requestData === undefined) {
              requestData = null;
            }

            // Send the request
            request.send(requestData);
          });
        };

        /***/
      }, /* 13 */
      /***/function (module, exports, __webpack_require__) {
        var createError = __webpack_require__(14);

        /**
         * Resolve or reject a Promise based on response status.
         *
         * @param {Function} resolve A function that resolves the promise.
         * @param {Function} reject A function that rejects the promise.
         * @param {object} response The response.
         */
        module.exports = function settle(resolve, reject, response) {
          var validateStatus = response.config.validateStatus;
          if (!validateStatus || validateStatus(response.status)) {
            resolve(response);
          } else {
            reject(createError('Request failed with status code ' + response.status, response.config, null, response.request, response));
          }
        };

        /***/
      }, /* 14 */
      /***/function (module, exports, __webpack_require__) {
        var enhanceError = __webpack_require__(15);

        /**
         * Create an Error with the specified message, config, error code, request and response.
         *
         * @param {string} message The error message.
         * @param {Object} config The config.
         * @param {string} [code] The error code (for example, 'ECONNABORTED').
         * @param {Object} [request] The request.
         * @param {Object} [response] The response.
         * @returns {Error} The created error.
         */
        module.exports = function createError(message, config, code, request, response) {
          var error = new Error(message);
          return enhanceError(error, config, code, request, response);
        };

        /***/
      }, /* 15 */
      /***/function (module, exports) {
        /**
         * Update an Error with the specified config, error code, and response.
         *
         * @param {Error} error The error to update.
         * @param {Object} config The config.
         * @param {string} [code] The error code (for example, 'ECONNABORTED').
         * @param {Object} [request] The request.
         * @param {Object} [response] The response.
         * @returns {Error} The error.
         */
        module.exports = function enhanceError(error, config, code, request, response) {
          error.config = config;
          if (code) {
            error.code = code;
          }
          error.request = request;
          error.response = response;
          error.isAxiosError = true;
          error.toJSON = function () {
            return {
              // Standard
              message: this.message,
              name: this.name,
              // Microsoft
              description: this.description,
              number: this.number,
              // Mozilla
              fileName: this.fileName,
              lineNumber: this.lineNumber,
              columnNumber: this.columnNumber,
              stack: this.stack,
              // Axios
              config: this.config,
              code: this.code
            };
          };
          return error;
        };

        /***/
      }, /* 16 */
      /***/function (module, exports, __webpack_require__) {
        var isAbsoluteURL = __webpack_require__(17);
        var combineURLs = __webpack_require__(18);

        /**
         * Creates a new URL by combining the baseURL with the requestedURL,
         * only when the requestedURL is not already an absolute URL.
         * If the requestURL is absolute, this function returns the requestedURL untouched.
         *
         * @param {string} baseURL The base URL
         * @param {string} requestedURL Absolute or relative URL to combine
         * @returns {string} The combined full path
         */
        module.exports = function buildFullPath(baseURL, requestedURL) {
          if (baseURL && !isAbsoluteURL(requestedURL)) {
            return combineURLs(baseURL, requestedURL);
          }
          return requestedURL;
        };

        /***/
      }, /* 17 */
      /***/function (module, exports) {
        /**
         * Determines whether the specified URL is absolute
         *
         * @param {string} url The URL to test
         * @returns {boolean} True if the specified URL is absolute, otherwise false
         */
        module.exports = function isAbsoluteURL(url) {
          // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
          // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
          // by any combination of letters, digits, plus, period, or hyphen.
          return /^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(url);
        };

        /***/
      }, /* 18 */
      /***/function (module, exports) {
        /**
         * Creates a new URL by combining the specified URLs
         *
         * @param {string} baseURL The base URL
         * @param {string} relativeURL The relative URL
         * @returns {string} The combined URL
         */
        module.exports = function combineURLs(baseURL, relativeURL) {
          return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL;
        };

        /***/
      }, /* 19 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);

        // Headers whose duplicates are ignored by node
        // c.f. https://nodejs.org/api/http.html#http_message_headers
        var ignoreDuplicateOf = ['age', 'authorization', 'content-length', 'content-type', 'etag', 'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since', 'last-modified', 'location', 'max-forwards', 'proxy-authorization', 'referer', 'retry-after', 'user-agent'];

        /**
         * Parse headers into an object
         *
         * ```
         * Date: Wed, 27 Aug 2014 08:58:49 GMT
         * Content-Type: application/json
         * Connection: keep-alive
         * Transfer-Encoding: chunked
         * ```
         *
         * @param {String} headers Headers needing to be parsed
         * @returns {Object} Headers parsed into an object
         */
        module.exports = function parseHeaders(headers) {
          var parsed = {};
          var key;
          var val;
          var i;
          if (!headers) {
            return parsed;
          }
          utils.forEach(headers.split('\n'), function parser(line) {
            i = line.indexOf(':');
            key = utils.trim(line.substr(0, i)).toLowerCase();
            val = utils.trim(line.substr(i + 1));
            if (key) {
              if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
                return;
              }
              if (key === 'set-cookie') {
                parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
              } else {
                parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
              }
            }
          });
          return parsed;
        };

        /***/
      }, /* 20 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        module.exports = utils.isStandardBrowserEnv() ?
        // Standard browser envs have full support of the APIs needed to test
        // whether the request URL is of the same origin as current location.
        function standardBrowserEnv() {
          var msie = /(msie|trident)/i.test(navigator.userAgent);
          var urlParsingNode = document.createElement('a');
          var originURL;

          /**
          * Parse a URL to discover it's components
          *
          * @param {String} url The URL to be parsed
          * @returns {Object}
          */
          function resolveURL(url) {
            var href = url;
            if (msie) {
              // IE needs attribute set twice to normalize properties
              urlParsingNode.setAttribute('href', href);
              href = urlParsingNode.href;
            }
            urlParsingNode.setAttribute('href', href);

            // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
            return {
              href: urlParsingNode.href,
              protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
              host: urlParsingNode.host,
              search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
              hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
              hostname: urlParsingNode.hostname,
              port: urlParsingNode.port,
              pathname: urlParsingNode.pathname.charAt(0) === '/' ? urlParsingNode.pathname : '/' + urlParsingNode.pathname
            };
          }
          originURL = resolveURL(window.location.href);

          /**
          * Determine if a URL shares the same origin as the current location
          *
          * @param {String} requestURL The URL to test
          * @returns {boolean} True if URL shares the same origin, otherwise false
          */
          return function isURLSameOrigin(requestURL) {
            var parsed = utils.isString(requestURL) ? resolveURL(requestURL) : requestURL;
            return parsed.protocol === originURL.protocol && parsed.host === originURL.host;
          };
        }() :
        // Non standard browser envs (web workers, react-native) lack needed support.
        function nonStandardBrowserEnv() {
          return function isURLSameOrigin() {
            return true;
          };
        }();

        /***/
      }, /* 21 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);
        module.exports = utils.isStandardBrowserEnv() ?
        // Standard browser envs support document.cookie
        function standardBrowserEnv() {
          return {
            write: function write(name, value, expires, path, domain, secure) {
              var cookie = [];
              cookie.push(name + '=' + encodeURIComponent(value));
              if (utils.isNumber(expires)) {
                cookie.push('expires=' + new Date(expires).toGMTString());
              }
              if (utils.isString(path)) {
                cookie.push('path=' + path);
              }
              if (utils.isString(domain)) {
                cookie.push('domain=' + domain);
              }
              if (secure === true) {
                cookie.push('secure');
              }
              document.cookie = cookie.join('; ');
            },
            read: function read(name) {
              var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
              return match ? decodeURIComponent(match[3]) : null;
            },
            remove: function remove(name) {
              this.write(name, '', Date.now() - 86400000);
            }
          };
        }() :
        // Non standard browser env (web workers, react-native) lack needed support.
        function nonStandardBrowserEnv() {
          return {
            write: function write() {},
            read: function read() {
              return null;
            },
            remove: function remove() {}
          };
        }();

        /***/
      }, /* 22 */
      /***/function (module, exports, __webpack_require__) {
        var utils = __webpack_require__(2);

        /**
         * Config-specific merge-function which creates a new config-object
         * by merging two configuration objects together.
         *
         * @param {Object} config1
         * @param {Object} config2
         * @returns {Object} New object resulting from merging config2 to config1
         */
        module.exports = function mergeConfig(config1, config2) {
          // eslint-disable-next-line no-param-reassign
          config2 = config2 || {};
          var config = {};
          var valueFromConfig2Keys = ['url', 'method', 'params', 'data'];
          var mergeDeepPropertiesKeys = ['headers', 'auth', 'proxy'];
          var defaultToConfig2Keys = ['baseURL', 'url', 'transformRequest', 'transformResponse', 'paramsSerializer', 'timeout', 'withCredentials', 'adapter', 'responseType', 'xsrfCookieName', 'xsrfHeaderName', 'onUploadProgress', 'onDownloadProgress', 'maxContentLength', 'validateStatus', 'maxRedirects', 'httpAgent', 'httpsAgent', 'cancelToken', 'socketPath'];
          utils.forEach(valueFromConfig2Keys, function valueFromConfig2(prop) {
            if (typeof config2[prop] !== 'undefined') {
              config[prop] = config2[prop];
            }
          });
          utils.forEach(mergeDeepPropertiesKeys, function mergeDeepProperties(prop) {
            if (utils.isObject(config2[prop])) {
              config[prop] = utils.deepMerge(config1[prop], config2[prop]);
            } else if (typeof config2[prop] !== 'undefined') {
              config[prop] = config2[prop];
            } else if (utils.isObject(config1[prop])) {
              config[prop] = utils.deepMerge(config1[prop]);
            } else if (typeof config1[prop] !== 'undefined') {
              config[prop] = config1[prop];
            }
          });
          utils.forEach(defaultToConfig2Keys, function defaultToConfig2(prop) {
            if (typeof config2[prop] !== 'undefined') {
              config[prop] = config2[prop];
            } else if (typeof config1[prop] !== 'undefined') {
              config[prop] = config1[prop];
            }
          });
          var axiosKeys = valueFromConfig2Keys.concat(mergeDeepPropertiesKeys).concat(defaultToConfig2Keys);
          var otherKeys = Object.keys(config2).filter(function filterAxiosKeys(key) {
            return axiosKeys.indexOf(key) === -1;
          });
          utils.forEach(otherKeys, function otherKeysDefaultToConfig2(prop) {
            if (typeof config2[prop] !== 'undefined') {
              config[prop] = config2[prop];
            } else if (typeof config1[prop] !== 'undefined') {
              config[prop] = config1[prop];
            }
          });
          return config;
        };

        /***/
      }, /* 23 */
      /***/function (module, exports) {
        /**
         * A `Cancel` is an object that is thrown when an operation is canceled.
         *
         * @class
         * @param {string=} message The message.
         */
        function Cancel(message) {
          this.message = message;
        }
        Cancel.prototype.toString = function toString() {
          return 'Cancel' + (this.message ? ': ' + this.message : '');
        };
        Cancel.prototype.__CANCEL__ = true;
        module.exports = Cancel;

        /***/
      }, /* 24 */
      /***/function (module, exports, __webpack_require__) {
        var Cancel = __webpack_require__(23);

        /**
         * A `CancelToken` is an object that can be used to request cancellation of an operation.
         *
         * @class
         * @param {Function} executor The executor function.
         */
        function CancelToken(executor) {
          if (typeof executor !== 'function') {
            throw new TypeError('executor must be a function.');
          }
          var resolvePromise;
          this.promise = new Promise(function promiseExecutor(resolve) {
            resolvePromise = resolve;
          });
          var token = this;
          executor(function cancel(message) {
            if (token.reason) {
              // Cancellation has already been requested
              return;
            }
            token.reason = new Cancel(message);
            resolvePromise(token.reason);
          });
        }

        /**
         * Throws a `Cancel` if cancellation has been requested.
         */
        CancelToken.prototype.throwIfRequested = function throwIfRequested() {
          if (this.reason) {
            throw this.reason;
          }
        };

        /**
         * Returns an object that contains a new `CancelToken` and a function that, when called,
         * cancels the `CancelToken`.
         */
        CancelToken.source = function source() {
          var cancel;
          var token = new CancelToken(function executor(c) {
            cancel = c;
          });
          return {
            token: token,
            cancel: cancel
          };
        };
        module.exports = CancelToken;

        /***/
      }, /* 25 */
      /***/function (module, exports) {
        /**
         * Syntactic sugar for invoking a function and expanding an array for arguments.
         *
         * Common use case would be to use `Function.prototype.apply`.
         *
         *  ```js
         *  function f(x, y, z) {}
         *  var args = [1, 2, 3];
         *  f.apply(null, args);
         *  ```
         *
         * With `spread` this example can be re-written.
         *
         *  ```js
         *  spread(function(x, y, z) {})([1, 2, 3]);
         *  ```
         *
         * @param {Function} callback
         * @returns {Function}
         */
        module.exports = function spread(callback) {
          return function wrap(arr) {
            return callback.apply(null, arr);
          };
        };

        /***/
      }
      /******/]);
    });
  });
  var rngBrowser = createCommonjsModule$1(function (module) {
    // Unique ID creation requires a high quality random # generator.  In the
    // browser this is a little complicated due to unknown quality of Math.random()
    // and inconsistent support for the `crypto` API.  We do the best we can via
    // feature-detection

    // getRandomValues needs to be invoked in a context where "this" is a Crypto
    // implementation. Also, find the complete implementation of crypto on IE11.
    var getRandomValues = typeof crypto != 'undefined' && crypto.getRandomValues && crypto.getRandomValues.bind(crypto) || typeof msCrypto != 'undefined' && typeof window.msCrypto.getRandomValues == 'function' && msCrypto.getRandomValues.bind(msCrypto);
    if (getRandomValues) {
      // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
      var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef

      module.exports = function whatwgRNG() {
        getRandomValues(rnds8);
        return rnds8;
      };
    } else {
      // Math.random()-based (RNG)
      //
      // If all else fails, use Math.random().  It's fast, but is of unspecified
      // quality.
      var rnds = new Array(16);
      module.exports = function mathRNG() {
        for (var i = 0, r; i < 16; i++) {
          if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
          rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
        }
        return rnds;
      };
    }
  });

  /**
   * Convert array of 16 byte values to UUID string format of the form:
   * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
   */
  var byteToHex = [];
  for (var i = 0; i < 256; ++i) {
    byteToHex[i] = (i + 0x100).toString(16).substr(1);
  }
  function bytesToUuid(buf, offset) {
    var i = offset || 0;
    var bth = byteToHex;
    // join used to fix memory issue caused by concatenation: https://bugs.chromium.org/p/v8/issues/detail?id=3175#c4
    return [bth[buf[i++]], bth[buf[i++]], bth[buf[i++]], bth[buf[i++]], '-', bth[buf[i++]], bth[buf[i++]], '-', bth[buf[i++]], bth[buf[i++]], '-', bth[buf[i++]], bth[buf[i++]], '-', bth[buf[i++]], bth[buf[i++]], bth[buf[i++]], bth[buf[i++]], bth[buf[i++]], bth[buf[i++]]].join('');
  }
  var bytesToUuid_1 = bytesToUuid;

  // **`v1()` - Generate time-based UUID**
  //
  // Inspired by https://github.com/LiosK/UUID.js
  // and http://docs.python.org/library/uuid.html

  var _nodeId;
  var _clockseq;

  // Previous uuid creation time
  var _lastMSecs = 0;
  var _lastNSecs = 0;

  // See https://github.com/uuidjs/uuid for API details
  function v1(options, buf, offset) {
    var i = buf && offset || 0;
    var b = buf || [];
    options = options || {};
    var node = options.node || _nodeId;
    var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

    // node and clockseq need to be initialized to random values if they're not
    // specified.  We do this lazily to minimize issues related to insufficient
    // system entropy.  See #189
    if (node == null || clockseq == null) {
      var seedBytes = rngBrowser();
      if (node == null) {
        // Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
        node = _nodeId = [seedBytes[0] | 0x01, seedBytes[1], seedBytes[2], seedBytes[3], seedBytes[4], seedBytes[5]];
      }
      if (clockseq == null) {
        // Per 4.2.2, randomize (14 bit) clockseq
        clockseq = _clockseq = (seedBytes[6] << 8 | seedBytes[7]) & 0x3fff;
      }
    }

    // UUID timestamps are 100 nano-second units since the Gregorian epoch,
    // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
    // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
    // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
    var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

    // Per 4.2.1.2, use count of uuid's generated during the current clock
    // cycle to simulate higher resolution clock
    var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

    // Time since last uuid creation (in msecs)
    var dt = msecs - _lastMSecs + (nsecs - _lastNSecs) / 10000;

    // Per 4.2.1.2, Bump clockseq on clock regression
    if (dt < 0 && options.clockseq === undefined) {
      clockseq = clockseq + 1 & 0x3fff;
    }

    // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
    // time interval
    if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
      nsecs = 0;
    }

    // Per 4.2.1.2 Throw error if too many uuids are requested
    if (nsecs >= 10000) {
      throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
    }
    _lastMSecs = msecs;
    _lastNSecs = nsecs;
    _clockseq = clockseq;

    // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
    msecs += 12219292800000;

    // `time_low`
    var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
    b[i++] = tl >>> 24 & 0xff;
    b[i++] = tl >>> 16 & 0xff;
    b[i++] = tl >>> 8 & 0xff;
    b[i++] = tl & 0xff;

    // `time_mid`
    var tmh = msecs / 0x100000000 * 10000 & 0xfffffff;
    b[i++] = tmh >>> 8 & 0xff;
    b[i++] = tmh & 0xff;

    // `time_high_and_version`
    b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
    b[i++] = tmh >>> 16 & 0xff;

    // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
    b[i++] = clockseq >>> 8 | 0x80;

    // `clock_seq_low`
    b[i++] = clockseq & 0xff;

    // `node`
    for (var n = 0; n < 6; ++n) {
      b[i + n] = node[n];
    }
    return buf ? buf : bytesToUuid_1(b);
  }
  var v1_1 = v1;
  var environment = {
    local: {
      gx: 'http://localhost:9000/api',
      sphEnterprise: 'http://enterprise:8080/pms-web-ui',
      sphCommunity: 'http://community:8080/pms-web-ui'
    },
    dev: {
      api: 'http://10.14.136.19:8080/shs-security-services',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api',
      sphEnterprise: 'https://enterprise-dev-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui',
      sphCommunity: 'https://community-dev-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    qa: {
      sphEnterprise: 'https://enterprise-qa-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui',
      sphCommunity: 'https://community-qa-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    test1: {
      api: 'https://gw-test.synxis.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    test2: {
      api: 'https://gw-test2.synxis.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    t1: {
      api: 'https://services-wrr.sab-dev-sh-t1-ni-shrd-7655.dev.sabre-gcp.com:3000',
      sbe: 'https://be-t1.shs.dev.ascint.sabrecirrus.com',
      media: 'https://controlcenter.sab-dev-sh-t1-ni-app1-1678.dev.sabre-gcp.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    t2: {
      api: 'https://services-wrr.sab-dev-sh-t2-ni-shrd-2890.dev.sabre-gcp.com:3000',
      sbe: 'https://be-t2.shs.dev.ascint.sabrecirrus.com',
      media: 'https://controlcenter.sab-dev-sh-t2-ni-app1-5788.dev.sabre-gcp.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    t3: {
      api: 'https://services-wrr.sab-dev-sh-t3-ni-shrd-3537.dev.sabre-gcp.com:3000',
      sbe: 'https://be-t3.shs.dev.ascint.sabrecirrus.com',
      media: 'https://controlcenter.sab-dev-sh-t3-ni-app1-6883.dev.sabre-gcp.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    t4: {
      api: 'https://services-wrr.sab-dev-sh-t4-ni-shrd-7319.dev.sabre-gcp.com:3000',
      sbe: 'https://be-t4.shs.dev.ascint.sabrecirrus.com',
      media: 'https://controlcenter.sab-dev-sh-t4-ni-app1-4536.dev.sabre-gcp.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    l1: {
      api: 'https://services.sab-dev-sh-l1-app-2020.dev.sabre-gcp.com',
      sbe: 'https://be-l1.shs.dev.ascint.sabrecirrus.com',
      sphCommunity: 'https://community-lt-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    l2: {
      api: 'https://services-wrr.sab-dev-sh-l2-nv-shrd-8030.dev.sabre-gcp.com',
      sbe: 'https://be-l2.shs.dev.ascint.sabrecirrus.com',
      sphCommunity: 'https://community-lt-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    c1: {
      api: 'https://services-c1.synxis.com',
      sbe: 'https://be-c1.synxis.com',
      media: 'https://controlcenter-c1.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api',
      sphCommunity: 'https://community-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    c2: {
      api: 'https://services-c2.synxis.com',
      sbe: 'https://be-c2.synxis.com',
      media: 'https://controlcenter-c2.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api',
      sphCommunity: 'https://community-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    i1: {
      api: 'https://services-i1.synxis.com',
      sbe: 'https://be-i1.synxis.com',
      media: 'https://controlcenter-i1.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api',
      sphCommunity: 'https://community-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    e2: {
      api: 'https://services-e2.synxis.com',
      sbe: 'https://be-e2.synxis.com',
      media: 'https://controlcenter-e2.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api',
      sphCommunity: 'https://community-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    p1: {
      api: 'https://services-p1.synxis.com',
      sbe: 'https://be.synxis.com',
      media: 'https://controlcenter-p1.synxis.com',
      gx: 'https://gx-api.shs.prod.asc.sabre.com/api',
      sphCommunity: 'https://community-pm.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    p2: {
      api: 'https://services-p2.synxis.com',
      sbe: 'https://be-p2.synxis.com',
      media: 'https://controlcenter-p2.synxis.com',
      gx: 'https://gx-api.shs.prod.asc.sabre.com/api',
      sphCommunity: 'https://community-pm.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    p4: {
      api: 'https://services-p4.synxis.com',
      sbe: 'https://be-p4.synxis.com',
      media: 'https://controlcenter-p4.synxis.com',
      gx: 'https://gx-api.shs.prod.asc.sabre.com/api',
      sphCommunity: 'https://community-pm.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    test1elab: {
      api: 'https://gw-test.sabrehospitality.com',
      sbe: 'https://ngbw-test.sabrehospitality.com',
      media: 'https://crs-test.sabrehospitality.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    test2elab: {
      api: 'https://gw-test2.sabrehospitality.com',
      sbe: 'https://ngbw-test2.sabrehospitality.com',
      media: 'https://crs-test2.sabrehospitality.com',
      gx: 'https://gx-api.shs.dev.asc.sabre.com/api'
    },
    integcert: {
      api: 'https://gw-cert.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api'
    },
    loadtest: {
      api: 'https://sbe-lt-int.shs.dev.asc.sabre.com',
      sbe: 'https://sbe-lt-int.shs.dev.asc.sabre.com',
      sphEnterprise: 'https://enterprise-lt-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui',
      sphCommunity: 'https://community-lt-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    rg: {
      sphEnterprise: 'https://enterprise-rg-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui',
      sphCommunity: 'https://community-rg-pm-ui.d.cloud.sabrehospitality.com/pms-web-ui'
    },
    uat: {
      api: 'https://gw-uat.synxis.com',
      sbe: 'https://ngbw-uat.synxis.com',
      media: 'https://usertest.synxis.com',
      gx: 'https://gx-api.shs.cert.asc.sabre.com/api'
    },
    euat: {
      api: 'https://gw-euat.sabrehospitality.com',
      sbe: 'https://be-euat-p2.synxis.com',
      sphEnterprise: 'https://enterprise-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    cuat: {
      api: 'https://bus-cuat.synxis.com',
      sbe: 'https://be-cuat.synxis.com',
      sphCommunity: 'https://community-cert-pm.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    euatinternal: {
      sphEnterprise: 'https://enterprise-cert-pm-ui.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    cuatinternal: {
      sphCommunity: 'https://community-cert-pm-ui.c.cloud.sabrehospitality.com/pms-web-ui'
    },
    ccrsprod: {
      api: 'https://services.synxis.com',
      sbe: 'https://be.synxis.com',
      media: 'https://gc.synxis.com',
      gx: 'https://gx-api.shs.prod.asc.sabre.com/api'
    },
    ccrs: {
      api: 'https://services.synxis.com',
      sbe: 'https://be.synxis.com',
      media: 'https://gc.synxis.com',
      gx: 'https://gx-api.shs.prod.asc.sabre.com/api',
      sphCommunity: 'https://community-pm.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    ecrsprod: {
      api: 'https://services.sabrehospitality.com'
    },
    ecrs: {
      api: 'https://services.sabrehospitality.com',
      sphEnterprise: 'https://enterprise-pm.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    ecrsinternal: {
      sphEnterprise: 'https://enterprise-prod-pm-ui.p.cloud.sabrehospitality.com/pms-web-ui'
    },
    ccrsinternal: {
      sphCommunity: 'https://community-prod-pm-ui.p.cloud.sabrehospitality.com/pms-web-ui'
    }
  };
  var dayjs_min$1 = createCommonjsModule$1(function (module, exports) {
    !function (t, e) {
      module.exports = e();
    }(commonjsGlobal$1, function () {
      var t = 1e3,
        e = 6e4,
        n = 36e5,
        r = "millisecond",
        i = "second",
        s = "minute",
        u = "hour",
        a = "day",
        o = "week",
        c = "month",
        f = "quarter",
        h = "year",
        d = "date",
        l = "Invalid Date",
        $ = /^(\d{4})[-/]?(\d{1,2})?[-/]?(\d{0,2})[Tt\s]*(\d{1,2})?:?(\d{1,2})?:?(\d{1,2})?[.:]?(\d+)?$/,
        y = /\[([^\]]+)]|Y{1,4}|M{1,4}|D{1,2}|d{1,4}|H{1,2}|h{1,2}|a|A|m{1,2}|s{1,2}|Z{1,2}|SSS/g,
        M = {
          name: "en",
          weekdays: "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"),
          months: "January_February_March_April_May_June_July_August_September_October_November_December".split("_"),
          ordinal: function (t) {
            var e = ["th", "st", "nd", "rd"],
              n = t % 100;
            return "[" + t + (e[(n - 20) % 10] || e[n] || e[0]) + "]";
          }
        },
        m = function (t, e, n) {
          var r = String(t);
          return !r || r.length >= e ? t : "" + Array(e + 1 - r.length).join(n) + t;
        },
        v = {
          s: m,
          z: function (t) {
            var e = -t.utcOffset(),
              n = Math.abs(e),
              r = Math.floor(n / 60),
              i = n % 60;
            return (e <= 0 ? "+" : "-") + m(r, 2, "0") + ":" + m(i, 2, "0");
          },
          m: function t(e, n) {
            if (e.date() < n.date()) return -t(n, e);
            var r = 12 * (n.year() - e.year()) + (n.month() - e.month()),
              i = e.clone().add(r, c),
              s = n - i < 0,
              u = e.clone().add(r + (s ? -1 : 1), c);
            return +(-(r + (n - i) / (s ? i - u : u - i)) || 0);
          },
          a: function (t) {
            return t < 0 ? Math.ceil(t) || 0 : Math.floor(t);
          },
          p: function (t) {
            return {
              M: c,
              y: h,
              w: o,
              d: a,
              D: d,
              h: u,
              m: s,
              s: i,
              ms: r,
              Q: f
            }[t] || String(t || "").toLowerCase().replace(/s$/, "");
          },
          u: function (t) {
            return void 0 === t;
          }
        },
        g = "en",
        D = {};
      D[g] = M;
      var p = "$isDayjsObject",
        S = function (t) {
          return t instanceof _ || !(!t || !t[p]);
        },
        w = function t(e, n, r) {
          var i;
          if (!e) return g;
          if ("string" == typeof e) {
            var s = e.toLowerCase();
            D[s] && (i = s), n && (D[s] = n, i = s);
            var u = e.split("-");
            if (!i && u.length > 1) return t(u[0]);
          } else {
            var a = e.name;
            D[a] = e, i = a;
          }
          return !r && i && (g = i), i || !r && g;
        },
        O = function (t, e) {
          if (S(t)) return t.clone();
          var n = "object" == typeof e ? e : {};
          return n.date = t, n.args = arguments, new _(n);
        },
        b = v;
      b.l = w, b.i = S, b.w = function (t, e) {
        return O(t, {
          locale: e.$L,
          utc: e.$u,
          x: e.$x,
          $offset: e.$offset
        });
      };
      var _ = function () {
          function M(t) {
            this.$L = w(t.locale, null, !0), this.parse(t), this.$x = this.$x || t.x || {}, this[p] = !0;
          }
          var m = M.prototype;
          return m.parse = function (t) {
            this.$d = function (t) {
              var e = t.date,
                n = t.utc;
              if (null === e) return new Date(NaN);
              if (b.u(e)) return new Date();
              if (e instanceof Date) return new Date(e);
              if ("string" == typeof e && !/Z$/i.test(e)) {
                var r = e.match($);
                if (r) {
                  var i = r[2] - 1 || 0,
                    s = (r[7] || "0").substring(0, 3);
                  return n ? new Date(Date.UTC(r[1], i, r[3] || 1, r[4] || 0, r[5] || 0, r[6] || 0, s)) : new Date(r[1], i, r[3] || 1, r[4] || 0, r[5] || 0, r[6] || 0, s);
                }
              }
              return new Date(e);
            }(t), this.init();
          }, m.init = function () {
            var t = this.$d;
            this.$y = t.getFullYear(), this.$M = t.getMonth(), this.$D = t.getDate(), this.$W = t.getDay(), this.$H = t.getHours(), this.$m = t.getMinutes(), this.$s = t.getSeconds(), this.$ms = t.getMilliseconds();
          }, m.$utils = function () {
            return b;
          }, m.isValid = function () {
            return !(this.$d.toString() === l);
          }, m.isSame = function (t, e) {
            var n = O(t);
            return this.startOf(e) <= n && n <= this.endOf(e);
          }, m.isAfter = function (t, e) {
            return O(t) < this.startOf(e);
          }, m.isBefore = function (t, e) {
            return this.endOf(e) < O(t);
          }, m.$g = function (t, e, n) {
            return b.u(t) ? this[e] : this.set(n, t);
          }, m.unix = function () {
            return Math.floor(this.valueOf() / 1e3);
          }, m.valueOf = function () {
            return this.$d.getTime();
          }, m.startOf = function (t, e) {
            var n = this,
              r = !!b.u(e) || e,
              f = b.p(t),
              l = function (t, e) {
                var i = b.w(n.$u ? Date.UTC(n.$y, e, t) : new Date(n.$y, e, t), n);
                return r ? i : i.endOf(a);
              },
              $ = function (t, e) {
                return b.w(n.toDate()[t].apply(n.toDate("s"), (r ? [0, 0, 0, 0] : [23, 59, 59, 999]).slice(e)), n);
              },
              y = this.$W,
              M = this.$M,
              m = this.$D,
              v = "set" + (this.$u ? "UTC" : "");
            switch (f) {
              case h:
                return r ? l(1, 0) : l(31, 11);
              case c:
                return r ? l(1, M) : l(0, M + 1);
              case o:
                var g = this.$locale().weekStart || 0,
                  D = (y < g ? y + 7 : y) - g;
                return l(r ? m - D : m + (6 - D), M);
              case a:
              case d:
                return $(v + "Hours", 0);
              case u:
                return $(v + "Minutes", 1);
              case s:
                return $(v + "Seconds", 2);
              case i:
                return $(v + "Milliseconds", 3);
              default:
                return this.clone();
            }
          }, m.endOf = function (t) {
            return this.startOf(t, !1);
          }, m.$set = function (t, e) {
            var n,
              o = b.p(t),
              f = "set" + (this.$u ? "UTC" : ""),
              l = (n = {}, n[a] = f + "Date", n[d] = f + "Date", n[c] = f + "Month", n[h] = f + "FullYear", n[u] = f + "Hours", n[s] = f + "Minutes", n[i] = f + "Seconds", n[r] = f + "Milliseconds", n)[o],
              $ = o === a ? this.$D + (e - this.$W) : e;
            if (o === c || o === h) {
              var y = this.clone().set(d, 1);
              y.$d[l]($), y.init(), this.$d = y.set(d, Math.min(this.$D, y.daysInMonth())).$d;
            } else l && this.$d[l]($);
            return this.init(), this;
          }, m.set = function (t, e) {
            return this.clone().$set(t, e);
          }, m.get = function (t) {
            return this[b.p(t)]();
          }, m.add = function (r, f) {
            var d,
              l = this;
            r = Number(r);
            var $ = b.p(f),
              y = function (t) {
                var e = O(l);
                return b.w(e.date(e.date() + Math.round(t * r)), l);
              };
            if ($ === c) return this.set(c, this.$M + r);
            if ($ === h) return this.set(h, this.$y + r);
            if ($ === a) return y(1);
            if ($ === o) return y(7);
            var M = (d = {}, d[s] = e, d[u] = n, d[i] = t, d)[$] || 1,
              m = this.$d.getTime() + r * M;
            return b.w(m, this);
          }, m.subtract = function (t, e) {
            return this.add(-1 * t, e);
          }, m.format = function (t) {
            var e = this,
              n = this.$locale();
            if (!this.isValid()) return n.invalidDate || l;
            var r = t || "YYYY-MM-DDTHH:mm:ssZ",
              i = b.z(this),
              s = this.$H,
              u = this.$m,
              a = this.$M,
              o = n.weekdays,
              c = n.months,
              f = n.meridiem,
              h = function (t, n, i, s) {
                return t && (t[n] || t(e, r)) || i[n].slice(0, s);
              },
              d = function (t) {
                return b.s(s % 12 || 12, t, "0");
              },
              $ = f || function (t, e, n) {
                var r = t < 12 ? "AM" : "PM";
                return n ? r.toLowerCase() : r;
              };
            return r.replace(y, function (t, r) {
              return r || function (t) {
                switch (t) {
                  case "YY":
                    return String(e.$y).slice(-2);
                  case "YYYY":
                    return b.s(e.$y, 4, "0");
                  case "M":
                    return a + 1;
                  case "MM":
                    return b.s(a + 1, 2, "0");
                  case "MMM":
                    return h(n.monthsShort, a, c, 3);
                  case "MMMM":
                    return h(c, a);
                  case "D":
                    return e.$D;
                  case "DD":
                    return b.s(e.$D, 2, "0");
                  case "d":
                    return String(e.$W);
                  case "dd":
                    return h(n.weekdaysMin, e.$W, o, 2);
                  case "ddd":
                    return h(n.weekdaysShort, e.$W, o, 3);
                  case "dddd":
                    return o[e.$W];
                  case "H":
                    return String(s);
                  case "HH":
                    return b.s(s, 2, "0");
                  case "h":
                    return d(1);
                  case "hh":
                    return d(2);
                  case "a":
                    return $(s, u, !0);
                  case "A":
                    return $(s, u, !1);
                  case "m":
                    return String(u);
                  case "mm":
                    return b.s(u, 2, "0");
                  case "s":
                    return String(e.$s);
                  case "ss":
                    return b.s(e.$s, 2, "0");
                  case "SSS":
                    return b.s(e.$ms, 3, "0");
                  case "Z":
                    return i;
                }
                return null;
              }(t) || i.replace(":", "");
            });
          }, m.utcOffset = function () {
            return 15 * -Math.round(this.$d.getTimezoneOffset() / 15);
          }, m.diff = function (r, d, l) {
            var $,
              y = this,
              M = b.p(d),
              m = O(r),
              v = (m.utcOffset() - this.utcOffset()) * e,
              g = this - m,
              D = function () {
                return b.m(y, m);
              };
            switch (M) {
              case h:
                $ = D() / 12;
                break;
              case c:
                $ = D();
                break;
              case f:
                $ = D() / 3;
                break;
              case o:
                $ = (g - v) / 6048e5;
                break;
              case a:
                $ = (g - v) / 864e5;
                break;
              case u:
                $ = g / n;
                break;
              case s:
                $ = g / e;
                break;
              case i:
                $ = g / t;
                break;
              default:
                $ = g;
            }
            return l ? $ : b.a($);
          }, m.daysInMonth = function () {
            return this.endOf(c).$D;
          }, m.$locale = function () {
            return D[this.$L];
          }, m.locale = function (t, e) {
            if (!t) return this.$L;
            var n = this.clone(),
              r = w(t, e, !0);
            return r && (n.$L = r), n;
          }, m.clone = function () {
            return b.w(this.$d, this);
          }, m.toDate = function () {
            return new Date(this.valueOf());
          }, m.toJSON = function () {
            return this.isValid() ? this.toISOString() : null;
          }, m.toISOString = function () {
            return this.$d.toISOString();
          }, m.toString = function () {
            return this.$d.toUTCString();
          }, M;
        }(),
        k = _.prototype;
      return O.prototype = k, [["$ms", r], ["$s", i], ["$m", s], ["$H", u], ["$W", a], ["$M", c], ["$y", h], ["$D", d]].forEach(function (t) {
        k[t[1]] = function (e) {
          return this.$g(e, t[0], t[1]);
        };
      }), O.extend = function (t, e) {
        return t.$i || (t(e, _, O), t.$i = !0), O;
      }, O.locale = w, O.isDayjs = S, O.unix = function (t) {
        return O(1e3 * t);
      }, O.en = D[g], O.Ls = D, O.p = {}, O;
    });
  });
  var PRICE_DISPLAY_TAX_FEE_OPTIONS = {
    INCLUDE_TAXES_FEES: 'includeTaxesFees',
    EXCLUDE_TAXES_FEES: 'excludeTaxesFees',
    INCLUDE_FEES_ONLY: 'includeFeesOnly'
  };
  var _getErrorMessage = function _getErrorMessage(response) {
    return get_1$1(response, 'error_description') || get_1$1(response, 'message');
  };
  var fetchData = function fetchData(url, _ref) {
    var _ref$method = _ref.method,
      method = _ref$method === void 0 ? 'POST' : _ref$method,
      _ref$headers = _ref.headers,
      headers = _ref$headers === void 0 ? {} : _ref$headers,
      _ref$body = _ref.body,
      body = _ref$body === void 0 ? false : _ref$body,
      options = _ref.options,
      _ref$env = _ref.env,
      env = _ref$env === void 0 ? 'ccrsprod' : _ref$env,
      _ref$type = _ref.type,
      type = _ref$type === void 0 ? 'api' : _ref$type,
      signal = _ref.signal,
      urlOverride = _ref.urlOverride;
    var parsedUrl = urlOverride ? urlOverride : get_1$1(environment, "".concat(env).concat(type)) + addQueryParams(url, method, body);
    var fetchOptions = _objectSpread2({
      signal: signal,
      method: method,
      headers: headers
    }, options);
    if (method === 'POST' || method === 'PUT') {
      fetchOptions.body = JSON.stringify(body);
    }
    return fetch(parsedUrl, fetchOptions).then(function (response) {
      if (get_1$1(response, 'status') >= 400) {
        return response.json().then(function (res) {
          return res;
        });
      }
      return response.json();
    }).then(function (response) {
      if (get_1$1(response, 'error')) {
        return {
          success: false,
          error: response.error
        };
      }
      return {
        success: true,
        body: response
      };
    }).catch(function (error) {
      return {
        success: false,
        error: _getErrorMessage(error)
      };
    });
  };
  var addQueryParams = function addQueryParams(url, method, body) {
    if (!isEmpty_1$1(body) && isEqual_1$1(method, 'GET')) {
      var newUrl = url.concat('?');
      return newUrl.concat(queryString.stringify(body));
    }
    return url;
  };
  var getStayInfoForLog = function getStayInfoForLog(formattedRequest) {
    var los = get_1$1(formattedRequest, 'Criterion.LengthOfStay');
    var startDate = get_1$1(formattedRequest, 'Criterion.StartDate');
    var endDate = get_1$1(formattedRequest, 'Criterion.EndDate');
    var calendarDuration = dayjs_min$1(endDate).diff(startDate, 'day');
    return "duration=".concat(calendarDuration ? calendarDuration : '', "|los=").concat(los);
  };
  var getPropsInfoForErrorLogging = function getPropsInfoForErrorLogging(props) {
    if (isEmpty_1$1(props)) {
      return {};
    }
    var filteredProps = Object.keys(props).reduce(function (accumulatedProps, key) {
      if (key !== 'labels') {
        accumulatedProps[key] = props[key];
      }
      return accumulatedProps;
    }, {});
    return filteredProps;
  };
  var translate$1 = function translate(value, labels, object) {
    return get_1$1(labels, value, value).replace(/%{.*?}/g, function (value) {
      var valueWithoutBracelets = value.replace(/%{/g, '').replace(/}/g, '');
      return get_1$1(object, valueWithoutBracelets, valueWithoutBracelets);
    });
  };
  var getCRSImageUrl = function getCRSImageUrl(img, env) {
    if (img && img.includes('http')) {
      return img;
    }
    return "".concat(get_1$1(environment, "".concat(env, ".media")), "/").concat(img.replace('\\', '/'));
  };

  /**
   * Determines the appropriate amount key based on tax/fee display option
   * @param taxFeeDisplayOption price display type for tax/fee
   * @returns {String}
   */
  function getAmountKey(taxFeeDisplayOption) {
    return cond_1$1([[function () {
      return taxFeeDisplayOption === PRICE_DISPLAY_TAX_FEE_OPTIONS.INCLUDE_FEES_ONLY;
    }, constant_1$1('AmountWithFees')], [function () {
      return taxFeeDisplayOption === PRICE_DISPLAY_TAX_FEE_OPTIONS.EXCLUDE_TAXES_FEES;
    }, constant_1$1('Amount')], [stubTrue_1$1, constant_1$1('AmountWithTaxesFees')]])();
  }

  /**
   * Determines the display option for tax and fee based on the provided parameters.
   *
   * @param {boolean} includeTaxes - indicates whether taxes are to be included.
   * @param {string} taxFeeDisplayOption - price display type for tax/fee.
   *
   * @returns {string} - Returns the appropriate tax/fee display option based on the conditions.
   */
  function getTaxFeeDisplayOption(includeTaxes, taxFeeDisplayOption) {
    return cond_1$1([[function () {
      return !!taxFeeDisplayOption;
    }, function () {
      return taxFeeDisplayOption;
    }], [function () {
      return includeTaxes;
    }, function () {
      return PRICE_DISPLAY_TAX_FEE_OPTIONS.INCLUDE_TAXES_FEES;
    }], [stubTrue_1$1, function () {
      return PRICE_DISPLAY_TAX_FEE_OPTIONS.EXCLUDE_TAXES_FEES;
    }]])();
  }
  var currency = {
    "AED": {
      "symbol": "AED",
      "code": "AED",
      "symbol_native": "\u062F.\u0625.\u200F",
      "decimal_digits": 2,
      "rounding": 0.0
    },
    "AFN": {
      "symbol": "AFN",
      "code": "AFN",
      "symbol_native": "؋",
      "decimal_digits": 0
    },
    "ALL": {
      "symbol": "ALL",
      "code": "ALL",
      "symbol_native": "Lekë",
      "decimal_digits": 0
    },
    "AMD": {
      "symbol": "AMD",
      "code": "AMD",
      "symbol_native": "֏",
      "decimal_digits": 0
    },
    "ANG": {
      "symbol": "ANG",
      "code": "ANG",
      "symbol_native": "NAf.",
      "decimal_digits": 2
    },
    "AOA": {
      "symbol": "AOA",
      "code": "AOA",
      "symbol_native": "Kz",
      "decimal_digits": 2
    },
    "ARS": {
      "symbol": "ARS",
      "code": "ARS",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "AUD": {
      "symbol": "AUD",
      "code": "AUD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "AWG": {
      "symbol": "AWG",
      "code": "AWG",
      "symbol_native": "Afl.",
      "decimal_digits": 2
    },
    "AZN": {
      "symbol": "AZN",
      "code": "AZN",
      "symbol_native": "\u20BC",
      "decimal_digits": 2
    },
    "BAM": {
      "symbol": "BAM",
      "code": "BAM",
      "symbol_native": "КМ",
      "decimal_digits": 2
    },
    "BBD": {
      "symbol": "BBD",
      "code": "BBD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "BDT": {
      "symbol": "BDT",
      "code": "BDT",
      "symbol_native": "৳",
      "decimal_digits": 2
    },
    "BGN": {
      "symbol": "BGN",
      "code": "BGN",
      "symbol_native": "лв.",
      "decimal_digits": 2
    },
    "BHD": {
      "symbol": "BHD",
      "code": "BHD",
      "symbol_native": "\u062F.\u0628.\u200F",
      "decimal_digits": 3
    },
    "BIF": {
      "symbol": "BIF",
      "code": "BIF",
      "symbol_native": "FBu",
      "decimal_digits": 0
    },
    "BMD": {
      "symbol": "BMD",
      "code": "BMD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "BND": {
      "symbol": "BND",
      "code": "BND",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "BOB": {
      "symbol": "BOB",
      "code": "BOB",
      "symbol_native": "Bs",
      "decimal_digits": 2
    },
    "BOV": {
      "symbol": "BOV",
      "code": "BOV",
      "symbol_native": "BOV",
      "decimal_digits": 2
    },
    "BRL": {
      "symbol": "R$",
      "code": "BRL",
      "symbol_native": "R$",
      "decimal_digits": 2
    },
    "BSD": {
      "symbol": "BSD",
      "code": "BSD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "BTN": {
      "symbol": "BTN",
      "code": "BTN",
      "symbol_native": "Nu.",
      "decimal_digits": 2
    },
    "BWP": {
      "symbol": "BWP",
      "code": "BWP",
      "symbol_native": "P",
      "decimal_digits": 2
    },
    "BYN": {
      "symbol": "BYN",
      "code": "BYN",
      "symbol_native": "Br",
      "decimal_digits": 2
    },
    "BZD": {
      "symbol": "BZD",
      "code": "BZD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "CAD": {
      "symbol": "CAD",
      "code": "CAD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "CDF": {
      "symbol": "CDF",
      "code": "CDF",
      "symbol_native": "FC",
      "decimal_digits": 2
    },
    "CHE": {
      "symbol": "CHE",
      "code": "CHE",
      "symbol_native": "CHE",
      "decimal_digits": 2
    },
    "CHF": {
      "symbol": "CHF",
      "code": "CHF",
      "symbol_native": "CHF",
      "decimal_digits": 2
    },
    "CHW": {
      "symbol": "CHW",
      "code": "CHW",
      "symbol_native": "CHW",
      "decimal_digits": 2
    },
    "CLF": {
      "symbol": "CLF",
      "code": "CLF",
      "symbol_native": "CLF",
      "decimal_digits": 4
    },
    "CLP": {
      "symbol": "CLP",
      "code": "CLP",
      "symbol_native": "$",
      "decimal_digits": 0
    },
    "CNH": {
      "symbol": "CNH",
      "code": "CNH",
      "symbol_native": "CNH",
      "decimal_digits": 2
    },
    "CNY": {
      "symbol": "CNY",
      "code": "CNY",
      "symbol_native": "¥",
      "decimal_digits": 2
    },
    "COP": {
      "symbol": "COP",
      "code": "COP",
      "symbol_native": "$",
      "decimal_digits": 0
    },
    "COU": {
      "symbol": "COU",
      "code": "COU",
      "symbol_native": "COU",
      "decimal_digits": 2
    },
    "CRC": {
      "symbol": "CRC",
      "code": "CRC",
      "symbol_native": "\u20A1",
      "decimal_digits": 2
    },
    "CUC": {
      "symbol": "CUC",
      "code": "CUC",
      "symbol_native": "CUC",
      "decimal_digits": 2
    },
    "CUP": {
      "symbol": "CUP",
      "code": "CUP",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "CVE": {
      "symbol": "CVE",
      "code": "CVE",
      "symbol_native": "\u200B",
      "decimal_digits": 2
    },
    "CZK": {
      "symbol": "CZK",
      "code": "CZK",
      "symbol_native": "Kč",
      "decimal_digits": 2
    },
    "DJF": {
      "symbol": "DJF",
      "code": "DJF",
      "symbol_native": "Fdj",
      "decimal_digits": 0
    },
    "DKK": {
      "symbol": "DKK",
      "code": "DKK",
      "symbol_native": "kr.",
      "decimal_digits": 2
    },
    "DOP": {
      "symbol": "DOP",
      "code": "DOP",
      "symbol_native": "RD$",
      "decimal_digits": 2
    },
    "DZD": {
      "symbol": "DZD",
      "code": "DZD",
      "symbol_native": "\u062F.\u062C.\u200F",
      "decimal_digits": 2
    },
    "EGP": {
      "symbol": "EGP",
      "code": "EGP",
      "symbol_native": "\u062C.\u0645.\u200F",
      "decimal_digits": 2
    },
    "ERN": {
      "symbol": "ERN",
      "code": "ERN",
      "symbol_native": "Nfk",
      "decimal_digits": 2
    },
    "ETB": {
      "symbol": "ETB",
      "code": "ETB",
      "symbol_native": "ብር",
      "decimal_digits": 2
    },
    "EUR": {
      "symbol": "\u20AC",
      "code": "EUR",
      "symbol_native": "\u20AC",
      "decimal_digits": 2
    },
    "FJD": {
      "symbol": "FJD",
      "code": "FJD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "FKP": {
      "symbol": "FKP",
      "code": "FKP",
      "symbol_native": "£",
      "decimal_digits": 2
    },
    "GBP": {
      "symbol": "GBP",
      "code": "GBP",
      "symbol_native": "£",
      "decimal_digits": 2
    },
    "GEL": {
      "symbol": "GEL",
      "code": "GEL",
      "symbol_native": "\u20BE",
      "decimal_digits": 2
    },
    "GHS": {
      "symbol": "GHS",
      "code": "GHS",
      "symbol_native": "GH\u20B5",
      "decimal_digits": 2
    },
    "GIP": {
      "symbol": "GIP",
      "code": "GIP",
      "symbol_native": "£",
      "decimal_digits": 2
    },
    "GMD": {
      "symbol": "GMD",
      "code": "GMD",
      "symbol_native": "D",
      "decimal_digits": 2
    },
    "GNF": {
      "symbol": "GNF",
      "code": "GNF",
      "symbol_native": "FG",
      "decimal_digits": 0
    },
    "GTQ": {
      "symbol": "GTQ",
      "code": "GTQ",
      "symbol_native": "Q",
      "decimal_digits": 2
    },
    "GYD": {
      "symbol": "GYD",
      "code": "GYD",
      "symbol_native": "$",
      "decimal_digits": 0
    },
    "HKD": {
      "symbol": "HKD",
      "code": "HKD",
      "symbol_native": "HK$",
      "decimal_digits": 2
    },
    "HNL": {
      "symbol": "HNL",
      "code": "HNL",
      "symbol_native": "L",
      "decimal_digits": 2
    },
    "HRK": {
      "symbol": "HRK",
      "code": "HRK",
      "symbol_native": "HRK",
      "decimal_digits": 2
    },
    "HTG": {
      "symbol": "HTG",
      "code": "HTG",
      "symbol_native": "G",
      "decimal_digits": 2
    },
    "HUF": {
      "symbol": "HUF",
      "code": "HUF",
      "symbol_native": "Ft",
      "decimal_digits": 2
    },
    "IDR": {
      "symbol": "IDR",
      "code": "IDR",
      "symbol_native": "Rp",
      "decimal_digits": 0
    },
    "ILS": {
      "symbol": "ILS",
      "code": "ILS",
      "symbol_native": "\u20AA",
      "decimal_digits": 2
    },
    "INR": {
      "symbol": "INR",
      "code": "INR",
      "symbol_native": "\u20B9",
      "decimal_digits": 2
    },
    "IQD": {
      "symbol": "IQD",
      "code": "IQD",
      "symbol_native": "\u062F.\u0639.\u200F",
      "decimal_digits": 0
    },
    "IRR": {
      "symbol": "IRR",
      "code": "IRR",
      "symbol_native": "IRR",
      "decimal_digits": 0
    },
    "ISK": {
      "symbol": "ISK",
      "code": "ISK",
      "symbol_native": "ISK",
      "decimal_digits": 0
    },
    "JMD": {
      "symbol": "JMD",
      "code": "JMD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "JOD": {
      "symbol": "JOD",
      "code": "JOD",
      "symbol_native": "\u062F.\u0623.\u200F",
      "decimal_digits": 3
    },
    "JPY": {
      "symbol": "JPY",
      "code": "JPY",
      "symbol_native": "￥",
      "decimal_digits": 0
    },
    "KES": {
      "symbol": "KES",
      "code": "KES",
      "symbol_native": "Ksh",
      "decimal_digits": 2
    },
    "KGS": {
      "symbol": "KGS",
      "code": "KGS",
      "symbol_native": "сом",
      "decimal_digits": 2
    },
    "KHR": {
      "symbol": "KHR",
      "code": "KHR",
      "symbol_native": "៛",
      "decimal_digits": 2
    },
    "KMF": {
      "symbol": "KMF",
      "code": "KMF",
      "symbol_native": "CF",
      "decimal_digits": 0
    },
    "KPW": {
      "symbol": "KPW",
      "code": "KPW",
      "symbol_native": "KPW",
      "decimal_digits": 0
    },
    "KRW": {
      "symbol": "KRW",
      "code": "KRW",
      "symbol_native": "\u20A9",
      "decimal_digits": 0
    },
    "KWD": {
      "symbol": "KWD",
      "code": "KWD",
      "symbol_native": "\u062F.\u0643.\u200F",
      "decimal_digits": 3
    },
    "KYD": {
      "symbol": "KYD",
      "code": "KYD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "KZT": {
      "symbol": "KZT",
      "code": "KZT",
      "symbol_native": "\u20B8",
      "decimal_digits": 2
    },
    "LAK": {
      "symbol": "LAK",
      "code": "LAK",
      "symbol_native": "\u20AD",
      "decimal_digits": 0
    },
    "LBP": {
      "symbol": "LBP",
      "code": "LBP",
      "symbol_native": "\u0644.\u0644.\u200F",
      "decimal_digits": 0
    },
    "LKR": {
      "symbol": "LKR",
      "code": "LKR",
      "symbol_native": "රු.",
      "decimal_digits": 2
    },
    "LRD": {
      "symbol": "LRD",
      "code": "LRD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "LSL": {
      "symbol": "LSL",
      "code": "LSL",
      "symbol_native": "LSL",
      "decimal_digits": 2
    },
    "LYD": {
      "symbol": "LYD",
      "code": "LYD",
      "symbol_native": "\u062F.\u0644.\u200F",
      "decimal_digits": 3
    },
    "MAD": {
      "symbol": "MAD",
      "code": "MAD",
      "symbol_native": "\u062F.\u0645.\u200F",
      "decimal_digits": 2
    },
    "MDL": {
      "symbol": "MDL",
      "code": "MDL",
      "symbol_native": "L",
      "decimal_digits": 2
    },
    "MGA": {
      "symbol": "MGA",
      "code": "MGA",
      "symbol_native": "Ar",
      "decimal_digits": 0
    },
    "MKD": {
      "symbol": "MKD",
      "code": "MKD",
      "symbol_native": "ден",
      "decimal_digits": 2
    },
    "MMK": {
      "symbol": "MMK",
      "code": "MMK",
      "symbol_native": "K",
      "decimal_digits": 0
    },
    "MNT": {
      "symbol": "MNT",
      "code": "MNT",
      "symbol_native": "\u20AE",
      "decimal_digits": 0
    },
    "MOP": {
      "symbol": "MOP",
      "code": "MOP",
      "symbol_native": "MOP$",
      "decimal_digits": 2
    },
    "MRO": {
      "symbol": "MRO",
      "code": "MRO",
      "symbol_native": "\u0623.\u0645.\u200F",
      "decimal_digits": 0
    },
    "MUR": {
      "symbol": "MUR",
      "code": "MUR",
      "symbol_native": "Rs",
      "decimal_digits": 0
    },
    "MWK": {
      "symbol": "MWK",
      "code": "MWK",
      "symbol_native": "MK",
      "decimal_digits": 2
    },
    "MXN": {
      "symbol": "MXN",
      "code": "MXN",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "MXV": {
      "symbol": "MXV",
      "code": "MXV",
      "symbol_native": "MXV",
      "decimal_digits": 2
    },
    "MYR": {
      "symbol": "MYR",
      "code": "MYR",
      "symbol_native": "RM",
      "decimal_digits": 2
    },
    "MZN": {
      "symbol": "MZN",
      "code": "MZN",
      "symbol_native": "MTn",
      "decimal_digits": 2
    },
    "NAD": {
      "symbol": "NAD",
      "code": "NAD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "NGN": {
      "symbol": "NGN",
      "code": "NGN",
      "symbol_native": "\u20A6",
      "decimal_digits": 2
    },
    "NIO": {
      "symbol": "NIO",
      "code": "NIO",
      "symbol_native": "C$",
      "decimal_digits": 2
    },
    "NOK": {
      "symbol": "NOK",
      "code": "NOK",
      "symbol_native": "kr",
      "decimal_digits": 2
    },
    "NPR": {
      "symbol": "NPR",
      "code": "NPR",
      "symbol_native": "नेरू",
      "decimal_digits": 2
    },
    "NZD": {
      "symbol": "NZD",
      "code": "NZD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "OMR": {
      "symbol": "OMR",
      "code": "OMR",
      "symbol_native": "\u0631.\u0639.\u200F",
      "decimal_digits": 3
    },
    "PAB": {
      "symbol": "PAB",
      "code": "PAB",
      "symbol_native": "B\/.",
      "decimal_digits": 2
    },
    "PEN": {
      "symbol": "PEN",
      "code": "PEN",
      "symbol_native": "S\/",
      "decimal_digits": 2
    },
    "PGK": {
      "symbol": "PGK",
      "code": "PGK",
      "symbol_native": "K",
      "decimal_digits": 2
    },
    "PHP": {
      "symbol": "PHP",
      "code": "PHP",
      "symbol_native": "\u20B1",
      "decimal_digits": 2
    },
    "PKR": {
      "symbol": "PKR",
      "code": "PKR",
      "symbol_native": "Rs",
      "decimal_digits": 0
    },
    "PLN": {
      "symbol": "zł",
      "code": "PLN",
      "symbol_native": "zł",
      "decimal_digits": 2
    },
    "PYG": {
      "symbol": "PYG",
      "code": "PYG",
      "symbol_native": "Gs.",
      "decimal_digits": 0
    },
    "QAR": {
      "symbol": "QAR",
      "code": "QAR",
      "symbol_native": "\u0631.\u0642.\u200F",
      "decimal_digits": 2
    },
    "RON": {
      "symbol": "RON",
      "code": "RON",
      "symbol_native": "RON",
      "decimal_digits": 2
    },
    "RSD": {
      "symbol": "RSD",
      "code": "RSD",
      "symbol_native": "RSD",
      "decimal_digits": 0
    },
    "RUB": {
      "symbol": "RUB",
      "code": "RUB",
      "symbol_native": "\u20BD",
      "decimal_digits": 2
    },
    "RWF": {
      "symbol": "RWF",
      "code": "RWF",
      "symbol_native": "RF",
      "decimal_digits": 0
    },
    "SAR": {
      "symbol": "SAR",
      "code": "SAR",
      "symbol_native": "\u0631.\u0633.\u200F",
      "decimal_digits": 2
    },
    "SBD": {
      "symbol": "SBD",
      "code": "SBD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "SCR": {
      "symbol": "SCR",
      "code": "SCR",
      "symbol_native": "SR",
      "decimal_digits": 2
    },
    "SDG": {
      "symbol": "SDG",
      "code": "SDG",
      "symbol_native": "ج.س.",
      "decimal_digits": 2
    },
    "SEK": {
      "symbol": "SEK",
      "code": "SEK",
      "symbol_native": "kr",
      "decimal_digits": 2
    },
    "SGD": {
      "symbol": "SGD",
      "code": "SGD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "SHP": {
      "symbol": "SHP",
      "code": "SHP",
      "symbol_native": "£",
      "decimal_digits": 2
    },
    "SLL": {
      "symbol": "SLL",
      "code": "SLL",
      "symbol_native": "Le",
      "decimal_digits": 0
    },
    "SOS": {
      "symbol": "SOS",
      "code": "SOS",
      "symbol_native": "S",
      "decimal_digits": 0
    },
    "SRD": {
      "symbol": "SRD",
      "code": "SRD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "SSP": {
      "symbol": "SSP",
      "code": "SSP",
      "symbol_native": "£",
      "decimal_digits": 2
    },
    "STN": {
      "symbol": "STN",
      "code": "STN",
      "symbol_native": "STN",
      "decimal_digits": 2
    },
    "SYP": {
      "symbol": "SYP",
      "code": "SYP",
      "symbol_native": "\u0644.\u0633.\u200F",
      "decimal_digits": 0
    },
    "SZL": {
      "symbol": "SZL",
      "code": "SZL",
      "symbol_native": "E",
      "decimal_digits": 2
    },
    "THB": {
      "symbol": "THB",
      "code": "THB",
      "symbol_native": "THB",
      "decimal_digits": 2
    },
    "TJS": {
      "symbol": "TJS",
      "code": "TJS",
      "symbol_native": "сом.",
      "decimal_digits": 2
    },
    "TND": {
      "symbol": "TND",
      "code": "TND",
      "symbol_native": "\u062F.\u062A.\u200F",
      "decimal_digits": 3
    },
    "TOP": {
      "symbol": "TOP",
      "code": "TOP",
      "symbol_native": "T$",
      "decimal_digits": 2
    },
    "TRY": {
      "symbol": "TRY",
      "code": "TRY",
      "symbol_native": "\u20BA",
      "decimal_digits": 2
    },
    "TTD": {
      "symbol": "TTD",
      "code": "TTD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "TWD": {
      "symbol": "TWD",
      "code": "TWD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "TZS": {
      "symbol": "TZS",
      "code": "TZS",
      "symbol_native": "TSh",
      "decimal_digits": 0
    },
    "UAH": {
      "symbol": "UAH",
      "code": "UAH",
      "symbol_native": "\u20B4",
      "decimal_digits": 2
    },
    "UGX": {
      "symbol": "UGX",
      "code": "UGX",
      "symbol_native": "USh",
      "decimal_digits": 0
    },
    "USD": {
      "symbol": "USD",
      "code": "USD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "USN": {
      "symbol": "USN",
      "code": "USN",
      "symbol_native": "USN",
      "decimal_digits": 2
    },
    "UYI": {
      "symbol": "UYI",
      "code": "UYI",
      "symbol_native": "UYI",
      "decimal_digits": 0
    },
    "UYU": {
      "symbol": "UYU",
      "code": "UYU",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "UZS": {
      "symbol": "UZS",
      "code": "UZS",
      "symbol_native": "сўм",
      "decimal_digits": 0
    },
    "VEF": {
      "symbol": "VEF",
      "code": "VEF",
      "symbol_native": "Bs.",
      "decimal_digits": 2
    },
    "VND": {
      "symbol": "VND",
      "code": "VND",
      "symbol_native": "\u20AB",
      "decimal_digits": 0
    },
    "VUV": {
      "symbol": "VUV",
      "code": "VUV",
      "symbol_native": "VT",
      "decimal_digits": 0
    },
    "WST": {
      "symbol": "WST",
      "code": "WST",
      "symbol_native": "WS$",
      "decimal_digits": 2
    },
    "XAF": {
      "symbol": "FCFA",
      "code": "XAF",
      "symbol_native": "FCFA",
      "decimal_digits": 0
    },
    "XCD": {
      "symbol": "EC$",
      "code": "XCD",
      "symbol_native": "$",
      "decimal_digits": 2
    },
    "XOF": {
      "symbol": "CFA",
      "code": "XOF",
      "symbol_native": "CFA",
      "decimal_digits": 0
    },
    "XPF": {
      "symbol": "CFPF",
      "code": "XPF",
      "symbol_native": "FCFP",
      "decimal_digits": 0
    },
    "YER": {
      "symbol": "YER",
      "code": "YER",
      "symbol_native": "\u0631.\u064A.\u200F",
      "decimal_digits": 0
    },
    "ZAR": {
      "symbol": "ZAR",
      "code": "ZAR",
      "symbol_native": "R",
      "decimal_digits": 2
    },
    "ZMW": {
      "symbol": "ZMW",
      "code": "ZMW",
      "symbol_native": "K",
      "decimal_digits": 2
    }
  };
  var label = {
    'shs-widgets--generic.error.InvalidApiKey.title': 'Invalid API Key',
    'shs-widgets--generic.error.InvalidApiKey.description': 'Your API Key is invalid. Please make sure you typed it correct.',
    'shs-widgets--generic.error.NoProduct.title': 'Invalid Product',
    'shs-widgets--generic.error.NoProduct.description': 'The requested product does not exist. Please check your setup and try again.',
    'shs-widgets--generic.error.ReferrerNotAllowed.title': 'Invalid domain',
    'shs-widgets--generic.error.ReferrerNotAllowed.description': 'Your website is missing an access for this widget.',
    'shs-widgets--generic.error.InvalidRequest.title': 'Error',
    'shs-widgets--generic.error.InvalidRequest.description': 'Something wrong with your configuration. Please validate parameters.',
    'shs-widgets--generic.error.InvalidHotelId.title': 'Invalid hotel ID',
    'shs-widgets--generic.error.InvalidHotelId.description': 'Please make sure you are providing a valid hotel ID',
    'shs-widgets--generic.error.InvalidChainId.title': 'Invalid chain ID',
    'shs-widgets--generic.error.InvalidChainId.description': 'Please make sure you are providing a valid chain ID'
  };
  function getEnvUrl(env) {
    return get_1$1(environment, "[".concat(env, "].api")) || env;
  }
  function logEvent(_x, _x2, _x3) {
    return _logEvent.apply(this, arguments);
  }
  function _logEvent() {
    _logEvent = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee(data, env, apiKey) {
      var envURL;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.prev = 0;
            if (!(!env || !apiKey || !data)) {
              _context.next = 3;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 3:
            envURL = getEnvUrl(env);
            _context.next = 6;
            return axios({
              url: "".concat(envURL, "/gw/v1/log/events"),
              method: 'post',
              data: data,
              headers: {
                'Content-Type': 'application/json'
              }
            });
          case 6:
            return _context.abrupt("return", _context.sent);
          case 9:
            _context.prev = 9;
            _context.t0 = _context["catch"](0);
            console.error(_context.t0);
            return _context.abrupt("return", _context.t0);
          case 13:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [[0, 9]]);
    }));
    return _logEvent.apply(this, arguments);
  }
  function getLeadAvailability(_x4, _x5, _x6, _x7) {
    return _getLeadAvailability.apply(this, arguments);
  }
  function _getLeadAvailability() {
    _getLeadAvailability = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee2(data, env, apiKey, activityId) {
      var isExternalContext,
        envURL,
        _args2 = arguments;
      return _regeneratorRuntime().wrap(function _callee2$(_context2) {
        while (1) switch (_context2.prev = _context2.next) {
          case 0:
            isExternalContext = _args2.length > 4 && _args2[4] !== undefined ? _args2[4] : false;
            _context2.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context2.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context2.next = 7;
            return axios({
              url: "".concat(envURL, "/gw/product/v1/getLeadAvailability"),
              method: 'post',
              data: data,
              headers: {
                activityid: activityId || v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context2.abrupt("return", _context2.sent);
          case 10:
            _context2.prev = 10;
            _context2.t0 = _context2["catch"](1);
            console.error(_context2.t0);
            return _context2.abrupt("return", _context2.t0);
          case 14:
          case "end":
            return _context2.stop();
        }
      }, _callee2, null, [[1, 10]]);
    }));
    return _getLeadAvailability.apply(this, arguments);
  }
  function queryReservation(_x8, _x9, _x10) {
    return _queryReservation.apply(this, arguments);
  }
  function _queryReservation() {
    _queryReservation = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee3(data, env, apiKey) {
      var isExternalContext,
        envURL,
        _args3 = arguments;
      return _regeneratorRuntime().wrap(function _callee3$(_context3) {
        while (1) switch (_context3.prev = _context3.next) {
          case 0:
            isExternalContext = _args3.length > 3 && _args3[3] !== undefined ? _args3[3] : false;
            _context3.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context3.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context3.next = 7;
            return axios({
              withCredentials: true,
              url: "".concat(envURL, "/gw/itinerary/v1/queryReservation"),
              method: 'post',
              data: data,
              headers: {
                activityid: v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context3.abrupt("return", _context3.sent);
          case 10:
            _context3.prev = 10;
            _context3.t0 = _context3["catch"](1);
            console.error(_context3.t0);
            return _context3.abrupt("return", _context3.t0);
          case 14:
          case "end":
            return _context3.stop();
        }
      }, _callee3, null, [[1, 10]]);
    }));
    return _queryReservation.apply(this, arguments);
  }
  function queryProducts(_x11, _x12, _x13) {
    return _queryProducts.apply(this, arguments);
  }
  function _queryProducts() {
    _queryProducts = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee4(data, env, apiKey) {
      var isExternalContext,
        envURL,
        _args4 = arguments;
      return _regeneratorRuntime().wrap(function _callee4$(_context4) {
        while (1) switch (_context4.prev = _context4.next) {
          case 0:
            isExternalContext = _args4.length > 3 && _args4[3] !== undefined ? _args4[3] : false;
            _context4.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context4.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context4.next = 7;
            return axios({
              url: "".concat(envURL, "/gw/product/v1/QueryProducts"),
              method: 'post',
              data: data,
              headers: {
                activityid: v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context4.abrupt("return", _context4.sent);
          case 10:
            _context4.prev = 10;
            _context4.t0 = _context4["catch"](1);
            console.error(_context4.t0);
            return _context4.abrupt("return", _context4.t0);
          case 14:
          case "end":
            return _context4.stop();
        }
      }, _callee4, null, [[1, 10]]);
    }));
    return _queryProducts.apply(this, arguments);
  }
  function createReservation(_x17, _x18, _x19) {
    return _createReservation.apply(this, arguments);
  }
  function _createReservation() {
    _createReservation = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee6(data, env, apiKey) {
      var isExternalContext,
        envURL,
        _args6 = arguments;
      return _regeneratorRuntime().wrap(function _callee6$(_context6) {
        while (1) switch (_context6.prev = _context6.next) {
          case 0:
            isExternalContext = _args6.length > 3 && _args6[3] !== undefined ? _args6[3] : false;
            _context6.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context6.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context6.next = 7;
            return axios({
              withCredentials: true,
              url: "".concat(envURL, "/gw/itinerary/v1/createReservation"),
              method: 'post',
              data: data,
              headers: {
                activityid: v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context6.abrupt("return", _context6.sent);
          case 10:
            _context6.prev = 10;
            _context6.t0 = _context6["catch"](1);
            console.error(_context6.t0);
            return _context6.abrupt("return", _context6.t0);
          case 14:
          case "end":
            return _context6.stop();
        }
      }, _callee6, null, [[1, 10]]);
    }));
    return _createReservation.apply(this, arguments);
  }
  function updateReservation(_x20, _x21, _x22) {
    return _updateReservation.apply(this, arguments);
  }
  function _updateReservation() {
    _updateReservation = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee7(data, env, apiKey) {
      var isExternalContext,
        envURL,
        _args7 = arguments;
      return _regeneratorRuntime().wrap(function _callee7$(_context7) {
        while (1) switch (_context7.prev = _context7.next) {
          case 0:
            isExternalContext = _args7.length > 3 && _args7[3] !== undefined ? _args7[3] : false;
            _context7.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context7.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context7.next = 7;
            return axios({
              withCredentials: true,
              url: "".concat(envURL, "/gw/itinerary/v1/updateReservation"),
              method: 'post',
              data: data,
              headers: {
                activityid: v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context7.abrupt("return", _context7.sent);
          case 10:
            _context7.prev = 10;
            _context7.t0 = _context7["catch"](1);
            console.error(_context7.t0);
            return _context7.abrupt("return", _context7.t0);
          case 14:
          case "end":
            return _context7.stop();
        }
      }, _callee7, null, [[1, 10]]);
    }));
    return _updateReservation.apply(this, arguments);
  }
  function cancelReservation(_x23, _x24, _x25) {
    return _cancelReservation.apply(this, arguments);
  }
  function _cancelReservation() {
    _cancelReservation = _asyncToGenerator(/*#__PURE__*/_regeneratorRuntime().mark(function _callee8(data, env, apiKey) {
      var isExternalContext,
        envURL,
        _args8 = arguments;
      return _regeneratorRuntime().wrap(function _callee8$(_context8) {
        while (1) switch (_context8.prev = _context8.next) {
          case 0:
            isExternalContext = _args8.length > 3 && _args8[3] !== undefined ? _args8[3] : false;
            _context8.prev = 1;
            if (!(!env || !apiKey || !data)) {
              _context8.next = 4;
              break;
            }
            throw new Error('Missing required parameters (data, env, apiKey)');
          case 4:
            envURL = isExternalContext ? getEnvUrl(env) : '';
            _context8.next = 7;
            return axios({
              withCredentials: true,
              url: "".concat(envURL, "/gw/itinerary/v1/CancelReservation"),
              method: 'post',
              data: data,
              headers: {
                activityid: v1_1(),
                'Content-Type': 'application/json',
                Authorization: "ApiKey ".concat(apiKey)
              }
            });
          case 7:
            return _context8.abrupt("return", _context8.sent);
          case 10:
            _context8.prev = 10;
            _context8.t0 = _context8["catch"](1);
            console.error(_context8.t0);
            return _context8.abrupt("return", _context8.t0);
          case 14:
          case "end":
            return _context8.stop();
        }
      }, _callee8, null, [[1, 10]]);
    }));
    return _cancelReservation.apply(this, arguments);
  }
  var widgetServices = {
    createReservation: createReservation,
    updateReservation: updateReservation,
    cancelReservation: cancelReservation,
    queryProducts: queryProducts,
    queryReservation: queryReservation,
    getLeadAvailability: getLeadAvailability,
    logEvent: logEvent
  };
  var currencies = _objectSpread2({}, currency);
  var environments = _objectSpread2({}, environment);
  var labels = _objectSpread2({}, label);
  var constants = {
    PRICE_DISPLAY_TAX_FEE_OPTIONS: PRICE_DISPLAY_TAX_FEE_OPTIONS
  };
  var utils = {
    fetchData: fetchData,
    translate: translate$1,
    getCRSImageUrl: getCRSImageUrl,
    getPropsInfoForErrorLogging: getPropsInfoForErrorLogging,
    getStayInfoForLog: getStayInfoForLog,
    getAmountKey: getAmountKey,
    getTaxFeeDisplayOption: getTaxFeeDisplayOption
  };

  /**
   * Casts `value` to `identity` if it's not a function.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {Function} Returns cast function.
   */
  function castFunction(value) {
    return typeof value == 'function' ? value : identity_1;
  }

  var _castFunction = castFunction;

  /** Used as references for various `Number` constants. */
  var MAX_SAFE_INTEGER$4 = 9007199254740991;

  /** Used as references for the maximum length and index of an array. */
  var MAX_ARRAY_LENGTH = 4294967295;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeMin = Math.min;

  /**
   * Invokes the iteratee `n` times, returning an array of the results of
   * each invocation. The iteratee is invoked with one argument; (index).
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} [iteratee=_.identity] The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   * @example
   *
   * _.times(3, String);
   * // => ['0', '1', '2']
   *
   *  _.times(4, _.constant(0));
   * // => [0, 0, 0, 0]
   */
  function times(n, iteratee) {
    n = toInteger_1(n);
    if (n < 1 || n > MAX_SAFE_INTEGER$4) {
      return [];
    }
    var index = MAX_ARRAY_LENGTH,
        length = nativeMin(n, MAX_ARRAY_LENGTH);

    iteratee = _castFunction(iteratee);
    n -= MAX_ARRAY_LENGTH;

    var result = _baseTimes(length, iteratee);
    while (++index < n) {
      iteratee(index);
    }
    return result;
  }

  var times_1 = times;

  var moment = createCommonjsModule(function (module, exports) {
  (function (global, factory) {
       module.exports = factory() ;
  }(commonjsGlobal, (function () {
      var hookCallback;

      function hooks () {
          return hookCallback.apply(null, arguments);
      }

      // This is done to register the method called with moment()
      // without creating circular dependencies.
      function setHookCallback (callback) {
          hookCallback = callback;
      }

      function isArray(input) {
          return input instanceof Array || Object.prototype.toString.call(input) === '[object Array]';
      }

      function isObject(input) {
          // IE8 will treat undefined and null as object if it wasn't for
          // input != null
          return input != null && Object.prototype.toString.call(input) === '[object Object]';
      }

      function isObjectEmpty(obj) {
          if (Object.getOwnPropertyNames) {
              return (Object.getOwnPropertyNames(obj).length === 0);
          } else {
              var k;
              for (k in obj) {
                  if (obj.hasOwnProperty(k)) {
                      return false;
                  }
              }
              return true;
          }
      }

      function isUndefined(input) {
          return input === void 0;
      }

      function isNumber(input) {
          return typeof input === 'number' || Object.prototype.toString.call(input) === '[object Number]';
      }

      function isDate(input) {
          return input instanceof Date || Object.prototype.toString.call(input) === '[object Date]';
      }

      function map(arr, fn) {
          var res = [], i;
          for (i = 0; i < arr.length; ++i) {
              res.push(fn(arr[i], i));
          }
          return res;
      }

      function hasOwnProp(a, b) {
          return Object.prototype.hasOwnProperty.call(a, b);
      }

      function extend(a, b) {
          for (var i in b) {
              if (hasOwnProp(b, i)) {
                  a[i] = b[i];
              }
          }

          if (hasOwnProp(b, 'toString')) {
              a.toString = b.toString;
          }

          if (hasOwnProp(b, 'valueOf')) {
              a.valueOf = b.valueOf;
          }

          return a;
      }

      function createUTC (input, format, locale, strict) {
          return createLocalOrUTC(input, format, locale, strict, true).utc();
      }

      function defaultParsingFlags() {
          // We need to deep clone this object.
          return {
              empty           : false,
              unusedTokens    : [],
              unusedInput     : [],
              overflow        : -2,
              charsLeftOver   : 0,
              nullInput       : false,
              invalidMonth    : null,
              invalidFormat   : false,
              userInvalidated : false,
              iso             : false,
              parsedDateParts : [],
              meridiem        : null,
              rfc2822         : false,
              weekdayMismatch : false
          };
      }

      function getParsingFlags(m) {
          if (m._pf == null) {
              m._pf = defaultParsingFlags();
          }
          return m._pf;
      }

      var some;
      if (Array.prototype.some) {
          some = Array.prototype.some;
      } else {
          some = function (fun) {
              var t = Object(this);
              var len = t.length >>> 0;

              for (var i = 0; i < len; i++) {
                  if (i in t && fun.call(this, t[i], i, t)) {
                      return true;
                  }
              }

              return false;
          };
      }

      function isValid(m) {
          if (m._isValid == null) {
              var flags = getParsingFlags(m);
              var parsedParts = some.call(flags.parsedDateParts, function (i) {
                  return i != null;
              });
              var isNowValid = !isNaN(m._d.getTime()) &&
                  flags.overflow < 0 &&
                  !flags.empty &&
                  !flags.invalidMonth &&
                  !flags.invalidWeekday &&
                  !flags.weekdayMismatch &&
                  !flags.nullInput &&
                  !flags.invalidFormat &&
                  !flags.userInvalidated &&
                  (!flags.meridiem || (flags.meridiem && parsedParts));

              if (m._strict) {
                  isNowValid = isNowValid &&
                      flags.charsLeftOver === 0 &&
                      flags.unusedTokens.length === 0 &&
                      flags.bigHour === undefined;
              }

              if (Object.isFrozen == null || !Object.isFrozen(m)) {
                  m._isValid = isNowValid;
              }
              else {
                  return isNowValid;
              }
          }
          return m._isValid;
      }

      function createInvalid (flags) {
          var m = createUTC(NaN);
          if (flags != null) {
              extend(getParsingFlags(m), flags);
          }
          else {
              getParsingFlags(m).userInvalidated = true;
          }

          return m;
      }

      // Plugins that add properties should also add the key here (null value),
      // so we can properly clone ourselves.
      var momentProperties = hooks.momentProperties = [];

      function copyConfig(to, from) {
          var i, prop, val;

          if (!isUndefined(from._isAMomentObject)) {
              to._isAMomentObject = from._isAMomentObject;
          }
          if (!isUndefined(from._i)) {
              to._i = from._i;
          }
          if (!isUndefined(from._f)) {
              to._f = from._f;
          }
          if (!isUndefined(from._l)) {
              to._l = from._l;
          }
          if (!isUndefined(from._strict)) {
              to._strict = from._strict;
          }
          if (!isUndefined(from._tzm)) {
              to._tzm = from._tzm;
          }
          if (!isUndefined(from._isUTC)) {
              to._isUTC = from._isUTC;
          }
          if (!isUndefined(from._offset)) {
              to._offset = from._offset;
          }
          if (!isUndefined(from._pf)) {
              to._pf = getParsingFlags(from);
          }
          if (!isUndefined(from._locale)) {
              to._locale = from._locale;
          }

          if (momentProperties.length > 0) {
              for (i = 0; i < momentProperties.length; i++) {
                  prop = momentProperties[i];
                  val = from[prop];
                  if (!isUndefined(val)) {
                      to[prop] = val;
                  }
              }
          }

          return to;
      }

      var updateInProgress = false;

      // Moment prototype object
      function Moment(config) {
          copyConfig(this, config);
          this._d = new Date(config._d != null ? config._d.getTime() : NaN);
          if (!this.isValid()) {
              this._d = new Date(NaN);
          }
          // Prevent infinite loop in case updateOffset creates new moment
          // objects.
          if (updateInProgress === false) {
              updateInProgress = true;
              hooks.updateOffset(this);
              updateInProgress = false;
          }
      }

      function isMoment (obj) {
          return obj instanceof Moment || (obj != null && obj._isAMomentObject != null);
      }

      function absFloor (number) {
          if (number < 0) {
              // -0 -> 0
              return Math.ceil(number) || 0;
          } else {
              return Math.floor(number);
          }
      }

      function toInt(argumentForCoercion) {
          var coercedNumber = +argumentForCoercion,
              value = 0;

          if (coercedNumber !== 0 && isFinite(coercedNumber)) {
              value = absFloor(coercedNumber);
          }

          return value;
      }

      // compare two arrays, return the number of differences
      function compareArrays(array1, array2, dontConvert) {
          var len = Math.min(array1.length, array2.length),
              lengthDiff = Math.abs(array1.length - array2.length),
              diffs = 0,
              i;
          for (i = 0; i < len; i++) {
              if ((dontConvert && array1[i] !== array2[i]) ||
                  (!dontConvert && toInt(array1[i]) !== toInt(array2[i]))) {
                  diffs++;
              }
          }
          return diffs + lengthDiff;
      }

      function warn(msg) {
          if (hooks.suppressDeprecationWarnings === false &&
                  (typeof console !==  'undefined') && console.warn) {
              console.warn('Deprecation warning: ' + msg);
          }
      }

      function deprecate(msg, fn) {
          var firstTime = true;

          return extend(function () {
              if (hooks.deprecationHandler != null) {
                  hooks.deprecationHandler(null, msg);
              }
              if (firstTime) {
                  var args = [];
                  var arg;
                  for (var i = 0; i < arguments.length; i++) {
                      arg = '';
                      if (typeof arguments[i] === 'object') {
                          arg += '\n[' + i + '] ';
                          for (var key in arguments[0]) {
                              arg += key + ': ' + arguments[0][key] + ', ';
                          }
                          arg = arg.slice(0, -2); // Remove trailing comma and space
                      } else {
                          arg = arguments[i];
                      }
                      args.push(arg);
                  }
                  warn(msg + '\nArguments: ' + Array.prototype.slice.call(args).join('') + '\n' + (new Error()).stack);
                  firstTime = false;
              }
              return fn.apply(this, arguments);
          }, fn);
      }

      var deprecations = {};

      function deprecateSimple(name, msg) {
          if (hooks.deprecationHandler != null) {
              hooks.deprecationHandler(name, msg);
          }
          if (!deprecations[name]) {
              warn(msg);
              deprecations[name] = true;
          }
      }

      hooks.suppressDeprecationWarnings = false;
      hooks.deprecationHandler = null;

      function isFunction(input) {
          return input instanceof Function || Object.prototype.toString.call(input) === '[object Function]';
      }

      function set (config) {
          var prop, i;
          for (i in config) {
              prop = config[i];
              if (isFunction(prop)) {
                  this[i] = prop;
              } else {
                  this['_' + i] = prop;
              }
          }
          this._config = config;
          // Lenient ordinal parsing accepts just a number in addition to
          // number + (possibly) stuff coming from _dayOfMonthOrdinalParse.
          // TODO: Remove "ordinalParse" fallback in next major release.
          this._dayOfMonthOrdinalParseLenient = new RegExp(
              (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
                  '|' + (/\d{1,2}/).source);
      }

      function mergeConfigs(parentConfig, childConfig) {
          var res = extend({}, parentConfig), prop;
          for (prop in childConfig) {
              if (hasOwnProp(childConfig, prop)) {
                  if (isObject(parentConfig[prop]) && isObject(childConfig[prop])) {
                      res[prop] = {};
                      extend(res[prop], parentConfig[prop]);
                      extend(res[prop], childConfig[prop]);
                  } else if (childConfig[prop] != null) {
                      res[prop] = childConfig[prop];
                  } else {
                      delete res[prop];
                  }
              }
          }
          for (prop in parentConfig) {
              if (hasOwnProp(parentConfig, prop) &&
                      !hasOwnProp(childConfig, prop) &&
                      isObject(parentConfig[prop])) {
                  // make sure changes to properties don't modify parent config
                  res[prop] = extend({}, res[prop]);
              }
          }
          return res;
      }

      function Locale(config) {
          if (config != null) {
              this.set(config);
          }
      }

      var keys;

      if (Object.keys) {
          keys = Object.keys;
      } else {
          keys = function (obj) {
              var i, res = [];
              for (i in obj) {
                  if (hasOwnProp(obj, i)) {
                      res.push(i);
                  }
              }
              return res;
          };
      }

      var defaultCalendar = {
          sameDay : '[Today at] LT',
          nextDay : '[Tomorrow at] LT',
          nextWeek : 'dddd [at] LT',
          lastDay : '[Yesterday at] LT',
          lastWeek : '[Last] dddd [at] LT',
          sameElse : 'L'
      };

      function calendar (key, mom, now) {
          var output = this._calendar[key] || this._calendar['sameElse'];
          return isFunction(output) ? output.call(mom, now) : output;
      }

      var defaultLongDateFormat = {
          LTS  : 'h:mm:ss A',
          LT   : 'h:mm A',
          L    : 'MM/DD/YYYY',
          LL   : 'MMMM D, YYYY',
          LLL  : 'MMMM D, YYYY h:mm A',
          LLLL : 'dddd, MMMM D, YYYY h:mm A'
      };

      function longDateFormat (key) {
          var format = this._longDateFormat[key],
              formatUpper = this._longDateFormat[key.toUpperCase()];

          if (format || !formatUpper) {
              return format;
          }

          this._longDateFormat[key] = formatUpper.replace(/MMMM|MM|DD|dddd/g, function (val) {
              return val.slice(1);
          });

          return this._longDateFormat[key];
      }

      var defaultInvalidDate = 'Invalid date';

      function invalidDate () {
          return this._invalidDate;
      }

      var defaultOrdinal = '%d';
      var defaultDayOfMonthOrdinalParse = /\d{1,2}/;

      function ordinal (number) {
          return this._ordinal.replace('%d', number);
      }

      var defaultRelativeTime = {
          future : 'in %s',
          past   : '%s ago',
          s  : 'a few seconds',
          ss : '%d seconds',
          m  : 'a minute',
          mm : '%d minutes',
          h  : 'an hour',
          hh : '%d hours',
          d  : 'a day',
          dd : '%d days',
          M  : 'a month',
          MM : '%d months',
          y  : 'a year',
          yy : '%d years'
      };

      function relativeTime (number, withoutSuffix, string, isFuture) {
          var output = this._relativeTime[string];
          return (isFunction(output)) ?
              output(number, withoutSuffix, string, isFuture) :
              output.replace(/%d/i, number);
      }

      function pastFuture (diff, output) {
          var format = this._relativeTime[diff > 0 ? 'future' : 'past'];
          return isFunction(format) ? format(output) : format.replace(/%s/i, output);
      }

      var aliases = {};

      function addUnitAlias (unit, shorthand) {
          var lowerCase = unit.toLowerCase();
          aliases[lowerCase] = aliases[lowerCase + 's'] = aliases[shorthand] = unit;
      }

      function normalizeUnits(units) {
          return typeof units === 'string' ? aliases[units] || aliases[units.toLowerCase()] : undefined;
      }

      function normalizeObjectUnits(inputObject) {
          var normalizedInput = {},
              normalizedProp,
              prop;

          for (prop in inputObject) {
              if (hasOwnProp(inputObject, prop)) {
                  normalizedProp = normalizeUnits(prop);
                  if (normalizedProp) {
                      normalizedInput[normalizedProp] = inputObject[prop];
                  }
              }
          }

          return normalizedInput;
      }

      var priorities = {};

      function addUnitPriority(unit, priority) {
          priorities[unit] = priority;
      }

      function getPrioritizedUnits(unitsObj) {
          var units = [];
          for (var u in unitsObj) {
              units.push({unit: u, priority: priorities[u]});
          }
          units.sort(function (a, b) {
              return a.priority - b.priority;
          });
          return units;
      }

      function zeroFill(number, targetLength, forceSign) {
          var absNumber = '' + Math.abs(number),
              zerosToFill = targetLength - absNumber.length,
              sign = number >= 0;
          return (sign ? (forceSign ? '+' : '') : '-') +
              Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
      }

      var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g;

      var localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g;

      var formatFunctions = {};

      var formatTokenFunctions = {};

      // token:    'M'
      // padded:   ['MM', 2]
      // ordinal:  'Mo'
      // callback: function () { this.month() + 1 }
      function addFormatToken (token, padded, ordinal, callback) {
          var func = callback;
          if (typeof callback === 'string') {
              func = function () {
                  return this[callback]();
              };
          }
          if (token) {
              formatTokenFunctions[token] = func;
          }
          if (padded) {
              formatTokenFunctions[padded[0]] = function () {
                  return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
              };
          }
          if (ordinal) {
              formatTokenFunctions[ordinal] = function () {
                  return this.localeData().ordinal(func.apply(this, arguments), token);
              };
          }
      }

      function removeFormattingTokens(input) {
          if (input.match(/\[[\s\S]/)) {
              return input.replace(/^\[|\]$/g, '');
          }
          return input.replace(/\\/g, '');
      }

      function makeFormatFunction(format) {
          var array = format.match(formattingTokens), i, length;

          for (i = 0, length = array.length; i < length; i++) {
              if (formatTokenFunctions[array[i]]) {
                  array[i] = formatTokenFunctions[array[i]];
              } else {
                  array[i] = removeFormattingTokens(array[i]);
              }
          }

          return function (mom) {
              var output = '', i;
              for (i = 0; i < length; i++) {
                  output += isFunction(array[i]) ? array[i].call(mom, format) : array[i];
              }
              return output;
          };
      }

      // format date using native date object
      function formatMoment(m, format) {
          if (!m.isValid()) {
              return m.localeData().invalidDate();
          }

          format = expandFormat(format, m.localeData());
          formatFunctions[format] = formatFunctions[format] || makeFormatFunction(format);

          return formatFunctions[format](m);
      }

      function expandFormat(format, locale) {
          var i = 5;

          function replaceLongDateFormatTokens(input) {
              return locale.longDateFormat(input) || input;
          }

          localFormattingTokens.lastIndex = 0;
          while (i >= 0 && localFormattingTokens.test(format)) {
              format = format.replace(localFormattingTokens, replaceLongDateFormatTokens);
              localFormattingTokens.lastIndex = 0;
              i -= 1;
          }

          return format;
      }

      var match1         = /\d/;            //       0 - 9
      var match2         = /\d\d/;          //      00 - 99
      var match3         = /\d{3}/;         //     000 - 999
      var match4         = /\d{4}/;         //    0000 - 9999
      var match6         = /[+-]?\d{6}/;    // -999999 - 999999
      var match1to2      = /\d\d?/;         //       0 - 99
      var match3to4      = /\d\d\d\d?/;     //     999 - 9999
      var match5to6      = /\d\d\d\d\d\d?/; //   99999 - 999999
      var match1to3      = /\d{1,3}/;       //       0 - 999
      var match1to4      = /\d{1,4}/;       //       0 - 9999
      var match1to6      = /[+-]?\d{1,6}/;  // -999999 - 999999

      var matchUnsigned  = /\d+/;           //       0 - inf
      var matchSigned    = /[+-]?\d+/;      //    -inf - inf

      var matchOffset    = /Z|[+-]\d\d:?\d\d/gi; // +00:00 -00:00 +0000 -0000 or Z
      var matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi; // +00 -00 +00:00 -00:00 +0000 -0000 or Z

      var matchTimestamp = /[+-]?\d+(\.\d{1,3})?/; // 123456789 123456789.123

      // any word (or two) characters or numbers including two/three word month in arabic.
      // includes scottish gaelic two word and hyphenated months
      var matchWord = /[0-9]{0,256}['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFF07\uFF10-\uFFEF]{1,256}|[\u0600-\u06FF\/]{1,256}(\s*?[\u0600-\u06FF]{1,256}){1,2}/i;

      var regexes = {};

      function addRegexToken (token, regex, strictRegex) {
          regexes[token] = isFunction(regex) ? regex : function (isStrict, localeData) {
              return (isStrict && strictRegex) ? strictRegex : regex;
          };
      }

      function getParseRegexForToken (token, config) {
          if (!hasOwnProp(regexes, token)) {
              return new RegExp(unescapeFormat(token));
          }

          return regexes[token](config._strict, config._locale);
      }

      // Code from http://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
      function unescapeFormat(s) {
          return regexEscape(s.replace('\\', '').replace(/\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g, function (matched, p1, p2, p3, p4) {
              return p1 || p2 || p3 || p4;
          }));
      }

      function regexEscape(s) {
          return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      }

      var tokens = {};

      function addParseToken (token, callback) {
          var i, func = callback;
          if (typeof token === 'string') {
              token = [token];
          }
          if (isNumber(callback)) {
              func = function (input, array) {
                  array[callback] = toInt(input);
              };
          }
          for (i = 0; i < token.length; i++) {
              tokens[token[i]] = func;
          }
      }

      function addWeekParseToken (token, callback) {
          addParseToken(token, function (input, array, config, token) {
              config._w = config._w || {};
              callback(input, config._w, config, token);
          });
      }

      function addTimeToArrayFromToken(token, input, config) {
          if (input != null && hasOwnProp(tokens, token)) {
              tokens[token](input, config._a, config, token);
          }
      }

      var YEAR = 0;
      var MONTH = 1;
      var DATE = 2;
      var HOUR = 3;
      var MINUTE = 4;
      var SECOND = 5;
      var MILLISECOND = 6;
      var WEEK = 7;
      var WEEKDAY = 8;

      // FORMATTING

      addFormatToken('Y', 0, 0, function () {
          var y = this.year();
          return y <= 9999 ? '' + y : '+' + y;
      });

      addFormatToken(0, ['YY', 2], 0, function () {
          return this.year() % 100;
      });

      addFormatToken(0, ['YYYY',   4],       0, 'year');
      addFormatToken(0, ['YYYYY',  5],       0, 'year');
      addFormatToken(0, ['YYYYYY', 6, true], 0, 'year');

      // ALIASES

      addUnitAlias('year', 'y');

      // PRIORITIES

      addUnitPriority('year', 1);

      // PARSING

      addRegexToken('Y',      matchSigned);
      addRegexToken('YY',     match1to2, match2);
      addRegexToken('YYYY',   match1to4, match4);
      addRegexToken('YYYYY',  match1to6, match6);
      addRegexToken('YYYYYY', match1to6, match6);

      addParseToken(['YYYYY', 'YYYYYY'], YEAR);
      addParseToken('YYYY', function (input, array) {
          array[YEAR] = input.length === 2 ? hooks.parseTwoDigitYear(input) : toInt(input);
      });
      addParseToken('YY', function (input, array) {
          array[YEAR] = hooks.parseTwoDigitYear(input);
      });
      addParseToken('Y', function (input, array) {
          array[YEAR] = parseInt(input, 10);
      });

      // HELPERS

      function daysInYear(year) {
          return isLeapYear(year) ? 366 : 365;
      }

      function isLeapYear(year) {
          return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      }

      // HOOKS

      hooks.parseTwoDigitYear = function (input) {
          return toInt(input) + (toInt(input) > 68 ? 1900 : 2000);
      };

      // MOMENTS

      var getSetYear = makeGetSet('FullYear', true);

      function getIsLeapYear () {
          return isLeapYear(this.year());
      }

      function makeGetSet (unit, keepTime) {
          return function (value) {
              if (value != null) {
                  set$1(this, unit, value);
                  hooks.updateOffset(this, keepTime);
                  return this;
              } else {
                  return get(this, unit);
              }
          };
      }

      function get (mom, unit) {
          return mom.isValid() ?
              mom._d['get' + (mom._isUTC ? 'UTC' : '') + unit]() : NaN;
      }

      function set$1 (mom, unit, value) {
          if (mom.isValid() && !isNaN(value)) {
              if (unit === 'FullYear' && isLeapYear(mom.year()) && mom.month() === 1 && mom.date() === 29) {
                  mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value, mom.month(), daysInMonth(value, mom.month()));
              }
              else {
                  mom._d['set' + (mom._isUTC ? 'UTC' : '') + unit](value);
              }
          }
      }

      // MOMENTS

      function stringGet (units) {
          units = normalizeUnits(units);
          if (isFunction(this[units])) {
              return this[units]();
          }
          return this;
      }


      function stringSet (units, value) {
          if (typeof units === 'object') {
              units = normalizeObjectUnits(units);
              var prioritized = getPrioritizedUnits(units);
              for (var i = 0; i < prioritized.length; i++) {
                  this[prioritized[i].unit](units[prioritized[i].unit]);
              }
          } else {
              units = normalizeUnits(units);
              if (isFunction(this[units])) {
                  return this[units](value);
              }
          }
          return this;
      }

      function mod(n, x) {
          return ((n % x) + x) % x;
      }

      var indexOf;

      if (Array.prototype.indexOf) {
          indexOf = Array.prototype.indexOf;
      } else {
          indexOf = function (o) {
              // I know
              var i;
              for (i = 0; i < this.length; ++i) {
                  if (this[i] === o) {
                      return i;
                  }
              }
              return -1;
          };
      }

      function daysInMonth(year, month) {
          if (isNaN(year) || isNaN(month)) {
              return NaN;
          }
          var modMonth = mod(month, 12);
          year += (month - modMonth) / 12;
          return modMonth === 1 ? (isLeapYear(year) ? 29 : 28) : (31 - modMonth % 7 % 2);
      }

      // FORMATTING

      addFormatToken('M', ['MM', 2], 'Mo', function () {
          return this.month() + 1;
      });

      addFormatToken('MMM', 0, 0, function (format) {
          return this.localeData().monthsShort(this, format);
      });

      addFormatToken('MMMM', 0, 0, function (format) {
          return this.localeData().months(this, format);
      });

      // ALIASES

      addUnitAlias('month', 'M');

      // PRIORITY

      addUnitPriority('month', 8);

      // PARSING

      addRegexToken('M',    match1to2);
      addRegexToken('MM',   match1to2, match2);
      addRegexToken('MMM',  function (isStrict, locale) {
          return locale.monthsShortRegex(isStrict);
      });
      addRegexToken('MMMM', function (isStrict, locale) {
          return locale.monthsRegex(isStrict);
      });

      addParseToken(['M', 'MM'], function (input, array) {
          array[MONTH] = toInt(input) - 1;
      });

      addParseToken(['MMM', 'MMMM'], function (input, array, config, token) {
          var month = config._locale.monthsParse(input, token, config._strict);
          // if we didn't find a month name, mark the date as invalid.
          if (month != null) {
              array[MONTH] = month;
          } else {
              getParsingFlags(config).invalidMonth = input;
          }
      });

      // LOCALES

      var MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/;
      var defaultLocaleMonths = 'January_February_March_April_May_June_July_August_September_October_November_December'.split('_');
      function localeMonths (m, format) {
          if (!m) {
              return isArray(this._months) ? this._months :
                  this._months['standalone'];
          }
          return isArray(this._months) ? this._months[m.month()] :
              this._months[(this._months.isFormat || MONTHS_IN_FORMAT).test(format) ? 'format' : 'standalone'][m.month()];
      }

      var defaultLocaleMonthsShort = 'Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec'.split('_');
      function localeMonthsShort (m, format) {
          if (!m) {
              return isArray(this._monthsShort) ? this._monthsShort :
                  this._monthsShort['standalone'];
          }
          return isArray(this._monthsShort) ? this._monthsShort[m.month()] :
              this._monthsShort[MONTHS_IN_FORMAT.test(format) ? 'format' : 'standalone'][m.month()];
      }

      function handleStrictParse(monthName, format, strict) {
          var i, ii, mom, llc = monthName.toLocaleLowerCase();
          if (!this._monthsParse) {
              // this is not used
              this._monthsParse = [];
              this._longMonthsParse = [];
              this._shortMonthsParse = [];
              for (i = 0; i < 12; ++i) {
                  mom = createUTC([2000, i]);
                  this._shortMonthsParse[i] = this.monthsShort(mom, '').toLocaleLowerCase();
                  this._longMonthsParse[i] = this.months(mom, '').toLocaleLowerCase();
              }
          }

          if (strict) {
              if (format === 'MMM') {
                  ii = indexOf.call(this._shortMonthsParse, llc);
                  return ii !== -1 ? ii : null;
              } else {
                  ii = indexOf.call(this._longMonthsParse, llc);
                  return ii !== -1 ? ii : null;
              }
          } else {
              if (format === 'MMM') {
                  ii = indexOf.call(this._shortMonthsParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._longMonthsParse, llc);
                  return ii !== -1 ? ii : null;
              } else {
                  ii = indexOf.call(this._longMonthsParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._shortMonthsParse, llc);
                  return ii !== -1 ? ii : null;
              }
          }
      }

      function localeMonthsParse (monthName, format, strict) {
          var i, mom, regex;

          if (this._monthsParseExact) {
              return handleStrictParse.call(this, monthName, format, strict);
          }

          if (!this._monthsParse) {
              this._monthsParse = [];
              this._longMonthsParse = [];
              this._shortMonthsParse = [];
          }

          // TODO: add sorting
          // Sorting makes sure if one month (or abbr) is a prefix of another
          // see sorting in computeMonthsParse
          for (i = 0; i < 12; i++) {
              // make the regex if we don't have it already
              mom = createUTC([2000, i]);
              if (strict && !this._longMonthsParse[i]) {
                  this._longMonthsParse[i] = new RegExp('^' + this.months(mom, '').replace('.', '') + '$', 'i');
                  this._shortMonthsParse[i] = new RegExp('^' + this.monthsShort(mom, '').replace('.', '') + '$', 'i');
              }
              if (!strict && !this._monthsParse[i]) {
                  regex = '^' + this.months(mom, '') + '|^' + this.monthsShort(mom, '');
                  this._monthsParse[i] = new RegExp(regex.replace('.', ''), 'i');
              }
              // test the regex
              if (strict && format === 'MMMM' && this._longMonthsParse[i].test(monthName)) {
                  return i;
              } else if (strict && format === 'MMM' && this._shortMonthsParse[i].test(monthName)) {
                  return i;
              } else if (!strict && this._monthsParse[i].test(monthName)) {
                  return i;
              }
          }
      }

      // MOMENTS

      function setMonth (mom, value) {
          var dayOfMonth;

          if (!mom.isValid()) {
              // No op
              return mom;
          }

          if (typeof value === 'string') {
              if (/^\d+$/.test(value)) {
                  value = toInt(value);
              } else {
                  value = mom.localeData().monthsParse(value);
                  // TODO: Another silent failure?
                  if (!isNumber(value)) {
                      return mom;
                  }
              }
          }

          dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value));
          mom._d['set' + (mom._isUTC ? 'UTC' : '') + 'Month'](value, dayOfMonth);
          return mom;
      }

      function getSetMonth (value) {
          if (value != null) {
              setMonth(this, value);
              hooks.updateOffset(this, true);
              return this;
          } else {
              return get(this, 'Month');
          }
      }

      function getDaysInMonth () {
          return daysInMonth(this.year(), this.month());
      }

      var defaultMonthsShortRegex = matchWord;
      function monthsShortRegex (isStrict) {
          if (this._monthsParseExact) {
              if (!hasOwnProp(this, '_monthsRegex')) {
                  computeMonthsParse.call(this);
              }
              if (isStrict) {
                  return this._monthsShortStrictRegex;
              } else {
                  return this._monthsShortRegex;
              }
          } else {
              if (!hasOwnProp(this, '_monthsShortRegex')) {
                  this._monthsShortRegex = defaultMonthsShortRegex;
              }
              return this._monthsShortStrictRegex && isStrict ?
                  this._monthsShortStrictRegex : this._monthsShortRegex;
          }
      }

      var defaultMonthsRegex = matchWord;
      function monthsRegex (isStrict) {
          if (this._monthsParseExact) {
              if (!hasOwnProp(this, '_monthsRegex')) {
                  computeMonthsParse.call(this);
              }
              if (isStrict) {
                  return this._monthsStrictRegex;
              } else {
                  return this._monthsRegex;
              }
          } else {
              if (!hasOwnProp(this, '_monthsRegex')) {
                  this._monthsRegex = defaultMonthsRegex;
              }
              return this._monthsStrictRegex && isStrict ?
                  this._monthsStrictRegex : this._monthsRegex;
          }
      }

      function computeMonthsParse () {
          function cmpLenRev(a, b) {
              return b.length - a.length;
          }

          var shortPieces = [], longPieces = [], mixedPieces = [],
              i, mom;
          for (i = 0; i < 12; i++) {
              // make the regex if we don't have it already
              mom = createUTC([2000, i]);
              shortPieces.push(this.monthsShort(mom, ''));
              longPieces.push(this.months(mom, ''));
              mixedPieces.push(this.months(mom, ''));
              mixedPieces.push(this.monthsShort(mom, ''));
          }
          // Sorting makes sure if one month (or abbr) is a prefix of another it
          // will match the longer piece.
          shortPieces.sort(cmpLenRev);
          longPieces.sort(cmpLenRev);
          mixedPieces.sort(cmpLenRev);
          for (i = 0; i < 12; i++) {
              shortPieces[i] = regexEscape(shortPieces[i]);
              longPieces[i] = regexEscape(longPieces[i]);
          }
          for (i = 0; i < 24; i++) {
              mixedPieces[i] = regexEscape(mixedPieces[i]);
          }

          this._monthsRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
          this._monthsShortRegex = this._monthsRegex;
          this._monthsStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
          this._monthsShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
      }

      function createDate (y, m, d, h, M, s, ms) {
          // can't just apply() to create a date:
          // https://stackoverflow.com/q/181348
          var date;
          // the date constructor remaps years 0-99 to 1900-1999
          if (y < 100 && y >= 0) {
              // preserve leap years using a full 400 year cycle, then reset
              date = new Date(y + 400, m, d, h, M, s, ms);
              if (isFinite(date.getFullYear())) {
                  date.setFullYear(y);
              }
          } else {
              date = new Date(y, m, d, h, M, s, ms);
          }

          return date;
      }

      function createUTCDate (y) {
          var date;
          // the Date.UTC function remaps years 0-99 to 1900-1999
          if (y < 100 && y >= 0) {
              var args = Array.prototype.slice.call(arguments);
              // preserve leap years using a full 400 year cycle, then reset
              args[0] = y + 400;
              date = new Date(Date.UTC.apply(null, args));
              if (isFinite(date.getUTCFullYear())) {
                  date.setUTCFullYear(y);
              }
          } else {
              date = new Date(Date.UTC.apply(null, arguments));
          }

          return date;
      }

      // start-of-first-week - start-of-year
      function firstWeekOffset(year, dow, doy) {
          var // first-week day -- which january is always in the first week (4 for iso, 1 for other)
              fwd = 7 + dow - doy,
              // first-week day local weekday -- which local weekday is fwd
              fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;

          return -fwdlw + fwd - 1;
      }

      // https://en.wikipedia.org/wiki/ISO_week_date#Calculating_a_date_given_the_year.2C_week_number_and_weekday
      function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
          var localWeekday = (7 + weekday - dow) % 7,
              weekOffset = firstWeekOffset(year, dow, doy),
              dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset,
              resYear, resDayOfYear;

          if (dayOfYear <= 0) {
              resYear = year - 1;
              resDayOfYear = daysInYear(resYear) + dayOfYear;
          } else if (dayOfYear > daysInYear(year)) {
              resYear = year + 1;
              resDayOfYear = dayOfYear - daysInYear(year);
          } else {
              resYear = year;
              resDayOfYear = dayOfYear;
          }

          return {
              year: resYear,
              dayOfYear: resDayOfYear
          };
      }

      function weekOfYear(mom, dow, doy) {
          var weekOffset = firstWeekOffset(mom.year(), dow, doy),
              week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1,
              resWeek, resYear;

          if (week < 1) {
              resYear = mom.year() - 1;
              resWeek = week + weeksInYear(resYear, dow, doy);
          } else if (week > weeksInYear(mom.year(), dow, doy)) {
              resWeek = week - weeksInYear(mom.year(), dow, doy);
              resYear = mom.year() + 1;
          } else {
              resYear = mom.year();
              resWeek = week;
          }

          return {
              week: resWeek,
              year: resYear
          };
      }

      function weeksInYear(year, dow, doy) {
          var weekOffset = firstWeekOffset(year, dow, doy),
              weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
          return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
      }

      // FORMATTING

      addFormatToken('w', ['ww', 2], 'wo', 'week');
      addFormatToken('W', ['WW', 2], 'Wo', 'isoWeek');

      // ALIASES

      addUnitAlias('week', 'w');
      addUnitAlias('isoWeek', 'W');

      // PRIORITIES

      addUnitPriority('week', 5);
      addUnitPriority('isoWeek', 5);

      // PARSING

      addRegexToken('w',  match1to2);
      addRegexToken('ww', match1to2, match2);
      addRegexToken('W',  match1to2);
      addRegexToken('WW', match1to2, match2);

      addWeekParseToken(['w', 'ww', 'W', 'WW'], function (input, week, config, token) {
          week[token.substr(0, 1)] = toInt(input);
      });

      // HELPERS

      // LOCALES

      function localeWeek (mom) {
          return weekOfYear(mom, this._week.dow, this._week.doy).week;
      }

      var defaultLocaleWeek = {
          dow : 0, // Sunday is the first day of the week.
          doy : 6  // The week that contains Jan 6th is the first week of the year.
      };

      function localeFirstDayOfWeek () {
          return this._week.dow;
      }

      function localeFirstDayOfYear () {
          return this._week.doy;
      }

      // MOMENTS

      function getSetWeek (input) {
          var week = this.localeData().week(this);
          return input == null ? week : this.add((input - week) * 7, 'd');
      }

      function getSetISOWeek (input) {
          var week = weekOfYear(this, 1, 4).week;
          return input == null ? week : this.add((input - week) * 7, 'd');
      }

      // FORMATTING

      addFormatToken('d', 0, 'do', 'day');

      addFormatToken('dd', 0, 0, function (format) {
          return this.localeData().weekdaysMin(this, format);
      });

      addFormatToken('ddd', 0, 0, function (format) {
          return this.localeData().weekdaysShort(this, format);
      });

      addFormatToken('dddd', 0, 0, function (format) {
          return this.localeData().weekdays(this, format);
      });

      addFormatToken('e', 0, 0, 'weekday');
      addFormatToken('E', 0, 0, 'isoWeekday');

      // ALIASES

      addUnitAlias('day', 'd');
      addUnitAlias('weekday', 'e');
      addUnitAlias('isoWeekday', 'E');

      // PRIORITY
      addUnitPriority('day', 11);
      addUnitPriority('weekday', 11);
      addUnitPriority('isoWeekday', 11);

      // PARSING

      addRegexToken('d',    match1to2);
      addRegexToken('e',    match1to2);
      addRegexToken('E',    match1to2);
      addRegexToken('dd',   function (isStrict, locale) {
          return locale.weekdaysMinRegex(isStrict);
      });
      addRegexToken('ddd',   function (isStrict, locale) {
          return locale.weekdaysShortRegex(isStrict);
      });
      addRegexToken('dddd',   function (isStrict, locale) {
          return locale.weekdaysRegex(isStrict);
      });

      addWeekParseToken(['dd', 'ddd', 'dddd'], function (input, week, config, token) {
          var weekday = config._locale.weekdaysParse(input, token, config._strict);
          // if we didn't get a weekday name, mark the date as invalid
          if (weekday != null) {
              week.d = weekday;
          } else {
              getParsingFlags(config).invalidWeekday = input;
          }
      });

      addWeekParseToken(['d', 'e', 'E'], function (input, week, config, token) {
          week[token] = toInt(input);
      });

      // HELPERS

      function parseWeekday(input, locale) {
          if (typeof input !== 'string') {
              return input;
          }

          if (!isNaN(input)) {
              return parseInt(input, 10);
          }

          input = locale.weekdaysParse(input);
          if (typeof input === 'number') {
              return input;
          }

          return null;
      }

      function parseIsoWeekday(input, locale) {
          if (typeof input === 'string') {
              return locale.weekdaysParse(input) % 7 || 7;
          }
          return isNaN(input) ? null : input;
      }

      // LOCALES
      function shiftWeekdays (ws, n) {
          return ws.slice(n, 7).concat(ws.slice(0, n));
      }

      var defaultLocaleWeekdays = 'Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday'.split('_');
      function localeWeekdays (m, format) {
          var weekdays = isArray(this._weekdays) ? this._weekdays :
              this._weekdays[(m && m !== true && this._weekdays.isFormat.test(format)) ? 'format' : 'standalone'];
          return (m === true) ? shiftWeekdays(weekdays, this._week.dow)
              : (m) ? weekdays[m.day()] : weekdays;
      }

      var defaultLocaleWeekdaysShort = 'Sun_Mon_Tue_Wed_Thu_Fri_Sat'.split('_');
      function localeWeekdaysShort (m) {
          return (m === true) ? shiftWeekdays(this._weekdaysShort, this._week.dow)
              : (m) ? this._weekdaysShort[m.day()] : this._weekdaysShort;
      }

      var defaultLocaleWeekdaysMin = 'Su_Mo_Tu_We_Th_Fr_Sa'.split('_');
      function localeWeekdaysMin (m) {
          return (m === true) ? shiftWeekdays(this._weekdaysMin, this._week.dow)
              : (m) ? this._weekdaysMin[m.day()] : this._weekdaysMin;
      }

      function handleStrictParse$1(weekdayName, format, strict) {
          var i, ii, mom, llc = weekdayName.toLocaleLowerCase();
          if (!this._weekdaysParse) {
              this._weekdaysParse = [];
              this._shortWeekdaysParse = [];
              this._minWeekdaysParse = [];

              for (i = 0; i < 7; ++i) {
                  mom = createUTC([2000, 1]).day(i);
                  this._minWeekdaysParse[i] = this.weekdaysMin(mom, '').toLocaleLowerCase();
                  this._shortWeekdaysParse[i] = this.weekdaysShort(mom, '').toLocaleLowerCase();
                  this._weekdaysParse[i] = this.weekdays(mom, '').toLocaleLowerCase();
              }
          }

          if (strict) {
              if (format === 'dddd') {
                  ii = indexOf.call(this._weekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              } else if (format === 'ddd') {
                  ii = indexOf.call(this._shortWeekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              } else {
                  ii = indexOf.call(this._minWeekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              }
          } else {
              if (format === 'dddd') {
                  ii = indexOf.call(this._weekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._shortWeekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._minWeekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              } else if (format === 'ddd') {
                  ii = indexOf.call(this._shortWeekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._weekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._minWeekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              } else {
                  ii = indexOf.call(this._minWeekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._weekdaysParse, llc);
                  if (ii !== -1) {
                      return ii;
                  }
                  ii = indexOf.call(this._shortWeekdaysParse, llc);
                  return ii !== -1 ? ii : null;
              }
          }
      }

      function localeWeekdaysParse (weekdayName, format, strict) {
          var i, mom, regex;

          if (this._weekdaysParseExact) {
              return handleStrictParse$1.call(this, weekdayName, format, strict);
          }

          if (!this._weekdaysParse) {
              this._weekdaysParse = [];
              this._minWeekdaysParse = [];
              this._shortWeekdaysParse = [];
              this._fullWeekdaysParse = [];
          }

          for (i = 0; i < 7; i++) {
              // make the regex if we don't have it already

              mom = createUTC([2000, 1]).day(i);
              if (strict && !this._fullWeekdaysParse[i]) {
                  this._fullWeekdaysParse[i] = new RegExp('^' + this.weekdays(mom, '').replace('.', '\\.?') + '$', 'i');
                  this._shortWeekdaysParse[i] = new RegExp('^' + this.weekdaysShort(mom, '').replace('.', '\\.?') + '$', 'i');
                  this._minWeekdaysParse[i] = new RegExp('^' + this.weekdaysMin(mom, '').replace('.', '\\.?') + '$', 'i');
              }
              if (!this._weekdaysParse[i]) {
                  regex = '^' + this.weekdays(mom, '') + '|^' + this.weekdaysShort(mom, '') + '|^' + this.weekdaysMin(mom, '');
                  this._weekdaysParse[i] = new RegExp(regex.replace('.', ''), 'i');
              }
              // test the regex
              if (strict && format === 'dddd' && this._fullWeekdaysParse[i].test(weekdayName)) {
                  return i;
              } else if (strict && format === 'ddd' && this._shortWeekdaysParse[i].test(weekdayName)) {
                  return i;
              } else if (strict && format === 'dd' && this._minWeekdaysParse[i].test(weekdayName)) {
                  return i;
              } else if (!strict && this._weekdaysParse[i].test(weekdayName)) {
                  return i;
              }
          }
      }

      // MOMENTS

      function getSetDayOfWeek (input) {
          if (!this.isValid()) {
              return input != null ? this : NaN;
          }
          var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
          if (input != null) {
              input = parseWeekday(input, this.localeData());
              return this.add(input - day, 'd');
          } else {
              return day;
          }
      }

      function getSetLocaleDayOfWeek (input) {
          if (!this.isValid()) {
              return input != null ? this : NaN;
          }
          var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
          return input == null ? weekday : this.add(input - weekday, 'd');
      }

      function getSetISODayOfWeek (input) {
          if (!this.isValid()) {
              return input != null ? this : NaN;
          }

          // behaves the same as moment#day except
          // as a getter, returns 7 instead of 0 (1-7 range instead of 0-6)
          // as a setter, sunday should belong to the previous week.

          if (input != null) {
              var weekday = parseIsoWeekday(input, this.localeData());
              return this.day(this.day() % 7 ? weekday : weekday - 7);
          } else {
              return this.day() || 7;
          }
      }

      var defaultWeekdaysRegex = matchWord;
      function weekdaysRegex (isStrict) {
          if (this._weekdaysParseExact) {
              if (!hasOwnProp(this, '_weekdaysRegex')) {
                  computeWeekdaysParse.call(this);
              }
              if (isStrict) {
                  return this._weekdaysStrictRegex;
              } else {
                  return this._weekdaysRegex;
              }
          } else {
              if (!hasOwnProp(this, '_weekdaysRegex')) {
                  this._weekdaysRegex = defaultWeekdaysRegex;
              }
              return this._weekdaysStrictRegex && isStrict ?
                  this._weekdaysStrictRegex : this._weekdaysRegex;
          }
      }

      var defaultWeekdaysShortRegex = matchWord;
      function weekdaysShortRegex (isStrict) {
          if (this._weekdaysParseExact) {
              if (!hasOwnProp(this, '_weekdaysRegex')) {
                  computeWeekdaysParse.call(this);
              }
              if (isStrict) {
                  return this._weekdaysShortStrictRegex;
              } else {
                  return this._weekdaysShortRegex;
              }
          } else {
              if (!hasOwnProp(this, '_weekdaysShortRegex')) {
                  this._weekdaysShortRegex = defaultWeekdaysShortRegex;
              }
              return this._weekdaysShortStrictRegex && isStrict ?
                  this._weekdaysShortStrictRegex : this._weekdaysShortRegex;
          }
      }

      var defaultWeekdaysMinRegex = matchWord;
      function weekdaysMinRegex (isStrict) {
          if (this._weekdaysParseExact) {
              if (!hasOwnProp(this, '_weekdaysRegex')) {
                  computeWeekdaysParse.call(this);
              }
              if (isStrict) {
                  return this._weekdaysMinStrictRegex;
              } else {
                  return this._weekdaysMinRegex;
              }
          } else {
              if (!hasOwnProp(this, '_weekdaysMinRegex')) {
                  this._weekdaysMinRegex = defaultWeekdaysMinRegex;
              }
              return this._weekdaysMinStrictRegex && isStrict ?
                  this._weekdaysMinStrictRegex : this._weekdaysMinRegex;
          }
      }


      function computeWeekdaysParse () {
          function cmpLenRev(a, b) {
              return b.length - a.length;
          }

          var minPieces = [], shortPieces = [], longPieces = [], mixedPieces = [],
              i, mom, minp, shortp, longp;
          for (i = 0; i < 7; i++) {
              // make the regex if we don't have it already
              mom = createUTC([2000, 1]).day(i);
              minp = this.weekdaysMin(mom, '');
              shortp = this.weekdaysShort(mom, '');
              longp = this.weekdays(mom, '');
              minPieces.push(minp);
              shortPieces.push(shortp);
              longPieces.push(longp);
              mixedPieces.push(minp);
              mixedPieces.push(shortp);
              mixedPieces.push(longp);
          }
          // Sorting makes sure if one weekday (or abbr) is a prefix of another it
          // will match the longer piece.
          minPieces.sort(cmpLenRev);
          shortPieces.sort(cmpLenRev);
          longPieces.sort(cmpLenRev);
          mixedPieces.sort(cmpLenRev);
          for (i = 0; i < 7; i++) {
              shortPieces[i] = regexEscape(shortPieces[i]);
              longPieces[i] = regexEscape(longPieces[i]);
              mixedPieces[i] = regexEscape(mixedPieces[i]);
          }

          this._weekdaysRegex = new RegExp('^(' + mixedPieces.join('|') + ')', 'i');
          this._weekdaysShortRegex = this._weekdaysRegex;
          this._weekdaysMinRegex = this._weekdaysRegex;

          this._weekdaysStrictRegex = new RegExp('^(' + longPieces.join('|') + ')', 'i');
          this._weekdaysShortStrictRegex = new RegExp('^(' + shortPieces.join('|') + ')', 'i');
          this._weekdaysMinStrictRegex = new RegExp('^(' + minPieces.join('|') + ')', 'i');
      }

      // FORMATTING

      function hFormat() {
          return this.hours() % 12 || 12;
      }

      function kFormat() {
          return this.hours() || 24;
      }

      addFormatToken('H', ['HH', 2], 0, 'hour');
      addFormatToken('h', ['hh', 2], 0, hFormat);
      addFormatToken('k', ['kk', 2], 0, kFormat);

      addFormatToken('hmm', 0, 0, function () {
          return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2);
      });

      addFormatToken('hmmss', 0, 0, function () {
          return '' + hFormat.apply(this) + zeroFill(this.minutes(), 2) +
              zeroFill(this.seconds(), 2);
      });

      addFormatToken('Hmm', 0, 0, function () {
          return '' + this.hours() + zeroFill(this.minutes(), 2);
      });

      addFormatToken('Hmmss', 0, 0, function () {
          return '' + this.hours() + zeroFill(this.minutes(), 2) +
              zeroFill(this.seconds(), 2);
      });

      function meridiem (token, lowercase) {
          addFormatToken(token, 0, 0, function () {
              return this.localeData().meridiem(this.hours(), this.minutes(), lowercase);
          });
      }

      meridiem('a', true);
      meridiem('A', false);

      // ALIASES

      addUnitAlias('hour', 'h');

      // PRIORITY
      addUnitPriority('hour', 13);

      // PARSING

      function matchMeridiem (isStrict, locale) {
          return locale._meridiemParse;
      }

      addRegexToken('a',  matchMeridiem);
      addRegexToken('A',  matchMeridiem);
      addRegexToken('H',  match1to2);
      addRegexToken('h',  match1to2);
      addRegexToken('k',  match1to2);
      addRegexToken('HH', match1to2, match2);
      addRegexToken('hh', match1to2, match2);
      addRegexToken('kk', match1to2, match2);

      addRegexToken('hmm', match3to4);
      addRegexToken('hmmss', match5to6);
      addRegexToken('Hmm', match3to4);
      addRegexToken('Hmmss', match5to6);

      addParseToken(['H', 'HH'], HOUR);
      addParseToken(['k', 'kk'], function (input, array, config) {
          var kInput = toInt(input);
          array[HOUR] = kInput === 24 ? 0 : kInput;
      });
      addParseToken(['a', 'A'], function (input, array, config) {
          config._isPm = config._locale.isPM(input);
          config._meridiem = input;
      });
      addParseToken(['h', 'hh'], function (input, array, config) {
          array[HOUR] = toInt(input);
          getParsingFlags(config).bigHour = true;
      });
      addParseToken('hmm', function (input, array, config) {
          var pos = input.length - 2;
          array[HOUR] = toInt(input.substr(0, pos));
          array[MINUTE] = toInt(input.substr(pos));
          getParsingFlags(config).bigHour = true;
      });
      addParseToken('hmmss', function (input, array, config) {
          var pos1 = input.length - 4;
          var pos2 = input.length - 2;
          array[HOUR] = toInt(input.substr(0, pos1));
          array[MINUTE] = toInt(input.substr(pos1, 2));
          array[SECOND] = toInt(input.substr(pos2));
          getParsingFlags(config).bigHour = true;
      });
      addParseToken('Hmm', function (input, array, config) {
          var pos = input.length - 2;
          array[HOUR] = toInt(input.substr(0, pos));
          array[MINUTE] = toInt(input.substr(pos));
      });
      addParseToken('Hmmss', function (input, array, config) {
          var pos1 = input.length - 4;
          var pos2 = input.length - 2;
          array[HOUR] = toInt(input.substr(0, pos1));
          array[MINUTE] = toInt(input.substr(pos1, 2));
          array[SECOND] = toInt(input.substr(pos2));
      });

      // LOCALES

      function localeIsPM (input) {
          // IE8 Quirks Mode & IE7 Standards Mode do not allow accessing strings like arrays
          // Using charAt should be more compatible.
          return ((input + '').toLowerCase().charAt(0) === 'p');
      }

      var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i;
      function localeMeridiem (hours, minutes, isLower) {
          if (hours > 11) {
              return isLower ? 'pm' : 'PM';
          } else {
              return isLower ? 'am' : 'AM';
          }
      }


      // MOMENTS

      // Setting the hour should keep the time, because the user explicitly
      // specified which hour they want. So trying to maintain the same hour (in
      // a new timezone) makes sense. Adding/subtracting hours does not follow
      // this rule.
      var getSetHour = makeGetSet('Hours', true);

      var baseConfig = {
          calendar: defaultCalendar,
          longDateFormat: defaultLongDateFormat,
          invalidDate: defaultInvalidDate,
          ordinal: defaultOrdinal,
          dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
          relativeTime: defaultRelativeTime,

          months: defaultLocaleMonths,
          monthsShort: defaultLocaleMonthsShort,

          week: defaultLocaleWeek,

          weekdays: defaultLocaleWeekdays,
          weekdaysMin: defaultLocaleWeekdaysMin,
          weekdaysShort: defaultLocaleWeekdaysShort,

          meridiemParse: defaultLocaleMeridiemParse
      };

      // internal storage for locale config files
      var locales = {};
      var localeFamilies = {};
      var globalLocale;

      function normalizeLocale(key) {
          return key ? key.toLowerCase().replace('_', '-') : key;
      }

      // pick the locale from the array
      // try ['en-au', 'en-gb'] as 'en-au', 'en-gb', 'en', as in move through the list trying each
      // substring from most specific to least, but move to the next array item if it's a more specific variant than the current root
      function chooseLocale(names) {
          var i = 0, j, next, locale, split;

          while (i < names.length) {
              split = normalizeLocale(names[i]).split('-');
              j = split.length;
              next = normalizeLocale(names[i + 1]);
              next = next ? next.split('-') : null;
              while (j > 0) {
                  locale = loadLocale(split.slice(0, j).join('-'));
                  if (locale) {
                      return locale;
                  }
                  if (next && next.length >= j && compareArrays(split, next, true) >= j - 1) {
                      //the next array item is better than a shallower substring of this one
                      break;
                  }
                  j--;
              }
              i++;
          }
          return globalLocale;
      }

      function loadLocale(name) {
          var oldLocale = null;
          // TODO: Find a better way to register and load all the locales in Node
          if (!locales[name] && ('object' !== 'undefined') &&
                  module && module.exports) {
              try {
                  oldLocale = globalLocale._abbr;
                  var aliasedRequire = commonjsRequire;
                  aliasedRequire('./locale/' + name);
                  getSetGlobalLocale(oldLocale);
              } catch (e) {}
          }
          return locales[name];
      }

      // This function will load locale and then set the global locale.  If
      // no arguments are passed in, it will simply return the current global
      // locale key.
      function getSetGlobalLocale (key, values) {
          var data;
          if (key) {
              if (isUndefined(values)) {
                  data = getLocale(key);
              }
              else {
                  data = defineLocale(key, values);
              }

              if (data) {
                  // moment.duration._locale = moment._locale = data;
                  globalLocale = data;
              }
              else {
                  if ((typeof console !==  'undefined') && console.warn) {
                      //warn user if arguments are passed but the locale could not be set
                      console.warn('Locale ' + key +  ' not found. Did you forget to load it?');
                  }
              }
          }

          return globalLocale._abbr;
      }

      function defineLocale (name, config) {
          if (config !== null) {
              var locale, parentConfig = baseConfig;
              config.abbr = name;
              if (locales[name] != null) {
                  deprecateSimple('defineLocaleOverride',
                          'use moment.updateLocale(localeName, config) to change ' +
                          'an existing locale. moment.defineLocale(localeName, ' +
                          'config) should only be used for creating a new locale ' +
                          'See http://momentjs.com/guides/#/warnings/define-locale/ for more info.');
                  parentConfig = locales[name]._config;
              } else if (config.parentLocale != null) {
                  if (locales[config.parentLocale] != null) {
                      parentConfig = locales[config.parentLocale]._config;
                  } else {
                      locale = loadLocale(config.parentLocale);
                      if (locale != null) {
                          parentConfig = locale._config;
                      } else {
                          if (!localeFamilies[config.parentLocale]) {
                              localeFamilies[config.parentLocale] = [];
                          }
                          localeFamilies[config.parentLocale].push({
                              name: name,
                              config: config
                          });
                          return null;
                      }
                  }
              }
              locales[name] = new Locale(mergeConfigs(parentConfig, config));

              if (localeFamilies[name]) {
                  localeFamilies[name].forEach(function (x) {
                      defineLocale(x.name, x.config);
                  });
              }

              // backwards compat for now: also set the locale
              // make sure we set the locale AFTER all child locales have been
              // created, so we won't end up with the child locale set.
              getSetGlobalLocale(name);


              return locales[name];
          } else {
              // useful for testing
              delete locales[name];
              return null;
          }
      }

      function updateLocale(name, config) {
          if (config != null) {
              var locale, tmpLocale, parentConfig = baseConfig;
              // MERGE
              tmpLocale = loadLocale(name);
              if (tmpLocale != null) {
                  parentConfig = tmpLocale._config;
              }
              config = mergeConfigs(parentConfig, config);
              locale = new Locale(config);
              locale.parentLocale = locales[name];
              locales[name] = locale;

              // backwards compat for now: also set the locale
              getSetGlobalLocale(name);
          } else {
              // pass null for config to unupdate, useful for tests
              if (locales[name] != null) {
                  if (locales[name].parentLocale != null) {
                      locales[name] = locales[name].parentLocale;
                  } else if (locales[name] != null) {
                      delete locales[name];
                  }
              }
          }
          return locales[name];
      }

      // returns locale data
      function getLocale (key) {
          var locale;

          if (key && key._locale && key._locale._abbr) {
              key = key._locale._abbr;
          }

          if (!key) {
              return globalLocale;
          }

          if (!isArray(key)) {
              //short-circuit everything else
              locale = loadLocale(key);
              if (locale) {
                  return locale;
              }
              key = [key];
          }

          return chooseLocale(key);
      }

      function listLocales() {
          return keys(locales);
      }

      function checkOverflow (m) {
          var overflow;
          var a = m._a;

          if (a && getParsingFlags(m).overflow === -2) {
              overflow =
                  a[MONTH]       < 0 || a[MONTH]       > 11  ? MONTH :
                  a[DATE]        < 1 || a[DATE]        > daysInMonth(a[YEAR], a[MONTH]) ? DATE :
                  a[HOUR]        < 0 || a[HOUR]        > 24 || (a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0)) ? HOUR :
                  a[MINUTE]      < 0 || a[MINUTE]      > 59  ? MINUTE :
                  a[SECOND]      < 0 || a[SECOND]      > 59  ? SECOND :
                  a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND :
                  -1;

              if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
                  overflow = DATE;
              }
              if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
                  overflow = WEEK;
              }
              if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
                  overflow = WEEKDAY;
              }

              getParsingFlags(m).overflow = overflow;
          }

          return m;
      }

      // Pick the first defined of two or three arguments.
      function defaults(a, b, c) {
          if (a != null) {
              return a;
          }
          if (b != null) {
              return b;
          }
          return c;
      }

      function currentDateArray(config) {
          // hooks is actually the exported moment object
          var nowValue = new Date(hooks.now());
          if (config._useUTC) {
              return [nowValue.getUTCFullYear(), nowValue.getUTCMonth(), nowValue.getUTCDate()];
          }
          return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
      }

      // convert an array to a date.
      // the array should mirror the parameters below
      // note: all values past the year are optional and will default to the lowest possible value.
      // [year, month, day , hour, minute, second, millisecond]
      function configFromArray (config) {
          var i, date, input = [], currentDate, expectedWeekday, yearToUse;

          if (config._d) {
              return;
          }

          currentDate = currentDateArray(config);

          //compute day of the year from weeks and weekdays
          if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
              dayOfYearFromWeekInfo(config);
          }

          //if the day of the year is set, figure out what it is
          if (config._dayOfYear != null) {
              yearToUse = defaults(config._a[YEAR], currentDate[YEAR]);

              if (config._dayOfYear > daysInYear(yearToUse) || config._dayOfYear === 0) {
                  getParsingFlags(config)._overflowDayOfYear = true;
              }

              date = createUTCDate(yearToUse, 0, config._dayOfYear);
              config._a[MONTH] = date.getUTCMonth();
              config._a[DATE] = date.getUTCDate();
          }

          // Default to current date.
          // * if no year, month, day of month are given, default to today
          // * if day of month is given, default month and year
          // * if month is given, default only year
          // * if year is given, don't default anything
          for (i = 0; i < 3 && config._a[i] == null; ++i) {
              config._a[i] = input[i] = currentDate[i];
          }

          // Zero out whatever was not defaulted, including time
          for (; i < 7; i++) {
              config._a[i] = input[i] = (config._a[i] == null) ? (i === 2 ? 1 : 0) : config._a[i];
          }

          // Check for 24:00:00.000
          if (config._a[HOUR] === 24 &&
                  config._a[MINUTE] === 0 &&
                  config._a[SECOND] === 0 &&
                  config._a[MILLISECOND] === 0) {
              config._nextDay = true;
              config._a[HOUR] = 0;
          }

          config._d = (config._useUTC ? createUTCDate : createDate).apply(null, input);
          expectedWeekday = config._useUTC ? config._d.getUTCDay() : config._d.getDay();

          // Apply timezone offset from input. The actual utcOffset can be changed
          // with parseZone.
          if (config._tzm != null) {
              config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
          }

          if (config._nextDay) {
              config._a[HOUR] = 24;
          }

          // check for mismatching day of week
          if (config._w && typeof config._w.d !== 'undefined' && config._w.d !== expectedWeekday) {
              getParsingFlags(config).weekdayMismatch = true;
          }
      }

      function dayOfYearFromWeekInfo(config) {
          var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow;

          w = config._w;
          if (w.GG != null || w.W != null || w.E != null) {
              dow = 1;
              doy = 4;

              // TODO: We need to take the current isoWeekYear, but that depends on
              // how we interpret now (local, utc, fixed offset). So create
              // a now version of current config (take local/utc/offset flags, and
              // create now).
              weekYear = defaults(w.GG, config._a[YEAR], weekOfYear(createLocal(), 1, 4).year);
              week = defaults(w.W, 1);
              weekday = defaults(w.E, 1);
              if (weekday < 1 || weekday > 7) {
                  weekdayOverflow = true;
              }
          } else {
              dow = config._locale._week.dow;
              doy = config._locale._week.doy;

              var curWeek = weekOfYear(createLocal(), dow, doy);

              weekYear = defaults(w.gg, config._a[YEAR], curWeek.year);

              // Default to current week.
              week = defaults(w.w, curWeek.week);

              if (w.d != null) {
                  // weekday -- low day numbers are considered next week
                  weekday = w.d;
                  if (weekday < 0 || weekday > 6) {
                      weekdayOverflow = true;
                  }
              } else if (w.e != null) {
                  // local weekday -- counting starts from beginning of week
                  weekday = w.e + dow;
                  if (w.e < 0 || w.e > 6) {
                      weekdayOverflow = true;
                  }
              } else {
                  // default to beginning of week
                  weekday = dow;
              }
          }
          if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
              getParsingFlags(config)._overflowWeeks = true;
          } else if (weekdayOverflow != null) {
              getParsingFlags(config)._overflowWeekday = true;
          } else {
              temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
              config._a[YEAR] = temp.year;
              config._dayOfYear = temp.dayOfYear;
          }
      }

      // iso 8601 regex
      // 0000-00-00 0000-W00 or 0000-W00-0 + T + 00 or 00:00 or 00:00:00 or 00:00:00.000 + +00:00 or +0000 or +00)
      var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;
      var basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/;

      var tzRegex = /Z|[+-]\d\d(?::?\d\d)?/;

      var isoDates = [
          ['YYYYYY-MM-DD', /[+-]\d{6}-\d\d-\d\d/],
          ['YYYY-MM-DD', /\d{4}-\d\d-\d\d/],
          ['GGGG-[W]WW-E', /\d{4}-W\d\d-\d/],
          ['GGGG-[W]WW', /\d{4}-W\d\d/, false],
          ['YYYY-DDD', /\d{4}-\d{3}/],
          ['YYYY-MM', /\d{4}-\d\d/, false],
          ['YYYYYYMMDD', /[+-]\d{10}/],
          ['YYYYMMDD', /\d{8}/],
          // YYYYMM is NOT allowed by the standard
          ['GGGG[W]WWE', /\d{4}W\d{3}/],
          ['GGGG[W]WW', /\d{4}W\d{2}/, false],
          ['YYYYDDD', /\d{7}/]
      ];

      // iso time formats and regexes
      var isoTimes = [
          ['HH:mm:ss.SSSS', /\d\d:\d\d:\d\d\.\d+/],
          ['HH:mm:ss,SSSS', /\d\d:\d\d:\d\d,\d+/],
          ['HH:mm:ss', /\d\d:\d\d:\d\d/],
          ['HH:mm', /\d\d:\d\d/],
          ['HHmmss.SSSS', /\d\d\d\d\d\d\.\d+/],
          ['HHmmss,SSSS', /\d\d\d\d\d\d,\d+/],
          ['HHmmss', /\d\d\d\d\d\d/],
          ['HHmm', /\d\d\d\d/],
          ['HH', /\d\d/]
      ];

      var aspNetJsonRegex = /^\/?Date\((\-?\d+)/i;

      // date from iso format
      function configFromISO(config) {
          var i, l,
              string = config._i,
              match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string),
              allowTime, dateFormat, timeFormat, tzFormat;

          if (match) {
              getParsingFlags(config).iso = true;

              for (i = 0, l = isoDates.length; i < l; i++) {
                  if (isoDates[i][1].exec(match[1])) {
                      dateFormat = isoDates[i][0];
                      allowTime = isoDates[i][2] !== false;
                      break;
                  }
              }
              if (dateFormat == null) {
                  config._isValid = false;
                  return;
              }
              if (match[3]) {
                  for (i = 0, l = isoTimes.length; i < l; i++) {
                      if (isoTimes[i][1].exec(match[3])) {
                          // match[2] should be 'T' or space
                          timeFormat = (match[2] || ' ') + isoTimes[i][0];
                          break;
                      }
                  }
                  if (timeFormat == null) {
                      config._isValid = false;
                      return;
                  }
              }
              if (!allowTime && timeFormat != null) {
                  config._isValid = false;
                  return;
              }
              if (match[4]) {
                  if (tzRegex.exec(match[4])) {
                      tzFormat = 'Z';
                  } else {
                      config._isValid = false;
                      return;
                  }
              }
              config._f = dateFormat + (timeFormat || '') + (tzFormat || '');
              configFromStringAndFormat(config);
          } else {
              config._isValid = false;
          }
      }

      // RFC 2822 regex: For details see https://tools.ietf.org/html/rfc2822#section-3.3
      var rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|([+-]\d{4}))$/;

      function extractFromRFC2822Strings(yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
          var result = [
              untruncateYear(yearStr),
              defaultLocaleMonthsShort.indexOf(monthStr),
              parseInt(dayStr, 10),
              parseInt(hourStr, 10),
              parseInt(minuteStr, 10)
          ];

          if (secondStr) {
              result.push(parseInt(secondStr, 10));
          }

          return result;
      }

      function untruncateYear(yearStr) {
          var year = parseInt(yearStr, 10);
          if (year <= 49) {
              return 2000 + year;
          } else if (year <= 999) {
              return 1900 + year;
          }
          return year;
      }

      function preprocessRFC2822(s) {
          // Remove comments and folding whitespace and replace multiple-spaces with a single space
          return s.replace(/\([^)]*\)|[\n\t]/g, ' ').replace(/(\s\s+)/g, ' ').replace(/^\s\s*/, '').replace(/\s\s*$/, '');
      }

      function checkWeekday(weekdayStr, parsedInput, config) {
          if (weekdayStr) {
              // TODO: Replace the vanilla JS Date object with an indepentent day-of-week check.
              var weekdayProvided = defaultLocaleWeekdaysShort.indexOf(weekdayStr),
                  weekdayActual = new Date(parsedInput[0], parsedInput[1], parsedInput[2]).getDay();
              if (weekdayProvided !== weekdayActual) {
                  getParsingFlags(config).weekdayMismatch = true;
                  config._isValid = false;
                  return false;
              }
          }
          return true;
      }

      var obsOffsets = {
          UT: 0,
          GMT: 0,
          EDT: -4 * 60,
          EST: -5 * 60,
          CDT: -5 * 60,
          CST: -6 * 60,
          MDT: -6 * 60,
          MST: -7 * 60,
          PDT: -7 * 60,
          PST: -8 * 60
      };

      function calculateOffset(obsOffset, militaryOffset, numOffset) {
          if (obsOffset) {
              return obsOffsets[obsOffset];
          } else if (militaryOffset) {
              // the only allowed military tz is Z
              return 0;
          } else {
              var hm = parseInt(numOffset, 10);
              var m = hm % 100, h = (hm - m) / 100;
              return h * 60 + m;
          }
      }

      // date and time from ref 2822 format
      function configFromRFC2822(config) {
          var match = rfc2822.exec(preprocessRFC2822(config._i));
          if (match) {
              var parsedArray = extractFromRFC2822Strings(match[4], match[3], match[2], match[5], match[6], match[7]);
              if (!checkWeekday(match[1], parsedArray, config)) {
                  return;
              }

              config._a = parsedArray;
              config._tzm = calculateOffset(match[8], match[9], match[10]);

              config._d = createUTCDate.apply(null, config._a);
              config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);

              getParsingFlags(config).rfc2822 = true;
          } else {
              config._isValid = false;
          }
      }

      // date from iso format or fallback
      function configFromString(config) {
          var matched = aspNetJsonRegex.exec(config._i);

          if (matched !== null) {
              config._d = new Date(+matched[1]);
              return;
          }

          configFromISO(config);
          if (config._isValid === false) {
              delete config._isValid;
          } else {
              return;
          }

          configFromRFC2822(config);
          if (config._isValid === false) {
              delete config._isValid;
          } else {
              return;
          }

          // Final attempt, use Input Fallback
          hooks.createFromInputFallback(config);
      }

      hooks.createFromInputFallback = deprecate(
          'value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), ' +
          'which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are ' +
          'discouraged and will be removed in an upcoming major release. Please refer to ' +
          'http://momentjs.com/guides/#/warnings/js-date/ for more info.',
          function (config) {
              config._d = new Date(config._i + (config._useUTC ? ' UTC' : ''));
          }
      );

      // constant that refers to the ISO standard
      hooks.ISO_8601 = function () {};

      // constant that refers to the RFC 2822 form
      hooks.RFC_2822 = function () {};

      // date from string and format string
      function configFromStringAndFormat(config) {
          // TODO: Move this to another part of the creation flow to prevent circular deps
          if (config._f === hooks.ISO_8601) {
              configFromISO(config);
              return;
          }
          if (config._f === hooks.RFC_2822) {
              configFromRFC2822(config);
              return;
          }
          config._a = [];
          getParsingFlags(config).empty = true;

          // This array is used to make a Date, either with `new Date` or `Date.UTC`
          var string = '' + config._i,
              i, parsedInput, tokens, token, skipped,
              stringLength = string.length,
              totalParsedInputLength = 0;

          tokens = expandFormat(config._f, config._locale).match(formattingTokens) || [];

          for (i = 0; i < tokens.length; i++) {
              token = tokens[i];
              parsedInput = (string.match(getParseRegexForToken(token, config)) || [])[0];
              // console.log('token', token, 'parsedInput', parsedInput,
              //         'regex', getParseRegexForToken(token, config));
              if (parsedInput) {
                  skipped = string.substr(0, string.indexOf(parsedInput));
                  if (skipped.length > 0) {
                      getParsingFlags(config).unusedInput.push(skipped);
                  }
                  string = string.slice(string.indexOf(parsedInput) + parsedInput.length);
                  totalParsedInputLength += parsedInput.length;
              }
              // don't parse if it's not a known token
              if (formatTokenFunctions[token]) {
                  if (parsedInput) {
                      getParsingFlags(config).empty = false;
                  }
                  else {
                      getParsingFlags(config).unusedTokens.push(token);
                  }
                  addTimeToArrayFromToken(token, parsedInput, config);
              }
              else if (config._strict && !parsedInput) {
                  getParsingFlags(config).unusedTokens.push(token);
              }
          }

          // add remaining unparsed input length to the string
          getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
          if (string.length > 0) {
              getParsingFlags(config).unusedInput.push(string);
          }

          // clear _12h flag if hour is <= 12
          if (config._a[HOUR] <= 12 &&
              getParsingFlags(config).bigHour === true &&
              config._a[HOUR] > 0) {
              getParsingFlags(config).bigHour = undefined;
          }

          getParsingFlags(config).parsedDateParts = config._a.slice(0);
          getParsingFlags(config).meridiem = config._meridiem;
          // handle meridiem
          config._a[HOUR] = meridiemFixWrap(config._locale, config._a[HOUR], config._meridiem);

          configFromArray(config);
          checkOverflow(config);
      }


      function meridiemFixWrap (locale, hour, meridiem) {
          var isPm;

          if (meridiem == null) {
              // nothing to do
              return hour;
          }
          if (locale.meridiemHour != null) {
              return locale.meridiemHour(hour, meridiem);
          } else if (locale.isPM != null) {
              // Fallback
              isPm = locale.isPM(meridiem);
              if (isPm && hour < 12) {
                  hour += 12;
              }
              if (!isPm && hour === 12) {
                  hour = 0;
              }
              return hour;
          } else {
              // this is not supposed to happen
              return hour;
          }
      }

      // date from string and array of format strings
      function configFromStringAndArray(config) {
          var tempConfig,
              bestMoment,

              scoreToBeat,
              i,
              currentScore;

          if (config._f.length === 0) {
              getParsingFlags(config).invalidFormat = true;
              config._d = new Date(NaN);
              return;
          }

          for (i = 0; i < config._f.length; i++) {
              currentScore = 0;
              tempConfig = copyConfig({}, config);
              if (config._useUTC != null) {
                  tempConfig._useUTC = config._useUTC;
              }
              tempConfig._f = config._f[i];
              configFromStringAndFormat(tempConfig);

              if (!isValid(tempConfig)) {
                  continue;
              }

              // if there is any input that was not parsed add a penalty for that format
              currentScore += getParsingFlags(tempConfig).charsLeftOver;

              //or tokens
              currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;

              getParsingFlags(tempConfig).score = currentScore;

              if (scoreToBeat == null || currentScore < scoreToBeat) {
                  scoreToBeat = currentScore;
                  bestMoment = tempConfig;
              }
          }

          extend(config, bestMoment || tempConfig);
      }

      function configFromObject(config) {
          if (config._d) {
              return;
          }

          var i = normalizeObjectUnits(config._i);
          config._a = map([i.year, i.month, i.day || i.date, i.hour, i.minute, i.second, i.millisecond], function (obj) {
              return obj && parseInt(obj, 10);
          });

          configFromArray(config);
      }

      function createFromConfig (config) {
          var res = new Moment(checkOverflow(prepareConfig(config)));
          if (res._nextDay) {
              // Adding is smart enough around DST
              res.add(1, 'd');
              res._nextDay = undefined;
          }

          return res;
      }

      function prepareConfig (config) {
          var input = config._i,
              format = config._f;

          config._locale = config._locale || getLocale(config._l);

          if (input === null || (format === undefined && input === '')) {
              return createInvalid({nullInput: true});
          }

          if (typeof input === 'string') {
              config._i = input = config._locale.preparse(input);
          }

          if (isMoment(input)) {
              return new Moment(checkOverflow(input));
          } else if (isDate(input)) {
              config._d = input;
          } else if (isArray(format)) {
              configFromStringAndArray(config);
          } else if (format) {
              configFromStringAndFormat(config);
          }  else {
              configFromInput(config);
          }

          if (!isValid(config)) {
              config._d = null;
          }

          return config;
      }

      function configFromInput(config) {
          var input = config._i;
          if (isUndefined(input)) {
              config._d = new Date(hooks.now());
          } else if (isDate(input)) {
              config._d = new Date(input.valueOf());
          } else if (typeof input === 'string') {
              configFromString(config);
          } else if (isArray(input)) {
              config._a = map(input.slice(0), function (obj) {
                  return parseInt(obj, 10);
              });
              configFromArray(config);
          } else if (isObject(input)) {
              configFromObject(config);
          } else if (isNumber(input)) {
              // from milliseconds
              config._d = new Date(input);
          } else {
              hooks.createFromInputFallback(config);
          }
      }

      function createLocalOrUTC (input, format, locale, strict, isUTC) {
          var c = {};

          if (locale === true || locale === false) {
              strict = locale;
              locale = undefined;
          }

          if ((isObject(input) && isObjectEmpty(input)) ||
                  (isArray(input) && input.length === 0)) {
              input = undefined;
          }
          // object construction must be done this way.
          // https://github.com/moment/moment/issues/1423
          c._isAMomentObject = true;
          c._useUTC = c._isUTC = isUTC;
          c._l = locale;
          c._i = input;
          c._f = format;
          c._strict = strict;

          return createFromConfig(c);
      }

      function createLocal (input, format, locale, strict) {
          return createLocalOrUTC(input, format, locale, strict, false);
      }

      var prototypeMin = deprecate(
          'moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/',
          function () {
              var other = createLocal.apply(null, arguments);
              if (this.isValid() && other.isValid()) {
                  return other < this ? this : other;
              } else {
                  return createInvalid();
              }
          }
      );

      var prototypeMax = deprecate(
          'moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/',
          function () {
              var other = createLocal.apply(null, arguments);
              if (this.isValid() && other.isValid()) {
                  return other > this ? this : other;
              } else {
                  return createInvalid();
              }
          }
      );

      // Pick a moment m from moments so that m[fn](other) is true for all
      // other. This relies on the function fn to be transitive.
      //
      // moments should either be an array of moment objects or an array, whose
      // first element is an array of moment objects.
      function pickBy(fn, moments) {
          var res, i;
          if (moments.length === 1 && isArray(moments[0])) {
              moments = moments[0];
          }
          if (!moments.length) {
              return createLocal();
          }
          res = moments[0];
          for (i = 1; i < moments.length; ++i) {
              if (!moments[i].isValid() || moments[i][fn](res)) {
                  res = moments[i];
              }
          }
          return res;
      }

      // TODO: Use [].sort instead?
      function min () {
          var args = [].slice.call(arguments, 0);

          return pickBy('isBefore', args);
      }

      function max () {
          var args = [].slice.call(arguments, 0);

          return pickBy('isAfter', args);
      }

      var now = function () {
          return Date.now ? Date.now() : +(new Date());
      };

      var ordering = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond'];

      function isDurationValid(m) {
          for (var key in m) {
              if (!(indexOf.call(ordering, key) !== -1 && (m[key] == null || !isNaN(m[key])))) {
                  return false;
              }
          }

          var unitHasDecimal = false;
          for (var i = 0; i < ordering.length; ++i) {
              if (m[ordering[i]]) {
                  if (unitHasDecimal) {
                      return false; // only allow non-integers for smallest unit
                  }
                  if (parseFloat(m[ordering[i]]) !== toInt(m[ordering[i]])) {
                      unitHasDecimal = true;
                  }
              }
          }

          return true;
      }

      function isValid$1() {
          return this._isValid;
      }

      function createInvalid$1() {
          return createDuration(NaN);
      }

      function Duration (duration) {
          var normalizedInput = normalizeObjectUnits(duration),
              years = normalizedInput.year || 0,
              quarters = normalizedInput.quarter || 0,
              months = normalizedInput.month || 0,
              weeks = normalizedInput.week || normalizedInput.isoWeek || 0,
              days = normalizedInput.day || 0,
              hours = normalizedInput.hour || 0,
              minutes = normalizedInput.minute || 0,
              seconds = normalizedInput.second || 0,
              milliseconds = normalizedInput.millisecond || 0;

          this._isValid = isDurationValid(normalizedInput);

          // representation for dateAddRemove
          this._milliseconds = +milliseconds +
              seconds * 1e3 + // 1000
              minutes * 6e4 + // 1000 * 60
              hours * 1000 * 60 * 60; //using 1000 * 60 * 60 instead of 36e5 to avoid floating point rounding errors https://github.com/moment/moment/issues/2978
          // Because of dateAddRemove treats 24 hours as different from a
          // day when working around DST, we need to store them separately
          this._days = +days +
              weeks * 7;
          // It is impossible to translate months into days without knowing
          // which months you are are talking about, so we have to store
          // it separately.
          this._months = +months +
              quarters * 3 +
              years * 12;

          this._data = {};

          this._locale = getLocale();

          this._bubble();
      }

      function isDuration (obj) {
          return obj instanceof Duration;
      }

      function absRound (number) {
          if (number < 0) {
              return Math.round(-1 * number) * -1;
          } else {
              return Math.round(number);
          }
      }

      // FORMATTING

      function offset (token, separator) {
          addFormatToken(token, 0, 0, function () {
              var offset = this.utcOffset();
              var sign = '+';
              if (offset < 0) {
                  offset = -offset;
                  sign = '-';
              }
              return sign + zeroFill(~~(offset / 60), 2) + separator + zeroFill(~~(offset) % 60, 2);
          });
      }

      offset('Z', ':');
      offset('ZZ', '');

      // PARSING

      addRegexToken('Z',  matchShortOffset);
      addRegexToken('ZZ', matchShortOffset);
      addParseToken(['Z', 'ZZ'], function (input, array, config) {
          config._useUTC = true;
          config._tzm = offsetFromString(matchShortOffset, input);
      });

      // HELPERS

      // timezone chunker
      // '+10:00' > ['10',  '00']
      // '-1530'  > ['-15', '30']
      var chunkOffset = /([\+\-]|\d\d)/gi;

      function offsetFromString(matcher, string) {
          var matches = (string || '').match(matcher);

          if (matches === null) {
              return null;
          }

          var chunk   = matches[matches.length - 1] || [];
          var parts   = (chunk + '').match(chunkOffset) || ['-', 0, 0];
          var minutes = +(parts[1] * 60) + toInt(parts[2]);

          return minutes === 0 ?
            0 :
            parts[0] === '+' ? minutes : -minutes;
      }

      // Return a moment from input, that is local/utc/zone equivalent to model.
      function cloneWithOffset(input, model) {
          var res, diff;
          if (model._isUTC) {
              res = model.clone();
              diff = (isMoment(input) || isDate(input) ? input.valueOf() : createLocal(input).valueOf()) - res.valueOf();
              // Use low-level api, because this fn is low-level api.
              res._d.setTime(res._d.valueOf() + diff);
              hooks.updateOffset(res, false);
              return res;
          } else {
              return createLocal(input).local();
          }
      }

      function getDateOffset (m) {
          // On Firefox.24 Date#getTimezoneOffset returns a floating point.
          // https://github.com/moment/moment/pull/1871
          return -Math.round(m._d.getTimezoneOffset() / 15) * 15;
      }

      // HOOKS

      // This function will be called whenever a moment is mutated.
      // It is intended to keep the offset in sync with the timezone.
      hooks.updateOffset = function () {};

      // MOMENTS

      // keepLocalTime = true means only change the timezone, without
      // affecting the local hour. So 5:31:26 +0300 --[utcOffset(2, true)]-->
      // 5:31:26 +0200 It is possible that 5:31:26 doesn't exist with offset
      // +0200, so we adjust the time as needed, to be valid.
      //
      // Keeping the time actually adds/subtracts (one hour)
      // from the actual represented time. That is why we call updateOffset
      // a second time. In case it wants us to change the offset again
      // _changeInProgress == true case, then we have to adjust, because
      // there is no such time in the given timezone.
      function getSetOffset (input, keepLocalTime, keepMinutes) {
          var offset = this._offset || 0,
              localAdjust;
          if (!this.isValid()) {
              return input != null ? this : NaN;
          }
          if (input != null) {
              if (typeof input === 'string') {
                  input = offsetFromString(matchShortOffset, input);
                  if (input === null) {
                      return this;
                  }
              } else if (Math.abs(input) < 16 && !keepMinutes) {
                  input = input * 60;
              }
              if (!this._isUTC && keepLocalTime) {
                  localAdjust = getDateOffset(this);
              }
              this._offset = input;
              this._isUTC = true;
              if (localAdjust != null) {
                  this.add(localAdjust, 'm');
              }
              if (offset !== input) {
                  if (!keepLocalTime || this._changeInProgress) {
                      addSubtract(this, createDuration(input - offset, 'm'), 1, false);
                  } else if (!this._changeInProgress) {
                      this._changeInProgress = true;
                      hooks.updateOffset(this, true);
                      this._changeInProgress = null;
                  }
              }
              return this;
          } else {
              return this._isUTC ? offset : getDateOffset(this);
          }
      }

      function getSetZone (input, keepLocalTime) {
          if (input != null) {
              if (typeof input !== 'string') {
                  input = -input;
              }

              this.utcOffset(input, keepLocalTime);

              return this;
          } else {
              return -this.utcOffset();
          }
      }

      function setOffsetToUTC (keepLocalTime) {
          return this.utcOffset(0, keepLocalTime);
      }

      function setOffsetToLocal (keepLocalTime) {
          if (this._isUTC) {
              this.utcOffset(0, keepLocalTime);
              this._isUTC = false;

              if (keepLocalTime) {
                  this.subtract(getDateOffset(this), 'm');
              }
          }
          return this;
      }

      function setOffsetToParsedOffset () {
          if (this._tzm != null) {
              this.utcOffset(this._tzm, false, true);
          } else if (typeof this._i === 'string') {
              var tZone = offsetFromString(matchOffset, this._i);
              if (tZone != null) {
                  this.utcOffset(tZone);
              }
              else {
                  this.utcOffset(0, true);
              }
          }
          return this;
      }

      function hasAlignedHourOffset (input) {
          if (!this.isValid()) {
              return false;
          }
          input = input ? createLocal(input).utcOffset() : 0;

          return (this.utcOffset() - input) % 60 === 0;
      }

      function isDaylightSavingTime () {
          return (
              this.utcOffset() > this.clone().month(0).utcOffset() ||
              this.utcOffset() > this.clone().month(5).utcOffset()
          );
      }

      function isDaylightSavingTimeShifted () {
          if (!isUndefined(this._isDSTShifted)) {
              return this._isDSTShifted;
          }

          var c = {};

          copyConfig(c, this);
          c = prepareConfig(c);

          if (c._a) {
              var other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
              this._isDSTShifted = this.isValid() &&
                  compareArrays(c._a, other.toArray()) > 0;
          } else {
              this._isDSTShifted = false;
          }

          return this._isDSTShifted;
      }

      function isLocal () {
          return this.isValid() ? !this._isUTC : false;
      }

      function isUtcOffset () {
          return this.isValid() ? this._isUTC : false;
      }

      function isUtc () {
          return this.isValid() ? this._isUTC && this._offset === 0 : false;
      }

      // ASP.NET json date format regex
      var aspNetRegex = /^(\-|\+)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)(\.\d*)?)?$/;

      // from http://docs.closure-library.googlecode.com/git/closure_goog_date_date.js.source.html
      // somewhat more in line with 4.4.3.2 2004 spec, but allows decimal anywhere
      // and further modified to allow for strings containing both week and day
      var isoRegex = /^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/;

      function createDuration (input, key) {
          var duration = input,
              // matching against regexp is expensive, do it on demand
              match = null,
              sign,
              ret,
              diffRes;

          if (isDuration(input)) {
              duration = {
                  ms : input._milliseconds,
                  d  : input._days,
                  M  : input._months
              };
          } else if (isNumber(input)) {
              duration = {};
              if (key) {
                  duration[key] = input;
              } else {
                  duration.milliseconds = input;
              }
          } else if (!!(match = aspNetRegex.exec(input))) {
              sign = (match[1] === '-') ? -1 : 1;
              duration = {
                  y  : 0,
                  d  : toInt(match[DATE])                         * sign,
                  h  : toInt(match[HOUR])                         * sign,
                  m  : toInt(match[MINUTE])                       * sign,
                  s  : toInt(match[SECOND])                       * sign,
                  ms : toInt(absRound(match[MILLISECOND] * 1000)) * sign // the millisecond decimal point is included in the match
              };
          } else if (!!(match = isoRegex.exec(input))) {
              sign = (match[1] === '-') ? -1 : 1;
              duration = {
                  y : parseIso(match[2], sign),
                  M : parseIso(match[3], sign),
                  w : parseIso(match[4], sign),
                  d : parseIso(match[5], sign),
                  h : parseIso(match[6], sign),
                  m : parseIso(match[7], sign),
                  s : parseIso(match[8], sign)
              };
          } else if (duration == null) {// checks for null or undefined
              duration = {};
          } else if (typeof duration === 'object' && ('from' in duration || 'to' in duration)) {
              diffRes = momentsDifference(createLocal(duration.from), createLocal(duration.to));

              duration = {};
              duration.ms = diffRes.milliseconds;
              duration.M = diffRes.months;
          }

          ret = new Duration(duration);

          if (isDuration(input) && hasOwnProp(input, '_locale')) {
              ret._locale = input._locale;
          }

          return ret;
      }

      createDuration.fn = Duration.prototype;
      createDuration.invalid = createInvalid$1;

      function parseIso (inp, sign) {
          // We'd normally use ~~inp for this, but unfortunately it also
          // converts floats to ints.
          // inp may be undefined, so careful calling replace on it.
          var res = inp && parseFloat(inp.replace(',', '.'));
          // apply sign while we're at it
          return (isNaN(res) ? 0 : res) * sign;
      }

      function positiveMomentsDifference(base, other) {
          var res = {};

          res.months = other.month() - base.month() +
              (other.year() - base.year()) * 12;
          if (base.clone().add(res.months, 'M').isAfter(other)) {
              --res.months;
          }

          res.milliseconds = +other - +(base.clone().add(res.months, 'M'));

          return res;
      }

      function momentsDifference(base, other) {
          var res;
          if (!(base.isValid() && other.isValid())) {
              return {milliseconds: 0, months: 0};
          }

          other = cloneWithOffset(other, base);
          if (base.isBefore(other)) {
              res = positiveMomentsDifference(base, other);
          } else {
              res = positiveMomentsDifference(other, base);
              res.milliseconds = -res.milliseconds;
              res.months = -res.months;
          }

          return res;
      }

      // TODO: remove 'name' arg after deprecation is removed
      function createAdder(direction, name) {
          return function (val, period) {
              var dur, tmp;
              //invert the arguments, but complain about it
              if (period !== null && !isNaN(+period)) {
                  deprecateSimple(name, 'moment().' + name  + '(period, number) is deprecated. Please use moment().' + name + '(number, period). ' +
                  'See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info.');
                  tmp = val; val = period; period = tmp;
              }

              val = typeof val === 'string' ? +val : val;
              dur = createDuration(val, period);
              addSubtract(this, dur, direction);
              return this;
          };
      }

      function addSubtract (mom, duration, isAdding, updateOffset) {
          var milliseconds = duration._milliseconds,
              days = absRound(duration._days),
              months = absRound(duration._months);

          if (!mom.isValid()) {
              // No op
              return;
          }

          updateOffset = updateOffset == null ? true : updateOffset;

          if (months) {
              setMonth(mom, get(mom, 'Month') + months * isAdding);
          }
          if (days) {
              set$1(mom, 'Date', get(mom, 'Date') + days * isAdding);
          }
          if (milliseconds) {
              mom._d.setTime(mom._d.valueOf() + milliseconds * isAdding);
          }
          if (updateOffset) {
              hooks.updateOffset(mom, days || months);
          }
      }

      var add      = createAdder(1, 'add');
      var subtract = createAdder(-1, 'subtract');

      function getCalendarFormat(myMoment, now) {
          var diff = myMoment.diff(now, 'days', true);
          return diff < -6 ? 'sameElse' :
                  diff < -1 ? 'lastWeek' :
                  diff < 0 ? 'lastDay' :
                  diff < 1 ? 'sameDay' :
                  diff < 2 ? 'nextDay' :
                  diff < 7 ? 'nextWeek' : 'sameElse';
      }

      function calendar$1 (time, formats) {
          // We want to compare the start of today, vs this.
          // Getting start-of-today depends on whether we're local/utc/offset or not.
          var now = time || createLocal(),
              sod = cloneWithOffset(now, this).startOf('day'),
              format = hooks.calendarFormat(this, sod) || 'sameElse';

          var output = formats && (isFunction(formats[format]) ? formats[format].call(this, now) : formats[format]);

          return this.format(output || this.localeData().calendar(format, this, createLocal(now)));
      }

      function clone () {
          return new Moment(this);
      }

      function isAfter (input, units) {
          var localInput = isMoment(input) ? input : createLocal(input);
          if (!(this.isValid() && localInput.isValid())) {
              return false;
          }
          units = normalizeUnits(units) || 'millisecond';
          if (units === 'millisecond') {
              return this.valueOf() > localInput.valueOf();
          } else {
              return localInput.valueOf() < this.clone().startOf(units).valueOf();
          }
      }

      function isBefore (input, units) {
          var localInput = isMoment(input) ? input : createLocal(input);
          if (!(this.isValid() && localInput.isValid())) {
              return false;
          }
          units = normalizeUnits(units) || 'millisecond';
          if (units === 'millisecond') {
              return this.valueOf() < localInput.valueOf();
          } else {
              return this.clone().endOf(units).valueOf() < localInput.valueOf();
          }
      }

      function isBetween (from, to, units, inclusivity) {
          var localFrom = isMoment(from) ? from : createLocal(from),
              localTo = isMoment(to) ? to : createLocal(to);
          if (!(this.isValid() && localFrom.isValid() && localTo.isValid())) {
              return false;
          }
          inclusivity = inclusivity || '()';
          return (inclusivity[0] === '(' ? this.isAfter(localFrom, units) : !this.isBefore(localFrom, units)) &&
              (inclusivity[1] === ')' ? this.isBefore(localTo, units) : !this.isAfter(localTo, units));
      }

      function isSame (input, units) {
          var localInput = isMoment(input) ? input : createLocal(input),
              inputMs;
          if (!(this.isValid() && localInput.isValid())) {
              return false;
          }
          units = normalizeUnits(units) || 'millisecond';
          if (units === 'millisecond') {
              return this.valueOf() === localInput.valueOf();
          } else {
              inputMs = localInput.valueOf();
              return this.clone().startOf(units).valueOf() <= inputMs && inputMs <= this.clone().endOf(units).valueOf();
          }
      }

      function isSameOrAfter (input, units) {
          return this.isSame(input, units) || this.isAfter(input, units);
      }

      function isSameOrBefore (input, units) {
          return this.isSame(input, units) || this.isBefore(input, units);
      }

      function diff (input, units, asFloat) {
          var that,
              zoneDelta,
              output;

          if (!this.isValid()) {
              return NaN;
          }

          that = cloneWithOffset(input, this);

          if (!that.isValid()) {
              return NaN;
          }

          zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;

          units = normalizeUnits(units);

          switch (units) {
              case 'year': output = monthDiff(this, that) / 12; break;
              case 'month': output = monthDiff(this, that); break;
              case 'quarter': output = monthDiff(this, that) / 3; break;
              case 'second': output = (this - that) / 1e3; break; // 1000
              case 'minute': output = (this - that) / 6e4; break; // 1000 * 60
              case 'hour': output = (this - that) / 36e5; break; // 1000 * 60 * 60
              case 'day': output = (this - that - zoneDelta) / 864e5; break; // 1000 * 60 * 60 * 24, negate dst
              case 'week': output = (this - that - zoneDelta) / 6048e5; break; // 1000 * 60 * 60 * 24 * 7, negate dst
              default: output = this - that;
          }

          return asFloat ? output : absFloor(output);
      }

      function monthDiff (a, b) {
          // difference in months
          var wholeMonthDiff = ((b.year() - a.year()) * 12) + (b.month() - a.month()),
              // b is in (anchor - 1 month, anchor + 1 month)
              anchor = a.clone().add(wholeMonthDiff, 'months'),
              anchor2, adjust;

          if (b - anchor < 0) {
              anchor2 = a.clone().add(wholeMonthDiff - 1, 'months');
              // linear across the month
              adjust = (b - anchor) / (anchor - anchor2);
          } else {
              anchor2 = a.clone().add(wholeMonthDiff + 1, 'months');
              // linear across the month
              adjust = (b - anchor) / (anchor2 - anchor);
          }

          //check for negative zero, return zero if negative zero
          return -(wholeMonthDiff + adjust) || 0;
      }

      hooks.defaultFormat = 'YYYY-MM-DDTHH:mm:ssZ';
      hooks.defaultFormatUtc = 'YYYY-MM-DDTHH:mm:ss[Z]';

      function toString () {
          return this.clone().locale('en').format('ddd MMM DD YYYY HH:mm:ss [GMT]ZZ');
      }

      function toISOString(keepOffset) {
          if (!this.isValid()) {
              return null;
          }
          var utc = keepOffset !== true;
          var m = utc ? this.clone().utc() : this;
          if (m.year() < 0 || m.year() > 9999) {
              return formatMoment(m, utc ? 'YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYYYY-MM-DD[T]HH:mm:ss.SSSZ');
          }
          if (isFunction(Date.prototype.toISOString)) {
              // native implementation is ~50x faster, use it when we can
              if (utc) {
                  return this.toDate().toISOString();
              } else {
                  return new Date(this.valueOf() + this.utcOffset() * 60 * 1000).toISOString().replace('Z', formatMoment(m, 'Z'));
              }
          }
          return formatMoment(m, utc ? 'YYYY-MM-DD[T]HH:mm:ss.SSS[Z]' : 'YYYY-MM-DD[T]HH:mm:ss.SSSZ');
      }

      /**
       * Return a human readable representation of a moment that can
       * also be evaluated to get a new moment which is the same
       *
       * @link https://nodejs.org/dist/latest/docs/api/util.html#util_custom_inspect_function_on_objects
       */
      function inspect () {
          if (!this.isValid()) {
              return 'moment.invalid(/* ' + this._i + ' */)';
          }
          var func = 'moment';
          var zone = '';
          if (!this.isLocal()) {
              func = this.utcOffset() === 0 ? 'moment.utc' : 'moment.parseZone';
              zone = 'Z';
          }
          var prefix = '[' + func + '("]';
          var year = (0 <= this.year() && this.year() <= 9999) ? 'YYYY' : 'YYYYYY';
          var datetime = '-MM-DD[T]HH:mm:ss.SSS';
          var suffix = zone + '[")]';

          return this.format(prefix + year + datetime + suffix);
      }

      function format (inputString) {
          if (!inputString) {
              inputString = this.isUtc() ? hooks.defaultFormatUtc : hooks.defaultFormat;
          }
          var output = formatMoment(this, inputString);
          return this.localeData().postformat(output);
      }

      function from (time, withoutSuffix) {
          if (this.isValid() &&
                  ((isMoment(time) && time.isValid()) ||
                   createLocal(time).isValid())) {
              return createDuration({to: this, from: time}).locale(this.locale()).humanize(!withoutSuffix);
          } else {
              return this.localeData().invalidDate();
          }
      }

      function fromNow (withoutSuffix) {
          return this.from(createLocal(), withoutSuffix);
      }

      function to (time, withoutSuffix) {
          if (this.isValid() &&
                  ((isMoment(time) && time.isValid()) ||
                   createLocal(time).isValid())) {
              return createDuration({from: this, to: time}).locale(this.locale()).humanize(!withoutSuffix);
          } else {
              return this.localeData().invalidDate();
          }
      }

      function toNow (withoutSuffix) {
          return this.to(createLocal(), withoutSuffix);
      }

      // If passed a locale key, it will set the locale for this
      // instance.  Otherwise, it will return the locale configuration
      // variables for this instance.
      function locale (key) {
          var newLocaleData;

          if (key === undefined) {
              return this._locale._abbr;
          } else {
              newLocaleData = getLocale(key);
              if (newLocaleData != null) {
                  this._locale = newLocaleData;
              }
              return this;
          }
      }

      var lang = deprecate(
          'moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.',
          function (key) {
              if (key === undefined) {
                  return this.localeData();
              } else {
                  return this.locale(key);
              }
          }
      );

      function localeData () {
          return this._locale;
      }

      var MS_PER_SECOND = 1000;
      var MS_PER_MINUTE = 60 * MS_PER_SECOND;
      var MS_PER_HOUR = 60 * MS_PER_MINUTE;
      var MS_PER_400_YEARS = (365 * 400 + 97) * 24 * MS_PER_HOUR;

      // actual modulo - handles negative numbers (for dates before 1970):
      function mod$1(dividend, divisor) {
          return (dividend % divisor + divisor) % divisor;
      }

      function localStartOfDate(y, m, d) {
          // the date constructor remaps years 0-99 to 1900-1999
          if (y < 100 && y >= 0) {
              // preserve leap years using a full 400 year cycle, then reset
              return new Date(y + 400, m, d) - MS_PER_400_YEARS;
          } else {
              return new Date(y, m, d).valueOf();
          }
      }

      function utcStartOfDate(y, m, d) {
          // Date.UTC remaps years 0-99 to 1900-1999
          if (y < 100 && y >= 0) {
              // preserve leap years using a full 400 year cycle, then reset
              return Date.UTC(y + 400, m, d) - MS_PER_400_YEARS;
          } else {
              return Date.UTC(y, m, d);
          }
      }

      function startOf (units) {
          var time;
          units = normalizeUnits(units);
          if (units === undefined || units === 'millisecond' || !this.isValid()) {
              return this;
          }

          var startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;

          switch (units) {
              case 'year':
                  time = startOfDate(this.year(), 0, 1);
                  break;
              case 'quarter':
                  time = startOfDate(this.year(), this.month() - this.month() % 3, 1);
                  break;
              case 'month':
                  time = startOfDate(this.year(), this.month(), 1);
                  break;
              case 'week':
                  time = startOfDate(this.year(), this.month(), this.date() - this.weekday());
                  break;
              case 'isoWeek':
                  time = startOfDate(this.year(), this.month(), this.date() - (this.isoWeekday() - 1));
                  break;
              case 'day':
              case 'date':
                  time = startOfDate(this.year(), this.month(), this.date());
                  break;
              case 'hour':
                  time = this._d.valueOf();
                  time -= mod$1(time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE), MS_PER_HOUR);
                  break;
              case 'minute':
                  time = this._d.valueOf();
                  time -= mod$1(time, MS_PER_MINUTE);
                  break;
              case 'second':
                  time = this._d.valueOf();
                  time -= mod$1(time, MS_PER_SECOND);
                  break;
          }

          this._d.setTime(time);
          hooks.updateOffset(this, true);
          return this;
      }

      function endOf (units) {
          var time;
          units = normalizeUnits(units);
          if (units === undefined || units === 'millisecond' || !this.isValid()) {
              return this;
          }

          var startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;

          switch (units) {
              case 'year':
                  time = startOfDate(this.year() + 1, 0, 1) - 1;
                  break;
              case 'quarter':
                  time = startOfDate(this.year(), this.month() - this.month() % 3 + 3, 1) - 1;
                  break;
              case 'month':
                  time = startOfDate(this.year(), this.month() + 1, 1) - 1;
                  break;
              case 'week':
                  time = startOfDate(this.year(), this.month(), this.date() - this.weekday() + 7) - 1;
                  break;
              case 'isoWeek':
                  time = startOfDate(this.year(), this.month(), this.date() - (this.isoWeekday() - 1) + 7) - 1;
                  break;
              case 'day':
              case 'date':
                  time = startOfDate(this.year(), this.month(), this.date() + 1) - 1;
                  break;
              case 'hour':
                  time = this._d.valueOf();
                  time += MS_PER_HOUR - mod$1(time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE), MS_PER_HOUR) - 1;
                  break;
              case 'minute':
                  time = this._d.valueOf();
                  time += MS_PER_MINUTE - mod$1(time, MS_PER_MINUTE) - 1;
                  break;
              case 'second':
                  time = this._d.valueOf();
                  time += MS_PER_SECOND - mod$1(time, MS_PER_SECOND) - 1;
                  break;
          }

          this._d.setTime(time);
          hooks.updateOffset(this, true);
          return this;
      }

      function valueOf () {
          return this._d.valueOf() - ((this._offset || 0) * 60000);
      }

      function unix () {
          return Math.floor(this.valueOf() / 1000);
      }

      function toDate () {
          return new Date(this.valueOf());
      }

      function toArray () {
          var m = this;
          return [m.year(), m.month(), m.date(), m.hour(), m.minute(), m.second(), m.millisecond()];
      }

      function toObject () {
          var m = this;
          return {
              years: m.year(),
              months: m.month(),
              date: m.date(),
              hours: m.hours(),
              minutes: m.minutes(),
              seconds: m.seconds(),
              milliseconds: m.milliseconds()
          };
      }

      function toJSON () {
          // new Date(NaN).toJSON() === null
          return this.isValid() ? this.toISOString() : null;
      }

      function isValid$2 () {
          return isValid(this);
      }

      function parsingFlags () {
          return extend({}, getParsingFlags(this));
      }

      function invalidAt () {
          return getParsingFlags(this).overflow;
      }

      function creationData() {
          return {
              input: this._i,
              format: this._f,
              locale: this._locale,
              isUTC: this._isUTC,
              strict: this._strict
          };
      }

      // FORMATTING

      addFormatToken(0, ['gg', 2], 0, function () {
          return this.weekYear() % 100;
      });

      addFormatToken(0, ['GG', 2], 0, function () {
          return this.isoWeekYear() % 100;
      });

      function addWeekYearFormatToken (token, getter) {
          addFormatToken(0, [token, token.length], 0, getter);
      }

      addWeekYearFormatToken('gggg',     'weekYear');
      addWeekYearFormatToken('ggggg',    'weekYear');
      addWeekYearFormatToken('GGGG',  'isoWeekYear');
      addWeekYearFormatToken('GGGGG', 'isoWeekYear');

      // ALIASES

      addUnitAlias('weekYear', 'gg');
      addUnitAlias('isoWeekYear', 'GG');

      // PRIORITY

      addUnitPriority('weekYear', 1);
      addUnitPriority('isoWeekYear', 1);


      // PARSING

      addRegexToken('G',      matchSigned);
      addRegexToken('g',      matchSigned);
      addRegexToken('GG',     match1to2, match2);
      addRegexToken('gg',     match1to2, match2);
      addRegexToken('GGGG',   match1to4, match4);
      addRegexToken('gggg',   match1to4, match4);
      addRegexToken('GGGGG',  match1to6, match6);
      addRegexToken('ggggg',  match1to6, match6);

      addWeekParseToken(['gggg', 'ggggg', 'GGGG', 'GGGGG'], function (input, week, config, token) {
          week[token.substr(0, 2)] = toInt(input);
      });

      addWeekParseToken(['gg', 'GG'], function (input, week, config, token) {
          week[token] = hooks.parseTwoDigitYear(input);
      });

      // MOMENTS

      function getSetWeekYear (input) {
          return getSetWeekYearHelper.call(this,
                  input,
                  this.week(),
                  this.weekday(),
                  this.localeData()._week.dow,
                  this.localeData()._week.doy);
      }

      function getSetISOWeekYear (input) {
          return getSetWeekYearHelper.call(this,
                  input, this.isoWeek(), this.isoWeekday(), 1, 4);
      }

      function getISOWeeksInYear () {
          return weeksInYear(this.year(), 1, 4);
      }

      function getWeeksInYear () {
          var weekInfo = this.localeData()._week;
          return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
      }

      function getSetWeekYearHelper(input, week, weekday, dow, doy) {
          var weeksTarget;
          if (input == null) {
              return weekOfYear(this, dow, doy).year;
          } else {
              weeksTarget = weeksInYear(input, dow, doy);
              if (week > weeksTarget) {
                  week = weeksTarget;
              }
              return setWeekAll.call(this, input, week, weekday, dow, doy);
          }
      }

      function setWeekAll(weekYear, week, weekday, dow, doy) {
          var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy),
              date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);

          this.year(date.getUTCFullYear());
          this.month(date.getUTCMonth());
          this.date(date.getUTCDate());
          return this;
      }

      // FORMATTING

      addFormatToken('Q', 0, 'Qo', 'quarter');

      // ALIASES

      addUnitAlias('quarter', 'Q');

      // PRIORITY

      addUnitPriority('quarter', 7);

      // PARSING

      addRegexToken('Q', match1);
      addParseToken('Q', function (input, array) {
          array[MONTH] = (toInt(input) - 1) * 3;
      });

      // MOMENTS

      function getSetQuarter (input) {
          return input == null ? Math.ceil((this.month() + 1) / 3) : this.month((input - 1) * 3 + this.month() % 3);
      }

      // FORMATTING

      addFormatToken('D', ['DD', 2], 'Do', 'date');

      // ALIASES

      addUnitAlias('date', 'D');

      // PRIORITY
      addUnitPriority('date', 9);

      // PARSING

      addRegexToken('D',  match1to2);
      addRegexToken('DD', match1to2, match2);
      addRegexToken('Do', function (isStrict, locale) {
          // TODO: Remove "ordinalParse" fallback in next major release.
          return isStrict ?
            (locale._dayOfMonthOrdinalParse || locale._ordinalParse) :
            locale._dayOfMonthOrdinalParseLenient;
      });

      addParseToken(['D', 'DD'], DATE);
      addParseToken('Do', function (input, array) {
          array[DATE] = toInt(input.match(match1to2)[0]);
      });

      // MOMENTS

      var getSetDayOfMonth = makeGetSet('Date', true);

      // FORMATTING

      addFormatToken('DDD', ['DDDD', 3], 'DDDo', 'dayOfYear');

      // ALIASES

      addUnitAlias('dayOfYear', 'DDD');

      // PRIORITY
      addUnitPriority('dayOfYear', 4);

      // PARSING

      addRegexToken('DDD',  match1to3);
      addRegexToken('DDDD', match3);
      addParseToken(['DDD', 'DDDD'], function (input, array, config) {
          config._dayOfYear = toInt(input);
      });

      // HELPERS

      // MOMENTS

      function getSetDayOfYear (input) {
          var dayOfYear = Math.round((this.clone().startOf('day') - this.clone().startOf('year')) / 864e5) + 1;
          return input == null ? dayOfYear : this.add((input - dayOfYear), 'd');
      }

      // FORMATTING

      addFormatToken('m', ['mm', 2], 0, 'minute');

      // ALIASES

      addUnitAlias('minute', 'm');

      // PRIORITY

      addUnitPriority('minute', 14);

      // PARSING

      addRegexToken('m',  match1to2);
      addRegexToken('mm', match1to2, match2);
      addParseToken(['m', 'mm'], MINUTE);

      // MOMENTS

      var getSetMinute = makeGetSet('Minutes', false);

      // FORMATTING

      addFormatToken('s', ['ss', 2], 0, 'second');

      // ALIASES

      addUnitAlias('second', 's');

      // PRIORITY

      addUnitPriority('second', 15);

      // PARSING

      addRegexToken('s',  match1to2);
      addRegexToken('ss', match1to2, match2);
      addParseToken(['s', 'ss'], SECOND);

      // MOMENTS

      var getSetSecond = makeGetSet('Seconds', false);

      // FORMATTING

      addFormatToken('S', 0, 0, function () {
          return ~~(this.millisecond() / 100);
      });

      addFormatToken(0, ['SS', 2], 0, function () {
          return ~~(this.millisecond() / 10);
      });

      addFormatToken(0, ['SSS', 3], 0, 'millisecond');
      addFormatToken(0, ['SSSS', 4], 0, function () {
          return this.millisecond() * 10;
      });
      addFormatToken(0, ['SSSSS', 5], 0, function () {
          return this.millisecond() * 100;
      });
      addFormatToken(0, ['SSSSSS', 6], 0, function () {
          return this.millisecond() * 1000;
      });
      addFormatToken(0, ['SSSSSSS', 7], 0, function () {
          return this.millisecond() * 10000;
      });
      addFormatToken(0, ['SSSSSSSS', 8], 0, function () {
          return this.millisecond() * 100000;
      });
      addFormatToken(0, ['SSSSSSSSS', 9], 0, function () {
          return this.millisecond() * 1000000;
      });


      // ALIASES

      addUnitAlias('millisecond', 'ms');

      // PRIORITY

      addUnitPriority('millisecond', 16);

      // PARSING

      addRegexToken('S',    match1to3, match1);
      addRegexToken('SS',   match1to3, match2);
      addRegexToken('SSS',  match1to3, match3);

      var token;
      for (token = 'SSSS'; token.length <= 9; token += 'S') {
          addRegexToken(token, matchUnsigned);
      }

      function parseMs(input, array) {
          array[MILLISECOND] = toInt(('0.' + input) * 1000);
      }

      for (token = 'S'; token.length <= 9; token += 'S') {
          addParseToken(token, parseMs);
      }
      // MOMENTS

      var getSetMillisecond = makeGetSet('Milliseconds', false);

      // FORMATTING

      addFormatToken('z',  0, 0, 'zoneAbbr');
      addFormatToken('zz', 0, 0, 'zoneName');

      // MOMENTS

      function getZoneAbbr () {
          return this._isUTC ? 'UTC' : '';
      }

      function getZoneName () {
          return this._isUTC ? 'Coordinated Universal Time' : '';
      }

      var proto = Moment.prototype;

      proto.add               = add;
      proto.calendar          = calendar$1;
      proto.clone             = clone;
      proto.diff              = diff;
      proto.endOf             = endOf;
      proto.format            = format;
      proto.from              = from;
      proto.fromNow           = fromNow;
      proto.to                = to;
      proto.toNow             = toNow;
      proto.get               = stringGet;
      proto.invalidAt         = invalidAt;
      proto.isAfter           = isAfter;
      proto.isBefore          = isBefore;
      proto.isBetween         = isBetween;
      proto.isSame            = isSame;
      proto.isSameOrAfter     = isSameOrAfter;
      proto.isSameOrBefore    = isSameOrBefore;
      proto.isValid           = isValid$2;
      proto.lang              = lang;
      proto.locale            = locale;
      proto.localeData        = localeData;
      proto.max               = prototypeMax;
      proto.min               = prototypeMin;
      proto.parsingFlags      = parsingFlags;
      proto.set               = stringSet;
      proto.startOf           = startOf;
      proto.subtract          = subtract;
      proto.toArray           = toArray;
      proto.toObject          = toObject;
      proto.toDate            = toDate;
      proto.toISOString       = toISOString;
      proto.inspect           = inspect;
      proto.toJSON            = toJSON;
      proto.toString          = toString;
      proto.unix              = unix;
      proto.valueOf           = valueOf;
      proto.creationData      = creationData;
      proto.year       = getSetYear;
      proto.isLeapYear = getIsLeapYear;
      proto.weekYear    = getSetWeekYear;
      proto.isoWeekYear = getSetISOWeekYear;
      proto.quarter = proto.quarters = getSetQuarter;
      proto.month       = getSetMonth;
      proto.daysInMonth = getDaysInMonth;
      proto.week           = proto.weeks        = getSetWeek;
      proto.isoWeek        = proto.isoWeeks     = getSetISOWeek;
      proto.weeksInYear    = getWeeksInYear;
      proto.isoWeeksInYear = getISOWeeksInYear;
      proto.date       = getSetDayOfMonth;
      proto.day        = proto.days             = getSetDayOfWeek;
      proto.weekday    = getSetLocaleDayOfWeek;
      proto.isoWeekday = getSetISODayOfWeek;
      proto.dayOfYear  = getSetDayOfYear;
      proto.hour = proto.hours = getSetHour;
      proto.minute = proto.minutes = getSetMinute;
      proto.second = proto.seconds = getSetSecond;
      proto.millisecond = proto.milliseconds = getSetMillisecond;
      proto.utcOffset            = getSetOffset;
      proto.utc                  = setOffsetToUTC;
      proto.local                = setOffsetToLocal;
      proto.parseZone            = setOffsetToParsedOffset;
      proto.hasAlignedHourOffset = hasAlignedHourOffset;
      proto.isDST                = isDaylightSavingTime;
      proto.isLocal              = isLocal;
      proto.isUtcOffset          = isUtcOffset;
      proto.isUtc                = isUtc;
      proto.isUTC                = isUtc;
      proto.zoneAbbr = getZoneAbbr;
      proto.zoneName = getZoneName;
      proto.dates  = deprecate('dates accessor is deprecated. Use date instead.', getSetDayOfMonth);
      proto.months = deprecate('months accessor is deprecated. Use month instead', getSetMonth);
      proto.years  = deprecate('years accessor is deprecated. Use year instead', getSetYear);
      proto.zone   = deprecate('moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/', getSetZone);
      proto.isDSTShifted = deprecate('isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information', isDaylightSavingTimeShifted);

      function createUnix (input) {
          return createLocal(input * 1000);
      }

      function createInZone () {
          return createLocal.apply(null, arguments).parseZone();
      }

      function preParsePostFormat (string) {
          return string;
      }

      var proto$1 = Locale.prototype;

      proto$1.calendar        = calendar;
      proto$1.longDateFormat  = longDateFormat;
      proto$1.invalidDate     = invalidDate;
      proto$1.ordinal         = ordinal;
      proto$1.preparse        = preParsePostFormat;
      proto$1.postformat      = preParsePostFormat;
      proto$1.relativeTime    = relativeTime;
      proto$1.pastFuture      = pastFuture;
      proto$1.set             = set;

      proto$1.months            =        localeMonths;
      proto$1.monthsShort       =        localeMonthsShort;
      proto$1.monthsParse       =        localeMonthsParse;
      proto$1.monthsRegex       = monthsRegex;
      proto$1.monthsShortRegex  = monthsShortRegex;
      proto$1.week = localeWeek;
      proto$1.firstDayOfYear = localeFirstDayOfYear;
      proto$1.firstDayOfWeek = localeFirstDayOfWeek;

      proto$1.weekdays       =        localeWeekdays;
      proto$1.weekdaysMin    =        localeWeekdaysMin;
      proto$1.weekdaysShort  =        localeWeekdaysShort;
      proto$1.weekdaysParse  =        localeWeekdaysParse;

      proto$1.weekdaysRegex       =        weekdaysRegex;
      proto$1.weekdaysShortRegex  =        weekdaysShortRegex;
      proto$1.weekdaysMinRegex    =        weekdaysMinRegex;

      proto$1.isPM = localeIsPM;
      proto$1.meridiem = localeMeridiem;

      function get$1 (format, index, field, setter) {
          var locale = getLocale();
          var utc = createUTC().set(setter, index);
          return locale[field](utc, format);
      }

      function listMonthsImpl (format, index, field) {
          if (isNumber(format)) {
              index = format;
              format = undefined;
          }

          format = format || '';

          if (index != null) {
              return get$1(format, index, field, 'month');
          }

          var i;
          var out = [];
          for (i = 0; i < 12; i++) {
              out[i] = get$1(format, i, field, 'month');
          }
          return out;
      }

      // ()
      // (5)
      // (fmt, 5)
      // (fmt)
      // (true)
      // (true, 5)
      // (true, fmt, 5)
      // (true, fmt)
      function listWeekdaysImpl (localeSorted, format, index, field) {
          if (typeof localeSorted === 'boolean') {
              if (isNumber(format)) {
                  index = format;
                  format = undefined;
              }

              format = format || '';
          } else {
              format = localeSorted;
              index = format;
              localeSorted = false;

              if (isNumber(format)) {
                  index = format;
                  format = undefined;
              }

              format = format || '';
          }

          var locale = getLocale(),
              shift = localeSorted ? locale._week.dow : 0;

          if (index != null) {
              return get$1(format, (index + shift) % 7, field, 'day');
          }

          var i;
          var out = [];
          for (i = 0; i < 7; i++) {
              out[i] = get$1(format, (i + shift) % 7, field, 'day');
          }
          return out;
      }

      function listMonths (format, index) {
          return listMonthsImpl(format, index, 'months');
      }

      function listMonthsShort (format, index) {
          return listMonthsImpl(format, index, 'monthsShort');
      }

      function listWeekdays (localeSorted, format, index) {
          return listWeekdaysImpl(localeSorted, format, index, 'weekdays');
      }

      function listWeekdaysShort (localeSorted, format, index) {
          return listWeekdaysImpl(localeSorted, format, index, 'weekdaysShort');
      }

      function listWeekdaysMin (localeSorted, format, index) {
          return listWeekdaysImpl(localeSorted, format, index, 'weekdaysMin');
      }

      getSetGlobalLocale('en', {
          dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
          ordinal : function (number) {
              var b = number % 10,
                  output = (toInt(number % 100 / 10) === 1) ? 'th' :
                  (b === 1) ? 'st' :
                  (b === 2) ? 'nd' :
                  (b === 3) ? 'rd' : 'th';
              return number + output;
          }
      });

      // Side effect imports

      hooks.lang = deprecate('moment.lang is deprecated. Use moment.locale instead.', getSetGlobalLocale);
      hooks.langData = deprecate('moment.langData is deprecated. Use moment.localeData instead.', getLocale);

      var mathAbs = Math.abs;

      function abs () {
          var data           = this._data;

          this._milliseconds = mathAbs(this._milliseconds);
          this._days         = mathAbs(this._days);
          this._months       = mathAbs(this._months);

          data.milliseconds  = mathAbs(data.milliseconds);
          data.seconds       = mathAbs(data.seconds);
          data.minutes       = mathAbs(data.minutes);
          data.hours         = mathAbs(data.hours);
          data.months        = mathAbs(data.months);
          data.years         = mathAbs(data.years);

          return this;
      }

      function addSubtract$1 (duration, input, value, direction) {
          var other = createDuration(input, value);

          duration._milliseconds += direction * other._milliseconds;
          duration._days         += direction * other._days;
          duration._months       += direction * other._months;

          return duration._bubble();
      }

      // supports only 2.0-style add(1, 's') or add(duration)
      function add$1 (input, value) {
          return addSubtract$1(this, input, value, 1);
      }

      // supports only 2.0-style subtract(1, 's') or subtract(duration)
      function subtract$1 (input, value) {
          return addSubtract$1(this, input, value, -1);
      }

      function absCeil (number) {
          if (number < 0) {
              return Math.floor(number);
          } else {
              return Math.ceil(number);
          }
      }

      function bubble () {
          var milliseconds = this._milliseconds;
          var days         = this._days;
          var months       = this._months;
          var data         = this._data;
          var seconds, minutes, hours, years, monthsFromDays;

          // if we have a mix of positive and negative values, bubble down first
          // check: https://github.com/moment/moment/issues/2166
          if (!((milliseconds >= 0 && days >= 0 && months >= 0) ||
                  (milliseconds <= 0 && days <= 0 && months <= 0))) {
              milliseconds += absCeil(monthsToDays(months) + days) * 864e5;
              days = 0;
              months = 0;
          }

          // The following code bubbles up values, see the tests for
          // examples of what that means.
          data.milliseconds = milliseconds % 1000;

          seconds           = absFloor(milliseconds / 1000);
          data.seconds      = seconds % 60;

          minutes           = absFloor(seconds / 60);
          data.minutes      = minutes % 60;

          hours             = absFloor(minutes / 60);
          data.hours        = hours % 24;

          days += absFloor(hours / 24);

          // convert days to months
          monthsFromDays = absFloor(daysToMonths(days));
          months += monthsFromDays;
          days -= absCeil(monthsToDays(monthsFromDays));

          // 12 months -> 1 year
          years = absFloor(months / 12);
          months %= 12;

          data.days   = days;
          data.months = months;
          data.years  = years;

          return this;
      }

      function daysToMonths (days) {
          // 400 years have 146097 days (taking into account leap year rules)
          // 400 years have 12 months === 4800
          return days * 4800 / 146097;
      }

      function monthsToDays (months) {
          // the reverse of daysToMonths
          return months * 146097 / 4800;
      }

      function as (units) {
          if (!this.isValid()) {
              return NaN;
          }
          var days;
          var months;
          var milliseconds = this._milliseconds;

          units = normalizeUnits(units);

          if (units === 'month' || units === 'quarter' || units === 'year') {
              days = this._days + milliseconds / 864e5;
              months = this._months + daysToMonths(days);
              switch (units) {
                  case 'month':   return months;
                  case 'quarter': return months / 3;
                  case 'year':    return months / 12;
              }
          } else {
              // handle milliseconds separately because of floating point math errors (issue #1867)
              days = this._days + Math.round(monthsToDays(this._months));
              switch (units) {
                  case 'week'   : return days / 7     + milliseconds / 6048e5;
                  case 'day'    : return days         + milliseconds / 864e5;
                  case 'hour'   : return days * 24    + milliseconds / 36e5;
                  case 'minute' : return days * 1440  + milliseconds / 6e4;
                  case 'second' : return days * 86400 + milliseconds / 1000;
                  // Math.floor prevents floating point math errors here
                  case 'millisecond': return Math.floor(days * 864e5) + milliseconds;
                  default: throw new Error('Unknown unit ' + units);
              }
          }
      }

      // TODO: Use this.as('ms')?
      function valueOf$1 () {
          if (!this.isValid()) {
              return NaN;
          }
          return (
              this._milliseconds +
              this._days * 864e5 +
              (this._months % 12) * 2592e6 +
              toInt(this._months / 12) * 31536e6
          );
      }

      function makeAs (alias) {
          return function () {
              return this.as(alias);
          };
      }

      var asMilliseconds = makeAs('ms');
      var asSeconds      = makeAs('s');
      var asMinutes      = makeAs('m');
      var asHours        = makeAs('h');
      var asDays         = makeAs('d');
      var asWeeks        = makeAs('w');
      var asMonths       = makeAs('M');
      var asQuarters     = makeAs('Q');
      var asYears        = makeAs('y');

      function clone$1 () {
          return createDuration(this);
      }

      function get$2 (units) {
          units = normalizeUnits(units);
          return this.isValid() ? this[units + 's']() : NaN;
      }

      function makeGetter(name) {
          return function () {
              return this.isValid() ? this._data[name] : NaN;
          };
      }

      var milliseconds = makeGetter('milliseconds');
      var seconds      = makeGetter('seconds');
      var minutes      = makeGetter('minutes');
      var hours        = makeGetter('hours');
      var days         = makeGetter('days');
      var months       = makeGetter('months');
      var years        = makeGetter('years');

      function weeks () {
          return absFloor(this.days() / 7);
      }

      var round = Math.round;
      var thresholds = {
          ss: 44,         // a few seconds to seconds
          s : 45,         // seconds to minute
          m : 45,         // minutes to hour
          h : 22,         // hours to day
          d : 26,         // days to month
          M : 11          // months to year
      };

      // helper function for moment.fn.from, moment.fn.fromNow, and moment.duration.fn.humanize
      function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale) {
          return locale.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
      }

      function relativeTime$1 (posNegDuration, withoutSuffix, locale) {
          var duration = createDuration(posNegDuration).abs();
          var seconds  = round(duration.as('s'));
          var minutes  = round(duration.as('m'));
          var hours    = round(duration.as('h'));
          var days     = round(duration.as('d'));
          var months   = round(duration.as('M'));
          var years    = round(duration.as('y'));

          var a = seconds <= thresholds.ss && ['s', seconds]  ||
                  seconds < thresholds.s   && ['ss', seconds] ||
                  minutes <= 1             && ['m']           ||
                  minutes < thresholds.m   && ['mm', minutes] ||
                  hours   <= 1             && ['h']           ||
                  hours   < thresholds.h   && ['hh', hours]   ||
                  days    <= 1             && ['d']           ||
                  days    < thresholds.d   && ['dd', days]    ||
                  months  <= 1             && ['M']           ||
                  months  < thresholds.M   && ['MM', months]  ||
                  years   <= 1             && ['y']           || ['yy', years];

          a[2] = withoutSuffix;
          a[3] = +posNegDuration > 0;
          a[4] = locale;
          return substituteTimeAgo.apply(null, a);
      }

      // This function allows you to set the rounding function for relative time strings
      function getSetRelativeTimeRounding (roundingFunction) {
          if (roundingFunction === undefined) {
              return round;
          }
          if (typeof(roundingFunction) === 'function') {
              round = roundingFunction;
              return true;
          }
          return false;
      }

      // This function allows you to set a threshold for relative time strings
      function getSetRelativeTimeThreshold (threshold, limit) {
          if (thresholds[threshold] === undefined) {
              return false;
          }
          if (limit === undefined) {
              return thresholds[threshold];
          }
          thresholds[threshold] = limit;
          if (threshold === 's') {
              thresholds.ss = limit - 1;
          }
          return true;
      }

      function humanize (withSuffix) {
          if (!this.isValid()) {
              return this.localeData().invalidDate();
          }

          var locale = this.localeData();
          var output = relativeTime$1(this, !withSuffix, locale);

          if (withSuffix) {
              output = locale.pastFuture(+this, output);
          }

          return locale.postformat(output);
      }

      var abs$1 = Math.abs;

      function sign(x) {
          return ((x > 0) - (x < 0)) || +x;
      }

      function toISOString$1() {
          // for ISO strings we do not use the normal bubbling rules:
          //  * milliseconds bubble up until they become hours
          //  * days do not bubble at all
          //  * months bubble up until they become years
          // This is because there is no context-free conversion between hours and days
          // (think of clock changes)
          // and also not between days and months (28-31 days per month)
          if (!this.isValid()) {
              return this.localeData().invalidDate();
          }

          var seconds = abs$1(this._milliseconds) / 1000;
          var days         = abs$1(this._days);
          var months       = abs$1(this._months);
          var minutes, hours, years;

          // 3600 seconds -> 60 minutes -> 1 hour
          minutes           = absFloor(seconds / 60);
          hours             = absFloor(minutes / 60);
          seconds %= 60;
          minutes %= 60;

          // 12 months -> 1 year
          years  = absFloor(months / 12);
          months %= 12;


          // inspired by https://github.com/dordille/moment-isoduration/blob/master/moment.isoduration.js
          var Y = years;
          var M = months;
          var D = days;
          var h = hours;
          var m = minutes;
          var s = seconds ? seconds.toFixed(3).replace(/\.?0+$/, '') : '';
          var total = this.asSeconds();

          if (!total) {
              // this is the same as C#'s (Noda) and python (isodate)...
              // but not other JS (goog.date)
              return 'P0D';
          }

          var totalSign = total < 0 ? '-' : '';
          var ymSign = sign(this._months) !== sign(total) ? '-' : '';
          var daysSign = sign(this._days) !== sign(total) ? '-' : '';
          var hmsSign = sign(this._milliseconds) !== sign(total) ? '-' : '';

          return totalSign + 'P' +
              (Y ? ymSign + Y + 'Y' : '') +
              (M ? ymSign + M + 'M' : '') +
              (D ? daysSign + D + 'D' : '') +
              ((h || m || s) ? 'T' : '') +
              (h ? hmsSign + h + 'H' : '') +
              (m ? hmsSign + m + 'M' : '') +
              (s ? hmsSign + s + 'S' : '');
      }

      var proto$2 = Duration.prototype;

      proto$2.isValid        = isValid$1;
      proto$2.abs            = abs;
      proto$2.add            = add$1;
      proto$2.subtract       = subtract$1;
      proto$2.as             = as;
      proto$2.asMilliseconds = asMilliseconds;
      proto$2.asSeconds      = asSeconds;
      proto$2.asMinutes      = asMinutes;
      proto$2.asHours        = asHours;
      proto$2.asDays         = asDays;
      proto$2.asWeeks        = asWeeks;
      proto$2.asMonths       = asMonths;
      proto$2.asQuarters     = asQuarters;
      proto$2.asYears        = asYears;
      proto$2.valueOf        = valueOf$1;
      proto$2._bubble        = bubble;
      proto$2.clone          = clone$1;
      proto$2.get            = get$2;
      proto$2.milliseconds   = milliseconds;
      proto$2.seconds        = seconds;
      proto$2.minutes        = minutes;
      proto$2.hours          = hours;
      proto$2.days           = days;
      proto$2.weeks          = weeks;
      proto$2.months         = months;
      proto$2.years          = years;
      proto$2.humanize       = humanize;
      proto$2.toISOString    = toISOString$1;
      proto$2.toString       = toISOString$1;
      proto$2.toJSON         = toISOString$1;
      proto$2.locale         = locale;
      proto$2.localeData     = localeData;

      proto$2.toIsoString = deprecate('toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)', toISOString$1);
      proto$2.lang = lang;

      // Side effect imports

      // FORMATTING

      addFormatToken('X', 0, 0, 'unix');
      addFormatToken('x', 0, 0, 'valueOf');

      // PARSING

      addRegexToken('x', matchSigned);
      addRegexToken('X', matchTimestamp);
      addParseToken('X', function (input, array, config) {
          config._d = new Date(parseFloat(input, 10) * 1000);
      });
      addParseToken('x', function (input, array, config) {
          config._d = new Date(toInt(input));
      });

      // Side effect imports


      hooks.version = '2.24.0';

      setHookCallback(createLocal);

      hooks.fn                    = proto;
      hooks.min                   = min;
      hooks.max                   = max;
      hooks.now                   = now;
      hooks.utc                   = createUTC;
      hooks.unix                  = createUnix;
      hooks.months                = listMonths;
      hooks.isDate                = isDate;
      hooks.locale                = getSetGlobalLocale;
      hooks.invalid               = createInvalid;
      hooks.duration              = createDuration;
      hooks.isMoment              = isMoment;
      hooks.weekdays              = listWeekdays;
      hooks.parseZone             = createInZone;
      hooks.localeData            = getLocale;
      hooks.isDuration            = isDuration;
      hooks.monthsShort           = listMonthsShort;
      hooks.weekdaysMin           = listWeekdaysMin;
      hooks.defineLocale          = defineLocale;
      hooks.updateLocale          = updateLocale;
      hooks.locales               = listLocales;
      hooks.weekdaysShort         = listWeekdaysShort;
      hooks.normalizeUnits        = normalizeUnits;
      hooks.relativeTimeRounding  = getSetRelativeTimeRounding;
      hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
      hooks.calendarFormat        = getCalendarFormat;
      hooks.prototype             = proto;

      // currently HTML5 input type only supports 24-hour formats
      hooks.HTML5_FMT = {
          DATETIME_LOCAL: 'YYYY-MM-DDTHH:mm',             // <input type="datetime-local" />
          DATETIME_LOCAL_SECONDS: 'YYYY-MM-DDTHH:mm:ss',  // <input type="datetime-local" step="1" />
          DATETIME_LOCAL_MS: 'YYYY-MM-DDTHH:mm:ss.SSS',   // <input type="datetime-local" step="0.001" />
          DATE: 'YYYY-MM-DD',                             // <input type="date" />
          TIME: 'HH:mm',                                  // <input type="time" />
          TIME_SECONDS: 'HH:mm:ss',                       // <input type="time" step="1" />
          TIME_MS: 'HH:mm:ss.SSS',                        // <input type="time" step="0.001" />
          WEEK: 'GGGG-[W]WW',                             // <input type="week" />
          MONTH: 'YYYY-MM'                                // <input type="month" />
      };

      return hooks;

  })));
  });

  var MomentLocaleUtils = createCommonjsModule(function (module, exports) {

  Object.defineProperty(exports, "__esModule", {
    value: true
  });
  exports.formatDay = formatDay;
  exports.formatMonthTitle = formatMonthTitle;
  exports.formatWeekdayShort = formatWeekdayShort;
  exports.formatWeekdayLong = formatWeekdayLong;
  exports.getFirstDayOfWeek = getFirstDayOfWeek;
  exports.getMonths = getMonths;
  exports.formatDate = formatDate;
  exports.parseDate = parseDate;



  var _moment2 = _interopRequireDefault(moment);

  function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

  function formatDay(day) {
    var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en';

    return (0, _moment2.default)(day).locale(locale).format('ddd ll');
  } /* eslint-disable import/no-extraneous-dependencies, no-underscore-dangle */

  function formatMonthTitle(date) {
    var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en';

    return (0, _moment2.default)(date).locale(locale).format('MMMM YYYY');
  }

  function formatWeekdayShort(day) {
    var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en';

    return _moment2.default.localeData(locale).weekdaysMin()[day];
  }

  function formatWeekdayLong(day) {
    var locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'en';

    return _moment2.default.localeData(locale).weekdays()[day];
  }

  function getFirstDayOfWeek() {
    var locale = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'en';

    return _moment2.default.localeData(locale).firstDayOfWeek();
  }

  function getMonths() {
    var locale = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'en';

    return _moment2.default.localeData(locale).months();
  }

  function formatDate(date) {
    var format = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'L';
    var locale = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'en';

    return (0, _moment2.default)(date).locale(locale).format(Array.isArray(format) ? format[0] : format);
  }

  function parseDate(str) {
    var format = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'L';
    var locale = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'en';

    var m = (0, _moment2.default)(str, format, locale, true);
    if (m.isValid()) {
      return m.toDate();
    }
    return undefined;
  }

  exports.default = {
    formatDay: formatDay,
    formatMonthTitle: formatMonthTitle,
    formatWeekdayShort: formatWeekdayShort,
    formatWeekdayLong: formatWeekdayLong,
    getFirstDayOfWeek: getFirstDayOfWeek,
    getMonths: getMonths,
    formatDate: formatDate,
    parseDate: parseDate
  };

  });

  unwrapExports(MomentLocaleUtils);
  var MomentLocaleUtils_1 = MomentLocaleUtils.formatDay;
  var MomentLocaleUtils_2 = MomentLocaleUtils.formatMonthTitle;
  var MomentLocaleUtils_3 = MomentLocaleUtils.formatWeekdayShort;
  var MomentLocaleUtils_4 = MomentLocaleUtils.formatWeekdayLong;
  var MomentLocaleUtils_5 = MomentLocaleUtils.getFirstDayOfWeek;
  var MomentLocaleUtils_6 = MomentLocaleUtils.getMonths;
  var MomentLocaleUtils_7 = MomentLocaleUtils.formatDate;
  var MomentLocaleUtils_8 = MomentLocaleUtils.parseDate;

  var moment$1 = MomentLocaleUtils;

  const ACCESS_CODE_TYPES = {
    PROMOTION: 'Promotion',
    GROUP: 'Group'
  };
  const RESTRICTIONS = {
    CLOSED: 'Closed',
    NO_AVAILABLE_INVENTORY: 'NoAvailableInventory',
    SEASONAL_CLOSURE: 'SeasonalClosure',
    ZERO_FINAL_PRICE: 'ZeroFinalPrice',
    LIMIT: 'Limit',
    LEAD_DAYS_TIME: 'LeadDaysTime',
    BELOW_HURDLE_PRICE: 'BelowHurdlePrice',
    MAX_OCCUPANCY_EXCEEDED: 'MaxOccupancyExceeded',
    MAX_ADULT_OCCUPANCY_EXCEEDED: 'MaxAdultOccupancyExceeded',
    MIN_ADULT_OCCUPANCY_NOT_MET: 'MinAdultOccupancyNotMet',
    MAX_CHILD_OCCUPANCY_EXCEEDED: 'MaxChildOccupancyExceeded',
    MIN_CHILD_OCCUPANCY_NOT_MET: 'MinChildOccupancyNotMet',
    NO_SELL_DAY: 'NoSellDay',
    NO_BASE_SEASON_FOR_DERIVED: 'NoBaseSeasonForDerived',
    NO_DEPARTURE: 'NoDeparture',
    PROMO_PRICING_RESTRICTION_NOT_MET: 'PromoPricingRestrictionNotMet',
    INVALID_OCCUPANT_QUANTITY: 'InvalidOccupantQuantity',
    NO_ARRIVE: 'NoArrive',
    MAX_LEAD_DAYS: 'MaxLeadDays',
    PAST_DATE: 'PastDate',
    MIN_STAY_ARRIVE: 'MinStayArrive',
    MIN_STAY_THROUGH: 'MinStayThrough',
    MAX_STAY_ARRIVE: 'MaxStayArrive',
    MAX_STAY_THROUGH: 'MaxStayThrough'
  };
  const DEVICE_TYPES = {
    MOBILE: 'mobile',
    TABLET: 'tablet',
    DESKTOP: 'desktop'
  };
  const CHANNELS = {
    GC: 'GC',
    MOBILE: 'Mobile',
    WEB: 'WEB'
  };

  var uaParser = createCommonjsModule(function (module, exports) {
  /////////////////////////////////////////////////////////////////////////////////
  /* UAParser.js v1.0.37
     Copyright © 2012-2021 Faisal Salman <f@faisalman.com>
     MIT License *//*
     Detect Browser, Engine, OS, CPU, and Device type/model from User-Agent data.
     Supports browser & node.js environment. 
     Demo   : https://faisalman.github.io/ua-parser-js
     Source : https://github.com/faisalman/ua-parser-js */
  /////////////////////////////////////////////////////////////////////////////////

  (function (window, undefined$1) {

      //////////////
      // Constants
      /////////////


      var LIBVERSION  = '1.0.37',
          EMPTY       = '',
          UNKNOWN     = '?',
          FUNC_TYPE   = 'function',
          UNDEF_TYPE  = 'undefined',
          OBJ_TYPE    = 'object',
          STR_TYPE    = 'string',
          MAJOR       = 'major',
          MODEL       = 'model',
          NAME        = 'name',
          TYPE        = 'type',
          VENDOR      = 'vendor',
          VERSION     = 'version',
          ARCHITECTURE= 'architecture',
          CONSOLE     = 'console',
          MOBILE      = 'mobile',
          TABLET      = 'tablet',
          SMARTTV     = 'smarttv',
          WEARABLE    = 'wearable',
          EMBEDDED    = 'embedded',
          UA_MAX_LENGTH = 500;

      var AMAZON  = 'Amazon',
          APPLE   = 'Apple',
          ASUS    = 'ASUS',
          BLACKBERRY = 'BlackBerry',
          BROWSER = 'Browser',
          CHROME  = 'Chrome',
          EDGE    = 'Edge',
          FIREFOX = 'Firefox',
          GOOGLE  = 'Google',
          HUAWEI  = 'Huawei',
          LG      = 'LG',
          MICROSOFT = 'Microsoft',
          MOTOROLA  = 'Motorola',
          OPERA   = 'Opera',
          SAMSUNG = 'Samsung',
          SHARP   = 'Sharp',
          SONY    = 'Sony',
          XIAOMI  = 'Xiaomi',
          ZEBRA   = 'Zebra',
          FACEBOOK    = 'Facebook',
          CHROMIUM_OS = 'Chromium OS',
          MAC_OS  = 'Mac OS';

      ///////////
      // Helper
      //////////

      var extend = function (regexes, extensions) {
              var mergedRegexes = {};
              for (var i in regexes) {
                  if (extensions[i] && extensions[i].length % 2 === 0) {
                      mergedRegexes[i] = extensions[i].concat(regexes[i]);
                  } else {
                      mergedRegexes[i] = regexes[i];
                  }
              }
              return mergedRegexes;
          },
          enumerize = function (arr) {
              var enums = {};
              for (var i=0; i<arr.length; i++) {
                  enums[arr[i].toUpperCase()] = arr[i];
              }
              return enums;
          },
          has = function (str1, str2) {
              return typeof str1 === STR_TYPE ? lowerize(str2).indexOf(lowerize(str1)) !== -1 : false;
          },
          lowerize = function (str) {
              return str.toLowerCase();
          },
          majorize = function (version) {
              return typeof(version) === STR_TYPE ? version.replace(/[^\d\.]/g, EMPTY).split('.')[0] : undefined$1;
          },
          trim = function (str, len) {
              if (typeof(str) === STR_TYPE) {
                  str = str.replace(/^\s\s*/, EMPTY);
                  return typeof(len) === UNDEF_TYPE ? str : str.substring(0, UA_MAX_LENGTH);
              }
      };

      ///////////////
      // Map helper
      //////////////

      var rgxMapper = function (ua, arrays) {

              var i = 0, j, k, p, q, matches, match;

              // loop through all regexes maps
              while (i < arrays.length && !matches) {

                  var regex = arrays[i],       // even sequence (0,2,4,..)
                      props = arrays[i + 1];   // odd sequence (1,3,5,..)
                  j = k = 0;

                  // try matching uastring with regexes
                  while (j < regex.length && !matches) {

                      if (!regex[j]) { break; }
                      matches = regex[j++].exec(ua);

                      if (!!matches) {
                          for (p = 0; p < props.length; p++) {
                              match = matches[++k];
                              q = props[p];
                              // check if given property is actually array
                              if (typeof q === OBJ_TYPE && q.length > 0) {
                                  if (q.length === 2) {
                                      if (typeof q[1] == FUNC_TYPE) {
                                          // assign modified match
                                          this[q[0]] = q[1].call(this, match);
                                      } else {
                                          // assign given value, ignore regex match
                                          this[q[0]] = q[1];
                                      }
                                  } else if (q.length === 3) {
                                      // check whether function or regex
                                      if (typeof q[1] === FUNC_TYPE && !(q[1].exec && q[1].test)) {
                                          // call function (usually string mapper)
                                          this[q[0]] = match ? q[1].call(this, match, q[2]) : undefined$1;
                                      } else {
                                          // sanitize match using given regex
                                          this[q[0]] = match ? match.replace(q[1], q[2]) : undefined$1;
                                      }
                                  } else if (q.length === 4) {
                                          this[q[0]] = match ? q[3].call(this, match.replace(q[1], q[2])) : undefined$1;
                                  }
                              } else {
                                  this[q] = match ? match : undefined$1;
                              }
                          }
                      }
                  }
                  i += 2;
              }
          },

          strMapper = function (str, map) {

              for (var i in map) {
                  // check if current value is array
                  if (typeof map[i] === OBJ_TYPE && map[i].length > 0) {
                      for (var j = 0; j < map[i].length; j++) {
                          if (has(map[i][j], str)) {
                              return (i === UNKNOWN) ? undefined$1 : i;
                          }
                      }
                  } else if (has(map[i], str)) {
                      return (i === UNKNOWN) ? undefined$1 : i;
                  }
              }
              return str;
      };

      ///////////////
      // String map
      //////////////

      // Safari < 3.0
      var oldSafariMap = {
              '1.0'   : '/8',
              '1.2'   : '/1',
              '1.3'   : '/3',
              '2.0'   : '/412',
              '2.0.2' : '/416',
              '2.0.3' : '/417',
              '2.0.4' : '/419',
              '?'     : '/'
          },
          windowsVersionMap = {
              'ME'        : '4.90',
              'NT 3.11'   : 'NT3.51',
              'NT 4.0'    : 'NT4.0',
              '2000'      : 'NT 5.0',
              'XP'        : ['NT 5.1', 'NT 5.2'],
              'Vista'     : 'NT 6.0',
              '7'         : 'NT 6.1',
              '8'         : 'NT 6.2',
              '8.1'       : 'NT 6.3',
              '10'        : ['NT 6.4', 'NT 10.0'],
              'RT'        : 'ARM'
      };

      //////////////
      // Regex map
      /////////////

      var regexes = {

          browser : [[

              /\b(?:crmo|crios)\/([\w\.]+)/i                                      // Chrome for Android/iOS
              ], [VERSION, [NAME, 'Chrome']], [
              /edg(?:e|ios|a)?\/([\w\.]+)/i                                       // Microsoft Edge
              ], [VERSION, [NAME, 'Edge']], [

              // Presto based
              /(opera mini)\/([-\w\.]+)/i,                                        // Opera Mini
              /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i,                 // Opera Mobi/Tablet
              /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i                           // Opera
              ], [NAME, VERSION], [
              /opios[\/ ]+([\w\.]+)/i                                             // Opera mini on iphone >= 8.0
              ], [VERSION, [NAME, OPERA+' Mini']], [
              /\bopr\/([\w\.]+)/i                                                 // Opera Webkit
              ], [VERSION, [NAME, OPERA]], [

              // Mixed
              /\bb[ai]*d(?:uhd|[ub]*[aekoprswx]{5,6})[\/ ]?([\w\.]+)/i            // Baidu
              ], [VERSION, [NAME, 'Baidu']], [
              /(kindle)\/([\w\.]+)/i,                                             // Kindle
              /(lunascape|maxthon|netfront|jasmine|blazer)[\/ ]?([\w\.]*)/i,      // Lunascape/Maxthon/Netfront/Jasmine/Blazer
              // Trident based
              /(avant|iemobile|slim)\s?(?:browser)?[\/ ]?([\w\.]*)/i,             // Avant/IEMobile/SlimBrowser
              /(?:ms|\()(ie) ([\w\.]+)/i,                                         // Internet Explorer

              // Webkit/KHTML based                                               // Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium/PhantomJS/Bowser/QupZilla/Falkon
              /(flock|rockmelt|midori|epiphany|silk|skyfire|bolt|iron|vivaldi|iridium|phantomjs|bowser|quark|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|qq|duckduckgo)\/([-\w\.]+)/i,
                                                                                  // Rekonq/Puffin/Brave/Whale/QQBrowserLite/QQ, aka ShouQ
              /(heytap|ovi)browser\/([\d\.]+)/i,                                  // Heytap/Ovi
              /(weibo)__([\d\.]+)/i                                               // Weibo
              ], [NAME, VERSION], [
              /(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i                 // UCBrowser
              ], [VERSION, [NAME, 'UC'+BROWSER]], [
              /microm.+\bqbcore\/([\w\.]+)/i,                                     // WeChat Desktop for Windows Built-in Browser
              /\bqbcore\/([\w\.]+).+microm/i,
              /micromessenger\/([\w\.]+)/i                                        // WeChat
              ], [VERSION, [NAME, 'WeChat']], [
              /konqueror\/([\w\.]+)/i                                             // Konqueror
              ], [VERSION, [NAME, 'Konqueror']], [
              /trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i                       // IE11
              ], [VERSION, [NAME, 'IE']], [
              /ya(?:search)?browser\/([\w\.]+)/i                                  // Yandex
              ], [VERSION, [NAME, 'Yandex']], [
              /slbrowser\/([\w\.]+)/i                                             // Smart Lenovo Browser
              ], [VERSION, [NAME, 'Smart Lenovo '+BROWSER]], [
              /(avast|avg)\/([\w\.]+)/i                                           // Avast/AVG Secure Browser
              ], [[NAME, /(.+)/, '$1 Secure '+BROWSER], VERSION], [
              /\bfocus\/([\w\.]+)/i                                               // Firefox Focus
              ], [VERSION, [NAME, FIREFOX+' Focus']], [
              /\bopt\/([\w\.]+)/i                                                 // Opera Touch
              ], [VERSION, [NAME, OPERA+' Touch']], [
              /coc_coc\w+\/([\w\.]+)/i                                            // Coc Coc Browser
              ], [VERSION, [NAME, 'Coc Coc']], [
              /dolfin\/([\w\.]+)/i                                                // Dolphin
              ], [VERSION, [NAME, 'Dolphin']], [
              /coast\/([\w\.]+)/i                                                 // Opera Coast
              ], [VERSION, [NAME, OPERA+' Coast']], [
              /miuibrowser\/([\w\.]+)/i                                           // MIUI Browser
              ], [VERSION, [NAME, 'MIUI '+BROWSER]], [
              /fxios\/([-\w\.]+)/i                                                // Firefox for iOS
              ], [VERSION, [NAME, FIREFOX]], [
              /\bqihu|(qi?ho?o?|360)browser/i                                     // 360
              ], [[NAME, '360 ' + BROWSER]], [
              /(oculus|sailfish|huawei|vivo)browser\/([\w\.]+)/i
              ], [[NAME, /(.+)/, '$1 ' + BROWSER], VERSION], [                    // Oculus/Sailfish/HuaweiBrowser/VivoBrowser
              /samsungbrowser\/([\w\.]+)/i                                        // Samsung Internet
              ], [VERSION, [NAME, SAMSUNG + ' Internet']], [
              /(comodo_dragon)\/([\w\.]+)/i                                       // Comodo Dragon
              ], [[NAME, /_/g, ' '], VERSION], [
              /metasr[\/ ]?([\d\.]+)/i                                            // Sogou Explorer
              ], [VERSION, [NAME, 'Sogou Explorer']], [
              /(sogou)mo\w+\/([\d\.]+)/i                                          // Sogou Mobile
              ], [[NAME, 'Sogou Mobile'], VERSION], [
              /(electron)\/([\w\.]+) safari/i,                                    // Electron-based App
              /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i,                   // Tesla
              /m?(qqbrowser|2345Explorer)[\/ ]?([\w\.]+)/i                        // QQBrowser/2345 Browser
              ], [NAME, VERSION], [
              /(lbbrowser)/i,                                                     // LieBao Browser
              /\[(linkedin)app\]/i                                                // LinkedIn App for iOS & Android
              ], [NAME], [

              // WebView
              /((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i       // Facebook App for iOS & Android
              ], [[NAME, FACEBOOK], VERSION], [
              /(Klarna)\/([\w\.]+)/i,                                             // Klarna Shopping Browser for iOS & Android
              /(kakao(?:talk|story))[\/ ]([\w\.]+)/i,                             // Kakao App
              /(naver)\(.*?(\d+\.[\w\.]+).*\)/i,                                  // Naver InApp
              /safari (line)\/([\w\.]+)/i,                                        // Line App for iOS
              /\b(line)\/([\w\.]+)\/iab/i,                                        // Line App for Android
              /(alipay)client\/([\w\.]+)/i,                                       // Alipay
              /(chromium|instagram|snapchat)[\/ ]([-\w\.]+)/i                     // Chromium/Instagram/Snapchat
              ], [NAME, VERSION], [
              /\bgsa\/([\w\.]+) .*safari\//i                                      // Google Search Appliance on iOS
              ], [VERSION, [NAME, 'GSA']], [
              /musical_ly(?:.+app_?version\/|_)([\w\.]+)/i                        // TikTok
              ], [VERSION, [NAME, 'TikTok']], [

              /headlesschrome(?:\/([\w\.]+)| )/i                                  // Chrome Headless
              ], [VERSION, [NAME, CHROME+' Headless']], [

              / wv\).+(chrome)\/([\w\.]+)/i                                       // Chrome WebView
              ], [[NAME, CHROME+' WebView'], VERSION], [

              /droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i           // Android Browser
              ], [VERSION, [NAME, 'Android '+BROWSER]], [

              /(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i       // Chrome/OmniWeb/Arora/Tizen/Nokia
              ], [NAME, VERSION], [

              /version\/([\w\.\,]+) .*mobile\/\w+ (safari)/i                      // Mobile Safari
              ], [VERSION, [NAME, 'Mobile Safari']], [
              /version\/([\w(\.|\,)]+) .*(mobile ?safari|safari)/i                // Safari & Safari Mobile
              ], [VERSION, NAME], [
              /webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i                      // Safari < 3.0
              ], [NAME, [VERSION, strMapper, oldSafariMap]], [

              /(webkit|khtml)\/([\w\.]+)/i
              ], [NAME, VERSION], [

              // Gecko based
              /(navigator|netscape\d?)\/([-\w\.]+)/i                              // Netscape
              ], [[NAME, 'Netscape'], VERSION], [
              /mobile vr; rv:([\w\.]+)\).+firefox/i                               // Firefox Reality
              ], [VERSION, [NAME, FIREFOX+' Reality']], [
              /ekiohf.+(flow)\/([\w\.]+)/i,                                       // Flow
              /(swiftfox)/i,                                                      // Swiftfox
              /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror|klar)[\/ ]?([\w\.\+]+)/i,
                                                                                  // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror/Klar
              /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|palemoon|basilisk|waterfox)\/([-\w\.]+)$/i,
                                                                                  // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
              /(firefox)\/([\w\.]+)/i,                                            // Other Firefox-based
              /(mozilla)\/([\w\.]+) .+rv\:.+gecko\/\d+/i,                         // Mozilla

              // Other
              /(polaris|lynx|dillo|icab|doris|amaya|w3m|netsurf|sleipnir|obigo|mosaic|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i,
                                                                                  // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf/Sleipnir/Obigo/Mosaic/Go/ICE/UP.Browser
              /(links) \(([\w\.]+)/i,                                             // Links
              /panasonic;(viera)/i                                                // Panasonic Viera
              ], [NAME, VERSION], [
              
              /(cobalt)\/([\w\.]+)/i                                              // Cobalt
              ], [NAME, [VERSION, /master.|lts./, ""]]
          ],

          cpu : [[

              /(?:(amd|x(?:(?:86|64)[-_])?|wow|win)64)[;\)]/i                     // AMD64 (x64)
              ], [[ARCHITECTURE, 'amd64']], [

              /(ia32(?=;))/i                                                      // IA32 (quicktime)
              ], [[ARCHITECTURE, lowerize]], [

              /((?:i[346]|x)86)[;\)]/i                                            // IA32 (x86)
              ], [[ARCHITECTURE, 'ia32']], [

              /\b(aarch64|arm(v?8e?l?|_?64))\b/i                                 // ARM64
              ], [[ARCHITECTURE, 'arm64']], [

              /\b(arm(?:v[67])?ht?n?[fl]p?)\b/i                                   // ARMHF
              ], [[ARCHITECTURE, 'armhf']], [

              // PocketPC mistakenly identified as PowerPC
              /windows (ce|mobile); ppc;/i
              ], [[ARCHITECTURE, 'arm']], [

              /((?:ppc|powerpc)(?:64)?)(?: mac|;|\))/i                            // PowerPC
              ], [[ARCHITECTURE, /ower/, EMPTY, lowerize]], [

              /(sun4\w)[;\)]/i                                                    // SPARC
              ], [[ARCHITECTURE, 'sparc']], [

              /((?:avr32|ia64(?=;))|68k(?=\))|\barm(?=v(?:[1-7]|[5-7]1)l?|;|eabi)|(?=atmel )avr|(?:irix|mips|sparc)(?:64)?\b|pa-risc)/i
                                                                                  // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
              ], [[ARCHITECTURE, lowerize]]
          ],

          device : [[

              //////////////////////////
              // MOBILES & TABLETS
              /////////////////////////

              // Samsung
              /\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i
              ], [MODEL, [VENDOR, SAMSUNG], [TYPE, TABLET]], [
              /\b((?:s[cgp]h|gt|sm)-\w+|sc[g-]?[\d]+a?|galaxy nexus)/i,
              /samsung[- ]([-\w]+)/i,
              /sec-(sgh\w+)/i
              ], [MODEL, [VENDOR, SAMSUNG], [TYPE, MOBILE]], [

              // Apple
              /(?:\/|\()(ip(?:hone|od)[\w, ]*)(?:\/|;)/i                          // iPod/iPhone
              ], [MODEL, [VENDOR, APPLE], [TYPE, MOBILE]], [
              /\((ipad);[-\w\),; ]+apple/i,                                       // iPad
              /applecoremedia\/[\w\.]+ \((ipad)/i,
              /\b(ipad)\d\d?,\d\d?[;\]].+ios/i
              ], [MODEL, [VENDOR, APPLE], [TYPE, TABLET]], [
              /(macintosh);/i
              ], [MODEL, [VENDOR, APPLE]], [

              // Sharp
              /\b(sh-?[altvz]?\d\d[a-ekm]?)/i
              ], [MODEL, [VENDOR, SHARP], [TYPE, MOBILE]], [

              // Huawei
              /\b((?:ag[rs][23]?|bah2?|sht?|btv)-a?[lw]\d{2})\b(?!.+d\/s)/i
              ], [MODEL, [VENDOR, HUAWEI], [TYPE, TABLET]], [
              /(?:huawei|honor)([-\w ]+)[;\)]/i,
              /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][012359c][adn]?)\b(?!.+d\/s)/i
              ], [MODEL, [VENDOR, HUAWEI], [TYPE, MOBILE]], [

              // Xiaomi
              /\b(poco[\w ]+|m2\d{3}j\d\d[a-z]{2})(?: bui|\))/i,                  // Xiaomi POCO
              /\b; (\w+) build\/hm\1/i,                                           // Xiaomi Hongmi 'numeric' models
              /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i,                             // Xiaomi Hongmi
              /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i,                   // Xiaomi Redmi
              /oid[^\)]+; (m?[12][0-389][01]\w{3,6}[c-y])( bui|; wv|\))/i,        // Xiaomi Redmi 'numeric' models
              /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note lte|max|cc)?[_ ]?(?:\d?\w?)[_ ]?(?:plus|se|lite)?)(?: bui|\))/i // Xiaomi Mi
              ], [[MODEL, /_/g, ' '], [VENDOR, XIAOMI], [TYPE, MOBILE]], [
              /oid[^\)]+; (2\d{4}(283|rpbf)[cgl])( bui|\))/i,                     // Redmi Pad
              /\b(mi[-_ ]?(?:pad)(?:[\w_ ]+))(?: bui|\))/i                        // Mi Pad tablets
              ],[[MODEL, /_/g, ' '], [VENDOR, XIAOMI], [TYPE, TABLET]], [

              // OPPO
              /; (\w+) bui.+ oppo/i,
              /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i
              ], [MODEL, [VENDOR, 'OPPO'], [TYPE, MOBILE]], [

              // Vivo
              /vivo (\w+)(?: bui|\))/i,
              /\b(v[12]\d{3}\w?[at])(?: bui|;)/i
              ], [MODEL, [VENDOR, 'Vivo'], [TYPE, MOBILE]], [

              // Realme
              /\b(rmx[1-3]\d{3})(?: bui|;|\))/i
              ], [MODEL, [VENDOR, 'Realme'], [TYPE, MOBILE]], [

              // Motorola
              /\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i,
              /\bmot(?:orola)?[- ](\w*)/i,
              /((?:moto[\w\(\) ]+|xt\d{3,4}|nexus 6)(?= bui|\)))/i
              ], [MODEL, [VENDOR, MOTOROLA], [TYPE, MOBILE]], [
              /\b(mz60\d|xoom[2 ]{0,2}) build\//i
              ], [MODEL, [VENDOR, MOTOROLA], [TYPE, TABLET]], [

              // LG
              /((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i
              ], [MODEL, [VENDOR, LG], [TYPE, TABLET]], [
              /(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i,
              /\blg[-e;\/ ]+((?!browser|netcast|android tv)\w+)/i,
              /\blg-?([\d\w]+) bui/i
              ], [MODEL, [VENDOR, LG], [TYPE, MOBILE]], [

              // Lenovo
              /(ideatab[-\w ]+)/i,
              /lenovo ?(s[56]000[-\w]+|tab(?:[\w ]+)|yt[-\d\w]{6}|tb[-\d\w]{6})/i
              ], [MODEL, [VENDOR, 'Lenovo'], [TYPE, TABLET]], [

              // Nokia
              /(?:maemo|nokia).*(n900|lumia \d+)/i,
              /nokia[-_ ]?([-\w\.]*)/i
              ], [[MODEL, /_/g, ' '], [VENDOR, 'Nokia'], [TYPE, MOBILE]], [

              // Google
              /(pixel c)\b/i                                                      // Google Pixel C
              ], [MODEL, [VENDOR, GOOGLE], [TYPE, TABLET]], [
              /droid.+; (pixel[\daxl ]{0,6})(?: bui|\))/i                         // Google Pixel
              ], [MODEL, [VENDOR, GOOGLE], [TYPE, MOBILE]], [

              // Sony
              /droid.+ (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-a\w[4-7][12])(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i
              ], [MODEL, [VENDOR, SONY], [TYPE, MOBILE]], [
              /sony tablet [ps]/i,
              /\b(?:sony)?sgp\w+(?: bui|\))/i
              ], [[MODEL, 'Xperia Tablet'], [VENDOR, SONY], [TYPE, TABLET]], [

              // OnePlus
              / (kb2005|in20[12]5|be20[12][59])\b/i,
              /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i
              ], [MODEL, [VENDOR, 'OnePlus'], [TYPE, MOBILE]], [

              // Amazon
              /(alexa)webm/i,
              /(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i,                             // Kindle Fire without Silk / Echo Show
              /(kf[a-z]+)( bui|\)).+silk\//i                                      // Kindle Fire HD
              ], [MODEL, [VENDOR, AMAZON], [TYPE, TABLET]], [
              /((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i                     // Fire Phone
              ], [[MODEL, /(.+)/g, 'Fire Phone $1'], [VENDOR, AMAZON], [TYPE, MOBILE]], [

              // BlackBerry
              /(playbook);[-\w\),; ]+(rim)/i                                      // BlackBerry PlayBook
              ], [MODEL, VENDOR, [TYPE, TABLET]], [
              /\b((?:bb[a-f]|st[hv])100-\d)/i,
              /\(bb10; (\w+)/i                                                    // BlackBerry 10
              ], [MODEL, [VENDOR, BLACKBERRY], [TYPE, MOBILE]], [

              // Asus
              /(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i
              ], [MODEL, [VENDOR, ASUS], [TYPE, TABLET]], [
              / (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i
              ], [MODEL, [VENDOR, ASUS], [TYPE, MOBILE]], [

              // HTC
              /(nexus 9)/i                                                        // HTC Nexus 9
              ], [MODEL, [VENDOR, 'HTC'], [TYPE, TABLET]], [
              /(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i,                         // HTC

              // ZTE
              /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i,
              /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i         // Alcatel/GeeksPhone/Nexian/Panasonic/Sony
              ], [VENDOR, [MODEL, /_/g, ' '], [TYPE, MOBILE]], [

              // Acer
              /droid.+; ([ab][1-7]-?[0178a]\d\d?)/i
              ], [MODEL, [VENDOR, 'Acer'], [TYPE, TABLET]], [

              // Meizu
              /droid.+; (m[1-5] note) bui/i,
              /\bmz-([-\w]{2,})/i
              ], [MODEL, [VENDOR, 'Meizu'], [TYPE, MOBILE]], [
                  
              // Ulefone
              /; ((?:power )?armor(?:[\w ]{0,8}))(?: bui|\))/i
              ], [MODEL, [VENDOR, 'Ulefone'], [TYPE, MOBILE]], [

              // MIXED
              /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus|dell|meizu|motorola|polytron|infinix|tecno)[-_ ]?([-\w]*)/i,
                                                                                  // BlackBerry/BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Meizu/Motorola/Polytron
              /(hp) ([\w ]+\w)/i,                                                 // HP iPAQ
              /(asus)-?(\w+)/i,                                                   // Asus
              /(microsoft); (lumia[\w ]+)/i,                                      // Microsoft Lumia
              /(lenovo)[-_ ]?([-\w]+)/i,                                          // Lenovo
              /(jolla)/i,                                                         // Jolla
              /(oppo) ?([\w ]+) bui/i                                             // OPPO
              ], [VENDOR, MODEL, [TYPE, MOBILE]], [

              /(kobo)\s(ereader|touch)/i,                                         // Kobo
              /(archos) (gamepad2?)/i,                                            // Archos
              /(hp).+(touchpad(?!.+tablet)|tablet)/i,                             // HP TouchPad
              /(kindle)\/([\w\.]+)/i,                                             // Kindle
              /(nook)[\w ]+build\/(\w+)/i,                                        // Nook
              /(dell) (strea[kpr\d ]*[\dko])/i,                                   // Dell Streak
              /(le[- ]+pan)[- ]+(\w{1,9}) bui/i,                                  // Le Pan Tablets
              /(trinity)[- ]*(t\d{3}) bui/i,                                      // Trinity Tablets
              /(gigaset)[- ]+(q\w{1,9}) bui/i,                                    // Gigaset Tablets
              /(vodafone) ([\w ]+)(?:\)| bui)/i                                   // Vodafone
              ], [VENDOR, MODEL, [TYPE, TABLET]], [

              /(surface duo)/i                                                    // Surface Duo
              ], [MODEL, [VENDOR, MICROSOFT], [TYPE, TABLET]], [
              /droid [\d\.]+; (fp\du?)(?: b|\))/i                                 // Fairphone
              ], [MODEL, [VENDOR, 'Fairphone'], [TYPE, MOBILE]], [
              /(u304aa)/i                                                         // AT&T
              ], [MODEL, [VENDOR, 'AT&T'], [TYPE, MOBILE]], [
              /\bsie-(\w*)/i                                                      // Siemens
              ], [MODEL, [VENDOR, 'Siemens'], [TYPE, MOBILE]], [
              /\b(rct\w+) b/i                                                     // RCA Tablets
              ], [MODEL, [VENDOR, 'RCA'], [TYPE, TABLET]], [
              /\b(venue[\d ]{2,7}) b/i                                            // Dell Venue Tablets
              ], [MODEL, [VENDOR, 'Dell'], [TYPE, TABLET]], [
              /\b(q(?:mv|ta)\w+) b/i                                              // Verizon Tablet
              ], [MODEL, [VENDOR, 'Verizon'], [TYPE, TABLET]], [
              /\b(?:barnes[& ]+noble |bn[rt])([\w\+ ]*) b/i                       // Barnes & Noble Tablet
              ], [MODEL, [VENDOR, 'Barnes & Noble'], [TYPE, TABLET]], [
              /\b(tm\d{3}\w+) b/i
              ], [MODEL, [VENDOR, 'NuVision'], [TYPE, TABLET]], [
              /\b(k88) b/i                                                        // ZTE K Series Tablet
              ], [MODEL, [VENDOR, 'ZTE'], [TYPE, TABLET]], [
              /\b(nx\d{3}j) b/i                                                   // ZTE Nubia
              ], [MODEL, [VENDOR, 'ZTE'], [TYPE, MOBILE]], [
              /\b(gen\d{3}) b.+49h/i                                              // Swiss GEN Mobile
              ], [MODEL, [VENDOR, 'Swiss'], [TYPE, MOBILE]], [
              /\b(zur\d{3}) b/i                                                   // Swiss ZUR Tablet
              ], [MODEL, [VENDOR, 'Swiss'], [TYPE, TABLET]], [
              /\b((zeki)?tb.*\b) b/i                                              // Zeki Tablets
              ], [MODEL, [VENDOR, 'Zeki'], [TYPE, TABLET]], [
              /\b([yr]\d{2}) b/i,
              /\b(dragon[- ]+touch |dt)(\w{5}) b/i                                // Dragon Touch Tablet
              ], [[VENDOR, 'Dragon Touch'], MODEL, [TYPE, TABLET]], [
              /\b(ns-?\w{0,9}) b/i                                                // Insignia Tablets
              ], [MODEL, [VENDOR, 'Insignia'], [TYPE, TABLET]], [
              /\b((nxa|next)-?\w{0,9}) b/i                                        // NextBook Tablets
              ], [MODEL, [VENDOR, 'NextBook'], [TYPE, TABLET]], [
              /\b(xtreme\_)?(v(1[045]|2[015]|[3469]0|7[05])) b/i                  // Voice Xtreme Phones
              ], [[VENDOR, 'Voice'], MODEL, [TYPE, MOBILE]], [
              /\b(lvtel\-)?(v1[12]) b/i                                           // LvTel Phones
              ], [[VENDOR, 'LvTel'], MODEL, [TYPE, MOBILE]], [
              /\b(ph-1) /i                                                        // Essential PH-1
              ], [MODEL, [VENDOR, 'Essential'], [TYPE, MOBILE]], [
              /\b(v(100md|700na|7011|917g).*\b) b/i                               // Envizen Tablets
              ], [MODEL, [VENDOR, 'Envizen'], [TYPE, TABLET]], [
              /\b(trio[-\w\. ]+) b/i                                              // MachSpeed Tablets
              ], [MODEL, [VENDOR, 'MachSpeed'], [TYPE, TABLET]], [
              /\btu_(1491) b/i                                                    // Rotor Tablets
              ], [MODEL, [VENDOR, 'Rotor'], [TYPE, TABLET]], [
              /(shield[\w ]+) b/i                                                 // Nvidia Shield Tablets
              ], [MODEL, [VENDOR, 'Nvidia'], [TYPE, TABLET]], [
              /(sprint) (\w+)/i                                                   // Sprint Phones
              ], [VENDOR, MODEL, [TYPE, MOBILE]], [
              /(kin\.[onetw]{3})/i                                                // Microsoft Kin
              ], [[MODEL, /\./g, ' '], [VENDOR, MICROSOFT], [TYPE, MOBILE]], [
              /droid.+; (cc6666?|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i             // Zebra
              ], [MODEL, [VENDOR, ZEBRA], [TYPE, TABLET]], [
              /droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i
              ], [MODEL, [VENDOR, ZEBRA], [TYPE, MOBILE]], [

              ///////////////////
              // SMARTTVS
              ///////////////////

              /smart-tv.+(samsung)/i                                              // Samsung
              ], [VENDOR, [TYPE, SMARTTV]], [
              /hbbtv.+maple;(\d+)/i
              ], [[MODEL, /^/, 'SmartTV'], [VENDOR, SAMSUNG], [TYPE, SMARTTV]], [
              /(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i        // LG SmartTV
              ], [[VENDOR, LG], [TYPE, SMARTTV]], [
              /(apple) ?tv/i                                                      // Apple TV
              ], [VENDOR, [MODEL, APPLE+' TV'], [TYPE, SMARTTV]], [
              /crkey/i                                                            // Google Chromecast
              ], [[MODEL, CHROME+'cast'], [VENDOR, GOOGLE], [TYPE, SMARTTV]], [
              /droid.+aft(\w+)( bui|\))/i                                         // Fire TV
              ], [MODEL, [VENDOR, AMAZON], [TYPE, SMARTTV]], [
              /\(dtv[\);].+(aquos)/i,
              /(aquos-tv[\w ]+)\)/i                                               // Sharp
              ], [MODEL, [VENDOR, SHARP], [TYPE, SMARTTV]],[
              /(bravia[\w ]+)( bui|\))/i                                              // Sony
              ], [MODEL, [VENDOR, SONY], [TYPE, SMARTTV]], [
              /(mitv-\w{5}) bui/i                                                 // Xiaomi
              ], [MODEL, [VENDOR, XIAOMI], [TYPE, SMARTTV]], [
              /Hbbtv.*(technisat) (.*);/i                                         // TechniSAT
              ], [VENDOR, MODEL, [TYPE, SMARTTV]], [
              /\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i,                          // Roku
              /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i         // HbbTV devices
              ], [[VENDOR, trim], [MODEL, trim], [TYPE, SMARTTV]], [
              /\b(android tv|smart[- ]?tv|opera tv|tv; rv:)\b/i                   // SmartTV from Unidentified Vendors
              ], [[TYPE, SMARTTV]], [

              ///////////////////
              // CONSOLES
              ///////////////////

              /(ouya)/i,                                                          // Ouya
              /(nintendo) ([wids3utch]+)/i                                        // Nintendo
              ], [VENDOR, MODEL, [TYPE, CONSOLE]], [
              /droid.+; (shield) bui/i                                            // Nvidia
              ], [MODEL, [VENDOR, 'Nvidia'], [TYPE, CONSOLE]], [
              /(playstation [345portablevi]+)/i                                   // Playstation
              ], [MODEL, [VENDOR, SONY], [TYPE, CONSOLE]], [
              /\b(xbox(?: one)?(?!; xbox))[\); ]/i                                // Microsoft Xbox
              ], [MODEL, [VENDOR, MICROSOFT], [TYPE, CONSOLE]], [

              ///////////////////
              // WEARABLES
              ///////////////////

              /((pebble))app/i                                                    // Pebble
              ], [VENDOR, MODEL, [TYPE, WEARABLE]], [
              /(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i                              // Apple Watch
              ], [MODEL, [VENDOR, APPLE], [TYPE, WEARABLE]], [
              /droid.+; (glass) \d/i                                              // Google Glass
              ], [MODEL, [VENDOR, GOOGLE], [TYPE, WEARABLE]], [
              /droid.+; (wt63?0{2,3})\)/i
              ], [MODEL, [VENDOR, ZEBRA], [TYPE, WEARABLE]], [
              /(quest( 2| pro)?)/i                                                // Oculus Quest
              ], [MODEL, [VENDOR, FACEBOOK], [TYPE, WEARABLE]], [

              ///////////////////
              // EMBEDDED
              ///////////////////

              /(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i                              // Tesla
              ], [VENDOR, [TYPE, EMBEDDED]], [
              /(aeobc)\b/i                                                        // Echo Dot
              ], [MODEL, [VENDOR, AMAZON], [TYPE, EMBEDDED]], [

              ////////////////////
              // MIXED (GENERIC)
              ///////////////////

              /droid .+?; ([^;]+?)(?: bui|; wv\)|\) applew).+? mobile safari/i    // Android Phones from Unidentified Vendors
              ], [MODEL, [TYPE, MOBILE]], [
              /droid .+?; ([^;]+?)(?: bui|\) applew).+?(?! mobile) safari/i       // Android Tablets from Unidentified Vendors
              ], [MODEL, [TYPE, TABLET]], [
              /\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i                      // Unidentifiable Tablet
              ], [[TYPE, TABLET]], [
              /(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i    // Unidentifiable Mobile
              ], [[TYPE, MOBILE]], [
              /(android[-\w\. ]{0,9});.+buil/i                                    // Generic Android Device
              ], [MODEL, [VENDOR, 'Generic']]
          ],

          engine : [[

              /windows.+ edge\/([\w\.]+)/i                                       // EdgeHTML
              ], [VERSION, [NAME, EDGE+'HTML']], [

              /webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i                         // Blink
              ], [VERSION, [NAME, 'Blink']], [

              /(presto)\/([\w\.]+)/i,                                             // Presto
              /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna)\/([\w\.]+)/i, // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m/Goanna
              /ekioh(flow)\/([\w\.]+)/i,                                          // Flow
              /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i,                           // KHTML/Tasman/Links
              /(icab)[\/ ]([23]\.[\d\.]+)/i,                                      // iCab
              /\b(libweb)/i
              ], [NAME, VERSION], [

              /rv\:([\w\.]{1,9})\b.+(gecko)/i                                     // Gecko
              ], [VERSION, NAME]
          ],

          os : [[

              // Windows
              /microsoft (windows) (vista|xp)/i                                   // Windows (iTunes)
              ], [NAME, VERSION], [
              /(windows (?:phone(?: os)?|mobile))[\/ ]?([\d\.\w ]*)/i             // Windows Phone
              ], [NAME, [VERSION, strMapper, windowsVersionMap]], [
              /windows nt 6\.2; (arm)/i,                                        // Windows RT
              /windows[\/ ]?([ntce\d\. ]+\w)(?!.+xbox)/i,
              /(?:win(?=3|9|n)|win 9x )([nt\d\.]+)/i
              ], [[VERSION, strMapper, windowsVersionMap], [NAME, 'Windows']], [

              // iOS/macOS
              /ip[honead]{2,4}\b(?:.*os ([\w]+) like mac|; opera)/i,              // iOS
              /(?:ios;fbsv\/|iphone.+ios[\/ ])([\d\.]+)/i,
              /cfnetwork\/.+darwin/i
              ], [[VERSION, /_/g, '.'], [NAME, 'iOS']], [
              /(mac os x) ?([\w\. ]*)/i,
              /(macintosh|mac_powerpc\b)(?!.+haiku)/i                             // Mac OS
              ], [[NAME, MAC_OS], [VERSION, /_/g, '.']], [

              // Mobile OSes
              /droid ([\w\.]+)\b.+(android[- ]x86|harmonyos)/i                    // Android-x86/HarmonyOS
              ], [VERSION, NAME], [                                               // Android/WebOS/QNX/Bada/RIM/Maemo/MeeGo/Sailfish OS
              /(android|webos|qnx|bada|rim tablet os|maemo|meego|sailfish)[-\/ ]?([\w\.]*)/i,
              /(blackberry)\w*\/([\w\.]*)/i,                                      // Blackberry
              /(tizen|kaios)[\/ ]([\w\.]+)/i,                                     // Tizen/KaiOS
              /\((series40);/i                                                    // Series 40
              ], [NAME, VERSION], [
              /\(bb(10);/i                                                        // BlackBerry 10
              ], [VERSION, [NAME, BLACKBERRY]], [
              /(?:symbian ?os|symbos|s60(?=;)|series60)[-\/ ]?([\w\.]*)/i         // Symbian
              ], [VERSION, [NAME, 'Symbian']], [
              /mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i // Firefox OS
              ], [VERSION, [NAME, FIREFOX+' OS']], [
              /web0s;.+rt(tv)/i,
              /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i                              // WebOS
              ], [VERSION, [NAME, 'webOS']], [
              /watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i                              // watchOS
              ], [VERSION, [NAME, 'watchOS']], [

              // Google Chromecast
              /crkey\/([\d\.]+)/i                                                 // Google Chromecast
              ], [VERSION, [NAME, CHROME+'cast']], [
              /(cros) [\w]+(?:\)| ([\w\.]+)\b)/i                                  // Chromium OS
              ], [[NAME, CHROMIUM_OS], VERSION],[

              // Smart TVs
              /panasonic;(viera)/i,                                               // Panasonic Viera
              /(netrange)mmh/i,                                                   // Netrange
              /(nettv)\/(\d+\.[\w\.]+)/i,                                         // NetTV

              // Console
              /(nintendo|playstation) ([wids345portablevuch]+)/i,                 // Nintendo/Playstation
              /(xbox); +xbox ([^\);]+)/i,                                         // Microsoft Xbox (360, One, X, S, Series X, Series S)

              // Other
              /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i,                            // Joli/Palm
              /(mint)[\/\(\) ]?(\w*)/i,                                           // Mint
              /(mageia|vectorlinux)[; ]/i,                                        // Mageia/VectorLinux
              /([kxln]?ubuntu|debian|suse|opensuse|gentoo|arch(?= linux)|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire)(?: gnu\/linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i,
                                                                                  // Ubuntu/Debian/SUSE/Gentoo/Arch/Slackware/Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus/Raspbian/Plan9/Minix/RISCOS/Contiki/Deepin/Manjaro/elementary/Sabayon/Linspire
              /(hurd|linux) ?([\w\.]*)/i,                                         // Hurd/Linux
              /(gnu) ?([\w\.]*)/i,                                                // GNU
              /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i, // FreeBSD/NetBSD/OpenBSD/PC-BSD/GhostBSD/DragonFly
              /(haiku) (\w+)/i                                                    // Haiku
              ], [NAME, VERSION], [
              /(sunos) ?([\w\.\d]*)/i                                             // Solaris
              ], [[NAME, 'Solaris'], VERSION], [
              /((?:open)?solaris)[-\/ ]?([\w\.]*)/i,                              // Solaris
              /(aix) ((\d)(?=\.|\)| )[\w\.])*/i,                                  // AIX
              /\b(beos|os\/2|amigaos|morphos|openvms|fuchsia|hp-ux|serenityos)/i, // BeOS/OS2/AmigaOS/MorphOS/OpenVMS/Fuchsia/HP-UX/SerenityOS
              /(unix) ?([\w\.]*)/i                                                // UNIX
              ], [NAME, VERSION]
          ]
      };

      /////////////////
      // Constructor
      ////////////////

      var UAParser = function (ua, extensions) {

          if (typeof ua === OBJ_TYPE) {
              extensions = ua;
              ua = undefined$1;
          }

          if (!(this instanceof UAParser)) {
              return new UAParser(ua, extensions).getResult();
          }

          var _navigator = (typeof window !== UNDEF_TYPE && window.navigator) ? window.navigator : undefined$1;
          var _ua = ua || ((_navigator && _navigator.userAgent) ? _navigator.userAgent : EMPTY);
          var _uach = (_navigator && _navigator.userAgentData) ? _navigator.userAgentData : undefined$1;
          var _rgxmap = extensions ? extend(regexes, extensions) : regexes;
          var _isSelfNav = _navigator && _navigator.userAgent == _ua;

          this.getBrowser = function () {
              var _browser = {};
              _browser[NAME] = undefined$1;
              _browser[VERSION] = undefined$1;
              rgxMapper.call(_browser, _ua, _rgxmap.browser);
              _browser[MAJOR] = majorize(_browser[VERSION]);
              // Brave-specific detection
              if (_isSelfNav && _navigator && _navigator.brave && typeof _navigator.brave.isBrave == FUNC_TYPE) {
                  _browser[NAME] = 'Brave';
              }
              return _browser;
          };
          this.getCPU = function () {
              var _cpu = {};
              _cpu[ARCHITECTURE] = undefined$1;
              rgxMapper.call(_cpu, _ua, _rgxmap.cpu);
              return _cpu;
          };
          this.getDevice = function () {
              var _device = {};
              _device[VENDOR] = undefined$1;
              _device[MODEL] = undefined$1;
              _device[TYPE] = undefined$1;
              rgxMapper.call(_device, _ua, _rgxmap.device);
              if (_isSelfNav && !_device[TYPE] && _uach && _uach.mobile) {
                  _device[TYPE] = MOBILE;
              }
              // iPadOS-specific detection: identified as Mac, but has some iOS-only properties
              if (_isSelfNav && _device[MODEL] == 'Macintosh' && _navigator && typeof _navigator.standalone !== UNDEF_TYPE && _navigator.maxTouchPoints && _navigator.maxTouchPoints > 2) {
                  _device[MODEL] = 'iPad';
                  _device[TYPE] = TABLET;
              }
              return _device;
          };
          this.getEngine = function () {
              var _engine = {};
              _engine[NAME] = undefined$1;
              _engine[VERSION] = undefined$1;
              rgxMapper.call(_engine, _ua, _rgxmap.engine);
              return _engine;
          };
          this.getOS = function () {
              var _os = {};
              _os[NAME] = undefined$1;
              _os[VERSION] = undefined$1;
              rgxMapper.call(_os, _ua, _rgxmap.os);
              if (_isSelfNav && !_os[NAME] && _uach && _uach.platform != 'Unknown') {
                  _os[NAME] = _uach.platform  
                                      .replace(/chrome os/i, CHROMIUM_OS)
                                      .replace(/macos/i, MAC_OS);           // backward compatibility
              }
              return _os;
          };
          this.getResult = function () {
              return {
                  ua      : this.getUA(),
                  browser : this.getBrowser(),
                  engine  : this.getEngine(),
                  os      : this.getOS(),
                  device  : this.getDevice(),
                  cpu     : this.getCPU()
              };
          };
          this.getUA = function () {
              return _ua;
          };
          this.setUA = function (ua) {
              _ua = (typeof ua === STR_TYPE && ua.length > UA_MAX_LENGTH) ? trim(ua, UA_MAX_LENGTH) : ua;
              return this;
          };
          this.setUA(_ua);
          return this;
      };

      UAParser.VERSION = LIBVERSION;
      UAParser.BROWSER =  enumerize([NAME, VERSION, MAJOR]);
      UAParser.CPU = enumerize([ARCHITECTURE]);
      UAParser.DEVICE = enumerize([MODEL, VENDOR, TYPE, CONSOLE, MOBILE, SMARTTV, TABLET, WEARABLE, EMBEDDED]);
      UAParser.ENGINE = UAParser.OS = enumerize([NAME, VERSION]);

      ///////////
      // Export
      //////////

      // check js environment
      {
          // nodejs env
          if ( module.exports) {
              exports = module.exports = UAParser;
          }
          exports.UAParser = UAParser;
      }

      // jQuery/Zepto specific (optional)
      // Note:
      //   In AMD env the global scope should be kept clean, but jQuery is an exception.
      //   jQuery always exports to global scope, unless jQuery.noConflict(true) is used,
      //   and we should catch that.
      var $ = typeof window !== UNDEF_TYPE && (window.jQuery || window.Zepto);
      if ($ && !$.ua) {
          var parser = new UAParser();
          $.ua = parser.getResult();
          $.ua.get = function () {
              return parser.getUA();
          };
          $.ua.set = function (ua) {
              parser.setUA(ua);
              var result = parser.getResult();
              for (var prop in result) {
                  $.ua[prop] = result[prop];
              }
          };
      }

  })(typeof window === 'object' ? window : commonjsGlobal);
  });
  var uaParser_1 = uaParser.UAParser;

  const translate$2 = (value, labels, object) => get_1(labels, value, value).replace(/{.*?}/g, value => {
    const valueWithoutBracelets = value.replace(/{/g, '').replace(/}/g, '');
    return get_1(object, valueWithoutBracelets, valueWithoutBracelets);
  });
  const getDayAttributes = (day, modifiers) => {
    const isPast = dayjs_min(day).isBefore(dayjs_min(), 'day');
    if (isPast) {
      return {
        isPast,
        isCheckIn: false,
        isCheckOut: false
      };
    }
    const checkInDate = get_1(modifiers, 'start');
    const isCheckIn = checkInDate ? dayjs_min(checkInDate).isSame(dayjs_min(day), 'day') : false;
    if (isCheckIn) {
      return {
        isPast: false,
        isCheckIn,
        isCheckOut: false
      };
    }
    const checkOutDate = get_1(modifiers, 'end');
    const isCheckOut = checkOutDate ? dayjs_min(checkOutDate).isSame(dayjs_min(day), 'day') : false;
    return {
      isPast: false,
      isCheckIn: false,
      isCheckOut
    };
  };
  function formatDay(day, response, locale, modifiers, t, hidePrices) {
    const dayData = get_1(response, `prices[${dayjs_min(day).format('YYYY-MM-DD')}]`);
    const priceData = get_1(dayData, `Price`);
    const dateOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    const {
      isPast,
      isCheckIn,
      isCheckOut
    } = getDayAttributes(day, modifiers);
    let result = new Intl.DateTimeFormat(locale, dateOptions).format(day);
    if (isPast) {
      return appendNavigationInstructions(`${t('shs-widgets--generic.restriction.PastDate')}, ${result}`, t);
    }
    if (isCheckIn) {
      result = `${t('shs-widgets--calendar.checkIn')}, ${result}`;
    }
    if (isCheckOut) {
      result = `${t('shs-widgets--calendar.checkOut')}, ${result}`;
    }
    if (dayData && !dayData.Available) {
      return appendNavigationInstructions(`${result} - ${t('shs-widgets--generic.restriction.Closed')}`, t);
    }
    if (!isEmpty_1(priceData) && !hidePrices) {
      const priceText = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: priceData.CurrencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        currencyDisplay: 'code'
      }).format(priceData.Value);
      return appendNavigationInstructions(`${result} - ${priceText}`, t);
    }
    return appendNavigationInstructions(result, t);
  }

  /**
   * Appends <i>Use arrow keys to navigate the dates</i> to a stringified date and
   * room price.
   *
   * @param text first part of the output
   * @param t translate function
   * @returns {string} combined output
   */
  function appendNavigationInstructions(text, t) {
    return `${text}. ${t('shs-widgets--calendar.useArrowKeys')}.`;
  }
  function getWarning(response) {
    return get_1(response, 'ApplicationResults.Warning[0].SystemSpecificResults.ShortText');
  }
  function selectedRestriction(state, restrictions) {
    const lengthOfStay = dayjs_min(state.to).diff(state.from, 'day');
    const noCheckInRestriction = state.restrictions.find(restriction => restriction.day === dayjs_min(state.from).format('YYYY-MM-DD') && restriction.LeastRestrictiveFailure.Cause === 'NoArrive');
    const noCheckOutRestriction = state.restrictions.find(restriction => restriction.day === dayjs_min(state.to).format('YYYY-MM-DD') && restriction.LeastRestrictiveFailure.Cause === 'NoDeparture');
    if (restrictions['Closed'] || restrictions['SeasonalClosure'] || restrictions['NoAvailableInventory'] || restrictions['BelowHurdlePrice'] || restrictions['ZeroFinalPrice'] || restrictions['Limit'] || restrictions['LeadDaysTime'] || restrictions['BelowHurdlePrice'] || restrictions['MaxAdultOccupancyExceeded'] || restrictions['MaxOccupancyExceeded'] || restrictions['MinAdultOccupancyNotMet'] || restrictions['MaxChildOccupancyExceeded'] || restrictions['MinChildOccupancyNotMet'] || restrictions['NoBaseSeasonForDerived'] || restrictions['NoPriceOnBaseRateForDerived']) {
      return {
        cause: 'NoAvailableInventory'
      };
    }
    if (restrictions['NoSellDay']) {
      return {
        cause: 'NoSellDay'
      };
    }
    if (restrictions['MinStayArrive'] || restrictions['MinStayThrough']) {
      let currentRestriction = restrictions['MinStayArrive'] || restrictions['MinStayThrough'];
      if (lengthOfStay < Number(currentRestriction.AdditionalInformation)) {
        return {
          cause: restrictions['MinStayThrough'] ? 'MinStayThrough' : 'MinStayArrive',
          additionalInformation: currentRestriction.AdditionalInformation
        };
      }
    }
    if (restrictions['MaxStayArrive'] || restrictions['MaxStayThrough']) {
      let currentRestriction = restrictions['MaxStayArrive'] || restrictions['MaxStayThrough'];
      if (lengthOfStay > Number(currentRestriction.AdditionalInformation)) {
        return {
          cause: restrictions['MaxStayThrough'] ? 'MaxStayThrough' : 'MaxStayArrive',
          additionalInformation: currentRestriction.AdditionalInformation
        };
      }
    }
    if (noCheckInRestriction || restrictions['MaxLeadDays']) {
      return {
        cause: 'NoArrive'
      };
    }
    if (noCheckOutRestriction) {
      return {
        cause: 'NoDeparture'
      };
    }
    return null;
  }
  function shouldReplaceRestriction(currentRestriction, newRestriction) {
    if (currentRestriction.LeastRestrictiveFailure.Cause === 'MinStayArrive' || currentRestriction.LeastRestrictiveFailure.Cause === 'MinStayThrough') {
      return Number(currentRestriction.LeastRestrictiveFailure.AdditionalInformation) < Number(newRestriction.LeastRestrictiveFailure.AdditionalInformation);
    }
    if (currentRestriction.LeastRestrictiveFailure.Cause === 'MaxStayArrive' || currentRestriction.LeastRestrictiveFailure.Cause === 'MaxStayThrough') {
      return Number(currentRestriction.LeastRestrictiveFailure.AdditionalInformation) > Number(newRestriction.LeastRestrictiveFailure.AdditionalInformation);
    }
    return false;
  }
  function parseRestrictions(restrictions, to) {
    return restrictions.reduce((results, restriction) => {
      if (restriction.LeastRestrictiveFailure.Cause !== 'NoDeparture' && restriction.day === dayjs_min(to).format('YYYY-MM-DD')) {
        return results;
      }
      if (results[restriction.LeastRestrictiveFailure.Cause] && !shouldReplaceRestriction(results[restriction.LeastRestrictiveFailure.Cause], restriction)) {
        return results;
      }
      results[restriction.LeastRestrictiveFailure.Cause] = {
        ...restriction.LeastRestrictiveFailure,
        ...restriction
      };
      return results;
    }, {});
  }
  function shouldFetchPrices(props, oldProps) {
    const propsToLook = ['chain', 'hotel', 'currency', 'accessCode', 'accessCodeType', 'adult', 'child', 'env', 'lengthOfStay', 'primaryChannel', 'rooms', 'secondaryChannel', 'iataNumber', 'onlyCheckRequested', 'displayCurrency'];
    const arraysToLook = ['rateList', 'roomList', 'childAges', 'rateFilterList', 'loyaltyList'];
    const areStringsNotEqual = propsToLook.some(prop => props[prop] !== oldProps[prop]);
    const areArraysNotEqual = arraysToLook.some(prop => JSON.stringify(props[prop]) !== JSON.stringify(oldProps[prop]));
    return areStringsNotEqual || areArraysNotEqual;
  }

  /**
   * Determines if the price should be displayed
   * @param {Object} args
   * @param {Boolean} args.isLastSelected
   * @param {Object} args.priceData
   * @param {Boolean} args.isDisabled
   * @param {Boolean} args.hidePrices
   * @param {Boolean} args.isSelecting
   * @param {Boolean} args.isDayAvailable
   * @returns {Boolean}
   */

  function shouldDisplayPrice(_ref) {
    let {
      isLastSelected,
      priceData,
      isDisabled,
      hidePrices,
      isSelecting,
      isStayAvailable
    } = _ref;
    const price = get_1(priceData, 'Price', {});
    if (hidePrices || isDisabled || isEmpty_1(price) || !isStayAvailable) {
      return false;
    }
    if (!isSelecting) {
      return !isLastSelected;
    }
    return true;
  }

  /**
   * Formats price object for selected stay
   * @param {Object} data - priceData from response
   * @param {String} priceType - selected price type
   * @param {String} taxFeeDisplayOption - price display type for tax/fee
   * @returns {Object}
   */
  function getPriceForStay(data, priceType, taxFeeDisplayOption) {
    const priceDetails = get_1(data, 'LeadAvailabilityList[0]');
    const price = get_1(data, 'LeadAvailabilityList[0].Price', []);
    let priceObj = price.find(item => item.Type === `${priceType}`);
    if (!priceObj) {
      priceObj = price.find(item => item.Type === 'Average');
    }
    const value = get_1(priceObj, utils.getAmountKey(taxFeeDisplayOption));
    return {
      ...priceDetails,
      Price: {
        ...priceObj,
        Value: value
      }
    };
  }
  function isRestrictionDisablingDay(restriction) {
    const closingDays = ['Closed', 'NoAvailableInventory', 'SeasonalClosure', 'ZeroFinalPrice', 'Limit', 'LeadDaysTime', 'BelowHurdlePrice', 'MaxOccupancyExceeded', 'MaxAdultOccupancyExceeded', 'MinAdultOccupancyNotMet', 'MaxChildOccupancyExceeded', 'MinChildOccupancyNotMet', 'NoSellDay', 'NoBaseSeasonForDerived', 'NoPriceOnBaseRateForDerived', 'NoProduct', 'MaxSellDate', 'MinSellDate', 'StartTime', 'EndTime'];
    return closingDays.indexOf(restriction) > -1;
  }
  function formatResponse(data, priceType, taxFeeDisplayOption, response) {
    const currencyDetails = get_1(data, 'ContentLists.CurrencyList[0]');
    const parsedData = get_1(data, 'LeadAvailabilityList', []).reduce((results, leadAvailabilityListItem) => {
      const hasNoProductError = get_1(leadAvailabilityListItem, 'ApplicationResults.Error[0].SystemSpecificResults.ShortText', '') === 'NoProduct';
      if (hasNoProductError) {
        results.hasNoProductError = true;
        return results;
      }
      let priceObj = get_1(leadAvailabilityListItem, 'Price', []).find(item => item.Type === priceType);
      if (!priceObj) {
        priceObj = get_1(leadAvailabilityListItem, 'Price', []).find(item => item.Type === 'Average');
      }
      results.prices[dayjs_min(leadAvailabilityListItem.ArrivalDate).format('YYYY-MM-DD')] = {
        ...leadAvailabilityListItem,
        Price: priceObj ? {
          ...priceObj,
          Value: get_1(priceObj, utils.getAmountKey(taxFeeDisplayOption))
        } : {}
      };
      return results;
    }, {
      prices: get_1(response, 'prices', {}),
      disabledDays: get_1(response, 'disabledDays', [])
    });
    return {
      currency: {
        code: currencyDetails.CurrencyCode,
        symbol: currencyDetails.Symbol,
        decimal: currencyDetails.DecimalPlaces
      },
      ...parsedData
    };
  }

  /**
   * Formats getLeadAvailability request.
   * @param {object} props
   * @returns {object} - RQ object for getLeadAvailability
   */
  function formatRequest(props) {
    const {
      chain,
      hotel,
      startDate,
      endDate,
      currency,
      lengthOfStay,
      onlyCheckRequested,
      adult,
      child,
      childAges,
      primaryChannel,
      secondaryChannel,
      rooms,
      rateList = [],
      roomList = [],
      rateFilterList = [],
      accessCode,
      accessCodeType,
      iataNumber,
      loyaltyList,
      enablePreferredRates
    } = props;
    const isPromotionCodeType = accessCodeType === ACCESS_CODE_TYPES.PROMOTION;
    const isMobile = getDeviceType() === DEVICE_TYPES.MOBILE;
    const accessCodeDetails = accessCode && accessCodeType ? {
      type: accessCodeType,
      value: accessCode,
      ...(isPromotionCodeType && enablePreferredRates && {
        returnPreferredRates: enablePreferredRates
      })
    } : {};
    return {
      Version: '1',
      Criterion: {
        listAllocationBlocks: true,
        NumRooms: rooms,
        Currency: {
          Code: currency
        },
        ChannelList: {
          PrimaryChannel: {
            code: primaryChannel
          },
          SecondaryChannel: {
            code: secondaryChannel
          }
        },
        StartDate: startDate,
        EndDate: endDate,
        LengthOfStay: lengthOfStay,
        ...(loyaltyList ? {
          LoyaltyList: loyaltyList
        } : {}),
        onlyCheckRequested: onlyCheckRequested,
        AgentInfo: {
          IATA_Number: iataNumber
        },
        AccessCode: accessCodeDetails,
        ...(isMobile && {
          DeviceType: CHANNELS.MOBILE
        }),
        RoomStay: {
          GuestCount: [{
            ageQualifyingCode: 'Adult',
            numGuests: adult
          }, {
            ageQualifyingCode: 'Child',
            numGuests: child,
            Ages: childAges
          }],
          RateList: rateList.map(rateCode => ({
            Code: rateCode
          })),
          RoomList: roomList.map(roomCode => ({
            Code: roomCode
          })),
          RateFilterList: rateFilterList.map(rateCode => ({
            Code: rateCode
          }))
        }
      },
      HotelList: [{
        id: hotel
      }],
      UserDetails: {
        Preferences: {
          ResponseOptions: 'ReturnAllocationBlocks'
        }
      },
      Chain: {
        id: chain
      }
    };
  }
  function getError(response) {
    const description = get_1(response, 'Result.ResultCode');
    const resultsError = get_1(response, 'ApplicationResults.Error[0].SystemSpecificResults.ShortText');
    const leadAvailabilityListError = get_1(response, 'LeadAvailabilityList[0].ApplicationResults.Error[0].SystemSpecificResults.ShortText');
    if (leadAvailabilityListError) {
      return leadAvailabilityListError;
    }
    if (resultsError) {
      return resultsError;
    }
    if (description) {
      return description;
    }
    if (response.error_description) {
      return response.error_description;
    }
    return response.error;
  }
  function getRestrictionCause(day, t, prevDay) {
    let availabilityForStay = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
    let hasNoProductError = arguments.length > 4 && arguments[4] !== undefined ? arguments[4] : false;
    const cause = get_1(day, 'LeastRestrictiveFailure.Cause');
    const prevCause = get_1(prevDay, 'LeastRestrictiveFailure.Cause');
    const prevFailures = get_1(prevDay, 'Failures', []);
    const hasNoDepartureFailure = !!find_1(prevFailures, failure => get_1(failure, 'Cause') === RESTRICTIONS.NO_DEPARTURE && get_1(failure, 'Percentage') === 100);
    if (prevCause && (prevCause === RESTRICTIONS.NO_DEPARTURE || hasNoDepartureFailure)) {
      return {
        restrictionCauseLabel: t(`shs-widgets--generic.restriction.${RESTRICTIONS.NO_DEPARTURE}`, {
          additionalInformation: get_1(day, 'LeastRestrictiveFailure.AdditionalInformation')
        }),
        restrictionCause: RESTRICTIONS.NO_DEPARTURE
      };
    }
    if (!isEmpty_1(availabilityForStay)) {
      const formattedArrivalDate = dayjs_min(get_1(day, 'ArrivalDate')).format('YYYY-MM-DD');
      const stayDay = get_1(availabilityForStay, formattedArrivalDate, {});
      const isStayAvailable = get_1(stayDay, 'available');
      const fullStayRestrictionCause = get_1(stayDay, 'leastRestrictiveFailure.cause');
      if (isStayAvailable) {
        return {};
      } else if (fullStayRestrictionCause && isRestrictionDisablingDay(fullStayRestrictionCause)) {
        return {
          restrictionCauseLabel: t(`shs-widgets--generic.restriction.${fullStayRestrictionCause}`, {
            additionalInformation: get_1(stayDay, 'leastRestrictiveFailure.additionalInformation')
          }),
          restrictionCause: fullStayRestrictionCause
        };
      }
    }
    if (hasNoProductError) {
      return {
        restrictionCauseLabel: t(`shs-widgets--generic.restriction.NoProduct`),
        restrictionCause: 'NoProduct'
      };
    }
    if (cause && cause !== RESTRICTIONS.NO_DEPARTURE && cause !== RESTRICTIONS.PROMO_PRICING_RESTRICTION_NOT_MET) {
      return {
        restrictionCauseLabel: t(`shs-widgets--generic.restriction.${cause}`, {
          additionalInformation: get_1(day, 'LeastRestrictiveFailure.AdditionalInformation')
        }),
        restrictionCause: cause
      };
    }
    return {};
  }
  function getRestrictionsBetweenDays(startDate, numberOfDays, response) {
    const affectedDays = times_1(numberOfDays, index => startDate.add(index, 'day').format('YYYY-MM-DD'));
    return affectedDays.reduce((results, day) => {
      const dayObj = get_1(response, `prices[${day}]`);
      if (get_1(dayObj, 'LeastRestrictiveFailure')) {
        results.push({
          day,
          LeastRestrictiveFailure: dayObj.LeastRestrictiveFailure
        });
      }
      return results;
    }, []);
  }
  function shouldDisplayAllocationIndicator(dayObj, accessCode) {
    const allocationBlock = get_1(dayObj, 'AllocationBlockList', []).find(block => block.RateCode === accessCode);
    if (!allocationBlock) {
      return false;
    }
    return !dayjs_min(dayObj.ArrivalDate).isBefore(dayjs_min(allocationBlock.StartDate));
  }
  const weekdayDateMap = {
    Sun: new Date('2020-01-12T00:00:00'),
    Mon: new Date('2020-01-06T00:00:00'),
    Tue: new Date('2020-01-07T00:00:00'),
    Wed: new Date('2020-01-08T00:00:00'),
    Thu: new Date('2020-01-09T00:00:00'),
    Fri: new Date('2020-01-10T00:00:00'),
    Sat: new Date('2020-01-11T00:00:00')
  };
  const shortWeekdays = Object.keys(weekdayDateMap);
  const getDayOfWeek = function (shortName, idx) {
    let locale = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 'en-US';
    let length = arguments.length > 3 ? arguments[3] : undefined;
    if (length === 'xs') {
      // intl only supports 'narrow' (S, M, T), 'short' (Sun, Mon, Tue), and 'long' (full names). SBE needs Su, Mo, Tu, which formatWeekdayShort provides
      return moment$1.formatWeekdayShort(idx, locale);
    } else {
      return new Intl.DateTimeFormat(locale, {
        weekday: length
      }).format(weekdayDateMap[shortName]);
    }
  };
  const getDaysOfWeek = function () {
    let locale = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 'en-US';
    let length = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'short';
    return shortWeekdays.map((shortName, idx) => getDayOfWeek(shortName, idx, locale, length));
  };
  function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  }
  const buildQueryParams = (props, state) => {
    const {
      from,
      to
    } = state;
    const {
      adult,
      child,
      chain,
      hotel,
      currency,
      locale,
      accessCodeType,
      accessCode,
      childAges,
      iataNumber,
      rateList,
      rateFilterList,
      roomList,
      activityId,
      sbeExtraParams
    } = props;
    let params = [{
      name: 'arrive',
      value: dayjs_min(from).format('YYYY-MM-DD')
    }, {
      name: 'depart',
      value: dayjs_min(to).format('YYYY-MM-DD')
    }, {
      name: 'chain',
      value: chain
    }, {
      name: 'adult',
      value: adult
    }, {
      name: 'child',
      value: child
    }, {
      name: 'sbe_widget',
      value: 'calendar'
    }, {
      name: 'activityId',
      value: activityId
    }, ...sbeExtraParams];
    if (hotel) {
      params.push({
        name: 'hotel',
        value: hotel
      });
    }
    if (!isEmpty_1(rateList)) {
      params.push({
        name: 'rate',
        value: rateList.join(',')
      });
    }
    if (!isEmpty_1(rateFilterList)) {
      params.push({
        name: 'filter',
        value: rateFilterList.join(',')
      });
    }
    if (!isEmpty_1(roomList)) {
      params.push({
        name: 'room',
        value: roomList.join(',')
      });
    }
    if (!isEmpty_1(childAges)) {
      params.push({
        name: 'childAges',
        value: childAges.join('|')
      });
    }
    if (iataNumber) {
      params.push({
        name: 'agencyid',
        value: iataNumber
      });
    }
    if (currency) {
      params.push({
        name: 'currency',
        value: currency
      });
    }
    if (locale) {
      params.push({
        name: 'locale',
        value: locale
      });
    }
    if (accessCodeType && accessCode) {
      if (accessCodeType === 'Group') {
        params.push({
          name: 'group',
          value: accessCode
        });
      }
      if (accessCodeType === 'Promotion') {
        params.push({
          name: 'promo',
          value: accessCode
        });
      }
      if (accessCodeType === 'Corporate') {
        params.push({
          name: 'corp',
          value: accessCode
        });
      }
    }
    return `?${params.map(param => `${param.name}=${param.value}`).join('&')}`;
  };

  /**
   * Generate map of the stay dates with their availability based on the data ArrivalDate and DepartureDate
   * @param {object} data - response.data with stay data
   * @returns {object} - map of stay dates with available value from stay data
   */
  const getAvailabilityForStay = data => {
    if (isEmpty_1(data)) {
      return {};
    }
    const priceDetails = get_1(data, 'LeadAvailabilityList[0]');
    const arrivalDate = get_1(priceDetails, 'ArrivalDate');
    const departureDate = get_1(priceDetails, 'DepartureDate');
    const lengthOfStay = dayjs_min(departureDate).diff(arrivalDate, 'day');
    const stayRange = Array(lengthOfStay).fill().map((day, index) => dayjs_min(arrivalDate).add(index, 'day').format('YYYY-MM-DD'));
    const availabilityPerDay = stayRange.reduce((availability, day) => {
      availability[day] = {
        available: get_1(priceDetails, 'Available', true),
        leastRestrictiveFailure: {
          cause: get_1(priceDetails, 'LeastRestrictiveFailure.Cause'),
          additionalInformation: get_1(priceDetails, 'LeastRestrictiveFailure.AdditionalInformation')
        }
      };
      return availability;
    }, {});
    return availabilityPerDay;
  };

  /**
   * Checks whether the machine operates on macOS.
   *
   * @returns {boolean} result
   */
  const isMacOs = () => {
    const ua = get_1(navigator, 'userAgent', '');
    return /Macintosh/i.test(ua);
  };

  /**
   * Gets device type.
   *
   * @returns {string} - device type (Mobile, Tablet, Desktop)
   */
  const getDeviceType = () => {
    const ua = uaParser(get_1(navigator, 'userAgent', ''));
    let deviceType = get_1(ua, 'device.type', DEVICE_TYPES.DESKTOP);
    if (![DEVICE_TYPES.DESKTOP, DEVICE_TYPES.MOBILE, DEVICE_TYPES.TABLET].includes(deviceType)) {
      deviceType = DEVICE_TYPES.MOBILE;
    }
    return deviceType;
  };

  const Context = /*#__PURE__*/react_5();

  var _extends_1 = createCommonjsModule(function (module) {
  function _extends() {
    return module.exports = _extends = Object.assign ? Object.assign.bind() : function (n) {
      for (var e = 1; e < arguments.length; e++) {
        var t = arguments[e];
        for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]);
      }
      return n;
    }, module.exports.__esModule = true, module.exports["default"] = module.exports, _extends.apply(null, arguments);
  }
  module.exports = _extends, module.exports.__esModule = true, module.exports["default"] = module.exports;
  });

  var _extends = unwrapExports(_extends_1);

  var reactDayPicker_min = createCommonjsModule(function (module, exports) {
  !function(e,t){module.exports=t(react);}("undefined"!=typeof self?self:commonjsGlobal,function(e){return function(e){function t(o){if(n[o])return n[o].exports;var r=n[o]={i:o,l:!1,exports:{}};return e[o].call(r.exports,r,r.exports,t),r.l=!0,r.exports}var n={};return t.m=e,t.c=n,t.d=function(e,n,o){t.o(e,n)||Object.defineProperty(e,n,{configurable:!1,enumerable:!0,get:o});},t.n=function(e){var n=e&&e.__esModule?function(){return e.default}:function(){return e};return t.d(n,"a",n),n},t.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},t.p="",t(t.s=8)}([function(t,n){t.exports=e;},function(e,t,n){function o(e){return new Date(e.getTime())}function r(e){return e instanceof Date&&!isNaN(e.valueOf())}function a(e,t){var n=o(e);return n.setMonth(e.getMonth()+t),n}function s(e,t){return !(!e||!t)&&(e.getDate()===t.getDate()&&e.getMonth()===t.getMonth()&&e.getFullYear()===t.getFullYear())}function i(e,t){return !(!e||!t)&&(e.getMonth()===t.getMonth()&&e.getFullYear()===t.getFullYear())}function u(e,t){return o(e).setHours(0,0,0,0)<o(t).setHours(0,0,0,0)}function l(e,t){return o(e).setHours(0,0,0,0)>o(t).setHours(0,0,0,0)}function c(e){var t=new Date;return t.setHours(0,0,0,0),u(e,t)}function p(e){var t=new Date((new Date).getTime()+864e5);return t.setHours(0,0,0,0),e>=t}function f(e,t,n){var r=o(e);return r.setHours(0,0,0,0),l(r,t)&&u(r,n)||l(r,n)&&u(r,t)}function h(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{from:null,to:null},n=t.from,o=t.to;return n?n&&o&&s(n,o)&&s(e,n)?(n=null,o=null):o&&u(e,n)?n=e:o&&s(e,o)?(n=e,o=e):(o=e,u(o,n)&&(o=n,n=e)):n=e,{from:n,to:o}}function d(e,t){var n=t.from,o=t.to;return n&&s(e,n)||o&&s(e,o)||n&&o&&f(e,n,o)}function y(e){var t=o(e);return t.setHours(0,0,0),t.setDate(t.getDate()+4-(t.getDay()||7)),Math.ceil(((t-new Date(t.getFullYear(),0,1))/864e5+1)/7)}Object.defineProperty(t,"__esModule",{value:!0}),t.clone=o,t.isDate=r,t.addMonths=a,t.isSameDay=s,t.isSameMonth=i,t.isDayBefore=u,t.isDayAfter=l,t.isPastDay=c,t.isFutureDay=p,t.isDayBetween=f,t.addDayToRange=h,t.isDayInRange=d,t.getWeekNumber=y,t.default={addDayToRange:h,addMonths:a,clone:o,getWeekNumber:y,isDate:r,isDayAfter:l,isDayBefore:u,isDayBetween:f,isDayInRange:d,isFutureDay:p,isPastDay:c,isSameDay:s,isSameMonth:i};},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});t.LEFT=37,t.UP=38,t.RIGHT=39,t.DOWN=40,t.ENTER=13,t.SPACE=32,t.ESC=27,t.TAB=9;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0}),t.default={container:"DayPicker",wrapper:"DayPicker-wrapper",interactionDisabled:"DayPicker--interactionDisabled",months:"DayPicker-Months",month:"DayPicker-Month",navBar:"DayPicker-NavBar",navButtonPrev:"DayPicker-NavButton DayPicker-NavButton--prev",navButtonNext:"DayPicker-NavButton DayPicker-NavButton--next",navButtonInteractionDisabled:"DayPicker-NavButton--interactionDisabled",caption:"DayPicker-Caption",weekdays:"DayPicker-Weekdays",weekdaysRow:"DayPicker-WeekdaysRow",weekday:"DayPicker-Weekday",body:"DayPicker-Body",week:"DayPicker-Week",weekNumber:"DayPicker-WeekNumber",day:"DayPicker-Day",footer:"DayPicker-Footer",todayButton:"DayPicker-TodayButton",today:"today",selected:"selected",disabled:"disabled",outside:"outside"};},function(e,t,n){function o(e){e.preventDefault(),e.stopPropagation();}function r(e){return new Date(e.getFullYear(),e.getMonth(),1,12)}function a(e){var t=r(e);return t.setMonth(t.getMonth()+1),t.setDate(t.getDate()-1),t.getDate()}function s(e){var t=y({},e.modifiers);return e.selectedDays&&(t[e.classNames.selected]=e.selectedDays),e.disabledDays&&(t[e.classNames.disabled]=e.disabledDays),t}function i(e){var t=e.firstDayOfWeek,n=e.locale,o=void 0===n?"en":n,r=e.localeUtils,a=void 0===r?{}:r;return isNaN(t)?a.getFirstDayOfWeek?a.getFirstDayOfWeek(o):0:t}function u(e){return !!(e&&e.from&&e.to)}function l(e,t){return t.getMonth()-e.getMonth()+12*(t.getFullYear()-e.getFullYear())}function c(e){for(var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:(0, m.getFirstDayOfWeek)(),n=arguments[2],o=a(e),r=[],s=[],i=[],u=1;u<=o;u+=1)r.push(new Date(e.getFullYear(),e.getMonth(),u,12));r.forEach(function(e){s.length>0&&e.getDay()===t&&(i.push(s),s=[]),s.push(e),r.indexOf(e)===r.length-1&&i.push(s);});for(var l=i[0],c=7-l.length;c>0;c-=1){var p=(0, v.clone)(l[0]);p.setDate(l[0].getDate()-1),l.unshift(p);}for(var f=i[i.length-1],h=f.length;h<7;h+=1){var d=(0, v.clone)(f[f.length-1]);d.setDate(f[f.length-1].getDate()+1),f.push(d);}if(n&&i.length<6)for(var y=void 0,k=i.length;k<6;k+=1){y=i[i.length-1];for(var D=y[y.length-1],b=[],g=0;g<7;g+=1){var w=(0, v.clone)(D);w.setDate(D.getDate()+g+1),b.push(w);}i.push(b);}return i}function p(e){var t=(0, v.clone)(e);return t.setDate(1),t.setHours(12,0,0,0),t}function f(e,t){var n=void 0;n=t===D.default?t.day+"--"+t.outside:""+t.outside;var o=t.day.replace(/ /g,"."),r=n.replace(/ /g,"."),a="."+o+":not(."+r+")";return e.querySelectorAll(a)}function h(e){return Array.prototype.slice.call(e,0)}function d(e,t){return Object.prototype.hasOwnProperty.call(e,t)}Object.defineProperty(t,"__esModule",{value:!0});var y=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o]);}return e};t.cancelEvent=o,t.getFirstDayOfMonth=r,t.getDaysInMonth=a,t.getModifiersFromProps=s,t.getFirstDayOfWeekFromProps=i,t.isRangeOfDates=u,t.getMonthsDiff=l,t.getWeekArray=c,t.startOfMonth=p,t.getDayNodes=f,t.nodeListToArray=h,t.hasOwnProp=d;var v=n(1),m=n(5),k=n(3),D=function(e){return e&&e.__esModule?e:{default:e}}(k);},function(e,t,n){function o(e){return e.toDateString()}function r(e){return p[e.getMonth()]+" "+e.getFullYear()}function a(e){return c[e]}function s(e){return l[e]}function i(){return 0}function u(){return p}Object.defineProperty(t,"__esModule",{value:!0}),t.formatDay=o,t.formatMonthTitle=r,t.formatWeekdayShort=a,t.formatWeekdayLong=s,t.getFirstDayOfWeek=i,t.getMonths=u;var l=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],c=["Su","Mo","Tu","We","Th","Fr","Sa"],p=["January","February","March","April","May","June","July","August","September","October","November","December"];t.default={formatDay:o,formatMonthTitle:r,formatWeekdayShort:a,formatWeekdayLong:s,getFirstDayOfWeek:i,getMonths:u};},function(e,t,n){function o(e,t){return !!t&&(Array.isArray(t)?t:[t]).some(function(t){return !!t&&(t instanceof Date?(0, a.isSameDay)(e,t):(0, s.isRangeOfDates)(t)?(0, a.isDayInRange)(e,t):t.after&&t.before&&(0, a.isDayAfter)(t.before,t.after)?(0, a.isDayAfter)(e,t.after)&&(0, a.isDayBefore)(e,t.before):t.after&&t.before&&((0, a.isDayAfter)(t.after,t.before)||(0, a.isSameDay)(t.after,t.before))?(0, a.isDayAfter)(e,t.after)||(0, a.isDayBefore)(e,t.before):t.after?(0, a.isDayAfter)(e,t.after):t.before?(0, a.isDayBefore)(e,t.before):t.daysOfWeek?t.daysOfWeek.some(function(t){return e.getDay()===t}):"function"==typeof t&&t(e))})}function r(e){var t=arguments.length>1&&void 0!==arguments[1]?arguments[1]:{};return Object.keys(t).reduce(function(n,r){var a=t[r];return o(e,a)&&n.push(r),n},[])}Object.defineProperty(t,"__esModule",{value:!0}),t.dayMatchesModifier=o,t.getModifiersForDay=r;var a=n(1),s=n(4);t.default={dayMatchesModifier:o,getModifiersForDay:r};},function(e,t,n){function o(e){if(e&&e.__esModule)return e;var t={};if(null!=e)for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&(t[n]=e[n]);return t.default=e,t}function r(e){return e&&e.__esModule?e:{default:e}}function a(e,t){var n={};for(var o in e)t.indexOf(o)>=0||Object.prototype.hasOwnProperty.call(e,o)&&(n[o]=e[o]);return n}function s(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function i(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function u(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0}),t.ModifiersUtils=t.LocaleUtils=t.DateUtils=t.DayPicker=void 0;var l=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o]);}return e},c=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),p=n(0),f=r(p),h=n(9),d=r(h),y=n(10),v=r(y),m=n(11),k=r(m),D=n(14),b=r(D),g=n(4),w=o(g),M=n(1),P=o(M),O=n(5),N=o(O),C=n(6),E=o(C),_=n(3),j=r(_),x=n(2),T=t.DayPicker=function(e){function t(e){s(this,t);var n=i(this,(t.__proto__||Object.getPrototypeOf(t)).call(this,e));n.dayPicker=null,n.showNextMonth=function(e){if(n.allowNextMonth()){var t=n.props.pagedNavigation?n.props.numberOfMonths:1,o=P.addMonths(n.state.currentMonth,t);n.showMonth(o,e);}},n.showPreviousMonth=function(e){if(n.allowPreviousMonth()){var t=n.props.pagedNavigation?n.props.numberOfMonths:1,o=P.addMonths(n.state.currentMonth,-t);n.showMonth(o,e);}},n.handleKeyDown=function(e){switch(e.persist(),e.keyCode){case x.LEFT:"rtl"===n.props.dir?n.showNextMonth():n.showPreviousMonth(),w.cancelEvent(e);break;case x.RIGHT:"rtl"===n.props.dir?n.showPreviousMonth():n.showNextMonth(),w.cancelEvent(e);break;case x.UP:n.showPreviousYear(),w.cancelEvent(e);break;case x.DOWN:n.showNextYear(),w.cancelEvent(e);}n.props.onKeyDown&&n.props.onKeyDown(e);},n.handleDayKeyDown=function(e,t,o){switch(o.persist(),o.keyCode){case x.LEFT:w.cancelEvent(o),"rtl"===n.props.dir?n.focusNextDay(o.target):n.focusPreviousDay(o.target);break;case x.RIGHT:w.cancelEvent(o),"rtl"===n.props.dir?n.focusPreviousDay(o.target):n.focusNextDay(o.target);break;case x.UP:w.cancelEvent(o),n.focusPreviousWeek(o.target);break;case x.DOWN:w.cancelEvent(o),n.focusNextWeek(o.target);break;case x.ENTER:case x.SPACE:w.cancelEvent(o),n.props.onDayClick&&n.handleDayClick(e,t,o);}n.props.onDayKeyDown&&n.props.onDayKeyDown(e,t,o);},n.handleDayClick=function(e,t,o){o.persist(),t[n.props.classNames.outside]&&n.props.enableOutsideDaysClick&&n.handleOutsideDayClick(e),n.props.onDayClick&&n.props.onDayClick(e,t,o);},n.handleTodayButtonClick=function(e){var t=new Date,o=new Date(t.getFullYear(),t.getMonth());n.showMonth(o),e.target.blur(),n.props.onTodayButtonClick&&(e.persist(),n.props.onTodayButtonClick(new Date(t.getFullYear(),t.getMonth(),t.getDate()),E.getModifiersForDay(t,n.props.modifiers),e));};var o=n.getCurrentMonthFromProps(e);return n.state={currentMonth:o},n}return u(t,e),c(t,[{key:"componentDidUpdate",value:function(e){if(e.month!==this.props.month&&!P.isSameMonth(e.month,this.props.month)){var t=this.getCurrentMonthFromProps(this.props);this.setState({currentMonth:t});}}},{key:"getCurrentMonthFromProps",value:function(e){var t=w.startOfMonth(e.month||e.initialMonth||new Date),n=t;if(e.pagedNavigation&&e.numberOfMonths>1&&e.fromMonth){var o=w.startOfMonth(e.fromMonth),r=w.getMonthsDiff(o,n);n=P.addMonths(o,Math.floor(r/e.numberOfMonths)*e.numberOfMonths);}else e.toMonth&&e.numberOfMonths>1&&w.getMonthsDiff(n,e.toMonth)<=0&&(n=P.addMonths(w.startOfMonth(e.toMonth),1-this.props.numberOfMonths));return n}},{key:"getNextNavigableMonth",value:function(){return P.addMonths(this.state.currentMonth,this.props.numberOfMonths)}},{key:"getPreviousNavigableMonth",value:function(){return P.addMonths(this.state.currentMonth,-1)}},{key:"allowPreviousMonth",value:function(){var e=P.addMonths(this.state.currentMonth,-1);return this.allowMonth(e)}},{key:"allowNextMonth",value:function(){var e=P.addMonths(this.state.currentMonth,this.props.numberOfMonths);return this.allowMonth(e)}},{key:"allowMonth",value:function(e){var t=this.props,n=t.fromMonth,o=t.toMonth;return !(!t.canChangeMonth||n&&w.getMonthsDiff(n,e)<0||o&&w.getMonthsDiff(o,e)>0)}},{key:"allowYearChange",value:function(){return this.props.canChangeMonth}},{key:"showMonth",value:function(e,t){var n=this;this.allowMonth(e)&&this.setState({currentMonth:w.startOfMonth(e)},function(){t&&t(),n.props.onMonthChange&&n.props.onMonthChange(n.state.currentMonth);});}},{key:"showNextYear",value:function(){if(this.allowYearChange()){var e=P.addMonths(this.state.currentMonth,12);this.showMonth(e);}}},{key:"showPreviousYear",value:function(){if(this.allowYearChange()){var e=P.addMonths(this.state.currentMonth,-12);this.showMonth(e);}}},{key:"focus",value:function(){this.wrapper.focus();}},{key:"focusFirstDayOfMonth",value:function(){w.getDayNodes(this.dayPicker,this.props.classNames)[0].focus();}},{key:"focusLastDayOfMonth",value:function(){var e=w.getDayNodes(this.dayPicker,this.props.classNames);e[e.length-1].focus();}},{key:"focusPreviousDay",value:function(e){var t=this,n=w.getDayNodes(this.dayPicker,this.props.classNames),o=w.nodeListToArray(n).indexOf(e);-1!==o&&(0===o?this.showPreviousMonth(function(){return t.focusLastDayOfMonth()}):n[o-1].focus());}},{key:"focusNextDay",value:function(e){var t=this,n=w.getDayNodes(this.dayPicker,this.props.classNames),o=w.nodeListToArray(n).indexOf(e);-1!==o&&(o===n.length-1?this.showNextMonth(function(){return t.focusFirstDayOfMonth()}):n[o+1].focus());}},{key:"focusNextWeek",value:function(e){var t=this,n=w.getDayNodes(this.dayPicker,this.props.classNames),o=w.nodeListToArray(n).indexOf(e);o>n.length-8?this.showNextMonth(function(){var e=n.length-o,r=7-e;w.getDayNodes(t.dayPicker,t.props.classNames)[r].focus();}):n[o+7].focus();}},{key:"focusPreviousWeek",value:function(e){var t=this,n=w.getDayNodes(this.dayPicker,this.props.classNames),o=w.nodeListToArray(n).indexOf(e);o<=6?this.showPreviousMonth(function(){var e=w.getDayNodes(t.dayPicker,t.props.classNames);e[e.length-7+o].focus();}):n[o-7].focus();}},{key:"handleOutsideDayClick",value:function(e){var t=this.state.currentMonth,n=this.props.numberOfMonths,o=w.getMonthsDiff(t,e);o>0&&o>=n?this.showNextMonth():o<0&&this.showPreviousMonth();}},{key:"renderNavbar",value:function(){var e=this.props,t=e.labels,n=e.locale,o=e.localeUtils,r=e.canChangeMonth,s=e.navbarElement,i=a(e,["labels","locale","localeUtils","canChangeMonth","navbarElement"]);if(!r)return null;var u={month:this.state.currentMonth,classNames:this.props.classNames,className:this.props.classNames.navBar,nextMonth:this.getNextNavigableMonth(),previousMonth:this.getPreviousNavigableMonth(),showPreviousButton:this.allowPreviousMonth(),showNextButton:this.allowNextMonth(),onNextClick:this.showNextMonth,onPreviousClick:this.showPreviousMonth,dir:i.dir,labels:t,locale:n,localeUtils:o};return f.default.isValidElement(s)?f.default.cloneElement(s,u):f.default.createElement(s,u)}},{key:"renderMonths",value:function(){for(var e=[],t=w.getFirstDayOfWeekFromProps(this.props),n=0;n<this.props.numberOfMonths;n+=1){var o=P.addMonths(this.state.currentMonth,n);e.push(f.default.createElement(k.default,l({key:n},this.props,{month:o,firstDayOfWeek:t,onDayKeyDown:this.handleDayKeyDown,onDayClick:this.handleDayClick})));}return this.props.reverseMonths&&e.reverse(),e}},{key:"renderFooter",value:function(){return this.props.todayButton?f.default.createElement("div",{className:this.props.classNames.footer},this.renderTodayButton()):null}},{key:"renderTodayButton",value:function(){return f.default.createElement("button",{type:"button",tabIndex:0,className:this.props.classNames.todayButton,"aria-label":this.props.todayButton,onClick:this.handleTodayButtonClick},this.props.todayButton)}},{key:"render",value:function(){var e=this,t=this.props.classNames.container;return this.props.onDayClick||(t=t+" "+this.props.classNames.interactionDisabled),this.props.className&&(t=t+" "+this.props.className),f.default.createElement("div",l({},this.props.containerProps,{className:t,ref:function(t){return e.dayPicker=t},lang:this.props.locale}),f.default.createElement("div",{className:this.props.classNames.wrapper,ref:function(t){return e.wrapper=t},tabIndex:this.props.canChangeMonth&&void 0!==this.props.tabIndex?this.props.tabIndex:-1,onKeyDown:this.handleKeyDown,onFocus:this.props.onFocus,onBlur:this.props.onBlur},this.renderNavbar(),f.default.createElement("div",{className:this.props.classNames.months},this.renderMonths()),this.renderFooter()))}}]),t}(p.Component);T.defaultProps={classNames:j.default,tabIndex:0,numberOfMonths:1,labels:{previousMonth:"Previous Month",nextMonth:"Next Month"},locale:"en",localeUtils:N,showOutsideDays:!1,enableOutsideDaysClick:!0,fixedWeeks:!1,canChangeMonth:!0,reverseMonths:!1,pagedNavigation:!1,showWeekNumbers:!1,showWeekDays:!0,renderDay:function(e){return e.getDate()},renderWeek:function(e){return e},weekdayElement:f.default.createElement(b.default,null),navbarElement:f.default.createElement(v.default,{classNames:j.default}),captionElement:f.default.createElement(d.default,{classNames:j.default})},T.VERSION="7.4.10",T.DateUtils=P,T.LocaleUtils=N,T.ModifiersUtils=E,t.DateUtils=P,t.LocaleUtils=N,t.ModifiersUtils=E,t.default=T;},function(e,t,n){Object.defineProperty(t,"__esModule",{value:!0});var o=n(7).default;o.Input=n(15).default,t.default=o;},function(e,t,n){function o(e){return e&&e.__esModule?e:{default:e}}function r(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function a(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function s(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),u=n(0),l=o(u),c=n(5),p=o(c),f=n(2),h=function(e){function t(e){r(this,t);var n=a(this,(t.__proto__||Object.getPrototypeOf(t)).call(this,e));return n.handleKeyUp=n.handleKeyUp.bind(n),n}return s(t,e),i(t,[{key:"shouldComponentUpdate",value:function(e){return e.locale!==this.props.locale||e.classNames!==this.props.classNames||e.date.getMonth()!==this.props.date.getMonth()||e.date.getFullYear()!==this.props.date.getFullYear()}},{key:"handleKeyUp",value:function(e){e.keyCode===f.ENTER&&this.props.onClick(e);}},{key:"render",value:function(){var e=this.props,t=e.classNames,n=e.date,o=e.months,r=e.locale,a=e.localeUtils,s=e.onClick;return l.default.createElement("div",{className:t.caption,role:"heading","aria-live":"polite"},l.default.createElement("div",{onClick:s,onKeyUp:this.handleKeyUp},o?o[n.getMonth()]+" "+n.getFullYear():a.formatMonthTitle(n,r)))}}]),t}(u.Component);h.defaultProps={localeUtils:p.default},t.default=h;},function(e,t,n){function o(e){return e&&e.__esModule?e:{default:e}}function r(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function a(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function s(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0});var i=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),u=n(0),l=o(u),c=n(3),p=o(c),f=n(2),h=function(e){function t(){var e,n,o,s;r(this,t);for(var i=arguments.length,u=Array(i),l=0;l<i;l++)u[l]=arguments[l];return n=o=a(this,(e=t.__proto__||Object.getPrototypeOf(t)).call.apply(e,[this].concat(u))),o.handleNextClick=function(){o.props.onNextClick&&o.props.onNextClick();},o.handlePreviousClick=function(){o.props.onPreviousClick&&o.props.onPreviousClick();},o.handleNextKeyDown=function(e){e.keyCode!==f.ENTER&&e.keyCode!==f.SPACE||(e.preventDefault(),o.handleNextClick());},o.handlePreviousKeyDown=function(e){e.keyCode!==f.ENTER&&e.keyCode!==f.SPACE||(e.preventDefault(),o.handlePreviousClick());},s=n,a(o,s)}return s(t,e),i(t,[{key:"shouldComponentUpdate",value:function(e){return e.labels!==this.props.labels||e.dir!==this.props.dir||this.props.showPreviousButton!==e.showPreviousButton||this.props.showNextButton!==e.showNextButton}},{key:"render",value:function(){var e=this.props,t=e.classNames,n=e.className,o=e.showPreviousButton,r=e.showNextButton,a=e.labels,s=e.dir,i=void 0,u=void 0,c=void 0,p=void 0,f=void 0,h=void 0;"rtl"===s?(i=this.handleNextClick,u=this.handlePreviousClick,c=this.handleNextKeyDown,p=this.handlePreviousKeyDown,h=o,f=r):(i=this.handlePreviousClick,u=this.handleNextClick,c=this.handlePreviousKeyDown,p=this.handleNextKeyDown,h=r,f=o);var d=f?t.navButtonPrev:t.navButtonPrev+" "+t.navButtonInteractionDisabled,y=h?t.navButtonNext:t.navButtonNext+" "+t.navButtonInteractionDisabled,v=l.default.createElement("span",{tabIndex:"0",role:"button","aria-label":a.previousMonth,key:"previous",className:d,onKeyDown:f?c:void 0,onClick:f?i:void 0}),m=l.default.createElement("span",{tabIndex:"0",role:"button","aria-label":a.nextMonth,key:"right",className:y,onKeyDown:h?p:void 0,onClick:h?u:void 0});return l.default.createElement("div",{className:n||t.navBar},"rtl"===s?[m,v]:[v,m])}}]),t}(u.Component);h.defaultProps={classNames:p.default,dir:"ltr",labels:{previousMonth:"Previous Month",nextMonth:"Next Month"},showPreviousButton:!0,showNextButton:!0},t.default=h;},function(e,t,n){function o(e){if(e&&e.__esModule)return e;var t={};if(null!=e)for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&(t[n]=e[n]);return t.default=e,t}function r(e){return e&&e.__esModule?e:{default:e}}function a(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function s(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function i(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0});var u=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),l=n(0),c=r(l),p=n(12),f=r(p),h=n(13),d=r(h),y=n(2),v=n(6),m=o(v),k=n(4),D=o(k),b=n(1),g=o(b),w=function(e){function t(){var e,n,o,r;a(this,t);for(var i=arguments.length,u=Array(i),l=0;l<i;l++)u[l]=arguments[l];return n=o=s(this,(e=t.__proto__||Object.getPrototypeOf(t)).call.apply(e,[this].concat(u))),o.renderDay=function(e){var t=o.props.month.getMonth(),n=D.getModifiersFromProps(o.props),r=m.getModifiersForDay(e,n);g.isSameDay(e,new Date)&&!Object.prototype.hasOwnProperty.call(n,o.props.classNames.today)&&r.push(o.props.classNames.today),e.getMonth()!==t&&r.push(o.props.classNames.outside);var a=e.getMonth()!==t,s=-1;o.props.onDayClick&&!a&&1===e.getDate()&&(s=o.props.tabIndex);var i=""+e.getFullYear()+e.getMonth()+e.getDate(),u={};return r.forEach(function(e){u[e]=!0;}),c.default.createElement(d.default,{key:(a?"outside-":"")+i,classNames:o.props.classNames,day:e,modifiers:u,modifiersStyles:o.props.modifiersStyles,empty:a&&!o.props.showOutsideDays&&!o.props.fixedWeeks,tabIndex:s,ariaLabel:o.props.localeUtils.formatDay(e,o.props.locale),ariaDisabled:a||r.indexOf(o.props.classNames.disabled)>-1,ariaSelected:r.indexOf(o.props.classNames.selected)>-1,onClick:o.props.onDayClick,onFocus:o.props.onDayFocus,onKeyDown:o.props.onDayKeyDown,onMouseEnter:o.props.onDayMouseEnter,onMouseLeave:o.props.onDayMouseLeave,onMouseDown:o.props.onDayMouseDown,onMouseUp:o.props.onDayMouseUp,onTouchEnd:o.props.onDayTouchEnd,onTouchStart:o.props.onDayTouchStart},o.props.renderDay(e,u))},r=n,s(o,r)}return i(t,e),u(t,[{key:"render",value:function(){var e=this,t=this.props,n=t.classNames,o=t.month,r=t.months,a=t.fixedWeeks,s=t.captionElement,i=t.weekdayElement,u=t.locale,l=t.localeUtils,p=t.weekdaysLong,h=t.weekdaysShort,d=t.firstDayOfWeek,v=t.onCaptionClick,m=t.showWeekNumbers,k=t.showWeekDays,b=t.onWeekClick,w={date:o,classNames:n,months:r,localeUtils:l,locale:u,onClick:v?function(e){return v(o,e)}:void 0},M=c.default.isValidElement(s)?c.default.cloneElement(s,w):c.default.createElement(s,w),P=D.getWeekArray(o,d,a);return c.default.createElement("div",{className:n.month,role:"grid"},M,k&&c.default.createElement(f.default,{classNames:n,weekdaysShort:h,weekdaysLong:p,firstDayOfWeek:d,showWeekNumbers:m,locale:u,localeUtils:l,weekdayElement:i}),c.default.createElement("div",{className:n.body,role:"rowgroup"},P.map(function(t){var r=void 0;return m&&(r=g.getWeekNumber(t[6])),c.default.createElement("div",{key:t[0].getTime(),className:n.week,role:"row"},m&&c.default.createElement("div",{className:n.weekNumber,tabIndex:b?0:-1,role:"gridcell",onClick:b?function(e){return b(r,t,e)}:void 0,onKeyUp:b?function(e){return e.keyCode===y.ENTER&&b(r,t,e)}:void 0},e.props.renderWeek(r,t,o)),t.map(e.renderDay))})))}}]),t}(l.Component);t.default=w;},function(e,t,n){function o(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function r(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function a(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0});var s=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),i=n(0),u=function(e){return e&&e.__esModule?e:{default:e}}(i),l=function(e){function t(){return o(this,t),r(this,(t.__proto__||Object.getPrototypeOf(t)).apply(this,arguments))}return a(t,e),s(t,[{key:"shouldComponentUpdate",value:function(e){return this.props!==e}},{key:"render",value:function(){for(var e=this.props,t=e.classNames,n=e.firstDayOfWeek,o=e.showWeekNumbers,r=e.weekdaysLong,a=e.weekdaysShort,s=e.locale,i=e.localeUtils,l=e.weekdayElement,c=[],p=0;p<7;p+=1){var f=(p+n)%7,h={key:p,className:t.weekday,weekday:f,weekdaysLong:r,weekdaysShort:a,localeUtils:i,locale:s},d=u.default.isValidElement(l)?u.default.cloneElement(l,h):u.default.createElement(l,h);c.push(d);}return u.default.createElement("div",{className:t.weekdays,role:"rowgroup"},u.default.createElement("div",{className:t.weekdaysRow,role:"row"},o&&u.default.createElement("div",{className:t.weekday}),c))}}]),t}(i.Component);t.default=l;},function(e,t,n){function o(e){return e&&e.__esModule?e:{default:e}}function r(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function a(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function s(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}function i(e,t,n){if(e)return function(o){o.persist(),e(t,n,o);}}Object.defineProperty(t,"__esModule",{value:!0});var u=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o]);}return e},l=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),c=n(0),p=o(c),f=n(1),h=n(4),d=n(3),y=o(d),v=function(e){function t(){return r(this,t),a(this,(t.__proto__||Object.getPrototypeOf(t)).apply(this,arguments))}return s(t,e),l(t,[{key:"shouldComponentUpdate",value:function(e){var t=this,n=Object.keys(this.props),o=Object.keys(e);return n.length!==o.length||n.some(function(n){if("modifiers"===n||"modifiersStyles"===n||"classNames"===n){var o=t.props[n],r=e[n],a=Object.keys(o),s=Object.keys(r);return a.length!==s.length||a.some(function(e){return !(0, h.hasOwnProp)(r,e)||o[e]!==r[e]})}return "day"===n?!(0, f.isSameDay)(t.props[n],e[n]):!(0, h.hasOwnProp)(e,n)||t.props[n]!==e[n]})}},{key:"render",value:function(){var e=this.props,t=e.classNames,n=e.modifiersStyles,o=e.day,r=e.tabIndex,a=e.empty,s=e.modifiers,l=e.onMouseEnter,c=e.onMouseLeave,f=e.onMouseUp,h=e.onMouseDown,d=e.onClick,v=e.onKeyDown,m=e.onTouchStart,k=e.onTouchEnd,D=e.onFocus,b=e.ariaLabel,g=e.ariaDisabled,w=e.ariaSelected,M=e.children,P=t.day;t!==y.default?P+=" "+Object.keys(s).join(" "):P+=Object.keys(s).map(function(e){return " "+P+"--"+e}).join("");var O=void 0;return n&&Object.keys(s).filter(function(e){return !!n[e]}).forEach(function(e){O=u({},O,n[e]);}),a?p.default.createElement("div",{"aria-disabled":!0,className:P,style:O}):p.default.createElement("div",{className:P,tabIndex:r,style:O,role:"gridcell","aria-label":b,"aria-disabled":g,"aria-selected":w,onClick:i(d,o,s),onKeyDown:i(v,o,s),onMouseEnter:i(l,o,s),onMouseLeave:i(c,o,s),onMouseUp:i(f,o,s),onMouseDown:i(h,o,s),onTouchEnd:i(k,o,s),onTouchStart:i(m,o,s),onFocus:i(D,o,s)},M)}}]),t}(c.Component);v.defaultProps={tabIndex:-1},v.defaultProps={modifiers:{},modifiersStyles:{},empty:!1},t.default=v;},function(e,t,n){function o(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function r(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function a(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}Object.defineProperty(t,"__esModule",{value:!0});var s=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),i=n(0),u=function(e){return e&&e.__esModule?e:{default:e}}(i),l=function(e){function t(){return o(this,t),r(this,(t.__proto__||Object.getPrototypeOf(t)).apply(this,arguments))}return a(t,e),s(t,[{key:"shouldComponentUpdate",value:function(e){return this.props!==e}},{key:"render",value:function(){var e=this.props,t=e.weekday,n=e.className,o=e.weekdaysLong,r=e.weekdaysShort,a=e.localeUtils,s=e.locale,i=void 0;i=o?o[t]:a.formatWeekdayLong(t,s);var l=void 0;return l=r?r[t]:a.formatWeekdayShort(t,s),u.default.createElement("div",{className:n,role:"columnheader"},u.default.createElement("abbr",{title:i},l))}}]),t}(i.Component);t.default=l;},function(e,t,n){function o(e){return e&&e.__esModule?e:{default:e}}function r(e,t,n){return t in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function a(e,t){if(!(e instanceof t))throw new TypeError("Cannot call a class as a function")}function s(e,t){if(!e)throw new ReferenceError("this hasn't been initialised - super() hasn't been called");return !t||"object"!=typeof t&&"function"!=typeof t?e:t}function i(e,t){if("function"!=typeof t&&null!==t)throw new TypeError("Super expression must either be null or a function, not "+typeof t);e.prototype=Object.create(t&&t.prototype,{constructor:{value:e,enumerable:!1,writable:!0,configurable:!0}}),t&&(Object.setPrototypeOf?Object.setPrototypeOf(e,t):e.__proto__=t);}function u(e,t){var n={};for(var o in e)t.indexOf(o)>=0||Object.prototype.hasOwnProperty.call(e,o)&&(n[o]=e[o]);return n}function l(e){var t=(e.input,e.selectedDay,e.month,e.children),n=e.classNames,o=u(e,["input","selectedDay","month","children","classNames"]);return y.default.createElement("div",h({className:n.overlayWrapper},o),y.default.createElement("div",{className:n.overlay},t))}function c(e){if((0, k.isDate)(e)){return e.getFullYear()+"-"+(""+(e.getMonth()+1))+"-"+(""+e.getDate())}return ""}function p(e){if("string"==typeof e){var t=e.split("-");if(3===t.length){var n=parseInt(t[0],10),o=parseInt(t[1],10)-1,r=parseInt(t[2],10);if(!(isNaN(n)||String(n).length>4||isNaN(o)||isNaN(r)||r<=0||r>31||o<0||o>=12))return new Date(n,o,r,12,0,0,0)}}}Object.defineProperty(t,"__esModule",{value:!0}),t.HIDE_TIMEOUT=void 0;var f=function(){function e(e,t){for(var n=0;n<t.length;n++){var o=t[n];o.enumerable=o.enumerable||!1,o.configurable=!0,"value"in o&&(o.writable=!0),Object.defineProperty(e,o.key,o);}}return function(t,n,o){return n&&e(t.prototype,n),o&&e(t,o),t}}(),h=Object.assign||function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var o in n)Object.prototype.hasOwnProperty.call(n,o)&&(e[o]=n[o]);}return e};t.OverlayComponent=l,t.defaultFormat=c,t.defaultParse=p;var d=n(0),y=o(d),v=n(7),m=o(v),k=n(1),D=n(6),b=n(2),g=t.HIDE_TIMEOUT=100,w=function(e){function t(e){a(this,t);var n=s(this,(t.__proto__||Object.getPrototypeOf(t)).call(this,e));return n.input=null,n.daypicker=null,n.clickTimeout=null,n.hideTimeout=null,n.inputBlurTimeout=null,n.inputFocusTimeout=null,n.state=n.getInitialStateFromProps(e),n.state.showOverlay=e.showOverlay,n.hideAfterDayClick=n.hideAfterDayClick.bind(n),n.handleInputClick=n.handleInputClick.bind(n),n.handleInputFocus=n.handleInputFocus.bind(n),n.handleInputBlur=n.handleInputBlur.bind(n),n.handleInputChange=n.handleInputChange.bind(n),n.handleInputKeyDown=n.handleInputKeyDown.bind(n),n.handleInputKeyUp=n.handleInputKeyUp.bind(n),n.handleDayClick=n.handleDayClick.bind(n),n.handleMonthChange=n.handleMonthChange.bind(n),n.handleOverlayFocus=n.handleOverlayFocus.bind(n),n.handleOverlayBlur=n.handleOverlayBlur.bind(n),n}return i(t,e),f(t,[{key:"componentDidUpdate",value:function(e){var t={},n=this.props,o=n.value,r=n.formatDate,a=n.format,s=n.dayPickerProps;o===e.value&&s.locale===e.dayPickerProps.locale&&a===e.format||((0, k.isDate)(o)?t.value=r(o,a,s.locale):t.value=o);var i=e.dayPickerProps.month;s.month&&s.month!==i&&!(0, k.isSameMonth)(s.month,i)&&(t.month=s.month),e.dayPickerProps.selectedDays!==s.selectedDays&&(t.selectedDays=s.selectedDays),Object.keys(t).length>0&&this.setState(t);}},{key:"componentWillUnmount",value:function(){clearTimeout(this.clickTimeout),clearTimeout(this.hideTimeout),clearTimeout(this.inputFocusTimeout),clearTimeout(this.inputBlurTimeout),clearTimeout(this.overlayBlurTimeout);}},{key:"getInitialMonthFromProps",value:function(e){var t=e.dayPickerProps,n=e.format,o=void 0;return e.value&&(o=(0, k.isDate)(e.value)?e.value:e.parseDate(e.value,n,t.locale)),t.initialMonth||t.month||o||new Date}},{key:"getInitialStateFromProps",value:function(e){var t=e.dayPickerProps,n=e.formatDate,o=e.format,r=e.typedValue,a=e.value;return e.value&&(0, k.isDate)(e.value)&&(a=n(e.value,o,t.locale)),{value:a,typedValue:r,month:this.getInitialMonthFromProps(e),selectedDays:t.selectedDays}}},{key:"getInput",value:function(){return this.input}},{key:"getDayPicker",value:function(){return this.daypicker}},{key:"updateState",value:function(e,t,n){var o=this,a=this.props,s=a.dayPickerProps,i=a.onDayChange;this.setState({month:e,value:t,typedValue:""},function(){if(n&&n(),i){var t=h({disabled:s.disabledDays,selected:s.selectedDays},s.modifiers),a=(0, D.getModifiersForDay)(e,t).reduce(function(e,t){return h({},e,r({},t,!0))},{});i(e,a,o);}});}},{key:"showDayPicker",value:function(){var e=this,t=this.props,n=t.parseDate,o=t.format,r=t.dayPickerProps,a=this.state,s=a.value;if(!a.showOverlay){var i=s?n(s,o,r.locale):this.getInitialMonthFromProps(this.props);this.setState(function(e){return {showOverlay:!0,month:i||e.month}},function(){e.props.onDayPickerShow&&e.props.onDayPickerShow();});}}},{key:"hideDayPicker",value:function(){var e=this;!1!==this.state.showOverlay&&this.setState({showOverlay:!1},function(){e.props.onDayPickerHide&&e.props.onDayPickerHide();});}},{key:"hideAfterDayClick",value:function(){var e=this;this.props.hideOnDayClick&&(this.hideTimeout=setTimeout(function(){e.overlayHasFocus=!1,e.hideDayPicker();},g));}},{key:"handleInputClick",value:function(e){this.showDayPicker(),this.props.inputProps.onClick&&(e.persist(),this.props.inputProps.onClick(e));}},{key:"handleInputFocus",value:function(e){var t=this;this.showDayPicker(),this.inputFocusTimeout=setTimeout(function(){t.overlayHasFocus=!1;},2),this.props.inputProps.onFocus&&(e.persist(),this.props.inputProps.onFocus(e));}},{key:"handleInputBlur",value:function(e){var t=this;this.inputBlurTimeout=setTimeout(function(){t.overlayHasFocus||t.hideDayPicker();},1),this.props.inputProps.onBlur&&(e.persist(),this.props.inputProps.onBlur(e));}},{key:"handleOverlayFocus",value:function(e){e.preventDefault(),this.overlayHasFocus=!0,this.props.keepFocus&&this.input&&"function"==typeof this.input.focus&&this.input.focus();}},{key:"handleOverlayBlur",value:function(){var e=this;this.overlayBlurTimeout=setTimeout(function(){e.overlayHasFocus=!1;},3);}},{key:"handleInputChange",value:function(e){var t=this.props,n=t.dayPickerProps,o=t.format,r=t.inputProps,a=t.onDayChange,s=t.parseDate;r.onChange&&(e.persist(),r.onChange(e));var i=e.target.value;if(""===i.trim())return this.setState({value:i,typedValue:""}),void(a&&a(void 0,{},this));var u=s(i,o,n.locale);if(!u)return this.setState({value:i,typedValue:i}),void(a&&a(void 0,{},this));this.updateState(u,i);}},{key:"handleInputKeyDown",value:function(e){e.keyCode===b.TAB?this.hideDayPicker():this.showDayPicker(),this.props.inputProps.onKeyDown&&(e.persist(),this.props.inputProps.onKeyDown(e));}},{key:"handleInputKeyUp",value:function(e){e.keyCode===b.ESC?this.hideDayPicker():this.showDayPicker(),this.props.inputProps.onKeyUp&&(e.persist(),this.props.inputProps.onKeyUp(e));}},{key:"handleMonthChange",value:function(e){var t=this;this.setState({month:e},function(){t.props.dayPickerProps&&t.props.dayPickerProps.onMonthChange&&t.props.dayPickerProps.onMonthChange(e);});}},{key:"handleDayClick",value:function(e,t,n){var o=this,r=this.props,a=r.clickUnselectsDay,s=r.dayPickerProps,i=r.onDayChange,u=r.formatDate,l=r.format;if(s.onDayClick&&s.onDayClick(e,t,n),!(t.disabled||s&&s.classNames&&t[s.classNames.disabled])){if(t.selected&&a){var c=this.state.selectedDays;if(Array.isArray(c)){c=c.slice(0);var p=c.indexOf(e);c.splice(p,1);}else c&&(c=null);return this.setState({value:"",typedValue:"",selectedDays:c},this.hideAfterDayClick),void(i&&i(void 0,t,this))}var f=u(e,l,s.locale);this.setState({value:f,typedValue:"",month:e},function(){i&&i(e,t,o),o.hideAfterDayClick();});}}},{key:"renderOverlay",value:function(){var e=this,t=this.props,n=t.classNames,o=t.dayPickerProps,r=t.parseDate,a=t.formatDate,s=t.format,i=this.state,u=i.selectedDays,l=i.value,c=void 0;if(!u&&l){var p=r(l,s,o.locale);p&&(c=p);}else u&&(c=u);var f=void 0;o.todayButton&&(f=function(){return e.updateState(new Date,a(new Date,s,o.locale),e.hideAfterDayClick)});var d=this.props.overlayComponent;return y.default.createElement(d,{classNames:n,month:this.state.month,selectedDay:c,input:this.input,tabIndex:0,onFocus:this.handleOverlayFocus,onBlur:this.handleOverlayBlur},y.default.createElement(m.default,h({ref:function(t){return e.daypicker=t},onTodayButtonClick:f},o,{month:this.state.month,selectedDays:c,onDayClick:this.handleDayClick,onMonthChange:this.handleMonthChange})))}},{key:"render",value:function(){var e=this,t=this.props.component,n=this.props.inputProps;return y.default.createElement("div",{className:this.props.classNames.container,style:this.props.style},y.default.createElement(t,h({ref:function(t){return e.input=t},placeholder:this.props.placeholder},n,{value:this.state.value||this.state.typedValue,onChange:this.handleInputChange,onFocus:this.handleInputFocus,onBlur:this.handleInputBlur,onKeyDown:this.handleInputKeyDown,onKeyUp:this.handleInputKeyUp,onClick:n.disabled?void 0:this.handleInputClick})),this.state.showOverlay&&this.renderOverlay())}}]),t}(y.default.Component);w.defaultProps={dayPickerProps:{},value:"",typedValue:"",placeholder:"YYYY-M-D",format:"L",formatDate:c,parseDate:p,showOverlay:!1,hideOnDayClick:!0,clickUnselectsDay:!1,keepFocus:!0,component:"input",inputProps:{},overlayComponent:l,classNames:{container:"DayPickerInput",overlayWrapper:"DayPickerInput-OverlayWrapper",overlay:"DayPickerInput-Overlay"}},t.default=w;}]).default});

  });

  var DayPicker = unwrapExports(reactDayPicker_min);
  var reactDayPicker_min_1 = reactDayPicker_min.DayPicker;

  const {
    Consumer
  } = Context;
  function getDisplayName(WrappedComponent) {
    return WrappedComponent.displayName || WrappedComponent.name || 'Component';
  }
  function withState (WrappedComponent) {
    const WithState = props => /*#__PURE__*/react.createElement(Consumer, null, state => /*#__PURE__*/react.createElement(WrappedComponent, _extends({}, state, props)));
    WithState.displayName = `WithState(${getDisplayName(WrappedComponent)})`;
    return WithState;
  }

  /**
   * This method is like `_.assignIn` except that it accepts `customizer`
   * which is invoked to produce the assigned values. If `customizer` returns
   * `undefined`, assignment is handled by the method instead. The `customizer`
   * is invoked with five arguments: (objValue, srcValue, key, object, source).
   *
   * **Note:** This method mutates `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @alias extendWith
   * @category Object
   * @param {Object} object The destination object.
   * @param {...Object} sources The source objects.
   * @param {Function} [customizer] The function to customize assigned values.
   * @returns {Object} Returns `object`.
   * @see _.assignWith
   * @example
   *
   * function customizer(objValue, srcValue) {
   *   return _.isUndefined(objValue) ? srcValue : objValue;
   * }
   *
   * var defaults = _.partialRight(_.assignInWith, customizer);
   *
   * defaults({ 'a': 1 }, { 'b': 2 }, { 'a': 3 });
   * // => { 'a': 1, 'b': 2 }
   */
  var assignInWith = _createAssigner(function(object, source, srcIndex, customizer) {
    _copyObject(source, keysIn_1(source), object, customizer);
  });

  var assignInWith_1 = assignInWith;

  /** `Object#toString` result references. */
  var domExcTag = '[object DOMException]',
      errorTag$4 = '[object Error]';

  /**
   * Checks if `value` is an `Error`, `EvalError`, `RangeError`, `ReferenceError`,
   * `SyntaxError`, `TypeError`, or `URIError` object.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an error object, else `false`.
   * @example
   *
   * _.isError(new Error);
   * // => true
   *
   * _.isError(Error);
   * // => false
   */
  function isError(value) {
    if (!isObjectLike_1(value)) {
      return false;
    }
    var tag = _baseGetTag(value);
    return tag == errorTag$4 || tag == domExcTag ||
      (typeof value.message == 'string' && typeof value.name == 'string' && !isPlainObject_1(value));
  }

  var isError_1 = isError;

  /**
   * Attempts to invoke `func`, returning either the result or the caught error
   * object. Any additional arguments are provided to `func` when it's invoked.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Util
   * @param {Function} func The function to attempt.
   * @param {...*} [args] The arguments to invoke `func` with.
   * @returns {*} Returns the `func` result or error object.
   * @example
   *
   * // Avoid throwing errors for invalid selectors.
   * var elements = _.attempt(function(selector) {
   *   return document.querySelectorAll(selector);
   * }, '>_>');
   *
   * if (_.isError(elements)) {
   *   elements = [];
   * }
   */
  var attempt = _baseRest(function(func, args) {
    try {
      return _apply(func, undefined, args);
    } catch (e) {
      return isError_1(e) ? e : new Error(e);
    }
  });

  var attempt_1 = attempt;

  /** Used for built-in method references. */
  var objectProto$t = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$p = objectProto$t.hasOwnProperty;

  /**
   * Used by `_.defaults` to customize its `_.assignIn` use to assign properties
   * of source objects to the destination object for all destination properties
   * that resolve to `undefined`.
   *
   * @private
   * @param {*} objValue The destination value.
   * @param {*} srcValue The source value.
   * @param {string} key The key of the property to assign.
   * @param {Object} object The parent object of `objValue`.
   * @returns {*} Returns the value to assign.
   */
  function customDefaultsAssignIn(objValue, srcValue, key, object) {
    if (objValue === undefined ||
        (eq_1(objValue, objectProto$t[key]) && !hasOwnProperty$p.call(object, key))) {
      return srcValue;
    }
    return objValue;
  }

  var _customDefaultsAssignIn = customDefaultsAssignIn;

  /** Used to escape characters for inclusion in compiled string literals. */
  var stringEscapes = {
    '\\': '\\',
    "'": "'",
    '\n': 'n',
    '\r': 'r',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  /**
   * Used by `_.template` to escape characters for inclusion in compiled string literals.
   *
   * @private
   * @param {string} chr The matched character to escape.
   * @returns {string} Returns the escaped character.
   */
  function escapeStringChar(chr) {
    return '\\' + stringEscapes[chr];
  }

  var _escapeStringChar = escapeStringChar;

  /** Used to match template delimiters. */
  var reInterpolate = /<%=([\s\S]+?)%>/g;

  var _reInterpolate = reInterpolate;

  /**
   * The base implementation of `_.propertyOf` without support for deep paths.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Function} Returns the new accessor function.
   */
  function basePropertyOf(object) {
    return function(key) {
      return object == null ? undefined : object[key];
    };
  }

  var _basePropertyOf = basePropertyOf;

  /** Used to map characters to HTML entities. */
  var htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };

  /**
   * Used by `_.escape` to convert characters to HTML entities.
   *
   * @private
   * @param {string} chr The matched character to escape.
   * @returns {string} Returns the escaped character.
   */
  var escapeHtmlChar = _basePropertyOf(htmlEscapes);

  var _escapeHtmlChar = escapeHtmlChar;

  /** Used to match HTML entities and HTML characters. */
  var reUnescapedHtml = /[&<>"']/g,
      reHasUnescapedHtml = RegExp(reUnescapedHtml.source);

  /**
   * Converts the characters "&", "<", ">", '"', and "'" in `string` to their
   * corresponding HTML entities.
   *
   * **Note:** No other characters are escaped. To escape additional
   * characters use a third-party library like [_he_](https://mths.be/he).
   *
   * Though the ">" character is escaped for symmetry, characters like
   * ">" and "/" don't need escaping in HTML and have no special meaning
   * unless they're part of a tag or unquoted attribute value. See
   * [Mathias Bynens's article](https://mathiasbynens.be/notes/ambiguous-ampersands)
   * (under "semi-related fun fact") for more details.
   *
   * When working with HTML you should always
   * [quote attribute values](http://wonko.com/post/html-escaping) to reduce
   * XSS vectors.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category String
   * @param {string} [string=''] The string to escape.
   * @returns {string} Returns the escaped string.
   * @example
   *
   * _.escape('fred, barney, & pebbles');
   * // => 'fred, barney, &amp; pebbles'
   */
  function escape$1(string) {
    string = toString_1(string);
    return (string && reHasUnescapedHtml.test(string))
      ? string.replace(reUnescapedHtml, _escapeHtmlChar)
      : string;
  }

  var _escape = escape$1;

  /** Used to match template delimiters. */
  var reEscape = /<%-([\s\S]+?)%>/g;

  var _reEscape = reEscape;

  /** Used to match template delimiters. */
  var reEvaluate = /<%([\s\S]+?)%>/g;

  var _reEvaluate = reEvaluate;

  /**
   * By default, the template delimiters used by lodash are like those in
   * embedded Ruby (ERB) as well as ES2015 template strings. Change the
   * following template settings to use alternative delimiters.
   *
   * @static
   * @memberOf _
   * @type {Object}
   */
  var templateSettings = {

    /**
     * Used to detect `data` property values to be HTML-escaped.
     *
     * @memberOf _.templateSettings
     * @type {RegExp}
     */
    'escape': _reEscape,

    /**
     * Used to detect code to be evaluated.
     *
     * @memberOf _.templateSettings
     * @type {RegExp}
     */
    'evaluate': _reEvaluate,

    /**
     * Used to detect `data` property values to inject.
     *
     * @memberOf _.templateSettings
     * @type {RegExp}
     */
    'interpolate': _reInterpolate,

    /**
     * Used to reference the data object in the template text.
     *
     * @memberOf _.templateSettings
     * @type {string}
     */
    'variable': '',

    /**
     * Used to import variables into the compiled template.
     *
     * @memberOf _.templateSettings
     * @type {Object}
     */
    'imports': {

      /**
       * A reference to the `lodash` function.
       *
       * @memberOf _.templateSettings.imports
       * @type {Function}
       */
      '_': { 'escape': _escape }
    }
  };

  var templateSettings_1 = templateSettings;

  /** Error message constants. */
  var INVALID_TEMPL_VAR_ERROR_TEXT = 'Invalid `variable` option passed into `_.template`';

  /** Used to match empty string literals in compiled template source. */
  var reEmptyStringLeading = /\b__p \+= '';/g,
      reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
      reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;

  /**
   * Used to validate the `validate` option in `_.template` variable.
   *
   * Forbids characters which could potentially change the meaning of the function argument definition:
   * - "()," (modification of function parameters)
   * - "=" (default value)
   * - "[]{}" (destructuring of function parameters)
   * - "/" (beginning of a comment)
   * - whitespace
   */
  var reForbiddenIdentifierChars = /[()=,{}\[\]\/\s]/;

  /**
   * Used to match
   * [ES template delimiters](http://ecma-international.org/ecma-262/7.0/#sec-template-literal-lexical-components).
   */
  var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;

  /** Used to ensure capturing order of template delimiters. */
  var reNoMatch = /($^)/;

  /** Used to match unescaped characters in compiled string literals. */
  var reUnescapedString = /['\n\r\u2028\u2029\\]/g;

  /** Used for built-in method references. */
  var objectProto$u = Object.prototype;

  /** Used to check objects for own properties. */
  var hasOwnProperty$q = objectProto$u.hasOwnProperty;

  /**
   * Creates a compiled template function that can interpolate data properties
   * in "interpolate" delimiters, HTML-escape interpolated data properties in
   * "escape" delimiters, and execute JavaScript in "evaluate" delimiters. Data
   * properties may be accessed as free variables in the template. If a setting
   * object is given, it takes precedence over `_.templateSettings` values.
   *
   * **Note:** In the development build `_.template` utilizes
   * [sourceURLs](http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl)
   * for easier debugging.
   *
   * For more information on precompiling templates see
   * [lodash's custom builds documentation](https://lodash.com/custom-builds).
   *
   * For more information on Chrome extension sandboxes see
   * [Chrome's extensions documentation](https://developer.chrome.com/extensions/sandboxingEval).
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category String
   * @param {string} [string=''] The template string.
   * @param {Object} [options={}] The options object.
   * @param {RegExp} [options.escape=_.templateSettings.escape]
   *  The HTML "escape" delimiter.
   * @param {RegExp} [options.evaluate=_.templateSettings.evaluate]
   *  The "evaluate" delimiter.
   * @param {Object} [options.imports=_.templateSettings.imports]
   *  An object to import into the template as free variables.
   * @param {RegExp} [options.interpolate=_.templateSettings.interpolate]
   *  The "interpolate" delimiter.
   * @param {string} [options.sourceURL='templateSources[n]']
   *  The sourceURL of the compiled template.
   * @param {string} [options.variable='obj']
   *  The data object variable name.
   * @param- {Object} [guard] Enables use as an iteratee for methods like `_.map`.
   * @returns {Function} Returns the compiled template function.
   * @example
   *
   * // Use the "interpolate" delimiter to create a compiled template.
   * var compiled = _.template('hello <%= user %>!');
   * compiled({ 'user': 'fred' });
   * // => 'hello fred!'
   *
   * // Use the HTML "escape" delimiter to escape data property values.
   * var compiled = _.template('<b><%- value %></b>');
   * compiled({ 'value': '<script>' });
   * // => '<b>&lt;script&gt;</b>'
   *
   * // Use the "evaluate" delimiter to execute JavaScript and generate HTML.
   * var compiled = _.template('<% _.forEach(users, function(user) { %><li><%- user %></li><% }); %>');
   * compiled({ 'users': ['fred', 'barney'] });
   * // => '<li>fred</li><li>barney</li>'
   *
   * // Use the internal `print` function in "evaluate" delimiters.
   * var compiled = _.template('<% print("hello " + user); %>!');
   * compiled({ 'user': 'barney' });
   * // => 'hello barney!'
   *
   * // Use the ES template literal delimiter as an "interpolate" delimiter.
   * // Disable support by replacing the "interpolate" delimiter.
   * var compiled = _.template('hello ${ user }!');
   * compiled({ 'user': 'pebbles' });
   * // => 'hello pebbles!'
   *
   * // Use backslashes to treat delimiters as plain text.
   * var compiled = _.template('<%= "\\<%- value %\\>" %>');
   * compiled({ 'value': 'ignored' });
   * // => '<%- value %>'
   *
   * // Use the `imports` option to import `jQuery` as `jq`.
   * var text = '<% jq.each(users, function(user) { %><li><%- user %></li><% }); %>';
   * var compiled = _.template(text, { 'imports': { 'jq': jQuery } });
   * compiled({ 'users': ['fred', 'barney'] });
   * // => '<li>fred</li><li>barney</li>'
   *
   * // Use the `sourceURL` option to specify a custom sourceURL for the template.
   * var compiled = _.template('hello <%= user %>!', { 'sourceURL': '/basic/greeting.jst' });
   * compiled(data);
   * // => Find the source of "greeting.jst" under the Sources tab or Resources panel of the web inspector.
   *
   * // Use the `variable` option to ensure a with-statement isn't used in the compiled template.
   * var compiled = _.template('hi <%= data.user %>!', { 'variable': 'data' });
   * compiled.source;
   * // => function(data) {
   * //   var __t, __p = '';
   * //   __p += 'hi ' + ((__t = ( data.user )) == null ? '' : __t) + '!';
   * //   return __p;
   * // }
   *
   * // Use custom template delimiters.
   * _.templateSettings.interpolate = /{{([\s\S]+?)}}/g;
   * var compiled = _.template('hello {{ user }}!');
   * compiled({ 'user': 'mustache' });
   * // => 'hello mustache!'
   *
   * // Use the `source` property to inline compiled templates for meaningful
   * // line numbers in error messages and stack traces.
   * fs.writeFileSync(path.join(process.cwd(), 'jst.js'), '\
   *   var JST = {\
   *     "main": ' + _.template(mainText).source + '\
   *   };\
   * ');
   */
  function template(string, options, guard) {
    // Based on John Resig's `tmpl` implementation
    // (http://ejohn.org/blog/javascript-micro-templating/)
    // and Laura Doktorova's doT.js (https://github.com/olado/doT).
    var settings = templateSettings_1.imports._.templateSettings || templateSettings_1;

    if (guard && _isIterateeCall(string, options, guard)) {
      options = undefined;
    }
    string = toString_1(string);
    options = assignInWith_1({}, options, settings, _customDefaultsAssignIn);

    var imports = assignInWith_1({}, options.imports, settings.imports, _customDefaultsAssignIn),
        importsKeys = keys_1(imports),
        importsValues = _baseValues(imports, importsKeys);

    var isEscaping,
        isEvaluating,
        index = 0,
        interpolate = options.interpolate || reNoMatch,
        source = "__p += '";

    // Compile the regexp to match each delimiter.
    var reDelimiters = RegExp(
      (options.escape || reNoMatch).source + '|' +
      interpolate.source + '|' +
      (interpolate === _reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
      (options.evaluate || reNoMatch).source + '|$'
    , 'g');

    // Use a sourceURL for easier debugging.
    // The sourceURL gets injected into the source that's eval-ed, so be careful
    // to normalize all kinds of whitespace, so e.g. newlines (and unicode versions of it) can't sneak in
    // and escape the comment, thus injecting code that gets evaled.
    var sourceURL = hasOwnProperty$q.call(options, 'sourceURL')
      ? ('//# sourceURL=' +
         (options.sourceURL + '').replace(/\s/g, ' ') +
         '\n')
      : '';

    string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
      interpolateValue || (interpolateValue = esTemplateValue);

      // Escape characters that can't be included in string literals.
      source += string.slice(index, offset).replace(reUnescapedString, _escapeStringChar);

      // Replace delimiters with snippets.
      if (escapeValue) {
        isEscaping = true;
        source += "' +\n__e(" + escapeValue + ") +\n'";
      }
      if (evaluateValue) {
        isEvaluating = true;
        source += "';\n" + evaluateValue + ";\n__p += '";
      }
      if (interpolateValue) {
        source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
      }
      index = offset + match.length;

      // The JS engine embedded in Adobe products needs `match` returned in
      // order to produce the correct `offset` value.
      return match;
    });

    source += "';\n";

    // If `variable` is not specified wrap a with-statement around the generated
    // code to add the data object to the top of the scope chain.
    var variable = hasOwnProperty$q.call(options, 'variable') && options.variable;
    if (!variable) {
      source = 'with (obj) {\n' + source + '\n}\n';
    }
    // Throw an error if a forbidden character was found in `variable`, to prevent
    // potential command injection attacks.
    else if (reForbiddenIdentifierChars.test(variable)) {
      throw new Error(INVALID_TEMPL_VAR_ERROR_TEXT);
    }

    // Cleanup code by stripping empty strings.
    source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
      .replace(reEmptyStringMiddle, '$1')
      .replace(reEmptyStringTrailing, '$1;');

    // Frame code as the function body.
    source = 'function(' + (variable || 'obj') + ') {\n' +
      (variable
        ? ''
        : 'obj || (obj = {});\n'
      ) +
      "var __t, __p = ''" +
      (isEscaping
         ? ', __e = _.escape'
         : ''
      ) +
      (isEvaluating
        ? ', __j = Array.prototype.join;\n' +
          "function print() { __p += __j.call(arguments, '') }\n"
        : ';\n'
      ) +
      source +
      'return __p\n}';

    var result = attempt_1(function() {
      return Function(importsKeys, sourceURL + 'return ' + source)
        .apply(undefined, importsValues);
    });

    // Provide the compiled function's source by its `toString` method or
    // the `source` property as a convenience for inlining compiled templates.
    result.source = source;
    if (isError_1(result)) {
      throw result;
    }
    return result;
  }

  var template_1 = template;

  const Error$1 = _ref => {
    let {
      error,
      t,
      renderErrorMessage
    } = _ref;
    const templateErrorMessageIsString = !isFunction_1(renderErrorMessage);
    const templateErrorMessage = templateErrorMessageIsString ? template_1(renderErrorMessage) : renderErrorMessage;
    if (templateErrorMessageIsString) {
      return /*#__PURE__*/react.createElement("div", {
        dangerouslySetInnerHTML: {
          __html: templateErrorMessage({
            t,
            error
          })
        }
      });
    }
    return templateErrorMessage({
      t,
      error
    });
  };
  Error$1.propTypes = {
    error: propTypes.string.isRequired,
    t: propTypes.func.isRequired,
    renderErrorMessage: propTypes.oneOfType([propTypes.string, propTypes.func])
  };
  var Error$2 = withState(Error$1);

  var isArray$2 = Array.isArray;

  function cc$1(obj) {
    var out = "";

    if (typeof obj === "string" || typeof obj === "number") return obj || ""

    if (isArray$2(obj))
      for (var k = 0, tmp; k < obj.length; k++) {
        if ((tmp = cc$1(obj[k])) !== "") {
          out += (out && " ") + tmp;
        }
      }
    else
      for (var k in obj) {
        if (obj.hasOwnProperty(k) && obj[k]) out += (out && " ") + k;
      }

    return out
  }

  const Day = _ref => {
    let {
      accessCode,
      day,
      hidePrices,
      defaultLengthOfStay,
      modifiers,
      labelCheckOut,
      hasNoProductError,
      isSelecting,
      isSingleDayUse,
      locale,
      loading,
      pricePrevDay,
      price,
      renderDayNumber,
      renderDayPrice,
      templatePriceIsString,
      templateDayIsString,
      priceForStay,
      t,
      escapeKeyPressed,
      setEscapeKey,
      lengthOfStay,
      isDepartureBeforeArrival,
      availabilityForStay
    } = _ref;
    const dayFormatted = dayjs_min(day).format('YYYY-MM-DD');
    const isFirstSelected = modifiers['start'];
    const isLastSelected = modifiers['end'];
    const isSelected = modifiers['DayPicker-Day--selected'] && !((isDepartureBeforeArrival || isSingleDayUse) && !isFirstSelected && !isLastSelected);
    const priceData = price;
    const {
      restrictionCause,
      restrictionCauseLabel
    } = getRestrictionCause(priceData, t, pricePrevDay, availabilityForStay, hasNoProductError);
    const isPast = modifiers['DayPicker-Day--disabled'];
    const isDisabled = modifiers['DayPicker-Day--disabled'] || isRestrictionDisablingDay(restrictionCause);
    const priceDetails = get_1(priceData, 'Price', {});
    const displayAllocationIndicator = shouldDisplayAllocationIndicator(priceData, accessCode);
    const templateDayArguments = {
      locale,
      modifiers,
      day,
      dayFormatted,
      displayAllocationIndicator
    };
    const isEscapedHoverDate = escapeKeyPressed === `day-${dayFormatted}`;
    const templatePriceArguments = {
      locale,
      modifiers,
      day,
      dayFormatted,
      defaultLengthOfStay,
      loading,
      ...priceDetails,
      displayAllocationIndicator,
      priceForStay,
      lengthOfStay
    };
    if (isEscapedHoverDate && !isLastSelected) {
      setEscapeKey(true);
    }
    const dailyStayAvailability = get_1(availabilityForStay, dayFormatted);
    const isStayAvailable = get_1(dailyStayAvailability, 'available', true);
    const isPriceVisible = shouldDisplayPrice({
      priceData,
      isDisabled,
      hidePrices,
      isLastSelected,
      isFirstSelected,
      isSelecting,
      isStayAvailable
    });
    const displayRestrictionTooltip = !(escapeKeyPressed && isFirstSelected && !isLastSelected) && !isEscapedHoverDate && restrictionCause && !isPast && isSelecting && !loading;
    const displayPriceTooltip = isPriceVisible && !(escapeKeyPressed && (isEscapedHoverDate || isFirstSelected && !isLastSelected)) && (isFirstSelected || isLastSelected) && isSelecting && !loading;
    const hasStayPriceForSelectedDay = isSelected && !isLastSelected && !isEmpty_1(priceForStay);
    const shouldRenderPrice = isPriceVisible || hasStayPriceForSelectedDay && isStayAvailable && !isDisabled;
    return /*#__PURE__*/react.createElement("div", {
      className: cc$1(['shs-widgets--calendar--day-container p-1', `shs-widgets--calendar--day__${restrictionCause}`, {
        'text-info font-weight-bold': modifiers['today'] && !isSelected,
        'bg-primary-opacity': isSelected && !isFirstSelected && !isDisabled && isSelecting && !isLastSelected,
        'is-between': isSelected && !isFirstSelected && !isDisabled && !isLastSelected,
        'bg-primary text-white': isFirstSelected || isLastSelected || isSelected && !isSelecting,
        'bg-danger text-white': isSelected && isDisabled && !isLastSelected,
        'day-disabled text-muted': isDisabled && !isSelected,
        'day-disabled-restricted': restrictionCause && isDisabled,
        'rounded-left': isFirstSelected || isLastSelected && isDepartureBeforeArrival,
        'rounded-right': isLastSelected || isFirstSelected && isDepartureBeforeArrival,
        selected: isSelected
      }])
    }, displayAllocationIndicator && !isDisabled && /*#__PURE__*/react.createElement("span", {
      className: "shs-widgets--calendar--day__allocation_indicator"
    }), isDisabled && !isLastSelected && !isPast && /*#__PURE__*/react.createElement("svg", {
      className: "shs-widgets--calendar--day__unavailable"
    }, /*#__PURE__*/react.createElement("line", {
      x1: "0",
      y1: "0",
      x2: "100%",
      y2: "100%"
    }), /*#__PURE__*/react.createElement("line", {
      x1: "0",
      y1: "100%",
      x2: "100%",
      y2: "0"
    })), displayRestrictionTooltip && !displayPriceTooltip && /*#__PURE__*/react.createElement("span", {
      className: `shs-widgets--calendar--day__tooltip shs-widgets--calendar--day__tooltip__restriction badge badge-dark badge-pill`
    }, restrictionCauseLabel), displayPriceTooltip && !displayRestrictionTooltip && /*#__PURE__*/react.createElement("span", {
      className: 'shs-widgets--calendar--day__tooltip shs-widgets--calendar--day__tooltip__price badge badge-dark badge-pill d-block'
    }, renderDayPrice({
      isTooltip: true,
      ...templatePriceArguments
    })), displayPriceTooltip && displayRestrictionTooltip && /*#__PURE__*/react.createElement("span", {
      className: 'shs-widgets--calendar--day__tooltip shs-widgets--calendar--day__tooltip__restriction-price badge badge-dark d-block'
    }, renderDayPrice({
      isTooltip: true,
      ...templatePriceArguments
    }), /*#__PURE__*/react.createElement("div", {
      className: "shs-widgets--calendar--day__tooltip-bottom"
    }, restrictionCauseLabel)), templateDayIsString ? /*#__PURE__*/react.createElement("span", {
      dangerouslySetInnerHTML: {
        __html: renderDayNumber(templateDayArguments)
      }
    }) : renderDayNumber(templateDayArguments), isLastSelected && !isSelecting && /*#__PURE__*/react.createElement("span", {
      className: `shs-widgets--calendar--day__price shs-widgets--calendar--day__check-out d-block`
    }, labelCheckOut), shouldRenderPrice && (templatePriceIsString ? /*#__PURE__*/react.createElement("span", {
      dangerouslySetInnerHTML: {
        __html: renderDayPrice(templatePriceArguments)
      }
    }) : renderDayPrice(templatePriceArguments)));
  };
  Day.propTypes = {
    day: propTypes.instanceOf(Date).isRequired,
    defaultLengthOfStay: propTypes.number,
    locale: propTypes.string.isRequired,
    modifiers: propTypes.object.isRequired,
    t: propTypes.func.isRequired,
    accessCode: propTypes.string,
    availabilityForStay: propTypes.object,
    hasNoProductError: propTypes.bool,
    hidePrices: propTypes.bool,
    isSelecting: propTypes.bool,
    isSingleDayUse: propTypes.bool,
    labelCheckOut: propTypes.string,
    loading: propTypes.bool,
    price: propTypes.shape({
      Available: propTypes.bool
    }),
    priceForStay: propTypes.object,
    pricePrevDay: propTypes.object,
    renderDayNumber: propTypes.oneOfType([propTypes.string, propTypes.func]),
    renderDayPrice: propTypes.oneOfType([propTypes.string, propTypes.func]),
    templateDayIsString: propTypes.bool,
    templatePriceIsString: propTypes.bool
  };

  const Legend = _ref => {
    let {
      t,
      renderLegend,
      error,
      loading,
      restrictionToDisplay,
      restrictionStay
    } = _ref;
    const templateLegendIsString = !isFunction_1(renderLegend);
    const templateLegend = templateLegendIsString ? template_1(renderLegend) : renderLegend;
    if (templateLegendIsString) {
      return /*#__PURE__*/react.createElement("div", {
        dangerouslySetInnerHTML: {
          __html: templateLegend({
            t,
            error,
            loading,
            restrictionStay,
            restrictionToDisplay
          })
        }
      });
    }
    return templateLegend({
      t,
      error,
      loading,
      restrictionToDisplay,
      restrictionStay
    });
  };
  Legend.propTypes = {
    t: propTypes.func.isRequired,
    error: propTypes.string,
    renderLegend: propTypes.oneOfType([propTypes.string, propTypes.func]),
    restrictionToDisplay: propTypes.object,
    restrictionStay: propTypes.object
  };
  var Legend$1 = withState(Legend);

  const Submit = props => {
    const {
      t,
      onSubmit,
      from,
      to,
      renderMessage,
      renderRestrictionMessage,
      renderSubmitButton,
      priceForStay,
      locale,
      includeTaxes,
      taxFeeDisplayOption,
      restrictionStay
    } = props;
    const isSubmitDisabled = !from || !to;
    const templateRestrictionIsString = !isFunction_1(renderRestrictionMessage);
    const templateRestriction = templateRestrictionIsString ? template_1(renderRestrictionMessage) : renderRestrictionMessage;
    const templateSubmitButtonIsString = !isFunction_1(renderSubmitButton);
    const templateSubmitButton = templateSubmitButtonIsString ? template_1(renderSubmitButton) : renderSubmitButton;
    const templateSubmitButtonProps = {
      onSubmit,
      isSubmitDisabled,
      t,
      priceForStay,
      locale,
      taxFeeDisplayOption,
      from,
      to,
      nights: dayjs_min(to).diff(from, 'day'),
      includeTaxes
    };
    const isRestrictionCause = !!(restrictionStay && restrictionStay.Cause);
    return /*#__PURE__*/react.createElement("div", {
      className: `shs-widgets--calendar--submit`
    }, isRestrictionCause && templateRestrictionIsString && /*#__PURE__*/react.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: templateRestriction({
          ...restrictionStay,
          t
        })
      }
    }), isRestrictionCause && !templateRestrictionIsString && templateRestriction({
      ...restrictionStay,
      t
    }), !isRestrictionCause && renderMessage && renderMessage(), templateSubmitButtonIsString && /*#__PURE__*/react.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: templateSubmitButton(templateSubmitButtonProps)
      }
    }), !templateSubmitButtonIsString && templateSubmitButton(templateSubmitButtonProps));
  };
  Submit.propTypes = {
    t: propTypes.func.isRequired,
    onSubmit: propTypes.func.isRequired,
    from: propTypes.instanceOf(Date),
    includeTaxes: propTypes.bool,
    locale: propTypes.string,
    priceForStay: propTypes.object,
    renderMessage: propTypes.func,
    renderRestrictionMessage: propTypes.oneOfType([propTypes.string, propTypes.func]),
    renderSubmitButton: propTypes.oneOfType([propTypes.string, propTypes.func]),
    restrictionStay: propTypes.object,
    restrictionToDisplay: propTypes.object,
    restrictions: propTypes.arrayOf(propTypes.shape({
      day: propTypes.string.isRequired,
      LeastRestrictiveFailure: propTypes.shape({
        AdditionalInformation: propTypes.string,
        Cause: propTypes.string
      })
    })),
    taxFeeDisplayOption: propTypes.string,
    to: propTypes.instanceOf(Date)
  };
  var Submit$1 = withState(Submit);

  const AccessibilityNotifications = _ref => {
    let {
      message = ''
    } = _ref;
    if (!message) {
      return null;
    }
    return /*#__PURE__*/react.createElement("div", {
      className: "sr-only",
      role: "alert"
    }, message);
  };
  AccessibilityNotifications.propTypes = {
    message: propTypes.string
  };

  const CalendarComponent = _ref => {
    let {
      accessCode,
      className,
      error,
      defaultLengthOfStay,
      loading,
      currency,
      from,
      hideLegend,
      hidePrices,
      hideSubmit,
      isSingleDayUse,
      to,
      locale,
      enteredTo,
      initialMonth,
      isInitialLoadFinished,
      calendarConfig,
      response,
      renderDayNumber,
      renderDayPrice,
      renderSpinner,
      setDates,
      priceType,
      t,
      onMouseEnter,
      onMonthChange,
      weekdayLength,
      priceForStay,
      displayCurrency,
      children,
      escapeKeyPressed,
      setEscapeKey,
      availabilityForStay
    } = _ref;
    const lengthOfStaySelected = dayjs_min(to).diff(from, 'day');
    const modifiers = {
      start: from,
      end: enteredTo
    };
    const selectedDays = [from, {
      from,
      to: enteredTo
    }];
    const currencyDetails = get_1(response, 'currency');
    const templateDayIsString = !isFunction_1(renderDayNumber);
    const templateDayNumber = templateDayIsString ? template_1(renderDayNumber) : renderDayNumber;
    const templatePriceIsString = !isFunction_1(renderDayPrice);
    const templatePrice = templatePriceIsString ? template_1(renderDayPrice) : renderDayPrice;
    const templateSpinnerIsString = !isFunction_1(renderSpinner);
    const templateSpinner = templateSpinnerIsString ? template_1(renderSpinner) : renderSpinner;
    const infoMessage = isSingleDayUse ? `shs-widgets--calendar.infoMessageDayUse${priceType}Price` : `shs-widgets--calendar.infoMessage${priceType}Price`;
    const isSelecting = Boolean(from && !to || isSingleDayUse && from);
    const [displayedMonthNames, setDisplayedMonthNames] = react_6([]);
    const [calendarInstructions, setCalendarInstructions] = react_6('');
    const hasNoProductError = get_1(response, 'hasNoProductError', false);
    const getInitialAnnouncements = () => {
      const initialMonthsNames = getDisplayedMonthNames(initialMonth, calendarConfig.numberOfMonths);
      setCalendarInstructions(`${t('shs-widgets--calendar.instructions')}. ${t('shs-widgets--calendar.useArrowKeys')}.`);
      setDisplayedMonthNames(initialMonthsNames);
    };
    react_7(() => {
      if (!isInitialLoadFinished) {
        return;
      }
      getInitialAnnouncements();
    }, [isInitialLoadFinished]);
    const displayedMonthsMessage = getDisplayedMonthsMessage(displayedMonthNames);
    function getDisplayedMonthNames(startDate, numberOfMonths) {
      const date = new Date(startDate);
      const result = [];
      for (let i = 0; i < numberOfMonths; i++) {
        const monthNumber = date.getMonth();
        const monthsName = date.toLocaleString(locale, {
          month: 'long'
        });
        const fullYear = date.getFullYear();
        const fullMonthName = `${monthsName} ${fullYear}`;
        date.setMonth(monthNumber + 1);
        result.push(fullMonthName);
      }
      return result;
    }
    function getDisplayedMonthsMessage(monthsNames) {
      if (!monthsNames.length) {
        return '';
      }
      return t('shs-widgets--calendar.currentlySelectedMonths', {
        value: monthsNames.join(', ')
      });
    }
    return /*#__PURE__*/react.createElement("div", {
      className: `shs-widgets--calendar ${className}`,
      role: "application"
    }, /*#__PURE__*/react.createElement("div", {
      className: "shs-widgets--calendar__container",
      role: "presentation"
    }, /*#__PURE__*/react.createElement(AccessibilityNotifications, {
      message: calendarInstructions
    }), /*#__PURE__*/react.createElement(AccessibilityNotifications, {
      message: displayedMonthsMessage
    }), error && /*#__PURE__*/react.createElement(Error$2, {
      error: error
    }), loading && templateSpinnerIsString && /*#__PURE__*/react.createElement("div", {
      dangerouslySetInnerHTML: {
        __html: templateSpinner()
      }
    }), loading && !templateSpinnerIsString && templateSpinner(), !hidePrices && /*#__PURE__*/react.createElement("p", {
      className: "shs-widgets--calendar__info-message"
    }, t(infoMessage, {
      currency: displayCurrency || currency,
      ...(!isSingleDayUse && {
        los: defaultLengthOfStay
      })
    })), /*#__PURE__*/react.createElement(DayPicker, _extends({
      className: "shs-widgets--calendar--component",
      selectedDays: selectedDays,
      modifiers: modifiers,
      fromMonth: new Date(),
      renderDay: (day, modifiers) => /*#__PURE__*/react.createElement(Day, {
        lengthOfStay: lengthOfStaySelected,
        accessCode: accessCode,
        day: day,
        hidePrices: hidePrices,
        modifiers: modifiers,
        labelCheckOut: t('shs-widgets--calendar.checkOut'),
        locale: locale,
        loading: loading,
        defaultLengthOfStay: defaultLengthOfStay,
        currency: currencyDetails,
        hasNoProductError: hasNoProductError,
        isSelecting: isSelecting,
        isSingleDayUse: isSingleDayUse,
        price: get_1(response, `prices[${dayjs_min(day).format('YYYY-MM-DD')}]`),
        priceForStay: priceForStay,
        pricePrevDay: get_1(response, `prices[${dayjs_min(day).subtract(1, 'day').format('YYYY-MM-DD')}]`),
        renderDayNumber: templateDayNumber,
        renderDayPrice: templatePrice,
        templateDayIsString: templateDayIsString,
        templatePriceIsString: templatePriceIsString,
        t: t,
        escapeKeyPressed: escapeKeyPressed,
        setEscapeKey: setEscapeKey,
        isDepartureBeforeArrival: !to && from > enteredTo,
        availabilityForStay: availabilityForStay
      }),
      onDayClick: (day, modifiers, e) => {
        if (modifiers['DayPicker-Day--disabled']) {
          return;
        }
        return setDates(day);
      },
      onDayMouseEnter: (day, modifiers) => {
        if (modifiers['DayPicker-Day--disabled']) {
          return;
        }
        onMouseEnter(day);
      },
      onMonthChange: day => {
        const displayedMonthNames = getDisplayedMonthNames(day, calendarConfig.numberOfMonths);
        setDisplayedMonthNames(displayedMonthNames);
        onMonthChange(day, calendarConfig.numberOfMonths);
      },
      captionElement: _ref2 => {
        let {
          date
        } = _ref2;
        const options = {
          year: 'numeric',
          month: 'long'
        };
        const formattedDate = new Intl.DateTimeFormat(locale, options).format(date);
        return /*#__PURE__*/react.createElement("div", {
          className: "DayPicker-Caption font-weight-bold h5 text-secondary"
        }, /*#__PURE__*/react.createElement("div", null, formattedDate));
      },
      firstDayOfWeek: moment$1.getFirstDayOfWeek(locale),
      weekdaysShort: getDaysOfWeek(locale, weekdayLength)
    }, calendarConfig, {
      initialMonth: initialMonth,
      disabledDays: [...calendarConfig.disabledDays, ...get_1(response, 'disabledDays', [])],
      localeUtils: {
        ...moment$1,
        formatDay: day => formatDay(day, response, locale, modifiers, t, hidePrices),
        ...calendarConfig.localeUtils
      },
      locale: locale
    }))), !hideLegend && /*#__PURE__*/react.createElement(Legend$1, null), children, !hideSubmit && /*#__PURE__*/react.createElement(Submit$1, null));
  };
  CalendarComponent.propTypes = {
    setDates: propTypes.func.isRequired,
    t: propTypes.func.isRequired,
    onMonthChange: propTypes.func.isRequired,
    onMouseEnter: propTypes.func.isRequired,
    accessCode: propTypes.string,
    availabilityForStay: propTypes.object,
    calendarConfig: propTypes.object,
    children: propTypes.any,
    className: propTypes.string,
    currency: propTypes.string,
    defaultLengthOfStay: propTypes.number,
    enteredTo: propTypes.instanceOf(Date),
    error: propTypes.string,
    from: propTypes.instanceOf(Date),
    hideLegend: propTypes.bool,
    hidePrices: propTypes.bool,
    hideSubmit: propTypes.bool,
    initialMonth: propTypes.instanceOf(Date),
    isInitialLoadFinished: propTypes.bool,
    isSingleDayUse: propTypes.bool,
    loading: propTypes.bool,
    locale: propTypes.string,
    priceForStay: propTypes.object,
    priceType: propTypes.string,
    renderDayNumber: propTypes.oneOfType([propTypes.string, propTypes.func]),
    renderDayPrice: propTypes.oneOfType([propTypes.string, propTypes.func]),
    renderErrorMessage: propTypes.oneOfType([propTypes.string, propTypes.func]),
    renderSpinner: propTypes.oneOfType([propTypes.string, propTypes.func]),
    response: propTypes.object,
    to: propTypes.instanceOf(Date)
  };
  var CalendarComponent$1 = withState(CalendarComponent);

  var defaultLabels = {
    'shs-widgets--generic.error.InvalidRate.title': 'The rate you entered is invalid',
    'shs-widgets--generic.error.InvalidRate.description': '',
    'shs-widgets--generic.error.InvalidPromoOrCorporateCode.title': 'The promo code you entered is invalid',
    'shs-widgets--generic.error.InvalidPromoOrCorporateCode.description': 'Enter a different code or continue shopping below.',
    'shs-widgets--generic.error.InvalidGroupCode.title': 'The group code you entered is invalid',
    'shs-widgets--generic.error.InvalidGroupCode.description': 'Enter a different code or continue shopping below.',
    'shs-widgets--generic.error.ERROR.title': 'Oops..',
    'shs-widgets--generic.error.ERROR.description': 'Something went wrong. Please try again in a minute.',
    'shs-widgets--generic.error.InvalidChainId.title': 'Invalid chain ID',
    'shs-widgets--generic.error.InvalidChainId.description': 'Please make sure you are providing a valid chain ID',
    'shs-widgets--generic.error.InvalidApiKey.title': 'Invalid API Key',
    'shs-widgets--generic.error.InvalidApiKey.description': 'Your API Key is invalid. Please make sure you typed it correct.',
    'shs-widgets--generic.error.ReferrerNotAllowed.title': 'Invalid domain',
    'shs-widgets--generic.error.ReferrerNotAllowed.description': 'Your website is missing an access for this widget.',
    'shs-widgets--generic.error.InvalidRequest.title': 'Error',
    'shs-widgets--generic.error.InvalidRequest.description': 'Something wrong with your configuration. Please validate parameters.',
    'shs-widgets--generic.error.InvalidHotelId.title': 'Invalid hotel ID',
    'shs-widgets--generic.error.InvalidHotelId.description': 'Please make sure you are providing a valid hotel ID',
    'shs-widgets--calendar.error.InvalidApiKey.title': 'Invalid API Key',
    'shs-widgets--calendar.checkIn': 'Check in',
    'shs-widgets--calendar.checkOut': 'Check out',
    'shs-widgets--calendar.totalPrice': 'From {price} total for {nights} night(s)',
    'shs-widgets--calendar.includingTax': 'Including taxes and fees',
    'shs-widgets--calendar.excludingTax': 'Excluding taxes and fees',
    'shs-widgets--calendar.includeFeesOnly': 'Including all fees',
    'shs-widgets--calendar.infoMessageMinimumPrice': 'We\'\re showing the best available price for {los} night(s),' + ' based on the number of guests',
    'shs-widgets--calendar.infoMessageMaximumPrice': 'We\'\re showing the highest available price for {los} night(s),' + ' based on the number of guests',
    'shs-widgets--calendar.infoMessageAveragePrice': 'We\'\re showing the average available price for {los} night(s),' + ' based on the number of guests',
    'shs-widgets--calendar.infoMessageDayUseMinimumPrice': 'We\'\re showing the best available price, based on the' + ' number of guests',
    'shs-widgets--calendar.infoMessageDayUseMaximumPrice': 'We\'\re showing the highest available price, based on the' + ' number of guests',
    'shs-widgets--calendar.infoMessageDayUseAveragePrice': 'We\'\re showing the average available price, based on' + ' the number of guests',
    'shs-widgets--calendar.instructions': 'Calendar is now available to select dates',
    'shs-widgets--calendar.currentlySelectedMonths': 'Currently selected months: {value}',
    'shs-widgets--calendar.minimum': 'Lowest',
    'shs-widgets--calendar.average': 'Average',
    'shs-widgets--calendar.maximum': 'Highest',
    'shs-widgets--calendar.restriction': 'You selected a restricted date.',
    'shs-widgets--calendar.restriction.MinStayThrough': 'There is a {additionalInformation} night minimum length of stay required for your selected dates.',
    'shs-widgets--calendar.restriction.MaxStayThrough': 'There is a {additionalInformation} night maximum length of stay required for your selected dates.',
    'shs-widgets--calendar.restriction.NoAvailableInventory': 'A date within your stay is not available.',
    'shs-widgets--calendar.restriction.NoArrive': 'No arrival allowed on your selected arrival date.',
    'shs-widgets--calendar.restriction.NoDeparture': 'No departure allowed on your selected departure date.',
    'shs-widgets--calendar.search': 'Search',
    'shs-widgets--calendar.noCheckIn': 'No Check-in',
    'shs-widgets--calendar.noCheckOut': 'No Check-out',
    'shs-widgets--calendar.useArrowKeys': 'Use arrow keys to navigate the dates',
    'shs-widgets--generic.restriction.InvalidOccupantQuantity': 'Invalid occupant quantity',
    'shs-widgets--generic.restriction.Limit': 'Not available',
    'shs-widgets--generic.restriction.NoSellDay': 'Not available',
    'shs-widgets--generic.restriction.NoDeparture': 'No Check-Out',
    'shs-widgets--generic.restriction.NoArrive': 'No Check-In',
    'shs-widgets--generic.restriction.MaxLeadDays': 'No Check-In',
    'shs-widgets--generic.restriction.MaxOccupancyExceeded': 'Too many guests - max {additionalInformation}',
    'shs-widgets--generic.restriction.Closed': 'Not available',
    'shs-widgets--generic.restriction.PastDate': 'Past date',
    'shs-widgets--generic.restriction.ZeroFinalPrice': 'Not available',
    'shs-widgets--generic.restriction.NoAvailableInventory': 'Not available',
    'shs-widgets--generic.restriction.SeasonalClosure': 'Not available',
    'shs-widgets--generic.restriction.PromoPricingRestrictionNotMet': 'Not available',
    'shs-widgets--generic.restriction.NoBaseSeasonForDerived': 'Not available',
    'shs-widgets--generic.restriction.MaxSellDate': 'Not available',
    'shs-widgets--generic.restriction.MinSellDate': 'Not available',
    'shs-widgets--generic.restriction.StartTime': 'Not available',
    'shs-widgets--generic.restriction.EndTime': 'Not available',
    'shs-widgets--generic.restriction.MinStayArrive': '{additionalInformation}-night minimum stay',
    'shs-widgets--generic.restriction.MinStayThrough': '{additionalInformation}-night minimum stay',
    'shs-widgets--generic.restriction.MaxStayArrive': '{additionalInformation}-night maximum stay',
    'shs-widgets--generic.restriction.MaxStayThrough': '{additionalInformation}-night maximum stay',
    'shs-widgets--generic.restriction.LeadDaysTime': 'This stay requires a {additionalInformation} lead days time',
    'shs-widgets--generic.restriction.MaxAdultOccupancyExceeded': 'Too many adults for selected number of rooms',
    'shs-widgets--generic.restriction.MaxChildOccupancyExceeded': 'Too many children for selected number of rooms',
    'shs-widgets--generic.restriction.NoPriceOnBaseRateForDerived': 'Not available',
    'shs-widgets--generic.restriction.NoProduct': 'Not available'
  };

  var defaultConfig = {
    classNames: {
      container: 'DayPicker',
      wrapper: 'DayPicker-wrapper',
      interactionDisabled: 'DayPicker--interactionDisabled',
      months: 'DayPicker-Months',
      month: 'DayPicker-Month',
      navBar: 'DayPicker-NavBar',
      navButtonPrev: 'DayPicker-NavButton DayPicker-NavButton--prev',
      navButtonNext: 'DayPicker-NavButton DayPicker-NavButton--next',
      navButtonInteractionDisabled: 'DayPicker-NavButton--interactionDisabled',
      caption: 'DayPicker-Caption font-weight-bold h5 text-secondary',
      weekdays: 'DayPicker-WeekDays DayPicker-Weekdays',
      weekdaysRow: 'DayPicker-WeekDaysRow DayPicker-WeekdaysRow',
      weekday: 'DayPicker-WeekDay DayPicker-Weekday text-muted small',
      body: 'DayPicker-Body',
      week: 'DayPicker-Week',
      weekNumber: 'DayPicker-WeekNumber',
      day: 'DayPicker-Day text-body',
      footer: 'DayPicker-Footer',
      todayButton: 'DayPicker-TodayButton',
      today: 'DayPicker-Day--today',
      selected: 'DayPicker-Day--selected',
      disabled: 'DayPicker-Day--disabled',
      outside: 'DayPicker-Day--outside'
    },
    showOutsideDays: false,
    initialMonth: new Date(),
    numberOfMonths: 1,
    disabledDays: [{
      before: new Date()
    }],
    localeUtils: {}
  };

  const {
    Provider
  } = Context;
  const {
    PRICE_DISPLAY_TAX_FEE_OPTIONS: PRICE_DISPLAY_TAX_FEE_OPTIONS$1
  } = constants;
  class CalendarContainer extends react_2 {
    constructor() {
      super(...arguments);
      _defineProperty(this, "state", {
        error: '',
        loading: true,
        from: this.props.startDate ? new Date(this.props.startDate) : null,
        to: this.props.endDate ? new Date(this.props.endDate) : null,
        enteredTo: this.props.isSingleDayUse ? new Date(this.props.startDate) : this.props.endDate && new Date(this.props.endDate) || null,
        response: null,
        restrictions: [],
        priceForStay: null,
        nights: this.props.startDate && this.props.endDate ? dayjs_min(new Date(this.props.endDate)).diff(new Date(this.props.startDate), 'day') : 0,
        restrictionStay: null,
        escapeKeyPressed: false,
        currentMonth: get_1(this.props.calendarConfig, 'initialMonth'),
        isInitialLoadFinished: !this.props.chain || !this.props.hotel,
        urlQuery: '',
        availabilityForStay: null
      });
      _defineProperty(this, "isFirstDayFocused", false);
      _defineProperty(this, "resetData", prevProps => {
        if (prevProps.hotel !== this.props.hotel || prevProps.chain !== this.props.chain) {
          this.setState({
            response: null,
            restrictions: [],
            priceForStay: null,
            restrictionStay: null,
            availabilityForStay: null
          });
        }
      });
      _defineProperty(this, "changeCalendarDayRole", () => {
        const days = toArray_1(document.getElementsByClassName('DayPicker-Day'));
        const preventFocusing = !!this.props.preventFocusing;
        days.forEach(day => {
          const roleAttribute = day.getAttribute('role');
          const disabledAttribute = day.getAttribute('aria-disabled');
          if (roleAttribute && roleAttribute === 'gridcell') {
            day.setAttribute('role', 'button');
          }
          if (!preventFocusing && !this.isFirstDayFocused && disabledAttribute !== 'true') {
            this.isFirstDayFocused = true;
            invoke_1(day, 'focus');
          }
        });
      });
      /**
       * Prevent default screen readers' behaviour on calendar elements.
       * Calendar (react-day-picker) implements its own methods to read
       * accessibility notifications. This is required for VoiceOver to not
       * misleadingly suggest to use VO Activation Keys when navigating dates.
       */
      _defineProperty(this, "preventMacOsAccessibilityDefaults", () => {
        if (isMacOs()) {
          const dayPickerWrappers = toArray_1(document.getElementsByClassName('DayPicker-wrapper'));
          dayPickerWrappers.forEach(wrapper => {
            wrapper.setAttribute('aria-hidden', 'true');
          });
        }
      });
      _defineProperty(this, "updateUrlQuery", () => {
        const currentQuery = buildQueryParams(this.props, this.state);
        if (this.state.urlQuery !== currentQuery) {
          this.setState({
            urlQuery: currentQuery
          });
        }
      });
      _defineProperty(this, "setEscapeKey", value => {
        this.setState({
          escapeKeyPressed: value
        });
      });
      _defineProperty(this, "onMonthChange", (day, numberOfMonths) => {
        const month = this.state.month || this.props.initialMonth;
        let startDate = dayjs_min(day);
        this.setState({
          currentMonth: dayjs_min(day).startOf('month'),
          month
        }, () => {
          this.fetchAvailability({
            startDate: startDate.format('YYYY-MM-DD'),
            endDate: startDate.add(numberOfMonths - 1, 'month').endOf('month').format('YYYY-MM-DD'),
            lengthOfStay: this.props.defaultLengthOfStay,
            initial: true
          });
          this.props.onMonthChange && this.props.onMonthChange(day, numberOfMonths, this.state);
        });
      });
      _defineProperty(this, "onMouseEnter", day => {
        const {
          from,
          to
        } = this.state;
        if (from && !to) {
          this.setState({
            enteredTo: day
          });
        }
      });
      _defineProperty(this, "logEvent", event => {
        const {
          activityId,
          api,
          chain,
          env,
          hotel,
          widgetContext
        } = this.props;
        const eventData = `${event}|cid=${chain}|hid=${hotel}|appEnv=${env}|api=${api}|sid=${activityId}|context=${widgetContext}`;
        if (this.props.preventLogging) {
          return;
        }
        widgetServices.logEvent({
          ChannelId: 'NGBE',
          EventsData: [{
            index: 'bi_ngbe',
            source: 'widget',
            event: eventData
          }]
        }, env, api);
      });
      _defineProperty(this, "setDates", day => {
        const {
          shouldSelectCheckoutOnly,
          shouldForceCheckout,
          isSingleDayUse
        } = this.props;
        const {
          from,
          to
        } = this.state;
        if (this.props.preventSelection) {
          return;
        }
        if (dayjs_min(day).format('YYYY-MM-DD') === dayjs_min(from).format('YYYY-MM-DD') && !to && !shouldForceCheckout && !isSingleDayUse) {
          return this.setState({
            escapeKeyPressed: false
          });
        }
        if (!shouldSelectCheckoutOnly && from && to && !isSingleDayUse || !from && !to) {
          return this.setState({
            from: day,
            to: null,
            enteredTo: null,
            priceForStay: null,
            restrictions: [],
            availabilityForStay: null,
            escapeKeyPressed: false
          }, () => {
            this.onDaySelect(day, null, null, this.state);
          });
        }
        let startDate = isSingleDayUse ? dayjs_min(day) : dayjs_min(this.state.from);
        let endDate = dayjs_min(day);
        if (!isSingleDayUse && endDate.isBefore(startDate, 'day')) {
          return this.setState({
            from: day,
            to: null,
            enteredTo: null,
            priceForStay: null,
            restrictions: [],
            availabilityForStay: null,
            escapeKeyPressed: false
          }, () => {
            this.onDaySelect(day, null, null, this.state);
          });
        }
        const restrictions = getRestrictionsBetweenDays(startDate, endDate.diff(startDate, 'day') + 1, this.state.response);
        let nights = endDate.diff(startDate, 'day');
        if (this.props.maxDays < nights) {
          endDate = startDate.add(this.props.maxDays, 'day');
        }
        if (shouldForceCheckout && from && !to || isSingleDayUse && from) {
          endDate = startDate.add(1, 'day');
          nights = endDate.diff(startDate, 'day');
        }
        return this.setState({
          from: startDate.toDate(),
          to: endDate.toDate(),
          enteredTo: isSingleDayUse ? startDate.toDate() : endDate.toDate(),
          nights,
          restrictions,
          escapeKeyPressed: false
        }, () => {
          if (!this.props.preventPriceCalculation) {
            this.fetchAvailability({
              startDate: startDate.format('YYYY-MM-DD'),
              lengthOfStay: endDate.diff(startDate, 'day'),
              isTotal: true
            });
          }
          this.onDaySelect(startDate.toDate(), endDate.toDate(), restrictions, this.state);
        });
      });
      _defineProperty(this, "onDaySelect", (startDate, endDate, restrictions) => {
        const submitEvent = new CustomEvent('shs-widgets-calendar__on-click', {
          detail: {
            ...this.state
          }
        });
        window && window.dispatchEvent(submitEvent);
        this.props.onDaySelect && this.props.onDaySelect(startDate, endDate, restrictions, this.state);
      });
      _defineProperty(this, "fetchAvailability", async _ref => {
        let {
          startDate,
          endDate,
          lengthOfStay,
          isTotal,
          initial
        } = _ref;
        const {
          api,
          env,
          activityId,
          chain,
          hotel,
          currency,
          onlyCheckRequested,
          adult,
          childAges,
          child,
          primaryChannel,
          secondaryChannel,
          rooms,
          iataNumber,
          onApiResponse,
          onError,
          displayCurrency,
          widgetContext
        } = this.props;
        const isExternalContext = /external/i.test(widgetContext);
        if (!hotel || !chain) {
          return;
        }
        const taxFeeDisplayOption = utils.getTaxFeeDisplayOption(this.props.includeTaxes, this.props.taxFeeDisplayOption);
        const formattedRequest = formatRequest({
          ...this.props,
          startDate,
          endDate: !initial && lengthOfStay > 1 ? startDate : isTotal && !initial ? startDate : endDate,
          lengthOfStay,
          chain,
          hotel,
          currency: displayCurrency || currency,
          onlyCheckRequested,
          adult,
          child,
          childAges,
          primaryChannel,
          secondaryChannel,
          rooms,
          iataNumber
        });
        this.setState({
          error: null,
          loading: true,
          restrictionStay: null
        }, async () => {
          try {
            const start = performance.now();
            const response = await widgetServices.getLeadAvailability(formattedRequest, env, api, activityId, isExternalContext);
            const fetchTime = Math.ceil(performance.now() - start);
            const {
              data
            } = response;
            const hasLeadAvailabilityListError = get_1(data, 'LeadAvailabilityList', []).some(leadAvailabilityListItem => !!get_1(leadAvailabilityListItem, 'ApplicationResults.Error[0].SystemSpecificResults.ShortText'));
            const stayInfoForLog = utils.getStayInfoForLog(formattedRequest);
            this.logEvent(`method=POST|url=/gw/product/v1/getLeadAvailability|${stayInfoForLog}|fetchTime=${fetchTime}|logCode=fetchJsonInfo|LEVEL=info`);
            if (data.error || get_1(data, 'ApplicationResults.Error[0]') || hasLeadAvailabilityListError) {
              const propsForErrorLogging = utils.getPropsInfoForErrorLogging(this.props);
              this.logEvent(`method=POST|url=/gw/product/v1/getLeadAvailability|requestBody=${JSON.stringify(formattedRequest)}|logCode=fetchJsonInfo|LEVEL=error|fetchTime=${fetchTime}|props=${JSON.stringify(propsForErrorLogging)}|error=${getError(data)}`);
              this.setState({
                error: getError(data),
                loading: false
              }, () => {
                onError && onError(getError(data), data, this.state);
              });
            }
            const warning = getWarning(data);
            if (warning) {
              this.logEvent(`method=POST|url=/gw/product/v1/getLeadAvailability|${stayInfoForLog}|fetchTime=${fetchTime}|logCode=fetchJsonInfo|LEVEL=warning|warn=${warning}`);
              this.setState({
                error: getWarning(data),
                loading: false
              }, () => {
                onError && onError(warning, data, this.state);
              });
            }
            if (isTotal) {
              return this.setState({
                loading: false,
                priceForStay: getPriceForStay({
                  ...data
                }, this.props.priceType, taxFeeDisplayOption),
                restrictionStay: {
                  ...get_1(data, 'LeadAvailabilityList[0].LeastRestrictiveFailure'),
                  date: startDate
                },
                availabilityForStay: getAvailabilityForStay(data)
              }, () => {
                onApiResponse && onApiResponse(data, this.state);
              });
            }
            const formattedResponse = formatResponse(data, this.props.priceType, taxFeeDisplayOption, this.state.response);
            const restrictions = getRestrictionsBetweenDays(dayjs_min(this.state.from), dayjs_min(this.state.to).diff(this.state.from, 'day') + 1, formattedResponse);
            this.setState({
              loading: false,
              response: formattedResponse,
              restrictions: restrictions,
              ...(initial && !this.state.isInitialLoadFinished && {
                isInitialLoadFinished: true
              })
            }, () => {
              onApiResponse && onApiResponse(data, this.state);
              initial && this.changeCalendarDayRole();
              initial && this.preventMacOsAccessibilityDefaults();
            });
          } catch (e) {
            const propsForErrorLogging = utils.getPropsInfoForErrorLogging(this.props);
            this.logEvent(`method=POST|url=/gw/product/v1/getLeadAvailability|requestBody=${JSON.stringify(formattedRequest)}|logCode=fetchJsonInfo|LEVEL=error|props=${JSON.stringify(propsForErrorLogging)}|error=${JSON.stringify(e)}`);
            onError && onError(e, this.state);
          }
        });
      });
      _defineProperty(this, "getState", () => {
        const {
          restrictions,
          to
        } = this.state;
        const mergedLabels = merge_1({}, labels, defaultLabels, this.props.labels);
        const mergedConfig = merge_1({}, defaultConfig, this.props.calendarConfig);
        const translateMethod = this.props.translate ? this.props.translate : translate$2;
        const parsedRestrictions = parseRestrictions(restrictions, to);
        const restrictionToDisplay = selectedRestriction(this.state, parsedRestrictions);
        return {
          ...this.props,
          ...this.state,
          taxFeeDisplayOption: utils.getTaxFeeDisplayOption(this.props.includeTaxes, this.props.taxFeeDisplayOption),
          initialMonth: this.props.initialMonth || this.state.from || new Date(),
          onSubmit: () => {
            const envData = environments[this.props.env];
            const sbeURL = this.props.sbeCustomUrl || envData && envData.sbe;
            if (this.props.sbeRedirect && sbeURL) {
              return window.open(`${sbeURL}${buildQueryParams(this.props, this.state)}`);
            }
            this.props.onSubmit && this.props.onSubmit(this.state);
          },
          restrictions: this.state.restrictions,
          parsedRestrictions,
          restrictionToDisplay,
          response: this.state.response,
          priceForStay: this.state.priceForStay,
          calendarConfig: mergedConfig,
          t: (label, values) => translateMethod(label, mergedLabels, values),
          tc: function (label, values) {
            let className = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : '';
            return /*#__PURE__*/react.createElement("span", {
              className: className,
              dangerouslySetInnerHTML: {
                __html: translateMethod(label, mergedLabels, values)
              }
            });
          }
        };
      });
    }
    componentDidMount() {
      const state = this.getState();
      const startDate = dayjs_min(state.initialMonth).startOf('month').format('YYYY-MM-DD');
      const endDate = dayjs_min(startDate).add(state.calendarConfig.numberOfMonths - 1, 'month').endOf('month').format('YYYY-MM-DD');
      if (!this.props.chain || !this.props.hotel) {
        this.changeCalendarDayRole();
        this.preventMacOsAccessibilityDefaults();
      }
      this.fetchAvailability({
        startDate,
        endDate,
        lengthOfStay: this.props.defaultLengthOfStay,
        initial: true
      });
      if (this.state.from && this.state.to) {
        this.fetchAvailability({
          startDate: dayjs_min(this.state.from).format('YYYY-MM-DD'),
          lengthOfStay: dayjs_min(this.state.to).diff(this.state.from, 'day'),
          isTotal: true
        });
      }
      window.addEventListener('keydown', e => this.handleKeyDown(e));
      this.setEscapeKey = this.setEscapeKey.bind(this);
    }
    componentDidUpdate(prevProps, prevState) {
      this.updateUrlQuery();
      this.resetData(prevProps);
      const isStartAndEndDateSelected = this.state.from && this.state.to;
      if (shouldFetchPrices(this.props, prevProps)) {
        const state = this.getState();
        const {
          from,
          to,
          currentMonth
        } = this.state;
        const startDate = dayjs_min(currentMonth || from || state.initialMonth).startOf('month').format('YYYY-MM-DD');
        const endDate = dayjs_min(currentMonth || to || startDate).add(state.calendarConfig.numberOfMonths - 1, 'month').endOf('month').format('YYYY-MM-DD');
        this.fetchAvailability({
          startDate,
          endDate,
          lengthOfStay: this.props.defaultLengthOfStay
        });
        if (isStartAndEndDateSelected) {
          this.fetchAvailability({
            startDate: dayjs_min(this.state.from).format('YYYY-MM-DD'),
            lengthOfStay: dayjs_min(this.state.to).diff(dayjs_min(this.state.from), 'day'),
            isTotal: true
          });
        }
      } else if (!isEqual_1(this.state.currentMonth, prevState.currentMonth) && isStartAndEndDateSelected) {
        this.fetchAvailability({
          startDate: dayjs_min(this.state.from).format('YYYY-MM-DD'),
          lengthOfStay: dayjs_min(this.state.to).diff(dayjs_min(this.state.from), 'day'),
          isTotal: true
        });
      }
      if ((this.props.shouldForceCheckout || this.props.isSingleDayUse) && this.state.from && !this.state.to) {
        this.setDates(this.state.from);
      }
    }
    componentWillUnmount() {
      window.removeEventListener('keydown', e => this.handleKeyDown(e));
    }
    handleKeyDown(e) {
      if (e.key === 'Escape') {
        const lastDayEl = document.querySelector('.DayPicker-Day--selected.end .shs-widgets--calendar--day__number');
        const currentHoverDate = find_1(get_1(lastDayEl, 'classList', []), className => className.includes('day-'));
        this.setState({
          escapeKeyPressed: currentHoverDate || true
        });
      }
    }
    render() {
      const {
        error,
        loading,
        from,
        to,
        enteredTo,
        escapeKeyPressed,
        isInitialLoadFinished
      } = this.state;
      const state = this.getState();
      const {
        isSingleDayUse,
        defaultLengthOfStay
      } = this.props;
      return /*#__PURE__*/react.createElement(Provider, {
        value: state
      }, /*#__PURE__*/react.createElement(CalendarComponent$1, {
        error: error,
        loading: loading,
        isInitialLoadFinished: isInitialLoadFinished,
        from: from,
        to: to,
        enteredTo: enteredTo,
        setDates: this.setDates,
        onMouseEnter: this.onMouseEnter,
        onMonthChange: this.onMonthChange,
        escapeKeyPressed: escapeKeyPressed,
        setEscapeKey: this.setEscapeKey,
        isSingleDayUse: isSingleDayUse,
        defaultLengthOfStay: defaultLengthOfStay
      }));
    }
  }
  CalendarContainer.propTypes = {
    /** CRS Api Key */
    api: propTypes.string.isRequired,
    /** CRS Chain ID */
    chain: propTypes.oneOfType([propTypes.string, propTypes.number]).isRequired,
    /** Currency for calendar prices */
    currency: propTypes.string.isRequired,
    /** CRS Hotel ID */
    hotel: propTypes.oneOfType([propTypes.string, propTypes.number]),
    /** Access code value */
    accessCode: propTypes.string,
    /** Access code type (Group, Promotion, ..) */
    accessCodeType: propTypes.string,
    /** Activity ID header for calendar API call */
    activityId: propTypes.string,
    /** Number of adults */
    adult: propTypes.number,
    /** Calendar configuration props (http://react-day-picker.js.org/api/DayPicker)  */
    calendarConfig: propTypes.object,
    /** Number of children */
    child: propTypes.number,
    /** Children ages i.e. [1,3,2] */
    childAges: propTypes.arrayOf(propTypes.number),
    /** Default length of stay for outside of stay days pricing */
    defaultLengthOfStay: propTypes.number,
    /** Display currency for messages */
    displayCurrency: propTypes.string,
    /** Preselected end date */
    endDate: propTypes.string,
    /** CRS Environment */
    env: propTypes.string,
    /** Hide legend section */
    hideLegend: propTypes.bool,
    /** Hide prices */
    hidePrices: propTypes.bool,
    /** Hide submit section */
    hideSubmit: propTypes.bool,
    /** IATA Number */
    iataNumber: propTypes.string,
    /** Price should include taxes */
    includeTaxes: propTypes.bool,
    /** Option on how to display taxes and fees with price */
    taxFeeDisplayOption: propTypes.oneOf([PRICE_DISPLAY_TAX_FEE_OPTIONS$1.INCLUDE_FEES_ONLY, PRICE_DISPLAY_TAX_FEE_OPTIONS$1.INCLUDE_TAXES_FEES, PRICE_DISPLAY_TAX_FEE_OPTIONS$1.EXCLUDE_TAXES_FEES]),
    /** Default labels override */
    labels: propTypes.object,
    /** Length of stay for an initial call */
    lengthOfStay: propTypes.number,
    /** Loyalty list based on BE Designer config and user's profile*/
    loyaltyList: propTypes.array,
    /** Start date in a calendar */
    initialMonth: propTypes.instanceOf(Date),
    /** Boolean that allows to select only one date for day use reservation */
    isSingleDayUse: propTypes.bool,
    /** Locale for your calendar */
    locale: propTypes.string,
    /** Maximum nuber of days user can select */
    maxDays: propTypes.number,
    /** Triggered on API response */
    onApiResponse: propTypes.func,
    /** Triggered on day select (startDate, endDate, restrictions, this.state) */
    onDaySelect: propTypes.func,
    /** Triggered on error */
    onError: propTypes.func,
    /** Triggered on month change */
    onMonthChange: propTypes.func,
    /** Triggered on button click */
    onSubmit: propTypes.func,
    /** Only check requested criteria */
    onlyCheckRequested: propTypes.bool,
    /** Prevent focusing on first available day */
    preventFocusing: propTypes.bool,
    /** Prevent logging */
    preventLogging: propTypes.bool,
    /** Prevent price calculation */
    preventPriceCalculation: propTypes.bool,
    /** Prevent date selection - it's just a calendar */
    preventSelection: propTypes.bool,
    /** Price type to display */
    priceType: propTypes.oneOf(['Maximum', 'Minimum', 'Average']),
    /** Primary CRS channel */
    primaryChannel: propTypes.string,
    /** Request specific rates */
    rateList: propTypes.arrayOf(propTypes.string),
    /** Request specific filter rates */
    rateFilterList: propTypes.arrayOf(propTypes.string),
    /** Custom render day method. Can be function with a react component or template string. Available arguments ({locale, modifiers, day, dayFormatted}) */
    renderDayNumber: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Custom render price method. Can be function with a react component or template string. Available arguments ({locale, modifiers, day, dayFormatted, ...priceDetails}) */
    renderDayPrice: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Custom render for error message. Available arguments ({t, error}) */
    renderErrorMessage: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Custom render for a legend section. Can be function with a react component or template string. Available arguments ({t}) */
    renderLegend: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Render a message in the same place as the restriction message when there is no restriction. */
    renderMessage: propTypes.func,
    /** Custom render for restriction message. Can be function with a react component or template string. Available arguments ({cause, extra, t}) */
    renderRestrictionMessage: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Custom render for a spinner */
    renderSpinner: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Custom render for a submit button. Can be function with a react component or template string. Available arguments ({onSubmit, isSubmitDisabled, t, priceForStay, locale, taxFeeDisplayOption, nights, includeTaxes}) */
    renderSubmitButton: propTypes.oneOfType([propTypes.string, propTypes.func]),
    /** Request specific rooms */
    roomList: propTypes.arrayOf(propTypes.string),
    /** Number of rooms */
    rooms: propTypes.number,
    sbeExtraParams: propTypes.arrayOf(propTypes.shape({
      name: propTypes.string,
      value: propTypes.string
    })),
    /** Redirect to SBE on click */
    sbeRedirect: propTypes.bool,
    /** Custom URL to SBE */
    sbeCustomUrl: propTypes.string,
    /** Secondary CRS channel */
    secondaryChannel: propTypes.string,
    /** Boolean that helps to select only checkout date if application has a search-bar and user clicked to select checkout */
    shouldSelectCheckoutOnly: propTypes.bool,
    /** Boolean that helps to select checkout date if only checkin date has been chosen and user clicked outside of calendar*/
    shouldForceCheckout: propTypes.bool,
    /** Preselected start date */
    startDate: propTypes.string,
    translate: propTypes.func,
    widgetContext: propTypes.string
  };
  CalendarContainer.defaultProps = {
    activityId: makeid(10),
    env: 'ccrs',
    locale: window.navigator.language,
    calendarConfig: defaultConfig,
    defaultLengthOfStay: 1,
    primaryChannel: 'WEB',
    secondaryChannel: 'GC',
    labels: defaultLabels,
    isSingleDayUse: false,
    lengthOfStay: 1,
    loyaltyList: [],
    onlyCheckRequested: false,
    childAges: [],
    adult: 1,
    child: 0,
    rooms: 1,
    sbeExtraParams: [],
    shouldForceCheckout: false,
    shouldSelectCheckoutOnly: false,
    priceType: 'Minimum',
    sbeRedirect: true,
    includeTaxes: true,
    // eslint-disable-next-line react/display-name,react/prop-types
    renderErrorMessage: _ref2 => {
      let {
        t,
        error
      } = _ref2;
      return /*#__PURE__*/react.createElement("div", {
        className: "shs-widgets--calendar--error alert alert-danger fade show",
        role: "alert"
      }, /*#__PURE__*/react.createElement("strong", null, t(`shs-widgets--generic.error.${error}.title`)), ' ', t(`shs-widgets--generic.error.${error}.description`));
    },
    // eslint-disable-next-line react/display-name,react/prop-types
    renderDayNumber: _ref3 => {
      let {
        dayFormatted,
        day,
        locale
      } = _ref3;
      return /*#__PURE__*/react.createElement("span", {
        className: `shs-widgets--calendar--day__number day-${dayFormatted}`,
        "aria-hidden": "true"
      }, new Intl.DateTimeFormat(locale, {
        day: 'numeric'
      }).format(day));
    },
    // eslint-disable-next-line react/display-name,react/prop-type
    renderDayPrice: _ref4 => {
      let {
        dayFormatted,
        CurrencyCode,
        Value,
        locale,
        loading,
        modifiers,
        priceForStay,
        lengthOfStay,
        isTooltip,
        defaultLengthOfStay
      } = _ref4;
      let priceValue = Value / defaultLengthOfStay;
      const currencyCodeFromPriceForStay = get_1(priceForStay, 'Price.CurrencyCode', '');
      if (loading) {
        return /*#__PURE__*/react.createElement("span", {
          className: `${isTooltip ? 'shs-widgets--calendar--day__price' : ''} day-${dayFormatted} d-block loading-price`
        }, "---");
      }
      const isSelected = !!modifiers['DayPicker-Day--selected'];
      if (isSelected && priceForStay && lengthOfStay) {
        priceValue = get_1(priceForStay, 'Price.Value', 0) / lengthOfStay;
      }
      if (!CurrencyCode && currencyCodeFromPriceForStay) {
        CurrencyCode = currencyCodeFromPriceForStay;
      }
      if (!CurrencyCode) {
        return null;
      }
      const priceText = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: CurrencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(priceValue);
      return /*#__PURE__*/react.createElement("span", {
        className: `shs-widgets--calendar--day__price day-${dayFormatted} d-block`,
        "aria-hidden": "true"
      }, priceText);
    },
    // eslint-disable-next-line react/display-name,react/prop-types
    renderRestrictionMessage: _ref5 => {
      let {
        Cause,
        AdditionalInformation,
        t
      } = _ref5;
      return /*#__PURE__*/react.createElement("div", {
        className: `shs-widgets--calendar--restriction alert alert-warning fade show`,
        role: "alert"
      }, /*#__PURE__*/react.createElement("strong", null, t(`shs-widgets--calendar.restriction`)), /*#__PURE__*/react.createElement("div", null, t(`shs-widgets--generic.restriction.${Cause}`, {
        additionalInformation: AdditionalInformation
      })));
    },
    // eslint-disable-next-line react/display-name,react/prop-types
    renderLegend: _ref6 => {
      let {
        t
      } = _ref6;
      return /*#__PURE__*/react.createElement("ul", {
        className: "shs-widgets--calendar--legend"
      }, /*#__PURE__*/react.createElement("li", {
        className: "shs-widgets--calendar--legend__no-checkin"
      }, /*#__PURE__*/react.createElement("span", null, t('shs-widgets--calendar.noCheckIn'))), /*#__PURE__*/react.createElement("li", {
        className: "shs-widgets--calendar--legend__no-checkout"
      }, /*#__PURE__*/react.createElement("span", null, t('shs-widgets--calendar.noCheckOut'))));
    },
    // eslint-disable-next-line react/display-name,react/prop-types
    renderSpinner: () => /*#__PURE__*/react.createElement("div", {
      className: "shs-widgets--calendar--loading spinner-border",
      role: "status"
    }, /*#__PURE__*/react.createElement("span", {
      className: "sr-only"
    }, "Loading...")),
    // eslint-disable-next-line react/display-name,react/prop-types
    renderSubmitButton: _ref7 => {
      let {
        onSubmit,
        isSubmitDisabled,
        t,
        priceForStay,
        locale,
        taxFeeDisplayOption,
        nights,
        includeTaxes
      } = _ref7;
      const value = get_1(priceForStay, 'Price.Value');
      const _taxFeeDisplayOption = utils.getTaxFeeDisplayOption(includeTaxes, taxFeeDisplayOption);
      const priceLabel = cond_1([[() => _taxFeeDisplayOption === PRICE_DISPLAY_TAX_FEE_OPTIONS$1.INCLUDE_FEES_ONLY, () => t('shs-widgets--calendar.includeFeesOnly')], [() => _taxFeeDisplayOption === PRICE_DISPLAY_TAX_FEE_OPTIONS$1.EXCLUDE_TAXES_FEES, () => t('shs-widgets--calendar.excludingTax')], [stubTrue_1, () => t('shs-widgets--calendar.includingTax')]])();
      const priceText = priceForStay && !!value && new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: priceForStay.Price.CurrencyCode,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
      return /*#__PURE__*/react.createElement("div", {
        className: "shs-widgets--calendar--button__container text-right"
      }, priceForStay && !!value && !isSubmitDisabled && /*#__PURE__*/react.createElement("div", {
        className: "shs-widgets--calendar--total_price"
      }, /*#__PURE__*/react.createElement("strong", {
        className: "shs-widgets--calendar--total_price_price"
      }, t('shs-widgets--calendar.totalPrice', {
        price: priceText,
        nights
      })), /*#__PURE__*/react.createElement("small", {
        className: "shs-widgets--calendar--total_price_tax d-block"
      }, priceLabel)), /*#__PURE__*/react.createElement("button", {
        className: "btn btn-primary shs-widgets--calendar--button btn-lg",
        onClick: onSubmit,
        disabled: isSubmitDisabled
      }, t(`shs-widgets--calendar.search`)));
    },
    widgetContext: 'external-calendar'
  };

  function parseJSON(data) {
    try {
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  }
  function parseFunction(functionName) {
    return window[functionName];
  }
  function parseBool(prop) {
    if (prop === 'true' || prop === true) {
      return true;
    }
    return false;
  }
  function getProp(prop) {
    if (isNumber_1(prop)) {
      return prop;
    }
    if (isEmpty_1(prop)) {
      return undefined;
    }
    return prop;
  }
  function reactify(fn) {
    return render(host => {
      const Component = fn(host);
      return (host, target) => reactDom.render(Component, target);
    }, {
      shadowRoot: false
    });
  }
  function getProps(props) {
    return {
      api: getProp(props.api),
      chain: getProp(props.chain),
      currency: getProp(props.currency),
      hotel: getProp(props.hotel),
      accessCode: getProp(props.accessCode),
      accessCodeType: getProp(props.accessCodeType),
      activityId: getProp(props.activityId),
      adult: getProp(props.adult),
      calendarConfig: parseJSON(props.calendarConfig),
      child: getProp(props.child),
      childAges: parseJSON(props.childAges),
      endDate: getProp(props.endDate),
      env: getProp(props.env),
      hideLegend: parseBool(props.hideLegend),
      hidePrices: parseBool(props.hidePrices),
      hideSubmit: parseBool(props.hideSubmit),
      iataNumber: getProp(props.iataNumber),
      includeTaxes: parseBool(props.includeTaxes),
      initialMonth: props.startDate ? new Date(props.startDate) : new Date(props.initialMonth),
      isSingleDayUse: parseBool(props.isSingleDayUse),
      labels: parseJSON(props.labels),
      lengthOfStay: getProp(props.lengthOfStay),
      locale: getProp(props.locale),
      sbeCustomUrl: getProp(props.sbeCustomURL),
      sbeRedirect: parseBool(props.sbeRedirect),
      sbeExtraParams: parseJSON(props.sbeExtraParams),
      onApiResponse: parseFunction(props.onApiResponse),
      onDaySelect: parseFunction(props.onDaySelect),
      onError: parseFunction(props.onError),
      onMonthChange: parseFunction(props.onMonthChange),
      onSubmit: parseFunction(props.onSubmit),
      onlyCheckRequested: parseBool(props.onlyCheckRequested),
      preventPriceCalculation: parseBool(props.preventPriceCalculation),
      preventSelection: getProp(props.preventSelection),
      priceType: getProp(props.priceType),
      primaryChannel: getProp(props.primaryChannel),
      rateList: parseJSON(props.rateList),
      rateFilterList: parseJSON(props.rateFilterList),
      renderDayNumber: getProp(props.renderDayNumber),
      renderRestrictionMessage: getProp(props.renderRestrictionMessage),
      renderDayPrice: getProp(props.renderDayPrice),
      renderErrorMessage: getProp(props.renderErrorMessage),
      renderSpinner: getProp(props.renderSpinner),
      renderSubmitButton: getProp(props.renderSubmitButton),
      renderLegend: getProp(props.renderLegend),
      roomList: parseJSON(props.roomList),
      rooms: getProp(props.rooms),
      secondaryChannel: getProp(props.secondaryChannel),
      startDate: getProp(props.startDate),
      enablePreferredRates: parseBool(props.enablePreferredRates),
      taxFeeDisplayOption: getProp(props.taxFeeDisplayOption),
      ...props.props
    };
  }
  const CalendarWebComponent = {
    api: property(''),
    chain: property(''),
    currency: property(''),
    hotel: property(''),
    accessCode: property(''),
    accessCodeType: property(''),
    activityId: property(''),
    adult: property(1),
    calendarConfig: property('{}'),
    child: property(0),
    childAges: property('[]'),
    endDate: property(''),
    startDate: property(''),
    env: property('ccrs'),
    hideLegend: property('false'),
    hidePrices: property('false'),
    hideSubmit: property('false'),
    iataNumber: property(''),
    includeTaxes: property('true'),
    initialMonth: property(dayjs_min().format('YYYY-MM-DD')),
    isSingleDayUse: property('false'),
    enablePreferredRates: property('false'),
    labels: property('{}'),
    lengthOfStay: property(1),
    locale: property('en-US'),
    onApiResponse: property(''),
    onDaySelect: property(''),
    onSubmit: property(''),
    onError: property(''),
    onMonthChange: property(''),
    onlyCheckRequested: property('false'),
    preventSelection: property(''),
    preventPriceCalculation: property('false'),
    priceType: property('Minimum'),
    primaryChannel: property('WEB'),
    rateList: property('[]'),
    rateFilterList: property('[]'),
    renderDayNumber: property(''),
    renderDayPrice: property(''),
    renderRestrictionMessage: property(''),
    renderErrorMessage: property(''),
    renderSpinner: property(''),
    renderSubmitButton: property(''),
    renderLegend: property(''),
    rooms: property(1),
    roomList: property('[]'),
    sbeRedirect: property('true'),
    sbeCustomURL: property(''),
    sbeExtraParams: property('[]'),
    taxFeeDisplayOption: property(''),
    // Props is use to bulk update multiple params at once.
    props: property({}),
    render: reactify((props, host) => {
      const parsedProps = getProps(props);
      return /*#__PURE__*/react.createElement(CalendarContainer, parsedProps);
    })
  };
  define('sabre-shs-widgets-calendar', CalendarWebComponent);

}());
