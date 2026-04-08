/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";

// Set your deployed Cloudflare Worker URL in secrets.js.
// const OPENAI_API_URL = "https://your-worker-url.workers.dev";
const WORKER_URL = typeof OPENAI_API_URL !== "undefined" ? OPENAI_API_URL : "";

// Store the full chat history so each request has context.
const messages = [
  {
    role: "system",
    content:
      "You are a L'Oreal Beauty Advisor chatbot. You may only answer questions about L'Oreal products, beauty routines, ingredients, skin care, hair care, makeup, fragrance, and product recommendations. If the user asks about any unrelated topic, politely refuse in 1 short sentence, then redirect with: 'I can help with L'Oreal products, routines, and beauty recommendations.' Keep all responses concise, practical, and beginner-friendly.",
  },
];

function updatePlaceholderText() {
  if (window.innerWidth <= 399) {
    userInput.placeholder = mobilePlaceholder;
    return;
  }

  userInput.placeholder = desktopPlaceholder;
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

  chatWindow.appendChild(msgElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function getAssistantReply() {
  const response = await fetch(WORKER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: messages,
    }),
  });

  if (!response.ok) {
    throw new Error("Request failed. Check your API URL and try again.");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// Set initial message
addMessage("assistant", "Hello. How can I help you with your beauty routine today?");
updatePlaceholderText();

window.addEventListener("resize", updatePlaceholderText);

// Enter sends the message. Shift+Enter inserts a new line.
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!WORKER_URL) {
    addMessage("assistant", "Please add OPENAI_API_URL in secrets.js first.");
    return;
  }

  const userText = userInput.value.trim();

  if (!userText) {
    return;
  }

  addMessage("user", userText);
  userInput.value = "";

  messages.push({ role: "user", content: userText });

  addMessage("assistant", "Thinking...");

  try {
    const aiText = await getAssistantReply();

    // Remove "Thinking..." and replace with actual assistant response.
    chatWindow.lastChild.remove();
    addMessage("assistant", aiText);
    messages.push({ role: "assistant", content: aiText });
  } catch (error) {
    chatWindow.lastChild.remove();
    addMessage("assistant", `Sorry, something went wrong. ${error.message}`);
  }

  userInput.focus();
});
