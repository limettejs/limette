import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import mdx from "lume/plugins/mdx.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import typographyPlugin from "npm:@tailwindcss/typography";

const site = lume();

site.use(jsx());
site.use(mdx());
site.use(
  tailwindcss({
    // Extract the classes from HTML and JSX files
    extensions: [".vto", ".html"],
    options: {
      content: [".vto"],
      darkMode: "selector",
      theme: {
        fontSize: {
          xs: ["0.75rem", { lineHeight: "1rem" }],
          sm: ["0.875rem", { lineHeight: "1.5rem" }],
          base: ["1rem", { lineHeight: "2rem" }],
          lg: ["1.125rem", { lineHeight: "1.75rem" }],
          xl: ["1.25rem", { lineHeight: "2rem" }],
          "2xl": ["1.5rem", { lineHeight: "2.5rem" }],
          "3xl": ["2rem", { lineHeight: "2.5rem" }],
          "4xl": ["2.5rem", { lineHeight: "3rem" }],
          "5xl": ["3rem", { lineHeight: "3.5rem" }],
          "6xl": ["3.75rem", { lineHeight: "1" }],
          "7xl": ["4.5rem", { lineHeight: "1" }],
          "8xl": ["6rem", { lineHeight: "1" }],
          "9xl": ["8rem", { lineHeight: "1" }],
        },
        extend: {
          fontFamily: {
            sans: "var(--font-inter)",
            display: ["var(--font-lexend)", { fontFeatureSettings: '"ss01"' }],
          },
          maxWidth: {
            "8xl": "88rem",
          },
        },
      },
      plugins: [typographyPlugin],
    },
  })
);
site.use(postcss());

// Copy all image files
site.copy([".jpg", ".gif", ".png", ".woff2"]);

export default site;
