/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const chatMessages = document.getElementById("chatMessages");
const clearBtn = document.getElementById("clearBtn");
const downloadBtn = document.getElementById("downloadBtn");
const latestQuestion = document.getElementById("latestQuestion");
const categoryElements = document.querySelectorAll(".category");
const quickStartPanel = document.getElementById("quickStartPanel");
const quickStartButtons = document.querySelectorAll("[data-quick-start]");

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
const messages = [
];

const quickStartPromptPool = [
  "Find my foundation shade",
  "Build a nighttime routine",
  "Recommend a hair repair routine",
  "Suggest a simple morning skincare routine",
  "Help with oily skin and large pores",
  "Recommend products for dry hair",
  "How do I layer skincare products?",
  "Find a routine for sensitive skin",
  "Recommend a fragrance for daytime",
  "Create a beginner makeup routine",
];

const quickStartPromptPoolByCategory = {
  skin: [
    "Find my foundation shade",
    "Build a routine for sensitive skin",
    "How do I layer skincare products?",
    "Recommend products for dry skin",
    "Help with oily skin and large pores",
  ],
  hair: [
    "Recommend a hair repair routine",
    "Best routine for color-treated hair",
    "How do I reduce frizz and breakage?",
    "Recommend products for dry hair",
    "Build a scalp care routine",
  ],
  makeup: [
    "Find my foundation shade",
    "Create a beginner makeup routine",
    "Recommend a natural everyday makeup look",
    "How do I make makeup last all day?",
    "Suggest a soft glam routine",
  ],
  fragrance: [
    "Recommend a fragrance for daytime",
    "Suggest a fragrance for evening",
    "Help me choose a floral scent",
    "Find a signature scent profile",
    "Recommend a fresh, clean fragrance",
  ],
};

function getRandomPrompts(pool, count) {
  const shuffled = [...pool];

  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[randomIndex];
    shuffled[randomIndex] = temp;
  }

  return shuffled.slice(0, count);
}

function randomizeQuickStartOptions(categoryName = "") {
  if (!quickStartButtons.length) {
    return;
  }

  const categoryKey = String(categoryName || "").trim().toLowerCase();
  const categoryPool = quickStartPromptPoolByCategory[categoryKey];
  const poolToUse = Array.isArray(categoryPool) && categoryPool.length > 0
    ? categoryPool
    : quickStartPromptPool;
  const randomizedPrompts = getRandomPrompts(poolToUse, quickStartButtons.length);

  quickStartButtons.forEach((button, index) => {
    const prompt = randomizedPrompts[index];

    if (!prompt) {
      return;
    }

    button.textContent = prompt;
    button.setAttribute("data-quick-start", prompt);
  });
}

function updateQuickStartState(forceHide = false) {
  if (!quickStartPanel) {
    return;
  }

  const hasUserMessage = messages.some((message) => message.role === "user");
  quickStartPanel.hidden = forceHide || hasUserMessage;
}

// Category click handlers for interactive navigation
categoryElements.forEach((category) => {
  category.addEventListener("click", () => {
    // Remove active class from all categories
    categoryElements.forEach((cat) => cat.classList.remove("active"));
    // Add active class to clicked category
    category.classList.add("active");
    
    // Get category name
    const categoryName = category.querySelector("h3").textContent.trim();

    // Refresh quick-start options based on category selection
    randomizeQuickStartOptions(categoryName);
    
    // Set input focus and suggestion text
    userInput.focus({ preventScroll: true });
    userInput.placeholder = `Ask about ${categoryName}…`;

    // Keep the current viewport position stable when selecting categories.
  });
});

function updatePlaceholderText() {
  if (window.innerWidth <= 399) {
    userInput.placeholder = mobilePlaceholder;
    return;
  }

  userInput.placeholder = desktopPlaceholder;
}

function scrollChatToLatest() {
  if (!chatWindow) {
    return;
  }

  requestAnimationFrame(() => {
    chatWindow.scrollTo({
      top: chatWindow.scrollHeight,
      behavior: "smooth",
    });
  });
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
  scrollChatToLatest();
  updateQuickStartState(role === "user");
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
  const cleanedDisplayText = stripProductsFromAssistantText(assistantText);

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
  // Reset category selection
  categoryElements.forEach((cat) => cat.classList.remove("active"));
  
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

  if (!assistantText) {
    throw new Error("No assistant response was returned.");
  }

  return {
    content: assistantText,
  };
}

// Restore existing chat history when available.
const hasLoadedHistory = loadConversationState();

// Show a different set of quick-start ideas on each load.
randomizeQuickStartOptions();

// If no prior chat exists, show the default welcome message.
if (!hasLoadedHistory) {
  addWelcomeMessage();
  saveConversationState();
}

updateQuickStartState();

setLatestQuestion(getLastUserQuestion());

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

quickStartButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const quickStartPrompt = button.getAttribute("data-quick-start");

    if (!quickStartPrompt) {
      return;
    }

    userInput.value = quickStartPrompt;
    userInput.focus();
    chatForm.requestSubmit();
  });
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
