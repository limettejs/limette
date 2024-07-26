import { LitElement, html, css } from "lit";

export class IslandBar extends LitElement {
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
    ctx: { type: Object, reflect: true },
    foo: { type: Object, reflect: true },
    id: { type: Number },
    count: { type: Number },
  };

  constructor() {
    super();
    this.count = 0;
  }

  willUpdate() {
    this.conect = "foo";
  }

  render() {
    return html`
      <div class="border-solid border-2 border-teal-500 rounded-md">
        <p>Params: ${this.foo?.a}</p>
        <section class="flex items-center">
          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=${() => this.count--}
          >
            -
          </button>
          <p>Count: ${this.count}</p>
          <button
            type="button"
            class="rounded-full bg-indigo-600 p-1.5 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            @click=${() => this.count++}
          >
            +
          </button>
        </section>
        <button
          type="button"
          class="rounded-full bg-white px-2.5 py-1 mt-4 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          @click=${() => this.dispatchEvent(new Event("change-name"))}
        >
          Change name
        </button>
      </div>
    `;
  }
}

customElements.define("island-bar", IslandBar);
