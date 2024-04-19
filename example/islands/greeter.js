import { LitElement, html, css } from "lit";
import "./child-island.js";

export class Greeter extends LitElement {
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
      <div>
        <h1>Hello, <span>${this.name}</span>!</h1>
        <section style="display: flex;">
          <button @click=${() => this.count--}>-</button>
          <p>Count: ${this.count}</p>
          <button @click=${() => this.count++}>+</button>
        </section>

        <child-island
          @change-name=${() => (this.name = "Ingrid")}
        ></child-island>
      </div>
    `;
  }
}

customElements.define("simple-greeter", Greeter);
