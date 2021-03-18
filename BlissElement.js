import { observable, observe } from "@nx-js/observer-util";
import { render, html, svg } from "uhtml";
import props from "element-props";
import "construct-style-sheets-polyfill";

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

const lifecycleMethods = {
  connectedCallback: true,
  disconnectedCallback: true,
  adoptedCallback: true,
  attributeChangedCallback: true,
};

const eventRegex = new RegExp("^on([a-z])");
function isAnEvent(name) {
  return eventRegex.test(name);
}

function define(tagName, componentObj, options = {}) {
  const { mixins = [], base = HTMLElement, extend = undefined } = options;
  const prototypeChain = Array.isArray(mixins) ? mixins : [mixins];
  prototypeChain.push(componentObj);
  const flattenedPrototype = Object.assign(
    Object.create(null),
    ...prototypeChain
  );
  const preBoundEvents = Object.keys(flattenedPrototype).reduce((acc, key) => {
    if (isAnEvent(key)) acc.push(key.replace(eventRegex, "$1"));
    return acc;
  }, []);

  const componentStylesheets = constructStylesheets(prototypeChain);

  class BlissElement extends base {
    static get observedAttributes() {
      return [
        /* array of attribute names to monitor for changes */
      ];
    }

    handleEvent(e) {
      this["on" + e.type](e);
    }

    constructor() {
      super();

      preBoundEvents.forEach((event) => {
        this.addEventListener(event, this);
      });

      const obsAttr = {
        foo: String,
        num: Number,
        bool: Boolean,
        arr: Array,
        obj: Object,
        fooBar: String,
      };
      this.state = this.props = observable(props(this, obsAttr));

      observe(() => {
        console.log("THe state of foo:", this.state.foo);
      });

      let rootNode;
      if (this.hasShadowRoot == null) {
        rootNode = this.attachShadow({ mode: "open" });
        rootNode.adoptedStyleSheets = componentStylesheets;
      } else {
        rootNode = this;
      }

      observe(() => {
        render(rootNode, this.render());
      });
    }

    connectedCallback() {
      if (super.connectedCallback) super.connectedCallback();
    }

    disconnectedCallback() {
      if (super.disconnectedCallback) super.disconnectedCallback();
    }

    adoptedCallback() {
      if (super.adoptedCallback) super.adoptedCallback();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (super.attributeChangedCallback) super.attributeChangedCallback();
    }

    render() {
      return html``;
    }
  }

  prototypeChain.forEach((proto) => {
    Object.entries(proto).forEach(([key, value]) => {
      if (typeof value === typeof Function) {
        if (lifecycleMethods[value.name]) {
          // If property is a lifecycleMethod, then call the original function and our new function. Behaves like `super.myMethod()`.
          const originalFn = BlissElement.prototype[key];
          BlissElement.prototype[key] = function (args) {
            originalFn.call(this, args);
            value.call(this, args);
          };
        } else {
          if (isAnEvent(key)) {
            // Events are handled in a special way on HTMLElement. This is because HTMLElement is a function, not an object.
            Object.defineProperty(BlissElement.prototype, key, {
              value: value,
              enumerable: true,
              configurable: true,
            });
          } else {
            BlissElement.prototype[key] = value;
          }
        }
        return;
      }

      // If not a lifecycleMethod then overwrite existing property.

      BlissElement.prototype[key] = value;
    });
  });

  customElements.define(tagName, BlissElement, { extends: extend });
}

export { define, html, svg, css, observable, observe };
