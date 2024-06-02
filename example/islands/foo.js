import { LitElement, html, css } from "lit";
import "./bar.js";

export class IslandFoo extends LitElement {
  static styles = css`
    div {
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    span {
      color: rebeccapurple;
    }

    p {
      font-family: sans-serif;
      margin: 0;
      padding: 0 10px;
    }
  `;

  static properties = {
    name: {},
    count: { type: Number },
  };

  constructor() {
    super();
    this.name = "Somebody";
    this.count = 0;
    console.log("constructor greeter");
  }

  connectedCallback() {
    // this.removeAttribute("defer-hydration");
    super.connectedCallback();
    // super.connectedCallback();
    console.log("connectedCallback greeter");
  }

  firstUpdated() {
    console.log("firstUpdated");
  }

  render() {
    console.log("island");
    return html`
      <div class="border-solid border-2 border-indigo-600 rounded-md">
        <h1 class="bg-lime-600">Hello, <span>${this.name}</span>!</h1>
        <section class="flex items-center">
          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=${() => this.count--}
          >
            -
          </button>
          <p class="text-blue-600/100">Count: ${this.count}</p>

          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=${() => this.count++}
          >
            +
          </button>
        </section>

        <island-bar
          class="mt-5"
          @change-name=${() => (this.name = "Ingrid")}
        ></island-bar>
      </div>
    `;
  }
}

customElements.define("island-foo", IslandFoo);
