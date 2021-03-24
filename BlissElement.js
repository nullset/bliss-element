import { observable, observe, raw } from "@nx-js/observer-util";
import { render, html, svg } from "uhtml";
import "construct-style-sheets-polyfill";
import deepmerge from "deepmerge";

function css(string) {
  return string;
}

function constructStylesheets(prototypes) {
  return prototypes
    .slice(0)
    .reduce((acc, { styles }) => {
      if (!styles) return acc;
      const rules = (Array.isArray(styles) ? styles : [styles])
        .map((s) => {
          return s.toString();
        })
        .join("");

      const sheet = new CSSStyleSheet();
      sheet.replaceSync(rules);

      acc.push(sheet);
      return acc;
    }, [])
    .flat(Infinity);
}

const eventRegex = new RegExp("^on([a-z])", "i");
function isAnEvent(name) {
  return eventRegex.test(name);
}

const lifecycleMethods = ["onInit", "onMount", "onUnmount", "onAdopted"];

function define(tagName, componentObj, options = {}) {
  const { mixins = [], base = HTMLElement, extend = undefined } = options;
  const prototypeChain = Array.isArray(mixins) ? mixins : [mixins];

  // Add a default mixin that creates observable attributes for `hidden` and `disabled`.
  prototypeChain.unshift({
    attrs: {
      hidden: { type: Boolean, default: false },
      disabled: { type: Boolean, default: false },
    },
  });

  // Add the specified web component to the prototype chain.
  prototypeChain.push(componentObj);
  const flattenedPrototype = deepmerge.all(prototypeChain);

  // TODO: Need to make sure lifecycleMethods are not here
  const preBoundEvents = Object.keys(flattenedPrototype).reduce((acc, key) => {
    if (isAnEvent(key)) acc.push(key.replace(eventRegex, "$1"));
    return acc;
  }, []);

  const observedAttrs = [];
  const attributePropMap = {};

  Object.entries(flattenedPrototype.attrs).forEach((item) => {
    const [propName, { attribute }] = item;
    const attributeName = attribute || propName;
    observedAttrs.push(attributeName);
    attributePropMap[attributeName] = propName;
  });

  const componentStylesheets = constructStylesheets(prototypeChain);

  class BlissElement extends base {
    state = observable({});
    isBlissElement = true;

    static get observedAttributes() {
      return observedAttrs;
    }

    handleEvent(e) {
      this["on" + e.type](e);
    }

    constructor() {
      super();
      this.bindEvents();
      this.convertPropsToAttributes();
      this.callLifecyleMethods("onInit");
      this.renderToRoot();
    }

    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
      this.callLifecyleMethods("onMount");
    }

    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
      this.callLifecyleMethods("onUnmount");
    }

    adoptedCallback() {
      if (super.adoptedCallback) super.adoptedCallback();
      this.callLifecyleMethods("onAdopted");
    }

    // Update state when attributes change.
    attributeChangedCallback(name, oldValue, newValue) {
      if (super.attributeChangedCallback) super.attributeChangedCallback();

      const propName = attributePropMap[name];
      const { type = String } = flattenedPrototype.attrs[propName];
      let convertedValue;

      if (type === Boolean) {
        convertedValue = [null, "false"].includes(newValue) ? false : true;
      } else if (type === Number) {
        convertedValue = Number(newValue);
      } else {
        try {
          convertedValue = JSON.parse(newValue);
        } catch (e) {
          convertedValue = String(newValue);
        }
      }
      this.state[propName] = convertedValue;
    }

    bindEvents() {
      preBoundEvents.forEach((event) => {
        this.addEventListener(event, this);
      });
    }

    // Convert properties to strings and set on attributes.
    // Based on `state` so values are reactive.
    convertPropsToAttributes() {
      Object.entries(flattenedPrototype.attrs).forEach(([attr, value]) => {
        if (value.reflect === false) return;

        const converter = value.type || String;
        if (converter === Function) return;

        const attributeName = value.attribute || attr.toLowerCase();

        // Observe update state keys, and set attributes appropriately.
        observe(() => {
          let convertedValue =
            this.state[attr] == null ? null : converter(this.state[attr]);
          if (convertedValue == null || convertedValue === false) {
            this.removeAttribute(attributeName);
          } else if (convertedValue === true) {
            this.setAttribute(attributeName, "");
          } else if (converter === Array) {
            convertedValue = Array.from(this.state[attr]);
            this.setAttribute(attributeName, JSON.stringify(convertedValue));
          } else {
            this.setAttribute(attributeName, convertedValue);
          }
        });

        // Set inintial default values.
        this.state[attr] = flattenedPrototype.attrs[attr].default;
      });
    }

    renderToRoot() {
      let rootNode;
      if (this.hasShadowRoot == null) {
        rootNode = this.attachShadow({ mode: "open" });
        rootNode.adoptedStyleSheets = componentStylesheets;
      } else {
        rootNode = this;
        // TODO: Attach stylesheets when component does not have shadow DOM.
      }

      observe(() => {
        render(rootNode, this.render());
      });
    }

    callLifecyleMethods(method, args) {
      if (this.constructor.prototype[method]) {
        this.constructor.prototype[method].forEach((fn) => fn.call(this, args));
      }
    }

    getContext(matcher) {
      let node = this;
      let ctx;
      while (!ctx && node.parentElement) {
        node = node.parentElement;
        if (node.isBlissElement && node.matches(matcher)) ctx = node;
      }
      if (node && document.documentElement !== node) return node;
      throw new Error(
        `A context that matches "${matcher}" could not be found for <${this.tagName.toLowerCase()}>.`
      );
    }

    render() {
      return html``;
    }
  }

  // Build up our web component's prototype.
  prototypeChain.forEach((proto) => {
    Object.entries(proto).forEach(([key, value]) => {
      if (typeof value === typeof Function) {
        if (lifecycleMethods.includes(key)) {
          if (!BlissElement.prototype[key]) BlissElement.prototype[key] = [];
          BlissElement.prototype[key].push(value);
        } else if (isAnEvent(key)) {
          // Events are handled in a special way on HTMLElement. This is because HTMLElement is a function, not an object.
          Object.defineProperty(BlissElement.prototype, key, {
            value: value,
            enumerable: true,
            configurable: true,
          });
        } else {
          BlissElement.prototype[key] = value;
        }
      } else {
        BlissElement.prototype[key] = value;
      }
    });
  });

  customElements.define(tagName, BlissElement, { extends: extend });
}

export { define, html, svg, css, observable, observe, raw };
