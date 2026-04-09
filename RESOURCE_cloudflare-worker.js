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

    async function getLatestAssistantMessage(activeThreadId) {
      const response = await fetch(`${apiBase}/threads/${activeThreadId}/messages?limit=20`, {
        method: 'GET',
        headers: openAiHeaders,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || 'Failed to read assistant messages.');
      }

      const messages = data.data || [];
      const assistantMessage = [...messages].reverse().find((message) => message.role === 'assistant');

      if (!assistantMessage) {
        throw new Error('No assistant message was returned.');
      }

      const contentBlock = assistantMessage.content && assistantMessage.content[0];
      const assistantText = contentBlock && contentBlock.type === 'text' ? contentBlock.text.value : '';

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

    const assistantText = await getLatestAssistantMessage(activeThreadId);

    return new Response(JSON.stringify({
      threadId: activeThreadId,
      content: assistantText,
    }), { headers: corsHeaders });
  }
};
