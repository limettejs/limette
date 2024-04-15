const customElementsDefine = customElements.define;

customElements.define = function (name, ctor, options) {
  if (!name.startsWith("lmt-route-") && name !== "is-land") return;

  customElementsDefine.call(customElements, name, ctor, options);
};
