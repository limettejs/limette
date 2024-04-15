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
    ctx: { type: Object },
    count: { type: Number },
  };

  constructor() {
    super();
    this.ctx = {};
    this.count = 0;
    // this.ctx = { id: "111" };
    console.log("constructor child");
  }

  connectedCallback() {
    super.connectedCallback();
    console.log("connectedCallback child");
  }

  render() {
    console.log("render child island", this.ctx);
    const { id } = this.ctx ?? { id: "x" };
    // const { id } = { id: "x" };
    console.log("", id);
    return html`
      <div>
        <p>Params: ${id}</p>
        <section style="display: flex;">
          <button @click=${() => this.count--}>-</button>
          <p>Count: ${this.count}</p>
          <button @click=${() => this.count++}>+</button>
        </section>
        <button @click=${() => this.dispatchEvent(new Event("change-name"))}>
          change
        </button>
      </div>
    `;
  }
}

customElements.define("child-island", ChildIsland);
