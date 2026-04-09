export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY;
    const assistantId = env.ASSISTANT_ID;
    const apiBase = 'https://api.openai.com/v1';
    const requestBody = await request.json();
    const userMessage = (requestBody.message || '').trim();
    const threadId = requestBody.threadId || '';

    if (!apiKey || !assistantId) {
      return new Response(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY or ASSISTANT_ID in Cloudflare Worker secrets.' } }), { status: 500, headers: corsHeaders });
    }

    if (!userMessage) {
      return new Response(JSON.stringify({ error: { message: 'Missing user message.' } }), { status: 400, headers: corsHeaders });
    }

    const openAiHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2'
    };

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

    async function createRun(activeThreadId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/runs`, {
        method: 'POST',
        headers: openAiHeaders,
        body: JSON.stringify({
          assistant_id: assistantId,
          additional_instructions: [
            'Treat each new user message as a continuation of the same conversation unless the user clearly starts a new topic.',
            'If the user is answering your previous question, do not restart; continue from the prior turn naturally.',
            'When you suggest products, always include a section exactly titled "Suggested products:" followed by up to 3 bullet items in this format: - Product Name | https://product-url'
          ].join(' '),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to create assistant run.');
      }

      return data.id;
    }

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

    let activeThreadId = threadId;

    if (!activeThreadId) {
      activeThreadId = await createThread();
    }

    await addMessage(activeThreadId);
    const runId = await createRun(activeThreadId);

    let runData = await getRun(activeThreadId, runId);
    let attempts = 0;

    while (runData.status === 'queued' || runData.status === 'in_progress') {
      if (attempts >= 15) {
        throw new Error('Assistant response timed out.');
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      runData = await getRun(activeThreadId, runId);
      attempts += 1;
    }

    if (runData.status !== 'completed') {
      throw new Error(`Assistant run ended with status: ${runData.status}`);
    }

    const assistantText = await getLatestAssistantMessage(activeThreadId, runId);

    return new Response(JSON.stringify({
      threadId: activeThreadId,
      content: assistantText,
    }), { headers: corsHeaders });
  }
};
