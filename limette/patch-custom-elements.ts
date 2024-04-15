const customElementsDefine = customElements.define;

/**
 * This patch prevents registration of other components on the server, excepting routes and is-land
 */
customElements.define = function (name, ctor, options) {
  if (!name.startsWith("lmt-route-") && name !== "is-land") return;

  customElementsDefine.call(customElements, name, ctor, options);
};
