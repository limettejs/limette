import lume from "lume/mod.ts";
import jsx from "lume/plugins/jsx.ts";
import mdx from "lume/plugins/mdx.ts";
import tailwindcss from "lume/plugins/tailwindcss.ts";
import postcss from "lume/plugins/postcss.ts";
import typographyPlugin from "npm:@tailwindcss/typography";

function extractHeadings(markdown) {
  const headingRegex = /^(##|###) (.+)$/gm;
  const headings = [];
  let match;

  while ((match = headingRegex.exec(markdown)) !== null) {
    headings.push({
      level: match[1] === "##" ? 2 : 3,
      text: match[2],
    });
  }
  return headings;
}

function slugify(str: string) {
  return str
    .toLowerCase() // Convert to lowercase
    .trim() // Remove leading and trailing whitespace
    .normalize("NFKD") // Normalize the string to decompose combined characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
    .replace(/[^a-z0-9\s-]/g, "") // Remove non-alphanumeric characters
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-"); // Remove consecutive hyphens
}

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

// Add ids to headings
site.process([".html"], (pages) => {
  for (const page of pages) {
    if (!page.data.url.startsWith("/docs")) continue;

    for (const heading of page.document
      .querySelector(".prose")
      ?.querySelectorAll?.("h2, h3") || []) {
      if (!heading.hasAttribute("id")) {
        heading.setAttribute("id", slugify(heading.textContent));
      }
    }
  }
});

// Extract content structure
site.preprocess([".html"], (pages) => {
  for (const page of pages) {
    if (!page.data.url.startsWith("/docs")) continue;

    const headings: { title: string; url: string; items: unknown[] }[] = [];
    for (const heading of extractHeadings(page.data.content)) {
      if (heading.level === 2) {
        headings.push({
          title: heading.text,
          url: "#" + slugify(heading.text),
          items: [],
        });
      }
      if (heading.level === 3) {
        headings?.[headings.length - 1]?.items?.push({
          title: heading.text,
          url: "#" + slugify(heading.text),
          items: [],
        });
      }
    }
    page.__contentStructure = headings;
    console.log(page);
  }
});

// site.process([".html"], (pages) => {
//   for (const page of pages) {
//     const headings = [];
//     for (const heading of page.document.querySelectorAll("h2, h3")) {
//       if (heading.nodeName === "H2") {
//         headings.push({
//           title: heading.textContent,
//           url: "#" + heading.getAttribute("id"),
//           items: [],
//         });
//       }
//       if (heading.nodeName === "H3") {
//         heading?.[headings.length - 1]?.items?.push({
//           title: heading.textContent,
//           url: "#" + heading.getAttribute("id"),
//         });
//       }
//     }
//     console.log("headings", headings);
//   }
// });

export default site;
