/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatMessages = document.getElementById("chatMessages");
const discoverSuggestedList = document.getElementById("discoverSuggestedList");
const discoverProductsDebug = document.getElementById("discoverProductsDebug");
const downloadProductsBtn = document.getElementById("downloadProductsBtn");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const latestQuestion = document.getElementById("latestQuestion");

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";
const STORAGE_KEY = "loreal-chat-state";
const THREAD_STORAGE_KEY = "loreal-chat-thread-id";

// Deployed Cloudflare Worker endpoint.
const WORKER_URL = "https://lorealchatbot-worker.akerr12.workers.dev/";

const userProfile = {
  name: "",
};

let assistantThreadId = localStorage.getItem(THREAD_STORAGE_KEY) || "";
let latestSuggestedProducts = [];
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
  const emptyItem = document.createElement("li");
  emptyItem.classList.add("discover-suggested-empty");
  emptyItem.textContent = message;
  discoverSuggestedList.appendChild(emptyItem);
}

function setProductsDebug(count, prefix = "Parsed") {
  if (!discoverProductsDebug) {
    return;
  }

  const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
  const label = safeCount === 1 ? "product" : "products";
  discoverProductsDebug.textContent = `${prefix} ${safeCount} ${label} from latest reply.`;
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

function renderDiscoverSuggestedProducts(products) {
  if (!discoverSuggestedList) {
    return;
  }

  if (!products.length) {
    if (!latestSuggestedProducts.length) {
      setDiscoverSuggestionMessage("No products suggested yet. Ask about a routine or concern.");
    }
    return;
  }

  latestSuggestedProducts = products.slice();
  discoverSuggestedList.innerHTML = "";

  for (let i = 0; i < products.length; i += 1) {
    const product = products[i];
    const item = document.createElement("li");

    if (product.url) {
      const link = document.createElement("a");
      link.href = product.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = product.name;
      item.appendChild(link);
    } else {
      item.textContent = product.name;
    }

    discoverSuggestedList.appendChild(item);
  }
}

function parseSuggestedProducts(text) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const sectionRegex = /(?:^|\n)(?:#{1,6}\s*)?(?:suggested|recommended)\s+products?\s*:?\s*\n([\s\S]*)/i;
  const match = normalizedText.match(sectionRegex);

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

    const markdownLinkMatch = line.match(/^(?:[\-•*]|\d+\.)\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    const pipeMatch = line.match(/^(?:[\-•*]|\d+\.)\s+([^|]+?)(?:\s*\|\s*(https?:\/\/\S+))?$/);
    const plainUrlMatch = line.match(/^(?:[\-•*]|\d+\.)\s+(.+?)\s+(https?:\/\/\S+)$/);

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

      const cleanedName = name.replace(/^["'`\-\s]+|["'`\s]+$/g, "");

      if (cleanedName) {
        products.push({ name: cleanedName, url });
    }
  }

    if (!products.length) {
      const fallbackListRegex = /(?:^|\n)(?:[\-•*]|\d+\.)\s+([^\n|]+?)\s*(?:\|\s*(https?:\/\/\S+)|\((https?:\/\/\S+)\)|\s+(https?:\/\/\S+))?\s*$/gim;
      let fallbackMatch;

      while ((fallbackMatch = fallbackListRegex.exec(normalizedText)) !== null) {
        const fallbackName = (fallbackMatch[1] || "").trim();
        const fallbackUrl = (fallbackMatch[2] || fallbackMatch[3] || fallbackMatch[4] || "").trim();

        if (fallbackName) {
          products.push({ name: fallbackName, url: fallbackUrl });
        }

        if (products.length >= 3) {
          break;
        }
      }
    }

  return {
    displayText: displayText || text.trim(),
    products: products.slice(0, 3),
  };
}
function addAssistantResponse(text) {
  const parsedResponse = parseSuggestedProducts(text);
  renderDiscoverSuggestedProducts(parsedResponse.products);
  setProductsDebug(parsedResponse.products.length);
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

function getSuggestedProductLinesForDownload() {
  if (!latestSuggestedProducts.length) {
    return ["L'Oreal Suggested Products", "", "No suggested products available yet."];
  }

  const lines = [
    "L'Oreal Suggested Products",
    `Exported: ${new Date().toLocaleString()}`,
    "",
  ];

  for (let i = 0; i < latestSuggestedProducts.length; i += 1) {
    const product = latestSuggestedProducts[i];
    const itemNumber = i + 1;

    if (product.url) {
      lines.push(`${itemNumber}. ${product.name} - ${product.url}`);
    } else {
      lines.push(`${itemNumber}. ${product.name}`);
    }
  }

  return lines;
}

function downloadSuggestedProducts() {
  const lines = getSuggestedProductLinesForDownload();
  const fileText = lines.join("\n");
  const fileBlob = new Blob([fileText], { type: "text/plain" });
  const objectUrl = URL.createObjectURL(fileBlob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = `loreal-suggested-products-${new Date().toISOString().slice(0, 10)}.txt`;
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
if (discoverSuggestedList && discoverSuggestedList.children.length === 0) {
  setDiscoverSuggestionMessage("Ask a question to see product suggestions.");
}
setProductsDebug(latestSuggestedProducts.length);

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

if (downloadProductsBtn) {
  downloadProductsBtn.addEventListener("click", () => {
    downloadSuggestedProducts();
  });
}

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
  setProductsDebug(0, "Waiting for reply. Parsed");

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
    setProductsDebug(0, "Reply failed. Parsed");
  }

  userInput.focus();
});
