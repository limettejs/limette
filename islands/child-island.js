import { LitElement, html, css } from "lit";

export class ChildIsland extends LitElement {
  static styles = css`
    div {
      border: 1px solid black;
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
    this.count = 0;
    console.log("constructor greeter");
  }

  connectedCallback() {
    this.removeAttribute("defer-hydration");
    super.connectedCallback();
    // super.connectedCallback();
    console.log("connectedCallback greeter");
  }

  firstUpdated() {
    console.log("firstUpdated");
  }

  render() {
    console.log("child island");
    return html`
      <div>
        <section style="display: flex;">
          <button @click=${() => this.count--}>-</button>
          <p>Count: ${this.count}</p>
          <button @click=${() => this.count++}>+</button>
        </section>
        <button @click=${() => this.dispatchEvent(new Event("change-name"))}>
          +
        </button>
      </div>
    `;
  }
}

customElements.define("child-island", ChildIsland);
