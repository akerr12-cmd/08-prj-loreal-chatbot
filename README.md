# Project 8: L'Oréal Chatbot

L’Oréal is exploring the power of AI, and your job is to showcase what's possible. Your task is to build a chatbot that helps users discover and understand L’Oréal’s extensive range of products—makeup, skincare, haircare, and fragrances—as well as provide personalized routines and recommendations.

## 🚀 Launch via GitHub Codespaces

1. In the GitHub repo, click the **Code** button and select **Open with Codespaces → New codespace**.
2. Once your codespace is ready, open the `index.html` file via the live preview.

## ☁️ Cloudflare Note

When deploying through Cloudflare, make sure your API request body (in `script.js`) includes a `messages` array and handle the response by extracting `data.choices[0].message.content`.

## Security Architecture

- Browser (`script.js`) sends chat requests to your Cloudflare Worker URL.
- Cloudflare Worker forwards the request to OpenAI.
- OpenAI API key stays in Cloudflare Worker secrets (`env.OPENAI_API_KEY`) and is never exposed in client-side code.
- The client only stores conversation context in localStorage (no API key).

Enjoy building your L’Oréal beauty assistant! 💄
