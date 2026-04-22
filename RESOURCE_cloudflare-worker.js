export default {
  async fetch(request, env) {
    // 1. Setup CORS headers to allow cross-origin requests from the frontend
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // 2. Handle preflight OPTIONS requests for CORS (browser security check)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 3. Reject any requests that are not POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: { message: 'Method not allowed. Use POST for chat requests.' } }), { status: 405, headers: corsHeaders });
    }

    // 4. Retrieve environment variables (API Keys and IDs configured in Cloudflare)
    const apiKey = env.OPENAI_API_KEY;
    const assistantId = env.ASSISTANT_ID;
    const apiBase = 'https://api.openai.com/v1';

    // 5. Parse the incoming JSON request body
    let requestBody;
    try {
      requestBody = await request.json();
    } catch (error) {
      return new Response(JSON.stringify({ error: { message: 'Invalid or empty JSON body. Send a JSON object with a message field.' } }), { status: 400, headers: corsHeaders });
    }

    // 6. Validate that the body is an object
    if (!requestBody || typeof requestBody !== 'object') {
      return new Response(JSON.stringify({ error: { message: 'Invalid request body. Expected a JSON object.' } }), { status: 400, headers: corsHeaders });
    }

    // 7. Extract the user message and optional threadId (for continuing conversations)
    const userMessage = typeof requestBody.message === 'string' ? requestBody.message.trim() : '';
    const threadId = typeof requestBody.threadId === 'string' ? requestBody.threadId : '';

    // 8. Verify that necessary environment variables are present
    if (!apiKey || !assistantId) {
      return new Response(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY or ASSISTANT_ID in Cloudflare Worker secrets.' } }), { status: 500, headers: corsHeaders });
    }

    // 9. Ensure the user actually sent a message
    if (!userMessage) {
      return new Response(JSON.stringify({ error: { message: 'Missing user message.' } }), { status: 400, headers: corsHeaders });
    }

    // 10. Setup headers for OpenAI API requests
    const openAiHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

    // --- Helper Functions for OpenAI API ---

    // Creates a new conversation thread with OpenAI
    async function createThread() {
      const response = await fetch(`${apiBase}/threads`, {
        method: 'POST',
        headers: openAiHeaders,
        body: '{}',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to create thread.');
      }

      return data.id;
    }

    // Adds the user's message to the specified thread
    async function addMessage(activeThreadId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/messages`, {
        method: 'POST',
        headers: openAiHeaders,
        body: JSON.stringify({
          role: 'user',
          content: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to add message to thread.');
      }

      return data;
    }

    // Starts a "run" which tells the Assistant to process the thread and generate a response
    async function createRun(activeThreadId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/runs`, {
        method: 'POST',
        headers: openAiHeaders,
        body: JSON.stringify({
          assistant_id: assistantId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to create assistant run.');
      }

      return data.id;
    }

    // Checks the status of an ongoing run (e.g., 'queued', 'in_progress', 'completed')
    async function getRun(activeThreadId, runId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/runs/${runId}`, {
        method: 'GET',
        headers: openAiHeaders,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to check assistant run.');
      }

      return data;
    }

    // Retrieves the final text response from the assistant once the run is complete
    async function getLatestAssistantMessage(activeThreadId, runId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/messages?limit=20`, {
        method: 'GET',
        headers: openAiHeaders,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to read assistant messages.');
      }

      const messages = data.data || [];
      let assistantMessage = messages.find((message) => message.role === 'assistant' && message.run_id === runId);

      if (!assistantMessage) {
        assistantMessage = messages.find((message) => message.role === 'assistant');
      }

      if (!assistantMessage) {
        throw new Error('No assistant message was returned.');
      }

      const textParts = (assistantMessage.content || [])
        .filter((contentBlock) => contentBlock.type === 'text' && contentBlock.text && contentBlock.text.value)
        .map((contentBlock) => contentBlock.text.value.trim())
        .filter(Boolean);

      const assistantText = textParts.join('\n\n');

      if (!assistantText) {
        throw new Error('Assistant response text was empty.');
      }

      return assistantText;
    }

    // --- Helper Functions for Text Processing and Product Extraction ---

    // Deduplicates product names and limits the final list to a maximum of 3
    function normalizeProducts(products) {
      if (!Array.isArray(products)) {
        return [];
      }

      const cleaned = [];
      const seen = new Set();

      for (let i = 0; i < products.length; i += 1) {
        const item = products[i] || {};
        const name = typeof item === 'string'
          ? cleanProductName(item)
          : cleanProductName(item.name || '');

        if (!name) {
          continue;
        }

        const dedupeKey = name.toLowerCase();
        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        cleaned.push({ name });

        if (cleaned.length >= 3) {
          break;
        }
      }

      return cleaned;
    }

    // Cleans up a product name by removing markdown, quotes, and conversational tails (e.g., "... which is great for")
    function cleanProductName(rawName) {
      let name = String(rawName || '').trim();

      name = name
        .replace(/\*\*/g, '')
        .replace(/^['"`\-\s]+|['"`\s]+$/g, '')
        .trim();

      if (name.includes(' - ')) {
        name = name.split(' - ')[0].trim();
      }

      if (name.includes(' — ')) {
        name = name.split(' — ')[0].trim();
      }

      if (name.includes(' – ')) {
        name = name.split(' – ')[0].trim();
      }

      if (name.includes(': ')) {
        const parts = name.split(': ');
        const tail = parts.slice(1).join(': ');
        if (/\b(although|this|it|which|that|helps?|provides?|leaves?)\b/i.test(tail) || tail.length > 28) {
          name = parts[0].trim();
        }
      }

      return name.replace(/\s{2,}/g, ' ').trim();
    }

    // Tries to extract a list of products from a structured "suggested products" section in the text
    function extractProductsFromText(text) {
      const normalized = String(text || '').replace(/\r\n/g, '\n');
      const headingRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:suggested|recommended)\s+products?\s*:?\s*(?:\*\*)?\s*\n([\s\S]*)/i;
      const headingMatch = normalized.match(headingRegex);
      const section = headingMatch ? headingMatch[1] : normalized;
      const lines = section.split('\n');
      const products = [];
      const seen = new Set();
      const bulletRegex = /^(?:[\-•*]|\d+\.)\s+/;

      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();

        if (!line && products.length > 0) {
          break;
        }

        if (!line) {
          continue;
        }

        if (products.length > 0 && !bulletRegex.test(line)) {
          break;
        }

        const itemText = line.replace(/^(?:[\-•*]|\d+\.)\s+/, '').trim();
        const markdownLinkMatch = itemText.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);

        let rawName = markdownLinkMatch ? markdownLinkMatch[1] : itemText;
        rawName = rawName
          .replace(/\((?:https?:\/\/[^\s)]+)\)$/i, '')
          .replace(/\|\s*https?:\/\/\S+$/i, '')
          .replace(/https?:\/\/\S+/gi, '')
          .trim();

        const name = cleanProductName(rawName);

        if (!name) {
          continue;
        }

        const dedupeKey = name.toLowerCase();
        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        products.push({ name });

        if (products.length >= 3) {
          break;
        }
      }

      if (!products.length) {
        const fallbackRegex = /(?:^|\n)(?:[\-•*]|\d+\.)\s+(.+?)\s*$/gim;
        let fallbackMatch;

        while ((fallbackMatch = fallbackRegex.exec(normalized)) !== null) {
          const candidate = String(fallbackMatch[1] || '')
            .replace(/\((?:https?:\/\/[^\s)]+)\)$/i, '')
            .replace(/\|\s*https?:\/\/\S+$/i, '')
            .replace(/https?:\/\/\S+/gi, '')
            .trim();

          const name = cleanProductName(candidate);

          if (!name) {
            continue;
          }

          const dedupeKey = name.toLowerCase();
          if (seen.has(dedupeKey)) {
            continue;
          }

          seen.add(dedupeKey);
          products.push({ name });

          if (products.length >= 3) {
            break;
          }
        }
      }

      return normalizeProducts(products);
    }

    // Fallback: Tries to extract product names from natural language sentences (e.g., "I recommend using [Product Name]")
    function extractInlineProductMentions(text) {
      const normalized = String(text || '').replace(/\r\n/g, '\n');
      const candidates = [];
      const patterns = [
        /(?:recommend|suggest|try|use)\s+(?:the\s+|a\s+|an\s+|using\s+)?([A-Z][A-Za-z0-9'&\-\s]{3,80})/g,
        /([A-Z][A-Za-z0-9'\-\s]{3,80})\s+(?:is|are)\s+(?:a\s+)?(?:great|good|helpful|effective)\s+(?:option|choice)/g,
        /([A-Z][A-Za-z0-9'&\-]*(?:\s+[A-Z][A-Za-z0-9'&\-]*){0,6}\s+(?:Shampoo|Conditioner|Serum|Cream|Moisturizer|Cleanser|Mask|Treatment|Oil|Gel))/g,
      ];

      for (let i = 0; i < patterns.length; i += 1) {
        let match;

        while ((match = patterns[i].exec(normalized)) !== null) {
          const candidateName = String(match[1] || '')
            .replace(/[.,;!?]+$/g, '')
            .trim();

          if (candidateName) {
            candidates.push({ name: candidateName });
          }
        }
      }

      return normalizeProducts(candidates);
    }

    // Removes the "suggested products" list from the main text so it's not repeated in the UI bubble
    function stripSuggestedProductsBlock(text) {
      const normalized = String(text || '').replace(/\r\n/g, '\n');
      const headingRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?\s*(?:suggested|recommended)\s+products?\s*:?\s*(?:\*\*)?\s*\n([\s\S]*)/i;
      const headingMatch = normalized.match(headingRegex);

      if (headingMatch) {
        const headingIndex = normalized.indexOf(headingMatch[0]);
        return normalized.slice(0, headingIndex).trim();
      }

      return normalized.trim();
    }

    // Main parsing function: tries to find JSON or falls back to regex to extract the chat answer and product list
    function extractStructuredPayload(text) {
      const raw = String(text || '').trim();

      if (!raw) {
        return { answer: '', products: [] };
      }

      const candidates = [raw];

      const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
      if (fencedMatch && fencedMatch[1]) {
        candidates.push(fencedMatch[1].trim());
      }

      const firstBrace = raw.indexOf('{');
      const lastBrace = raw.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        candidates.push(raw.slice(firstBrace, lastBrace + 1));
      }

      for (let i = 0; i < candidates.length; i += 1) {
        try {
          const candidateText = candidates[i];
          const parsed = JSON.parse(candidateText);
          const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
          const products = normalizeProducts(parsed.products);

          let textSource = answer;

          if (!textSource) {
            const rawWithoutCandidate = raw.includes(candidateText)
              ? raw.replace(candidateText, '').trim()
              : raw;
            textSource = rawWithoutCandidate;
          }

          const cleanAnswer = stripSuggestedProductsBlock(textSource || raw);

          if (cleanAnswer || products.length) {
            return { answer: cleanAnswer || answer || raw, products };
          }
        } catch (error) {
          // Keep trying other candidate JSON snippets.
        }
      }

      const cleanAnswer = stripSuggestedProductsBlock(raw);
      const sectionProducts = extractProductsFromText(raw);
      const inlineProducts = sectionProducts.length ? sectionProducts : extractInlineProductMentions(raw);
      return { answer: cleanAnswer || raw, products: inlineProducts };
    }

    // --- Main Execution Flow ---
    try {
      // 11. Determine if we are continuing an existing thread or starting a new one
      let activeThreadId = threadId;

      if (!activeThreadId) {
        activeThreadId = await createThread();
      }

      // 12. Add the user's message to the thread
      await addMessage(activeThreadId);
      
      // 13. Trigger the assistant to start generating a response
      const runId = await createRun(activeThreadId);

      // 14. Poll the OpenAI API until the assistant finishes processing (status becomes 'completed')
      let runData = await getRun(activeThreadId, runId);
      let attempts = 0;

      while (runData.status === 'queued' || runData.status === 'in_progress') {
        // Timeout after 15 seconds to prevent the Worker from hanging indefinitely
        if (attempts >= 15) {
          throw new Error('Assistant response timed out.');
        }

        // Wait 1 second before checking the status again
        await new Promise((resolve) => setTimeout(resolve, 1000));
        runData = await getRun(activeThreadId, runId);
        attempts += 1;
      }

      // If the run failed or was cancelled, throw an error
      if (runData.status !== 'completed') {
        throw new Error(`Assistant run ended with status: ${runData.status}`);
      }

      // 15. Retrieve the assistant's final response text
      const assistantText = await getLatestAssistantMessage(activeThreadId, runId);
      
      // 16. Parse the text to separate the conversational answer from suggested products
      const structured = extractStructuredPayload(assistantText);

      // 17. Return the final structured response (threadId, content, products) to the frontend
      return new Response(JSON.stringify({
        threadId: activeThreadId,
        content: structured.answer || assistantText,
        products: structured.products,
      }), { headers: corsHeaders });

    } catch (error) {
      // 18. Catch any errors during the OpenAI API calls (e.g., timeouts, failed requests)
      // and return a graceful 500 error response with CORS headers so the frontend can handle it
      return new Response(JSON.stringify({ 
        error: { message: error.message || 'An internal error occurred while processing the request.' } 
      }), { status: 500, headers: corsHeaders });
    }
  }
};
