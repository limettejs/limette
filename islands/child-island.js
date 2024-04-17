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
    cctx: { type: Object, reflect: true },
    foo: { type: Object, reflect: true },
    id: { type: Number },
    count: { type: Number },
  };

  constructor() {
    super();
    this.count = 0;
    // this.ctx = {};
    console.log("island[constructor][ctx]", this.ctx);
    console.log("island[constructor][cctx]", this.cctx);
    console.log("island[constructor][foo]", this.foo);
    this.id = this.ctx?.params;
  }

  connectedCallback() {
    super.connectedCallback();
    console.log("connectedCallback island", this.ctx, this.cctx);
  }
  willUpdate(changed) {
    console.log("island[willUpdate][ctx]", this.ctx, this.cctx);
  }

  render() {
    console.log(
      "island[render][ctx]",
      this.tagName,
      this.ctx,
      this.cctx,
      this.foo
    );
    const { id } = this?.ctx?.params ?? {};
    // const { id } = { id: "x" };
    return html`
      <div>
        <p>Params: ${this.foo.a}</p>
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
