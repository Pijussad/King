'use strict';

let chatHistory = [];
let newsLoaded = false;
let newsLoading = false;

const selectors = {
  quoteText: '#quote-text',
  quoteAuthor: '#quote-author',
  newQuoteButton: '#new-quote-btn',
  quotePage: '#quote-page',
  chatPage: '#chat-page',
  newsPage: '#news-page',
  chatWindow: '#chat-window',
  chatForm: '#chat-form',
  chatInput: '#chat-input',
  thinkingIndicator: '#thinking-indicator',
  navQuote: '#nav-quote',
  navChat: '#nav-chat',
  navNews: '#nav-news',
  newsList: '#news-list',
  newsStatus: '#news-status',
  refreshNews: '#refresh-news-btn',
  adUnits: '.adsbygoogle'
};

function init() {
  bindNavigation();
  bindQuotes();
  bindChat();
  bindNews();
  displayRandomQuote();
  loadChatHistory();
  initAds();
}

document.addEventListener('DOMContentLoaded', init);

function bindNavigation() {
  const quoteButton = document.querySelector(selectors.navQuote);
  const chatButton = document.querySelector(selectors.navChat);
  const newsButton = document.querySelector(selectors.navNews);

  if (quoteButton) {
    quoteButton.addEventListener('click', () => setActivePage('quote'));
  }

  if (chatButton) {
    chatButton.addEventListener('click', () => setActivePage('chat'));
  }

  if (newsButton) {
    newsButton.addEventListener('click', () => setActivePage('news'));
  }
}

function bindQuotes() {
  const newQuoteButton = document.querySelector(selectors.newQuoteButton);
  if (newQuoteButton) {
    newQuoteButton.addEventListener('click', displayRandomQuote);
  }
}

function bindChat() {
  const chatForm = document.querySelector(selectors.chatForm);
  if (!chatForm) {
    return;
  }

  chatForm.addEventListener('submit', handleChatSubmit);
}

function bindNews() {
  const refreshButton = document.querySelector(selectors.refreshNews);
  if (!refreshButton) {
    return;
  }

  refreshButton.addEventListener('click', () => loadNewsDiary(true));
}

function setActivePage(target) {
  const quoteButton = document.querySelector(selectors.navQuote);
  const chatButton = document.querySelector(selectors.navChat);
  const newsButton = document.querySelector(selectors.navNews);
  const quotePage = document.querySelector(selectors.quotePage);
  const chatPage = document.querySelector(selectors.chatPage);
  const newsPage = document.querySelector(selectors.newsPage);

  if (!quoteButton || !chatButton || !newsButton || !quotePage || !chatPage || !newsPage) {
    return;
  }

  const isQuote = target === 'quote';
  const isChat = target === 'chat';
  const isNews = target === 'news';

  quoteButton.classList.toggle('active', isQuote);
  chatButton.classList.toggle('active', isChat);
  newsButton.classList.toggle('active', isNews);

  quotePage.classList.toggle('hidden', !isQuote);
  chatPage.classList.toggle('hidden', !isChat);
  newsPage.classList.toggle('hidden', !isNews);

  if (isChat) {
    const chatInput = document.querySelector(selectors.chatInput);
    if (chatInput) {
      chatInput.focus();
    }
  }

  if (isNews && !newsLoaded && !newsLoading) {
    loadNewsDiary();
  }
}

function displayRandomQuote() {
  const quotes = getQuotes();
  if (!quotes || quotes.length === 0) {
    console.warn('No quotes available to display.');
    return;
  }

  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  const quoteTextEl = document.querySelector(selectors.quoteText);
  const quoteAuthorEl = document.querySelector(selectors.quoteAuthor);

  if (quoteTextEl) {
    quoteTextEl.textContent = quote.text;
  }

  if (quoteAuthorEl) {
    quoteAuthorEl.textContent = `— ${quote.author}`;
  }
}

function getQuotes() {
  if (typeof myQuotes !== 'undefined' && Array.isArray(myQuotes)) {
    return myQuotes;
  }

  if (typeof window !== 'undefined' && Array.isArray(window.myQuotes)) {
    return window.myQuotes;
  }

  return null;
}

function loadChatHistory() {
  const stored = localStorage.getItem('donaldKingChat');
  if (!stored) {
    chatHistory = [];
    return;
  }

  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed)) {
      chatHistory = parsed;
      renderChatHistory();
    } else {
      chatHistory = [];
    }
  } catch (error) {
    console.error('Failed to parse chat history', error);
    chatHistory = [];
  }
}

function renderChatHistory() {
  const chatWindow = document.querySelector(selectors.chatWindow);
  if (!chatWindow) {
    return;
  }

  chatWindow.innerHTML = '';
  chatHistory.forEach(renderMessage);
  scrollChatToBottom();
}

function saveChatHistory() {
  try {
    localStorage.setItem('donaldKingChat', JSON.stringify(chatHistory));
  } catch (error) {
    console.error('Failed to persist chat history', error);
  }
}

function renderMessage(message) {
  const chatWindow = document.querySelector(selectors.chatWindow);
  if (!chatWindow || !message || typeof message.content !== 'string') {
    return;
  }

  const role = message.role === 'assistant' ? 'assistant' : message.role === 'user' ? 'user' : 'system';

  const messageEl = document.createElement('div');
  messageEl.classList.add('chat-message', role);

  const bubble = document.createElement('div');
  bubble.classList.add('chat-bubble');
  bubble.textContent = message.content;

  messageEl.appendChild(bubble);
  chatWindow.appendChild(messageEl);

  scrollChatToBottom();
}

function scrollChatToBottom() {
  const chatWindow = document.querySelector(selectors.chatWindow);
  if (!chatWindow) {
    return;
  }

  chatWindow.scrollTop = chatWindow.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  const chatInput = document.querySelector(selectors.chatInput);
  if (!chatInput) {
    return;
  }

  const message = chatInput.value.trim();
  if (!message) {
    return;
  }

  const userMessage = { role: 'user', content: message };
  chatHistory.push(userMessage);
  renderMessage(userMessage);
  saveChatHistory();
  chatInput.value = '';

  showThinkingIndicator();

  try {
    const assistantMessage = await getKingResponse();
    hideThinkingIndicator();
    chatHistory.push(assistantMessage);
    renderMessage(assistantMessage);
    saveChatHistory();
  } catch (error) {
    hideThinkingIndicator();
    console.error('Error retrieving response from the King', error);
    const fallback = {
      role: 'system',
      content: 'The King is momentarily unavailable. Please try again shortly.'
    };
    renderMessage(fallback);
  }
}

function showThinkingIndicator() {
  const indicator = document.querySelector(selectors.thinkingIndicator);
  if (indicator) {
    indicator.classList.remove('hidden');
  }
}

function hideThinkingIndicator() {
  const indicator = document.querySelector(selectors.thinkingIndicator);
  if (indicator) {
    indicator.classList.add('hidden');
  }
}

async function getKingResponse() {
  const response = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ messages: chatHistory })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Request failed: ${response.status} ${errorText}`);
  }

  const payload = await response.json();
  if (!payload || typeof payload.reply !== 'string') {
    throw new Error('Invalid response payload');
  }

  return {
    role: 'assistant',
    content: payload.reply.trim()
  };
}

function initAds() {
  if (typeof window === 'undefined') {
    return;
  }

  const adElements = document.querySelectorAll(selectors.adUnits);
  if (!adElements.length) {
    return;
  }

  window.adsbygoogle = window.adsbygoogle || [];

  adElements.forEach(() => {
    try {
      window.adsbygoogle.push({});
    } catch (error) {
      console.warn('AdSense push failed', error);
    }
  });
}

async function loadNewsDiary(isManualRefresh = false) {
  const listEl = document.querySelector(selectors.newsList);
  const statusEl = document.querySelector(selectors.newsStatus);

  if (!listEl || !statusEl) {
    return;
  }

  listEl.innerHTML = '';
  statusEl.textContent = isManualRefresh ? 'Refreshing the royal brief...' : "Summoning today's decrees...";
  statusEl.classList.remove('hidden');
  newsLoading = true;
  newsLoaded = false;

  try {
    const response = await fetch('/.netlify/functions/news');
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    const entries = Array.isArray(payload.entries)
      ? payload.entries
          .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean)
      : [];

    if (entries.length > 0) {
      renderNewsEntries(entries);
      const timestamp = payload.updatedAt ? new Date(payload.updatedAt) : null;
      statusEl.textContent = timestamp ? `Updated at ${timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'Updated just now.';
      newsLoaded = true;
      newsLoading = false;
      return;
    }

    statusEl.textContent = 'No royal diary entries are available. Please refresh shortly.';
    newsLoaded = false;
    newsLoading = false;
    return;
  } catch (error) {
    console.error('Failed to load news diary', error);
    statusEl.textContent = 'The royal scribes are delayed. Please try again soon.';
    newsLoaded = false;
    newsLoading = false;
  }
}

function renderNewsEntries(entries) {
  const listEl = document.querySelector(selectors.newsList);
  if (!listEl) {
    return;
  }

  listEl.innerHTML = '';

  entries.slice(0, 3).forEach((entry, index) => {
    const item = document.createElement('li');
    item.classList.add('news-entry');

    const heading = document.createElement('h3');
    heading.textContent = `Entry ${index + 1}`;

    const paragraph = document.createElement('p');
    paragraph.textContent = typeof entry === 'string' ? entry : '';

    item.appendChild(heading);
    item.appendChild(paragraph);
    listEl.appendChild(item);
  });
}
