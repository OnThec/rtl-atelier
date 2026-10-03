export const GENERIC_ADAPTER = {
  id: "generic",
  name: "Website",
  inputSelectors: ["textarea", "input[type='text']", "input[type='search']"],
  unitHints: [],
};

/*
 * Unit boundaries that generic block-tag detection cannot see. Modern chat
 * platforms render each turn inside custom containers (data-testid roles,
 * framework class names, custom elements); without explicit hints the engine
 * resolves units at the wrong granularity — mis-merging whole conversations
 * or missing streaming updates entirely. Selectors are checked against
 * ancestors of a text leaf; the innermost match becomes the paragraph unit.
 */
const UNIT_HINTS = {
  chatgpt: ["[data-message-author-role]", "[data-testid^='conversation-turn']"],
  claude: [
    "[data-testid='user-message']",
    "[data-testid='assistant-message']",
    "[role='article']",
    ".font-claude-message",
    ".font-claude-response",
    "[class*='font-claude']",
    "[class*='font-user']",
    "[class*='standard-markdown']",
    "[class*='rendered-markdown']",
    "div.prose",
    "[class*='prose']",
  ],
  gemini: ["user-query", "model-response", "message-content"],
  deepseek: [
    "[class*='message-item']",
    ".ds-chat-message-item",
    "[class*='ds-markdown']",
    ".ds-markdown",
    "[class*='chat-message']",
    ".ds-message-item",
    "[class*='chat-content']",
    "div[class*='markdown']",
    ".ds-chat-cell",
    ".ds-message",
  ],
  qwen: ["[class*='user-message']", "[class*='assistant-message']", "[class*='chat-item']"],
  kimi: ["[class*='message-content']", "[class*='chat-content-item']"],
  zai: ["[class*='chat-message']", "[class*='message-item']"],
};

const ADAPTERS = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["chatgpt.com"],
    inputSelectors: ["#prompt-textarea", "textarea"],
  },
  {
    id: "claude",
    name: "Claude",
    hosts: ["claude.ai"],
    inputSelectors: ["div.ProseMirror[contenteditable='true']", "textarea"],
  },
  {
    id: "gemini",
    name: "Gemini",
    hosts: ["gemini.google.com"],
    inputSelectors: ["rich-textarea .ql-editor", ".ql-editor", "textarea"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    hosts: ["deepseek.com", "chat.deepseek.com"],
    inputSelectors: ["textarea"],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    hosts: ["perplexity.ai"],
    inputSelectors: ["textarea"],
  },
  {
    id: "grok",
    name: "Grok",
    hosts: ["grok.com", "x.com"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "copilot",
    name: "Microsoft Copilot",
    hosts: ["copilot.microsoft.com", "bing.com"],
    inputSelectors: ["#searchbox", "#toneofvoice", "textarea"],
  },
  {
    id: "huggingchat",
    name: "HuggingChat",
    hosts: ["huggingface.co"],
    inputSelectors: ["textarea"],
  },
  {
    id: "poe",
    name: "Poe",
    hosts: ["poe.com"],
    inputSelectors: ["textarea"],
  },
  {
    id: "meta-ai",
    name: "Meta AI",
    hosts: ["meta.ai"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "le-chat",
    name: "Le Chat",
    hosts: ["chat.mistral.ai", "mistral.ai"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "ai-studio",
    name: "Google AI Studio",
    hosts: ["aistudio.google.com"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "notebooklm",
    name: "NotebookLM",
    hosts: ["notebooklm.google.com"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "v0",
    name: "v0",
    hosts: ["v0.dev"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "bolt",
    name: "bolt.new",
    hosts: ["bolt.new"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "lovable",
    name: "Lovable",
    hosts: ["lovable.dev"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "replit",
    name: "Replit",
    hosts: ["replit.com"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    hosts: ["openrouter.ai"],
    inputSelectors: ["textarea"],
  },
  {
    id: "together",
    name: "Together AI",
    hosts: ["together.ai"],
    inputSelectors: ["textarea"],
  },
  {
    id: "kimi",
    name: "Kimi",
    hosts: ["kimi.ai", "moonshot.ai"],
    inputSelectors: ["textarea"],
  },
  {
    id: "qwen",
    name: "Qwen Chat",
    hosts: ["chat.qwen.ai", "qwen.ai"],
    inputSelectors: ["div[contenteditable='true']", "textarea"],
  },
  {
    id: "zai",
    name: "Z.ai",
    hosts: ["z.ai", "chat.z.ai"],
    inputSelectors: ["textarea"],
  },
  {
    id: "cohere",
    name: "Coral",
    hosts: ["coral.cohere.com", "cohere.com"],
    inputSelectors: ["textarea"],
  },
];

for (const adapter of ADAPTERS) {
  adapter.unitHints = UNIT_HINTS[adapter.id] || [];
}

export function detectAdapter(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
  for (const adapter of ADAPTERS) {
    for (const pattern of adapter.hosts) {
      if (host === pattern || host.endsWith(`.${pattern}`)) return adapter;
    }
  }
  return GENERIC_ADAPTER;
}

export function listAdapters() {
  return ADAPTERS.map(({ id, name, hosts, unitHints }) => ({ id, name, hosts, unitHints }));
}

/** Hosts where RTL Atelier is active by default in "targeted" activation mode. */
export const PRESET_HOSTS = [
  ...new Set(ADAPTERS.flatMap((adapter) => adapter.hosts)),
];

const PRESET_SET = new Set(PRESET_HOSTS);

/** True when a normalized host is covered by the built-in activation presets. */
export function isPresetHost(hostname) {
  const host = String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
  if (!host) return false;
  if (PRESET_SET.has(host)) return true;
  for (const pattern of PRESET_HOSTS) {
    if (host.endsWith(`.${pattern}`)) return true;
  }
  return false;
}
