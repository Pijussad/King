'use strict';

let chatHistory = [];

const selectors = {
  quoteText: '#quote-text',
  quoteAuthor: '#quote-author',
  newQuoteButton: '#new-quote-btn',
  quotePage: '#quote-page',
  chatPage: '#chat-page',
  chatWindow: '#chat-window',
  chatForm: '#chat-form',
  chatInput: '#chat-input',
  thinkingIndicator: '#thinking-indicator',
  navQuote: '#nav-quote',
  navChat: '#nav-chat'
};

function init() {
  bindNavigation();
  bindQuotes();
  bindChat();
  displayRandomQuote();
  loadChatHistory();
}

document.addEventListener('DOMContentLoaded', init);

function bindNavigation() {
  const quoteButton = document.querySelector(selectors.navQuote);
  const chatButton = document.querySelector(selectors.navChat);

  quoteButton.addEventListener('click', () => setActivePage('quote'));
  chatButton.addEventListener('click', () => setActivePage('chat'));
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

function setActivePage(target) {
  const quoteButton = document.querySelector(selectors.navQuote);
  const chatButton = document.querySelector(selectors.navChat);
  const quotePage = document.querySelector(selectors.quotePage);
  const chatPage = document.querySelector(selectors.chatPage);

  if (!quoteButton || !chatButton || !quotePage || !chatPage) {
    return;
  }

  const isQuote = target === 'quote';

  quoteButton.classList.toggle('active', isQuote);
  chatButton.classList.toggle('active', !isQuote);

  quotePage.classList.toggle('hidden', !isQuote);
  chatPage.classList.toggle('hidden', isQuote);

  if (!isQuote) {
    const chatInput = document.querySelector(selectors.chatInput);
    if (chatInput) {
      chatInput.focus();
    }
  }
}

function displayRandomQuote() {
  if (!Array.isArray(window.myQuotes) || window.myQuotes.length === 0) {
    return;
  }

  const quote = window.myQuotes[Math.floor(Math.random() * window.myQuotes.length)];
  const quoteTextEl = document.querySelector(selectors.quoteText);
  const quoteAuthorEl = document.querySelector(selectors.quoteAuthor);

  if (quoteTextEl) {
    quoteTextEl.textContent = quote.text;
  }

  if (quoteAuthorEl) {
    quoteAuthorEl.textContent = `— ${quote.author}`;
  }
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
