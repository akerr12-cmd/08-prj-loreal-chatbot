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

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";
const STORAGE_KEY = "loreal-chat-state";
const MAX_HISTORY_MESSAGES = 20;
const PRODUCT_FOLLOW_UP = "Would you like to know where you can find these suggested products based on your location?";
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

const SYSTEM_PROMPT =
  "You are a L'Oreal Beauty Advisor chatbot. You may only answer questions about L'Oreal products, beauty routines, ingredients, skin care, hair care, makeup, fragrance, and product recommendations. If the user asks about any unrelated topic, politely refuse in 1 short sentence, then redirect with: 'I can help with L'Oreal products, routines, and beauty recommendations.' When you recommend products, include an exact section labeled 'Suggested products:' followed by up to three bullet lines in this exact format: '- Product name' or '- Product name | https://verified-official-url'. Do not use any other heading for product suggestions. After listing suggested products, ask one short follow-up question about whether the user would like help finding them locally or by location. Keep all responses concise, practical, and beginner-friendly.";

// Store the full chat history so each request has context.
const messages = [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
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
    const card = document.createElement("div");
    card.classList.add("suggested-product-card");
    card.dataset.hasLink = product.url ? "true" : "false";

    const name = document.createElement("div");
    name.classList.add("suggested-product-name");
    name.textContent = product.name;
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.classList.add("suggested-product-meta");
    meta.textContent = product.url ? "Official link available" : "Suggested by the advisor";
    card.appendChild(meta);

    if (product.url) {
      const link = document.createElement("a");
      link.classList.add("suggested-product-link");
      link.href = product.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open official link";
      card.appendChild(link);
    }

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

    const bulletMatch = line.match(/^[\-•*]\s+([^|]+?)(?:\s*\|\s*(https?:\/\/\S+))?$/);

    if (!bulletMatch) {
      break;
    }

    const name = bulletMatch[1].trim();
    const url = bulletMatch[2] ? bulletMatch[2].trim() : "";

    if (name) {
      products.push({ name, url });
    }
  }

  return {
    displayText: displayText || text.trim(),
    products: products.slice(0, 3),
  };
}

function shouldAskLocationFollowUp(parsedResponse) {
  if (parsedResponse.products.length > 0) {
    return true;
  }

  return /\b(store|stores|location|locations|nearby|near you|find them|where to buy|available at|retailer|retailers)\b/i.test(parsedResponse.displayText);
}

function addAssistantResponse(text) {
  const parsedResponse = parseSuggestedProducts(text);
  renderSuggestedProducts(parsedResponse.products);
  addMessage("assistant", parsedResponse.displayText);

  if (shouldAskLocationFollowUp(parsedResponse)) {
    addMessage("assistant", PRODUCT_FOLLOW_UP);
  }

  return parsedResponse;
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
          const parsedResponse = addAssistantResponse(msg.content);

          if (parsedResponse.products.length > 0) {
            messages.push({ role: "assistant", content: PRODUCT_FOLLOW_UP });
          }
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

function buildMessagesForRequest() {
  const historyWithoutSystem = messages.filter((msg) => msg.role !== "system");
  const recentHistory = historyWithoutSystem.slice(-MAX_HISTORY_MESSAGES);

  const requestMessages = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (userProfile.name) {
    requestMessages.push({
      role: "system",
      content: `Known user name: ${userProfile.name}. Use their name naturally when helpful.`,
    });
  }

  for (let i = 0; i < recentHistory.length; i += 1) {
    requestMessages.push(recentHistory[i]);
  }

  return requestMessages;
}

function getChatLinesForDownload() {
  const historyWithoutSystem = messages.filter((msg) => msg.role !== "system");

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
  messages.length = 1;
  chatWindow.innerHTML = "";
  hideSuggestedProducts();
  setLatestQuestion("");
  addWelcomeMessage();
  saveConversationState();
  userInput.focus();
}

async function getAssistantReply(requestMessages) {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: requestMessages,
    }),
  });

  if (!response.ok) {
    throw new Error("Request failed. Check your API URL and try again.");
  }

  const data = await response.json();
  return data.choices[0].message.content;
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

  if (!WORKER_URL) {
    addMessage("assistant", "Please add your Cloudflare Worker URL in script.js.");
    return;
  }

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
    const requestMessages = buildMessagesForRequest();
    const aiText = await getAssistantReply(requestMessages);
    const parsedResponse = parseSuggestedProducts(aiText);

    // Remove "Thinking..." and replace with actual assistant response.
    chatWindow.lastChild.remove();
    addAssistantResponse(aiText);
    messages.push({ role: "assistant", content: aiText });

    if (parsedResponse.products.length > 0) {
      messages.push({ role: "assistant", content: PRODUCT_FOLLOW_UP });
    }

    saveConversationState();
  } catch (error) {
    chatWindow.lastChild.remove();
    addMessage("assistant", `Sorry, something went wrong. ${error.message}`);
  }

  userInput.focus();
});
