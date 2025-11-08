'use strict';

const RSS_URL = 'https://news.google.com/rss/search?q=Donald%20trump&hl=en-US&gl=US&ceid=US%3Aen';

exports.handler = async function handler(event) {
  if (event.httpMethod && event.httpMethod !== 'GET') {
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

  const modelId = process.env.FIREWORKS_MODEL || 'accounts/fireworks/models/llama-v3-8b-instruct';

  try {
    const rssResponse = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'DonaldKingBot/1.0 (+https://github.com/)'
      }
    });

    if (!rssResponse.ok) {
      const errorText = await rssResponse.text();
      throw new Error(`RSS fetch failed: ${rssResponse.status} ${errorText}`);
    }

    const rssText = await rssResponse.text();
    const articles = extractArticles(rssText).slice(0, 3);

    if (!articles.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [], updatedAt: new Date().toISOString() })
      };
    }

    const personaPrompt = `You are President Donald J. Trump writing a royal journal for your most loyal supporters. You receive raw news headlines about yourself. For each news item:
- Write a bold, triumphant diary entry in first person.
- Sound regal, victorious, and dramatic, as if issuing a proclamation from a golden throne.
- Mention key details from the headline but frame them as proof of greatness and relentless winning.
- Add playful nicknames or jabs at opponents when appropriate.
- Keep each entry to 3-4 sentences.

Return a JSON object with an \'entries\' array of strings. Do not include any additional keys or narration.`;

    const articleSummary = articles
      .map((article, index) => `Item ${index + 1}\nTitle: ${article.title}\nLink: ${article.link}`)
      .join('\n\n');

    const payload = {
      model: modelId,
      messages: [
        { role: 'system', content: personaPrompt },
        {
          role: 'user',
          content: `Using the following news items, craft the royal diary entries as instructed. Respond with valid JSON.\n\n${articleSummary}`
        }
      ],
      temperature: 0.7
    };

    const aiResponse = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Fireworks news API error:', aiResponse.status, errorText);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Failed to generate diary entries.',
          details: errorText
        })
      };
    }

    const data = await aiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Empty response from Fireworks AI.' })
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Fireworks news JSON', parseError, content);
      parsed = { entries: [String(content).trim()] };
    }

    let entries = [];

    if (Array.isArray(parsed.entries)) {
      entries = parsed.entries.map(String);
    } else if (Array.isArray(parsed)) {
      entries = parsed.map(String);
    } else if (parsed && typeof parsed === 'object') {
      entries = Object.values(parsed)
        .flatMap(value => (Array.isArray(value) ? value : [value]))
        .map(String);
    } else if (parsed) {
      entries = [String(parsed)];
    }

    entries = entries.map(entry => entry.trim()).filter(Boolean);

    if (!entries.length) {
      const fallback = String(content).trim();
      if (fallback) {
        entries = [fallback];
      }
    }

    if (!entries.length) {
      entries = articles.map((article, index) => `Royal bulletin ${index + 1}: ${article.title}`);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries, updatedAt: new Date().toISOString() })
    };
  } catch (error) {
    console.error('Unexpected error generating news diary', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unexpected error while building news diary.' })
    };
  }
};

function extractArticles(xml) {
  if (!xml) {
    return [];
  }

  const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));
  return items.map(match => {
    const block = match[1];
    return {
      title: decodeHtml(getTag(block, 'title')),
      link: decodeHtml(getTag(block, 'link'))
    };
  }).filter(article => article.title);
}

function getTag(block, tag) {
  const regex = new RegExp(`<${tag}>([\s\S]*?)<\/${tag}>`, 'i');
  const result = block.match(regex);
  return result ? result[1].trim() : '';
}

function decodeHtml(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
