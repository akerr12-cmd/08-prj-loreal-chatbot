/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

const desktopPlaceholder = "Ask me about products or routines…";
const mobilePlaceholder = "Ask about products or routines";

function updatePlaceholderText() {
  if (window.innerWidth <= 399) {
    userInput.placeholder = mobilePlaceholder;
    return;
  }

  userInput.placeholder = desktopPlaceholder;
}

// Set initial message
chatWindow.textContent = "👋 Hello! How can I help you today?";
updatePlaceholderText();

window.addEventListener("resize", updatePlaceholderText);

/* Handle form submit */
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();

  // When using Cloudflare, you'll need to POST a `messages` array in the body,
  // and handle the response using: data.choices[0].message.content

  // Show message
  chatWindow.innerHTML = "Connect to the OpenAI API for a response!";
});
