import { Node, mergeAttributes } from "@tiptap/core";

/**
 * TipTap custom node : placeholder de variable contrat.
 * Rendu : <span data-placeholder="employe_nom">{{employe_nom}}</span>
 * Sérialisation HTML : conserve `{{var}}` à l'intérieur pour que l'interpolation regex côté PDF matche.
 */
export const ContratPlaceholderNode = Node.create({
  name: "contratPlaceholder",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: {
        default: "",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-placeholder") ?? "",
        renderHTML: (attrs) => ({ "data-placeholder": attrs.key }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-placeholder]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const key = (node.attrs as { key?: string }).key ?? "";
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "tiptap-placeholder-badge",
      }),
      `{{${key}}}`,
    ];
  },

  renderText({ node }) {
    const key = (node.attrs as { key?: string }).key ?? "";
    return `{{${key}}}`;
  },
});
