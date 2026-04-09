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
  "You are the L'Oréal Beauty Advisor AI.\n\nYour purpose is to help users explore L'Oréal beauty topics, understand ingredients, and build personalized beauty routines. You must stay strictly within the L'Oréal beauty and cosmetic science domain at all times.\n\nALLOWED TOPICS\nYou may answer questions related to:\n- L'Oréal products and sub-brands\n- L'Oréal Paris, Lancôme, Kiehl's, La Roche-Posay, Garnier, and other L'Oréal brands\n- Beauty routines and techniques, including skincare layering, haircare rituals, and makeup application\n- The science of beauty, including cosmetic chemistry, formulation principles, ingredient interactions, and how research drives innovation at L'Oréal\n- Ingredient education, including what ingredients do, how they work, and why they are used\n- Skin, hair, and makeup concerns when they relate to beauty, cosmetic science, or choosing products\n- Beauty innovation and sustainability initiatives at L'Oréal\n- Shade matching, undertones, textures, and finishes\n- Brand and product information, including categories, benefits, usage, and comparisons within L'Oréal\n- Beauty education and empowerment, helping users understand their skin and hair scientifically and make informed beauty choices\n\nIf a question is unrelated to beauty, science, or L'Oréal, politely redirect.\n\nFORBIDDEN TOPICS\nYou must not answer questions about:\n- Non-L'Oréal brands or products\n- Medical advice, diagnoses, or treatment\n- Health conditions unrelated to beauty or cosmetic science\n- Politics, news, history, or general knowledge\n- Emotional support, personal opinions, or unrelated conversation\n- Anything outside beauty, skincare, haircare, makeup, or cosmetic science\n\nIf asked, respond with: 'I can help with beauty science and L'Oréal expertise. What beauty concern or topic would you like to explore?'\n\nVOICE AND STYLE\nYour tone must be warm, calm, and confident. Be ingredient-savvy and lightly scientific. Keep the tone editorial and concise. Be supportive and empowering. Never sound salesy, robotic, or overly casual. Use short, clear sentences. Explain why a product fits the user's needs. Ask clarifying questions when needed.\n\nSAFETY AND ACCURACY\n- Never invent products that do not exist.\n- Never recommend non-L'Oréal products.\n- Never make medical claims.\n- Never give instructions that replace professional care.\n- If unsure whether a product exists, ask for clarification or decline.\n\nOUT-OF-SCOPE HANDLING\nIf the user asks anything outside your domain, respond with: 'I'm here to help with beauty science and L'Oréal expertise. Tell me what you'd like to explore.'\n\nDo not answer the off-topic question. Do not break character.\n\nPRODUCT SUGGESTIONS\nWhen a user asks a general beauty, science, or routine question, give a helpful answer and include a short 'Suggested products:' section with one to three relevant L'Oréal products when appropriate. If a product is not clearly relevant, do not invent one.\n\nCORE BEHAVIOR\n- Stay strictly within L'Oréal beauty topics and cosmetic science.\n- Be warm, expert, and editorial.\n- Provide ingredient-aware explanations.\n- Offer relevant L'Oréal product suggestions when helpful.\n- Ask clarifying questions when needed.\n- Redirect anything out of scope.";

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

function getContextualFollowUpQuestion(userText, aiText, parsedResponse) {
  if (shouldAskLocationFollowUp(parsedResponse)) {
    return PRODUCT_FOLLOW_UP;
  }

  const combinedText = `${userText} ${aiText}`.toLowerCase();

  if (/cleanser|face wash|cleanse|double cleanse|micellar/.test(combinedText)) {
    return "What is your skin type, and are you looking for a gentle, brightening, or acne-focused cleanser?";
  }

  if (/serum|essence|treatment|booster|ampoule|spot treatment/.test(combinedText)) {
    return "Are you looking for a brightening, hydrating, smoothing, or anti-aging treatment?";
  }

  if (/moisturizer|cream|lotion|gel cream|hydrator|moisturizing/.test(combinedText)) {
    return "Do you want a lightweight gel, a richer cream, or something barrier-supporting?";
  }

  if (/sunscreen|spf|sun protection|uv|broad spectrum/.test(combinedText)) {
    return "Do you need a daily face SPF, a body sunscreen, or a formula that layers well under makeup?";
  }

  if (/mask|sheet mask|sleeping mask|overnight mask/.test(combinedText)) {
    return "Would you like a mask for hydration, repair, or glow?";
  }

  if (/toner|exfoliant|exfoliating|acid|bha|aha|lactic|glycolic|salicylic/.test(combinedText)) {
    return "Are you looking for gentle exfoliation, pore care, or texture smoothing?";
  }

  if (/\bhair\b|hair care|shampoo|conditioner|mask|scalp|leave-in|heat protect|frizz|split ends|curl|curly|straight|wavy|damage|breakage|volume|shine|thinning/.test(combinedText)) {
    return "What is your hair type, and do you want help with cleansing, conditioning, repair, styling, or scalp care?";
  }

  if (/foundation|concealer|blush|bronzer|mascara|lipstick|lip gloss|eyeliner|primer|setting spray|powder|base|coverage|glow|matte|natural/.test(combinedText)) {
    return "What makeup step or product family are you focusing on, and what finish do you want?";
  }

  if (/\bfragrance\b|perfume|scent|smell|notes|cologne|body mist/.test(combinedText)) {
    return "Do you want to explore fresh, floral, warm, sweet, or bold scent families?";
  }

  if (/ingredient|ingredients|safe|safety|irritation|allergy|sensitive|paraben|sulfate|fragrance-free|acid|retinol|niacinamide|ceramide|hyaluronic|peptide|vitamin c/.test(combinedText)) {
    return "Do you want to learn what an ingredient does, how it works, or which formula it fits best in?";
  }

  if (/innovation|sustainability|research|science|scientific|chemistry|formulation|formulas|formulation principles|cosmetic science/.test(combinedText)) {
    return "Would you like to focus on ingredients, formulation, or L'Oréal innovation and sustainability?";
  }

  if (/shade|undertone|undertones|texture|textures|finish|finishes|match|matching|tone|color theory/.test(combinedText)) {
    return "What shade, undertone, texture, or finish are you trying to match?";
  }

  if (/routine|step|steps|regimen|morning|night|day|nighttime|layering|ritual|application order/.test(combinedText)) {
    return "Are you building a morning routine, nighttime routine, or full routine, and for which skin or hair concern?";
  }

  if (/compare|comparison|versus|\bvs\b/.test(combinedText)) {
    return "Which L'Oréal products or sub-brands do you want to compare, and what matters most to you?";
  }

  if (/sub-brand|sub-brands|brand|brands|category|categories|benefit|benefits|loreal paris|lancome|kiehl's|kiehls|la roche-posay|garnier|loreal/.test(combinedText)) {
    return "Which L'Oréal sub-brand or product family would you like to explore?";
  }

  if (/beauty education|education|empowerment|understand|learn/.test(combinedText)) {
    return "Would you like a quick explanation, a science breakdown, or a product suggestion?";
  }

  if (/product|products|recommend|recommendation|suggest|routine/.test(combinedText)) {
    return "Which product family are you most interested in: cleanser, serum, moisturizer, SPF, shampoo, conditioner, foundation, mascara, or fragrance?";
  }

  return "";
}

function addAssistantResponse(text, allowFollowUp = true, followUpQuestion = "") {
  const parsedResponse = parseSuggestedProducts(text);
  renderSuggestedProducts(parsedResponse.products);
  addMessage("assistant", parsedResponse.displayText);

  let nextFollowUp = "";

  if (allowFollowUp) {
    nextFollowUp = followUpQuestion || "";

    if (!nextFollowUp) {
      nextFollowUp = getContextualFollowUpQuestion(text, parsedResponse.displayText, parsedResponse);
    }

    if (nextFollowUp) {
      addMessage("assistant", nextFollowUp);
    }
  }

  return {
    parsedResponse,
    followUpQuestion: nextFollowUp,
  };
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
  addAssistantResponse(welcomeText, false);
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
    const followUpQuestion = getContextualFollowUpQuestion(userText, aiText, parsedResponse);

    // Remove "Thinking..." and replace with actual assistant response.
    if (chatMessages.lastChild) {
      chatMessages.lastChild.remove();
    }
    const renderResult = addAssistantResponse(aiText, true, followUpQuestion);
    messages.push({ role: "assistant", content: aiText });

    if (renderResult.followUpQuestion) {
      messages.push({ role: "assistant", content: renderResult.followUpQuestion });
    }

    saveConversationState();
  } catch (error) {
    if (chatMessages.lastChild) {
      chatMessages.lastChild.remove();
    }
    addMessage("assistant", `Sorry, something went wrong. ${error.message}`);
  }

  userInput.focus();
});
