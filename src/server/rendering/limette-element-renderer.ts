// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import { unsafeCSS } from "lit";
// @ts-ignore lit is a npm package and Deno doesn't resolve the exported members
import type { LitElement } from "lit";
import { LitElementRenderer } from "../../deps.ts";
import type { RenderInfo, RenderResult } from "../../deps.ts";
import type { BuildRoute } from "../../dev/build.ts";
import type { ComponentContext } from "../router.ts";

interface LimetteElement extends LitElement {
  __ctx?: ComponentContext; // Define the custom property here }
}

export const LimetteElementRenderer = (
  route: BuildRoute,
  componentContext: ComponentContext
) =>
  class LimetteElementRenderer extends LitElementRenderer {
    override connectedCallback(): void {
      if (
        this.element.hasAttribute("island") &&
        !this.element.hasAttribute("ssr")
      ) {
        this.element.setAttribute("skip-hydration", "");
      }

      super.connectedCallback();
    }
    /**
     * Render the element's shadow root children.
     *
     * If `renderShadow()` returns undefined, no declarative shadow root is
     * emitted.
     */
    override renderShadow(renderInfo: RenderInfo): RenderResult {
      // console.log("RENDERSHADOW SSR", this);

      // We check if the element is inside of is-land element
      const isIslandChild = renderInfo.customElementInstanceStack
        .slice(0, -1)
        .some((el) => el?.tagName === "is-land");

      if (
        (isIslandChild || this.element.hasAttribute("island")) &&
        !this.element.hasAttribute("ssr")
      ) {
        if (this.element.hasAttribute("no-tailwind")) return;
        // console.log(
        //   this.tagName,
        //   "no-ssr",
        //   this.element.constructor.elementStyles
        // );
        // console.log("aaa", renderInfo.customElementHostStack);
        // console.log("bbb", this.element.constructor.shadowRootOptions);
        // return `<template shadowroot="open" shadowrootmode="open"
        //   ><style>
        //     @import url("/_limette/css/tailwind-6dbd54.css");
        //   </style></template
        // >`;
        // console.log("hhhhh", renderInfo.customElementInstanceStack);
        // return `<style>
        //     @import url("/_limette/css/tailwind-6dbd54.css");
        //   </style>
        //   <!--lit-part 73bOaQSTJ+0=--><div></div><!--/lit-part-->`;
        this.setAttribute("skip-hydrationvv", "ggg");
        this.element.setAttribute("skip-hydrationvv", "sss");
        return `<style>@import url("${route.cssAssetPath}");</style>`;
        // return `<style>@import url("${route.cssAssetPath}");</style><!--lit-part-->ss<!--/lit-part-->`;
        // return `<style>@import url("${route.cssAssetPath}");</style><!--lit-part 73bOaQSTJ+0=--><!--/lit-part-->`;
        // this.element.render = () => html`${myDirective("loading")}`;
        // ("lit-part 73bOaQSTJ+0=");
        // // return;
      }

      const ctor = this.element.constructor as typeof LitElement & {
        __tailwind: boolean;
      };

      // Inject component context
      if (this.tagName.startsWith("lmt-route-")) {
        (this.element as LimetteElement).__ctx = componentContext;
      }

      // Don't inject Tailwind CSS for <is-land>, no-tailwind attribute or if there is no CSS
      if (
        this.tagName !== "is-land" &&
        !this.element.hasAttribute("no-tailwind") &&
        ctor.__tailwind !== true &&
        route.cssAssetPath
      ) {
        // Inject Tailwind CSS import
        ctor.elementStyles?.unshift?.(
          unsafeCSS(`@import url("${route.cssAssetPath}");`)
        );

        // Mark component that was already injected
        ctor.__tailwind = true;
      }

      return super.renderShadow(renderInfo);
    }
  };
