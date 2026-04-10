/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatMessages = document.getElementById("chatMessages");
const discoverSuggestedList = document.getElementById("discoverSuggestedList");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const latestQuestion = document.getElementById("latestQuestion");

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";
const STORAGE_KEY = "loreal-chat-state";
const THREAD_STORAGE_KEY = "loreal-chat-thread-id";
const LOREAL_SEARCH_BASE = "https://www.lorealparisusa.com/search?q=";

// Deployed Cloudflare Worker endpoint.
const WORKER_URL = "https://lorealchatbot-worker.akerr12.workers.dev/";

const userProfile = {
  name: "",
};

let assistantThreadId = localStorage.getItem(THREAD_STORAGE_KEY) || "";
const messages = [
];

function updatePlaceholderText() {
  if (window.innerWidth <= 399) {
    userInput.placeholder = mobilePlaceholder;
    return;
  }

  userInput.placeholder = desktopPlaceholder;
}

function setDiscoverSuggestionMessage(message) {
  if (!discoverSuggestedList) {
    return;
  }

  discoverSuggestedList.innerHTML = "";
  const item = document.createElement("li");
  item.classList.add("discover-suggested-empty");
  item.textContent = message;
  discoverSuggestedList.appendChild(item);
}

function cleanSuggestedProductName(rawName) {
  let name = String(rawName || "").trim();

  name = name
    .replace(/\*\*/g, "")
    .replace(/^['"`\-\s]+|['"`\s]+$/g, "")
    .trim();

  if (name.includes(" - ")) {
    name = name.split(" - ")[0].trim();
  }

  if (name.includes(" — ")) {
    name = name.split(" — ")[0].trim();
  }

  if (name.includes(" – ")) {
    name = name.split(" – ")[0].trim();
  }

  return name.replace(/\s{2,}/g, " ").trim();
}

function buildLorealProductUrl(productName) {
  return `${LOREAL_SEARCH_BASE}${encodeURIComponent(productName)}`;
}

function normalizeSuggestedProducts(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (let i = 0; i < products.length; i += 1) {
    const product = products[i] || {};
    const productName = typeof product === "string"
      ? cleanSuggestedProductName(product)
      : cleanSuggestedProductName(product.name || "");

    if (!productName) {
      continue;
    }

    const dedupeKey = productName.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push({
      name: productName,
      url: buildLorealProductUrl(productName),
    });

    if (normalized.length >= 3) {
      break;
    }
  }

  return normalized;
}

function parseSuggestedProductsFromText(text) {
  const normalizedText = String(text || "").replace(/\r\n/g, "\n");
  const sectionMatch = normalizedText.match(/(?:^|\n)\s*(?:suggested|recommended)\s+products?\s*:?\s*\n([\s\S]*)/i);

  if (!sectionMatch || !sectionMatch[1]) {
    return [];
  }

  const lines = sectionMatch[1].split("\n");
  const products = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line && products.length > 0) {
      break;
    }

    const bulletMatch = line.match(/^(?:[\-•*]|\d+\.)\s+(.+)$/);
    if (!bulletMatch || !bulletMatch[1]) {
      if (products.length > 0) {
        break;
      }
      continue;
    }

    const candidate = bulletMatch[1]
      .replace(/\((?:https?:\/\/[^\s)]+)\)$/i, "")
      .replace(/\|\s*https?:\/\/\S+$/i, "")
      .replace(/https?:\/\/\S+/gi, "")
      .trim();

    products.push({ name: candidate });

    if (products.length >= 3) {
      break;
    }
  }

  return normalizeSuggestedProducts(products);
}

function parseInlineProductMentions(text) {
  const normalizedText = String(text || "").replace(/\r\n/g, "\n");
  const matches = [];
  const patterns = [
    /(?:recommend|suggest|try)\s+([A-Z][A-Za-z0-9'\-\s]{3,80})/g,
    /([A-Z][A-Za-z0-9'\-\s]{3,80})\s+(?:is|are)\s+(?:a\s+)?(?:great|good|helpful|effective)\s+(?:option|choice)/g,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    let match;

    while ((match = patterns[i].exec(normalizedText)) !== null) {
      const candidate = String(match[1] || "")
        .replace(/[.,;!?]+$/g, "")
        .trim();

      if (candidate) {
        matches.push({ name: candidate });
      }
    }
  }

  return normalizeSuggestedProducts(matches);
}

function renderDiscoverSuggestedProducts(products) {
  if (!discoverSuggestedList) {
    return;
  }

  const safeProducts = normalizeSuggestedProducts(products);
  discoverSuggestedList.innerHTML = "";

  if (!safeProducts.length) {
    setDiscoverSuggestionMessage("No products suggested yet. Ask a product question.");
    return;
  }

  for (let i = 0; i < safeProducts.length; i += 1) {
    const product = safeProducts[i];
    const item = document.createElement("li");
    const link = document.createElement("a");

    link.href = product.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = product.name;

    item.appendChild(link);
    discoverSuggestedList.appendChild(item);
  }
}

function addMessage(role, text) {
  const msgElement = document.createElement("div");
  msgElement.classList.add("msg");

  if (role === "user") {
    msgElement.classList.add("user");
    msgElement.textContent = `You: ${text}`;
  } else {
    msgElement.classList.add("ai");
    msgElement.textContent = `L'Oréal Advisor: ${text}`;
  }

  chatMessages.appendChild(msgElement);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function saveAssistantThreadId(threadId) {
  assistantThreadId = threadId || "";

  if (assistantThreadId) {
    localStorage.setItem(THREAD_STORAGE_KEY, assistantThreadId);
    return;
  }

  localStorage.removeItem(THREAD_STORAGE_KEY);
}

function stripProductsFromAssistantText(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const headingRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:suggested|recommended)\s+products?\s*:?\s*(?:\*\*)?\s*\n([\s\S]*)/i;
  const headingMatch = normalized.match(headingRegex);

  if (headingMatch) {
    const headingIndex = normalized.indexOf(headingMatch[0]);
    return normalized.slice(0, headingIndex).trim();
  }

  return normalized.trim();
}

function addAssistantResponse(payload) {
  const isStructuredPayload = payload && typeof payload === "object" && !Array.isArray(payload);
  const assistantText = typeof payload === "string"
    ? payload
    : isStructuredPayload && typeof payload.content === "string"
      ? payload.content
      : "";
  const suggestedProducts = isStructuredPayload && Array.isArray(payload.products)
    ? normalizeSuggestedProducts(payload.products)
    : [];
  const fallbackSectionProducts = suggestedProducts.length
    ? suggestedProducts
    : parseSuggestedProductsFromText(assistantText);
  const finalSuggestedProducts = fallbackSectionProducts.length
    ? fallbackSectionProducts
    : parseInlineProductMentions(assistantText);
  const cleanedDisplayText = stripProductsFromAssistantText(assistantText);

  renderDiscoverSuggestedProducts(finalSuggestedProducts);
  addMessage("assistant", (cleanedDisplayText || assistantText || "").trim());
}

function setLatestQuestion(text) {
  if (!text) {
    latestQuestion.hidden = true;
    latestQuestion.textContent = "";
    return;
  }

  latestQuestion.hidden = false;
  latestQuestion.textContent = `Latest question: ${text}`;
}

function getLastUserQuestion() {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "user") {
      return messages[i].content;
    }
  }

  return "";
}

function addWelcomeMessage() {
  const welcomeText = "Hello. How can I help you with your beauty routine today?";
  messages.push({ role: "assistant", content: welcomeText });
  addAssistantResponse(welcomeText);
}

function capitalizeName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

function extractNameFromText(text) {
  const patterns = [
    /(?:my name is)\s+([a-zA-Z][a-zA-Z'-]{1,30})/i,
    /(?:i am|i'm)\s+([a-zA-Z][a-zA-Z'-]{1,30})/i,
  ];

  for (let i = 0; i < patterns.length; i += 1) {
    const match = text.match(patterns[i]);
    if (match && match[1]) {
      return capitalizeName(match[1]);
    }
  }

  return "";
}

function updateKnownUserName(text) {
  const detectedName = extractNameFromText(text);

  if (detectedName) {
    userProfile.name = detectedName;
  }
}

function saveConversationState() {
  const historyWithoutSystem = messages.filter((msg) => msg.role !== "system");

  const state = {
    name: userProfile.name,
    messages: historyWithoutSystem,
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadConversationState() {
  const rawState = localStorage.getItem(STORAGE_KEY);

  if (!rawState) {
    return false;
  }

  try {
    const state = JSON.parse(rawState);

    if (state.name) {
      userProfile.name = state.name;
    }

    if (Array.isArray(state.messages) && state.messages.length > 0) {
      for (let i = 0; i < state.messages.length; i += 1) {
        const msg = state.messages[i];

        if (!msg || !msg.role || !msg.content) {
          continue;
        }

        messages.push({ role: msg.role, content: msg.content });
        if (msg.role === "assistant") {
          addAssistantResponse(msg.content);
        } else {
          addMessage(msg.role, msg.content);
        }
      }

      return true;
    }
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
  }

  return false;
}

function getChatLinesForDownload() {
  const historyWithoutSystem = messages;

  if (historyWithoutSystem.length === 0) {
    return ["L'Oreal Beauty Advisor Chat", "", "No chat messages available."];
  }

  const lines = [
    "L'Oreal Beauty Advisor Chat",
    `Exported: ${new Date().toLocaleString()}`,
    "",
  ];

  for (let i = 0; i < historyWithoutSystem.length; i += 1) {
    const msg = historyWithoutSystem[i];
    const label = msg.role === "user" ? "You" : "L'Oreal Advisor";
    lines.push(`${label}: ${msg.content}`);
    lines.push("");
  }

  return lines;
}

function downloadChatHistory() {
  const lines = getChatLinesForDownload();
  const fileText = lines.join("\n");
  const fileBlob = new Blob([fileText], { type: "text/plain" });
  const objectUrl = URL.createObjectURL(fileBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = `loreal-chat-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(objectUrl);
}

function clearConversation() {
  userProfile.name = "";
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(THREAD_STORAGE_KEY);
  assistantThreadId = "";
  window.location.reload();
}

async function getAssistantReply(userText) {
  let response;
  let data;

  if (!userText || !userText.trim()) {
    throw new Error("Cannot send an empty message.");
  }

  try {
    response = await fetch(WORKER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userText,
        threadId: assistantThreadId,
      }),
    });
  } catch (error) {
    throw new Error("Could not reach the Cloudflare Worker. Check the worker URL, deployment, and CORS settings.");
  }

  try {
    data = await response.json();
  } catch (error) {
    if (!response.ok) {
      throw new Error("Request failed. Check your API URL and try again.");
    }

    throw new Error("The Cloudflare Worker returned an invalid JSON response.");
  }

  if (!response.ok) {
    const errorMessage = data?.error?.message || "Request failed. Check your API URL and try again.";
    throw new Error(errorMessage);
  }

  if (data.error && data.error.message) {
    throw new Error(data.error.message);
  }

  if (data.threadId) {
    saveAssistantThreadId(data.threadId);
  }

  const assistantText = data?.content;
  const assistantProducts = Array.isArray(data?.products) ? data.products : [];

  if (!assistantText) {
    throw new Error("No assistant response was returned.");
  }

  return {
    content: assistantText,
    products: assistantProducts,
  };
}

// Restore existing chat history when available.
const hasLoadedHistory = loadConversationState();

// If no prior chat exists, show the default welcome message.
if (!hasLoadedHistory) {
  addWelcomeMessage();
  saveConversationState();
}

setLatestQuestion(getLastUserQuestion());
if (discoverSuggestedList) {
  setDiscoverSuggestionMessage("Ask a product question to see suggestions.");
}

updatePlaceholderText();

window.addEventListener("resize", updatePlaceholderText);

// Enter sends the message. Shift+Enter inserts a new line.
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

clearBtn.addEventListener("click", () => {
  clearConversation();
});

downloadBtn.addEventListener("click", () => {
  downloadChatHistory();
});

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userText = userInput.value.trim();

  if (!userText) {
    return;
  }

  addMessage("user", userText);
  userInput.value = "";
  setLatestQuestion(userText);

  updateKnownUserName(userText);
  messages.push({ role: "user", content: userText });
  saveConversationState();

  addMessage("assistant", "Thinking...");

  try {
    const assistantPayload = await getAssistantReply(userText);

    if (chatMessages.lastChild) {
      chatMessages.lastChild.remove();
    }

    addAssistantResponse(assistantPayload);
    messages.push({ role: "assistant", content: assistantPayload.content });
    saveConversationState();
  } catch (error) {
    if (chatMessages.lastChild) {
      chatMessages.lastChild.remove();
    }
    if (String(error.message).includes("Missing required parameter: 'messages'")) {
      addMessage("assistant", "Your deployed Cloudflare Worker is still using the old chat-completions code. Redeploy the updated worker from RESOURCE_cloudflare-worker.js and make sure ASSISTANT_ID is set.");
    } else {
      addMessage("assistant", `Sorry, something went wrong. ${error.message}`);
    }
  }

  userInput.focus();
});
