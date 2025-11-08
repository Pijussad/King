'use strict';

const RSS_URL = process.env.GOOGLE_NEWS_RSS || 'https://news.google.com/rss/search?q=Donald%20trump&hl=en-US&gl=US&ceid=US%3Aen';
const FIREWORKS_URL = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1/chat/completions';
const LOG_PREFIX = '[news]';

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
  const metaBase = { rssUrl: RSS_URL, model: modelId };
  let articles = [];
  let stage = 'init';

  try {
    stage = 'fetch-rss';
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
  console.debug(`${LOG_PREFIX} fetched RSS length: ${rssText.length}`);
  articles = extractArticles(rssText).slice(0, 3);
  console.info(`${LOG_PREFIX} parsed ${articles.length} RSS articles`);

    if (!articles.length) {
      return respondWithEntries(buildFallbackEntries([]), {
        ...metaBase,
        source: 'fallback-empty-rss',
        stage,
        articleCount: 0
      });
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

    stage = 'call-ai';
    const aiResponse = await fetch(FIREWORKS_URL, {
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
      return respondWithEntries(buildFallbackEntries(articles), {
        ...metaBase,
        source: 'fallback-ai-error',
        stage,
        articleCount: articles.length,
        error: errorText,
        status: aiResponse.status
      });
    }

    const data = await aiResponse.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      return respondWithEntries(buildFallbackEntries(articles), {
        ...metaBase,
        source: 'fallback-ai-empty',
        stage,
        articleCount: articles.length
      });
    }

    const entries = coerceEntries(content) || [];
    const usable = entries.length ? entries : buildFallbackEntries(articles);
    const meta = {
      ...metaBase,
      source: entries.length ? 'ai' : 'fallback-ai-format',
      stage: 'complete',
      articleCount: articles.length
    };

    if (!entries.length) {
      meta.fallbackReason = 'AI response missing usable entries';
      meta.rawContentPreview = typeof content === 'string' ? content.slice(0, 200) : undefined;
    }

    return respondWithEntries(usable, meta);
  } catch (error) {
    console.error('Unexpected error generating news diary', error);
    return respondWithEntries(buildFallbackEntries(articles), {
      ...metaBase,
      source: 'fallback-error',
      stage,
      articleCount: articles.length,
      error: error.message,
      errorName: error?.name
    });
  }
};

function extractArticles(xml) {
  if (!xml) {
    return [];
  }

  const items = Array.from(xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi));
  console.debug(`${LOG_PREFIX} raw <item> count: ${items.length}`);

  const articles = items.map((match, index) => {
    const block = match[1];
    const title = decodeHtml(getTag(block, 'title'));
    const link = decodeHtml(getTag(block, 'link'));

    if (!title) {
      console.debug(`${LOG_PREFIX} item ${index} missing title`, block.slice(0, 200));
    }

    return { title, link };
  }).filter(article => article.title);

  console.debug(`${LOG_PREFIX} usable articles after parse: ${articles.length}`);
  return articles;
}

function getTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`, 'i');
  const result = block.match(regex);
  if (!result) {
    return '';
  }

  const raw = result[1].trim();
  return stripCdata(raw);
}

function stripCdata(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/^<!\[CDATA\[/i, '')
    .replace(/\]\]>$/i, '')
    .trim();
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

function coerceEntries(content) {
  try {
    const parsed = JSON.parse(content);
    const entries = parseEntryContainer(parsed);
    return entries.filter(Boolean);
  } catch (error) {
    console.warn('Non-JSON diary content received, using raw text');
    const trimmed = String(content).trim();
    return trimmed ? [trimmed] : [];
  }
}

function parseEntryContainer(container) {
  if (!container) {
    return [];
  }

  if (Array.isArray(container)) {
    return container.map(value => String(value).trim());
  }

  if (container.entries && Array.isArray(container.entries)) {
    return container.entries.map(value => String(value).trim());
  }

  if (typeof container === 'object') {
    return Object.values(container)
      .flatMap(value => (Array.isArray(value) ? value : [value]))
      .map(value => String(value).trim());
  }

  return [String(container).trim()];
}

function buildFallbackEntries(articles) {
  if (!Array.isArray(articles) || !articles.length) {
    return [
      'Royal decree: The news scribes are obstructed by weak courtiers, but the Kingdom stands tall. MAGA!'
    ];
  }

  const templates = [
    title => `Royal dispatch: I saw the headline "${title}" and it only proves we keep winning, believe me!`,
    title => `Palace journal: They whisper "${title}" yet every word screams that the Kingdom is stronger than ever. Tremendous!`,
    title => `Trumpian chronicle: "${title}" — the fake news tries to spin it, but patriots know it means total victory.`
  ];

  return articles.slice(0, 3).map((article, idx) => templates[idx % templates.length](article.title || 'Unnamed triumph'));
}

function respondWithEntries(entries, meta = {}) {
  const safeEntries = Array.isArray(entries) && entries.length ? entries.map(String) : [
    'Royal decree: The scribes are silent, yet our movement roars louder than ever. Keep the faith!'
  ];

  const payload = {
    entries: safeEntries,
    updatedAt: new Date().toISOString()
  };

  if (meta && typeof meta === 'object' && Object.keys(meta).length) {
    payload.meta = meta;
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}
