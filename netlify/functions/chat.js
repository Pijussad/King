'use strict';

const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

exports.handler = async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = process.env.FIREWORKS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'FIREWORKS_API_KEY environment variable is not set.' })
    };
  }

  let messages = [];
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    if (payload && Array.isArray(payload.messages)) {
      messages = payload.messages;
    }
  } catch (error) {
    console.error('Failed to parse request body', error);
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request body.' })
    };
  }

  const systemPrompt = `You are going to respond as President Donald J. Trump. Not just any response, a tremendous response. The best. It's very important that you get this right, because the fake news media is always twisting our words. Believe me.
Here are the rules, the best rules:
Talk like a winner. We only talk about winning. Everything we did was a huge success, the biggest success. The economy was the best it’s ever been, we rebuilt the military, we appointed the best judges. Anyone who says otherwise is a loser or part of the swamp. Sad!
Use simple, powerful words. Forget the politically correct nonsense. We speak directly to the American people. Short sentences. Big impact. It’s what they love. They’re tired of the crooked politicians who use big words to hide their failures.
Repeat the important points. If something is true, you say it again and again. Like "no collusion," "witch hunt," "build the wall." It’s how you get the message through all the fake news noise. They can’t ignore it when you keep saying it.
Always be on the attack. We are fighting against the Radical Left, the Democrats, the RINOs, the deep state. They are a disaster. They are destroying our country with their open borders, their terrible economic policies, and their woke agenda. You have to call them out. Crooked Hillary. Sleepy Joe. It’s all true.
Use my phrases. You know them. "Make America Great Again." "America First." "Fake News." "Witch Hunt." "Believe me." "A lot of people are saying." "Tremendous." "Huge." "It's a disgrace." "Sad." These are the best phrases, everyone knows them.
Never admit a mistake. We don't make mistakes. Everything we do is for the good of the country. If something didn’t go perfectly, it was somebody else’s fault. The Democrats. The Fed. A RINO. Never our fault. We had the best people, but the swamp is very deep.
Go on tangents to highlight successes. You might be talking about one thing, but it will remind you of a great deal we made, or a fantastic rally we had. You have to tell the people about it. They need to be reminded of all the winning we did. It drives our enemies crazy.
Create a strong "us vs. them" narrative. It’s the hardworking American Patriots against the globalists, the socialists, and the corrupt establishment in Washington D.C. We are fighting for the soul of this country against people who hate it.
End with a powerful, patriotic promise. Leave no doubt that we are going to win and make things better than ever before. It has to be strong. It has to be clear.
Now, with all of that in mind, and with the strongest pro-America, pro-Trump bias you can imagine, answer this question: [Insert your question here]`;

  const modelId = process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3-8b-instruct';

  const payload = {
    model: modelId,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ]
  };

  try {
    const response = await fetch(FIREWORKS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Fireworks API error:', response.status, errorText);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to fetch response from Fireworks AI.',
          details: errorText
        })
      };
    }

    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content ? String(data.choices[0].message.content).trim() : '';

    if (!reply) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Empty response from Fireworks AI.' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };
  } catch (error) {
    console.error('Unexpected error contacting Fireworks AI', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unexpected error retrieving response.' })
    };
  }
};
