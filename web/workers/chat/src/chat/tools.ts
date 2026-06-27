import type { ToolDefinition, ToolParameter } from '../types';

// JSON-Schema `{type:object, properties, required}` shared by every provider.
// Each provider wraps this in its own envelope (function:{} / input_schema / parameters).
export function toJsonSchemaParams(parameters: ToolParameter[]) {
  return {
    type: 'object' as const,
    properties: Object.fromEntries(
      parameters.map(p => [
        p.name,
        p.type === 'string[]'
          ? { type: 'array', items: { type: 'string' }, description: p.description }
          : { type: 'string', description: p.description },
      ])
    ),
    required: parameters.filter(p => p.required).map(p => p.name),
  };
}

export const TOOLS: ToolDefinition[] = [
  // --- Client-side tools (emitted to browser via SSE) ---
  {
    name: 'show_items',
    description: 'Renders interactive item cards in the chat UI. Call this every time you recommend menu items. MANDATORY: You MUST write at least one sentence of text in your response before or alongside this tool call. A response with only this tool call and no text is invalid — always include a warm descriptive sentence.',
    parameters: [
      {
        name: 'item_ids',
        type: 'string[]',
        description: 'Array of exact item IDs copied from [id:...] brackets in the menu data. Copy the real ID verbatim. Never invent IDs and never use placeholder/example IDs.',
        required: true,
      },
    ],
  },
  {
    name: 'navigate_to_category',
    description: 'Navigate the menu page to a specific category AND show refinement choices to the user. Use ONLY when the user explicitly asks to see or browse a section (e.g. "mostrami i secondi", "show me the pizzas"). You MUST write a short text confirmation in the same response (e.g. "Eccoci nella sezione Pizze!").',
    parameters: [
      {
        name: 'category_id',
        type: 'string',
        description: 'The exact category ID copied from a [category:...] bracket in the menu data. Copy the real ID verbatim; never translate it and never use the category name.',
        required: true,
      },
      {
        name: 'choices_prompt',
        type: 'string',
        description: 'The question to display to help narrow down (e.g. "Cosa preferisci?").',
        required: true,
      },
      {
        name: 'choices',
        type: 'string[]',
        description: 'Short labels for the refinement choices (2-4 items, e.g. ["Pesce", "Carne"]).',
        required: true,
      },
    ],
  },
  {
    name: 'filter_menu',
    description: 'Filter the menu to exclude allergens or search for specific items. Use when user mentions dietary restrictions or allergies.',
    parameters: [
      {
        name: 'exclude_allergens',
        type: 'string[]',
        description: 'Allergen identifiers to exclude (e.g. "Glutine", "Latte-e-Derivati")',
        required: false,
      },
      {
        name: 'search_query',
        type: 'string',
        description: 'Text search query to filter menu items',
        required: false,
      },
    ],
  },

  {
    name: 'show_choices',
    description: 'Show interactive choice buttons to help the user decide. Use when the user is uncertain or indecisive, OR immediately after scroll_to_category to help narrow down within the scrolled section. The user picks from the options, and their selection is sent back as a message. Set mode to "single" for one choice, "multi" for multiple selections.',
    parameters: [
      {
        name: 'prompt',
        type: 'string',
        description: 'The question to display above the choices (e.g. "Che tipo di piatto preferisci?")',
        required: true,
      },
      {
        name: 'choices',
        type: 'string[]',
        description: 'Array of choice labels (e.g. ["Pesce", "Carne", "Vegetariano"]). Keep labels short (1-3 words).',
        required: true,
      },
      {
        name: 'mode',
        type: 'string',
        description: '"single" (pick one, sent immediately) or "multi" (pick several, confirm to send). Default: "single".',
        required: false,
      },
    ],
  },

  // --- Server-side tools (resolved by the worker, result fed back to LLM) ---
  {
    name: 'get_item_detail',
    description: 'Get full details for a menu item: description, allergens, variants, and extras. Use when the user asks about a specific dish or you need allergen info.',
    serverSide: true,
    parameters: [
      {
        name: 'item_id',
        type: 'string',
        description: 'The item ID from [id:xxx] brackets in the menu data.',
        required: true,
      },
    ],
  },
  {
    name: 'search_by_allergens',
    description: 'Find menu items whose listed allergens do not include specific allergens according to menu data. Use when the user has dietary restrictions, allergies, or intolerances. This does not guarantee safety; the diner must confirm with the waiter before ordering.',
    serverSide: true,
    parameters: [
      {
        name: 'exclude_allergens',
        type: 'string[]',
        description: 'Allergen identifiers to exclude. Valid values: Glutine, Latte-e-Derivati, Uova, Pesce, Crostacei, Molluschi, Arachidi, Frutta-a-Guscio, Soia, Sedano, Senape, Sesamo, Lupini, Anidride-Solforosa-e-Solfiti.',
        required: true,
      },
    ],
  },
];
