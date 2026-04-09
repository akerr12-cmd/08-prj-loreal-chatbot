/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const chatMessages = document.getElementById("chatMessages");
const suggestedProductsPanel = document.getElementById("suggestedProductsPanel");
const suggestedProductsList = document.getElementById("suggestedProductsList");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const latestQuestion = document.getElementById("latestQuestion");
const beautyFactCollapsible = document.querySelector(".hero-fact-collapsible");

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";
const STORAGE_KEY = "loreal-chat-state";
const THREAD_STORAGE_KEY = "loreal-chat-thread-id";
const BEAUTY_FACTS = [
  "L'Oréal launched in 1909 and grew into one of the world's best-known beauty companies.",
  "A simple routine usually works best: cleanse, treat, moisturize, and protect with SPF during the day.",
  "Hair and skin care products often work best when chosen for your specific concern, not just your category.",
  "Layering lightweight products first and richer products last helps a routine feel more balanced.",
  "Consistent daily care usually matters more than using a lot of products at once.",
];

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

function setRandomBeautyFact() {
  const factElement = document.getElementById("beautyFactText");

  if (!factElement || BEAUTY_FACTS.length === 0) {
    return;
  }

  const randomIndex = Math.floor(Math.random() * BEAUTY_FACTS.length);
  factElement.textContent = BEAUTY_FACTS[randomIndex];
}

function syncBeautyFactCollapsibleState() {
  if (!beautyFactCollapsible) {
    return;
  }

  if (window.innerWidth <= 1023) {
    beautyFactCollapsible.removeAttribute("open");
    return;
  }

  beautyFactCollapsible.setAttribute("open", "");
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

function hideSuggestedProducts() {
  suggestedProductsPanel.hidden = true;
  suggestedProductsList.innerHTML = "";
}

function renderSuggestedProducts(products) {
  suggestedProductsList.innerHTML = "";

  if (!products.length) {
    hideSuggestedProducts();
    return;
  }

  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    const card = document.createElement(product.url ? "a" : "div");
    card.classList.add("suggested-product-card");

    if (product.url) {
      card.classList.add("suggested-product-card--link");
      card.href = product.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }

    const name = document.createElement("div");
    name.classList.add("suggested-product-name");
    name.textContent = product.name;
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.classList.add("suggested-product-meta");
    meta.textContent = "Suggested by the advisor";
    card.appendChild(meta);

    suggestedProductsList.appendChild(card);
  }

  suggestedProductsPanel.hidden = false;
}

function parseSuggestedProducts(text) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const match = normalizedText.match(/(?:^|\n)Suggested products:\s*\n([\s\S]*)/);

  if (!match) {
    return {
      displayText: text.trim(),
      products: [],
    };
  }

  const headingIndex = normalizedText.indexOf(match[0]);
  const displayText = normalizedText.slice(0, headingIndex).trim();
  const section = match[1];
  const lines = section.split("\n");
  const products = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (!line) {
      break;
    }

    const markdownLinkMatch = line.match(/^[\-•*]\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    const pipeMatch = line.match(/^[\-•*]\s+([^|]+?)(?:\s*\|\s*(https?:\/\/\S+))?$/);
    const plainUrlMatch = line.match(/^[\-•*]\s+(.+?)\s+(https?:\/\/\S+)$/);

    const name = markdownLinkMatch
      ? markdownLinkMatch[1].trim()
      : pipeMatch
        ? pipeMatch[1].trim()
        : plainUrlMatch
          ? plainUrlMatch[1].trim()
          : "";

    const url = markdownLinkMatch
      ? markdownLinkMatch[2].trim()
      : pipeMatch && pipeMatch[2]
        ? pipeMatch[2].trim()
        : plainUrlMatch
          ? plainUrlMatch[2].trim()
          : "";

    if (name) {
      products.push({ name, url });
    }
  }

  return {
    displayText: displayText || text.trim(),
    products: products.slice(0, 3),
  };
}
function addAssistantResponse(text) {
  const parsedResponse = parseSuggestedProducts(text);
  renderSuggestedProducts(parsedResponse.products);
  addMessage("assistant", parsedResponse.displayText);
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
          addAssistantResponse(msg.content, false);
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
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: userText,
      threadId: assistantThreadId,
    }),
  });

  if (!response.ok) {
    throw new Error("Request failed. Check your API URL and try again.");
  }

  const data = await response.json();

  if (data.error && data.error.message) {
    throw new Error(data.error.message);
  }

  if (data.threadId) {
    saveAssistantThreadId(data.threadId);
  }

  const assistantText = data?.content;

  if (!assistantText) {
    throw new Error("No assistant response was returned.");
  }

  return assistantText;
}

// Restore existing chat history when available.
const hasLoadedHistory = loadConversationState();

// If no prior chat exists, show the default welcome message.
if (!hasLoadedHistory) {
  addWelcomeMessage();
  saveConversationState();
}

setLatestQuestion(getLastUserQuestion());
setRandomBeautyFact();
syncBeautyFactCollapsibleState();

updatePlaceholderText();

window.addEventListener("resize", updatePlaceholderText);
window.addEventListener("resize", syncBeautyFactCollapsibleState);

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
  hideSuggestedProducts();

  updateKnownUserName(userText);
  messages.push({ role: "user", content: userText });
  saveConversationState();

  addMessage("assistant", "Thinking...");

  try {
    const aiText = await getAssistantReply(userText);

    if (chatMessages.lastChild) {
      chatMessages.lastChild.remove();
    }

    addAssistantResponse(aiText);
    messages.push({ role: "assistant", content: aiText });
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
