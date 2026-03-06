import { createChart, LineSeries } from "lightweight-charts";

// Configuration
const FINNHUB_KEY = "d6laibpr01qr0gn6g6ngd6laibpr01qr0gn6g6o0";  // Sandbox key for initial demo
const DEFAULTS = ["TSLA", "AAPL", "AMZN", "MSFT", "GOOGL"];
let currentSymbol = "TSLA";
let socket;
let chart;
let lineSeries;
let isDemoMode = false;
let mockInterval;
let recentSearches = [];

// Portfolio State
let portfolio = {
  balance: 10000.00,
  holdings: {} // Format: { "AAPL": { qty: 10, avgPrice: 150.00 } }
};

// Alerts State
let activeAlerts = []; // Format: { symbol: 'AAPL', targetPrice: 150, type: 'UP' }

// Initialize Chart
function initChart() {
  try {
    const container = document.getElementById("chart");
    if (!container) return;
    
    chart = createChart(container, {
      layout: {
        background: { color: "transparent" },
        textColor: "#8b8b99",
        fontFamily: "'Space Grotesk', sans-serif"
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.03)" },
        horzLines: { color: "rgba(255, 255, 255, 0.03)" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        timeVisible: true,
        secondsVisible: false,
      },
    });

    lineSeries = chart.addSeries(LineSeries, {
      color: "#00f2ff",
      lineWidth: 3,
      crosshairMarkerBackgroundColor: "#00f2ff",
      crosshairMarkerRadius: 5,
      crosshairMarkerBorderColor: "#050508",
      crosshairMarkerBorderWidth: 2,
    });

    window.addEventListener("resize", () => {
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    console.log("Chart initialized.");
  } catch (err) {
    console.error("FATAL ERROR in initChart:", err);
    enableDemoMode(); // Fallback if chart fails
  }
}

// WebSocket Setup
function connectWebSocket() {
  if (socket) socket.close();

  socket = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_KEY}`);

  socket.addEventListener("open", () => {
    subscribe(currentSymbol);
  });

  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.type === "trade") {
      const trade = data.data[0];
      updateUI(trade.s, trade.p);
      updateChart(trade.p, trade.t);
      updateWatchlistPrice(trade.s, trade.p);
    }
  });

  socket.addEventListener("error", (err) => {
    console.error("Socket Error:", err);
  });
}

const COMMON_SYMBOLS = [
  { s: "AAPL", n: "Apple Inc." },
  { s: "TSLA", n: "Tesla Inc." },
  { s: "GOOGL", n: "Alphabet Inc." },
  { s: "MSFT", n: "Microsoft Corp." },
  { s: "AMZN", n: "Amazon.com Inc." },
  { s: "META", n: "Meta Platforms Inc." },
  { s: "NVDA", n: "NVIDIA Corp." },
  { s: "NFLX", n: "Netflix Inc." },
  { s: "AMD", n: "Advanced Micro Devices" },
  { s: "PYPL", n: "PayPal Holdings" },
  { s: "INTC", n: "Intel Corp." },
];

async function fetchQuote(symbol) {
  try {
    const response = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`
    );
    
    if (!response.ok) {
      console.warn(`API Error (${response.status}), switching to Demo Mode...`);
      enableDemoMode();
      return;
    }

    const data = await response.json();
    ^
    if (!data.c) {
      console.warn(`Missing data for ${symbol}, switching to Demo Mode...`);
      enableDemoMode();
      return;
    }

    updateMetrics(data);
    updateUI(symbol, data.c);
    if (data.c) {
      updatePortfolioUI(data.c);
      checkAlerts(symbol, data.c);
    }
  } catch (error) {
    console.error("Error fetching quote, switching to Demo Mode:", error);
    enableDemoMode();
  }
}

async function fetchHistoricalData(symbol) {
  try {
    const to = Math.floor(Date.now() / 1000);
    const from = to - 86400 * 7; // Last 7 days
    const response = await fetch(
      `https://finnhub.io/api/v1/stock/candle?symbol=${symbol}&resolution=60&from=${from}&to=${to}&token=${FINNHUB_KEY}`
    );
    const data = await response.json();

    if (data.s === "ok") {
      const historicalData = data.t.map((time, i) => ({
        time: time,
        value: data.c[i],
      }));
      lineSeries.setData(historicalData);
    }
  } catch (error) {
    console.error("Error fetching historical data:", error);
  }
}

function updateMetrics(data) {
  if (!data || data.error) {
    return;
  }
  
  document.getElementById("metric-high").innerText = data.h ? `$${data.h}` : "--";
  document.getElementById("metric-low").innerText = data.l ? `$${data.l}` : "--";
  document.getElementById("metric-open").innerText = data.o ? `$${data.o}` : "--";
  document.getElementById("metric-close").innerText = data.pc ? `$${data.pc}` : "--";

  const change = data.dp || 0;
  const changeEl = document.getElementById("price-change");
  changeEl.innerText = `${change > 0 ? "+" : ""}${change.toFixed(2)}%`;
  changeEl.className = `metric-label ${change >= 0 ? "price-up" : "price-down"}`;
  
  if (isDemoMode) {
    document.querySelector(".live-badge").innerHTML = `
      <span class="dot" style="background: #ffcc00; box-shadow: 0 0 10px #ffcc00"></span>
      Demo Mode (No API)
    `;
    document.querySelector(".live-badge").style.color = "#ffcc00";
  }
}

function subscribe(symbol) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe", symbol: symbol }));
  }
}

function unsubscribe(symbol) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "unsubscribe", symbol: symbol }));
  }
}

// UI Updates
const priceEl = document.getElementById("current-price");

function updateUI(symbol, price) {
  if (symbol !== currentSymbol || !price || isNaN(price)) return;

  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);

  priceEl.innerText = formattedPrice;

  // Pulse effect
  priceEl.animate(
    [
      { transform: "scale(1)", filter: "brightness(1)" },
      { transform: "scale(1.05)", filter: "brightness(1.5)" },
      { transform: "scale(1)", filter: "brightness(1)" },
    ],
    { duration: 400, easing: "ease-out" }
  );
}

function updateWatchlistPrice(symbol, price) {
  const el = document.getElementById(`watch-${symbol}`);
  if (el) {
    el.innerText = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(price);
  }
}

function updateChart(price, timestamp) {
  lineSeries.update({
    time: Math.floor(timestamp / 1000),
    value: price,
  });
}

// Watchlist Logic
function initWatchlist() {
  const watchlist = document.getElementById("watchlist");
  DEFAULTS.forEach((symbol) => {
    const item = document.createElement("div");
    item.className = `stock-item ${symbol === currentSymbol ? "active" : ""}`;
    item.id = `item-${symbol}`;
    item.innerHTML = `
            <span class="symbol">${symbol}</span>
            <span class="price" id="watch-${symbol}">$---</span>
        `;
    item.onclick = () => switchSymbol(symbol);
    watchlist.appendChild(item);
  });

  // Add Demo Mode Button (Hidden if already in demo mode)
  const demoBtn = document.createElement("button");
  demoBtn.id = "demo-mode-btn";
  demoBtn.className = "search-input";
  demoBtn.style.marginTop = "1rem";
  demoBtn.style.background = "rgba(255, 204, 0, 0.1)";
  demoBtn.style.borderColor = "#ffcc00";
  demoBtn.style.color = "#ffcc00";
  demoBtn.style.cursor = "pointer";
  demoBtn.innerText = "Demo Modus Starten";
  demoBtn.onclick = () => enableDemoMode();
  if (isDemoMode) {
     demoBtn.style.display = "none";
  }
  watchlist.parentElement.appendChild(demoBtn);
}

async function switchSymbol(newSymbol) {
  if (newSymbol === currentSymbol) return;

  unsubscribe(currentSymbol);

  const items = document.querySelectorAll(".stock-item");
  items.forEach((i) => i.classList.remove("active"));
  document.getElementById(`item-${newSymbol}`)?.classList.add("active");

  // Manage recent searches
  if (!DEFAULTS.includes(newSymbol) && !recentSearches.includes(newSymbol)) {
    recentSearches.unshift(newSymbol);
    if (recentSearches.length > 5) recentSearches.pop(); // Keep only last 5
    renderRecentSearches();
  }

  currentSymbol = newSymbol;
  document.getElementById("current-symbol").innerText = currentSymbol;

  // Try to find full name
  const known = COMMON_SYMBOLS.find(s => s.s === currentSymbol);
  document.getElementById("current-name").innerText = known ? known.n : newSymbol;

  lineSeries.setData([]);
  
  // Set an immediate price to 0 or fetch so trade buttons don't break
  document.getElementById("current-price").innerText = "$---";
  
  if (isDemoMode) {
      setupDemoDataForSymbol(currentSymbol);
      renderFakeNews(currentSymbol);
  } else {
      await fetchQuote(currentSymbol);
      await fetchHistoricalData(currentSymbol);
      await fetchNews(currentSymbol);
      subscribe(currentSymbol);
  }
}


// Search Logic
const searchInput = document.getElementById("symbol-search");
const suggestionsContainer = document.createElement("div");
suggestionsContainer.className = "suggestions-dropdown";
searchInput.parentElement.appendChild(suggestionsContainer);

searchInput.addEventListener("input", (e) => {
  const query = e.target.value.toUpperCase();
  if (query.length < 1) {
    suggestionsContainer.innerHTML = "";
    return;
  }

  const matches = COMMON_SYMBOLS.filter(
    (item) => item.s.includes(query) || item.n.toUpperCase().includes(query)
  ).slice(0, 5);

  renderSuggestions(matches);
});

function renderSuggestions(matches) {
  suggestionsContainer.innerHTML = "";
  if (matches.length === 0) return;

  matches.forEach((match) => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `
      <span class="symbol">${match.s}</span>
      <span class="name">${match.n}</span>
    `;
    div.onclick = () => {
      switchSymbol(match.s);
      searchInput.value = "";
      suggestionsContainer.innerHTML = "";
    };
    suggestionsContainer.appendChild(div);
  });
}

document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
    suggestionsContainer.innerHTML = "";
  }
});

searchInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const sym = e.target.value.toUpperCase();
    if (sym) {
      switchSymbol(sym);
      searchInput.value = "";
      suggestionsContainer.innerHTML = "";
    }
  }
});

function renderRecentSearches() {
  const container = document.getElementById("recent-searches-container");
  const list = document.getElementById("recent-searches");
  
  if (recentSearches.length === 0) {
    container.style.display = "none";
    return;
  }
  
  container.style.display = "block";
  list.innerHTML = "";
  
  recentSearches.forEach((symbol) => {
    const item = document.createElement("div");
    item.className = `stock-item ${symbol === currentSymbol ? "active" : ""}`;
    item.id = `item-recent-${symbol}`;
    item.innerHTML = `
      <span class="symbol">${symbol}</span>
      <span class="price" id="watch-${symbol}">$---</span>
    `;
    item.onclick = () => switchSymbol(symbol);
    list.appendChild(item);
    
    // Attempt to fetch quote if we're not in demo mode
    if (!isDemoMode) {
      fetchQuote(symbol); // Note: this will update the ui and try to subscribe if possible, might need refinement for full live updates
      subscribe(symbol);
    }
  });
}

// News Logic
async function fetchNews(symbol) {
  const newsFeed = document.getElementById("news-feed");
  newsFeed.innerHTML = '<div class="news-placeholder">Lade Nachrichten...</div>';

  try {
    const today = new Date().toISOString().split('T')[0];
    const pastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const response = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${pastWeek}&to=${today}&token=${FINNHUB_KEY}`
    );
    
    if (!response.ok) throw new Error("API Error");
    const data = await response.json();
    
    renderNews(data);
  } catch (error) {
    console.error("Error fetching news:", error);
    renderFakeNews(symbol);
  }
}

function renderNews(newsArray) {
  const newsFeed = document.getElementById("news-feed");
  newsFeed.innerHTML = "";
  
  if (!newsArray || newsArray.length === 0) {
    newsFeed.innerHTML = '<div class="news-placeholder">Keine aktuellen Nachrichten gefunden.</div>';
    return;
  }

  // Display top 10 news
  newsArray.slice(0, 10).forEach(item => {
    const date = new Date(item.datetime * 1000).toLocaleDateString("de-DE", { 
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" 
    });
    
    const article = document.createElement("a");
    article.className = "news-item";
    article.href = item.url;
    article.target = "_blank";
    article.innerHTML = `
      <div class="news-headline">${item.headline}</div>
      <div class="news-meta">
        <span class="news-source">${item.source}</span>
        <span>${date}</span>
      </div>
    `;
    newsFeed.appendChild(article);
  });
}

function renderFakeNews(symbol) {
  const newsFeed = document.getElementById("news-feed");
  newsFeed.innerHTML = "";
  
  const fakeNews = [
    { headline: `${symbol} bringt bahnbrechende neue Technologie auf den Markt. Aktienkurs reagiert positiv.`, source: "Tech Crunch", datetime: Date.now() / 1000 - 3600, url: "#" },
    { headline: `Analysten stufen ${symbol} auf 'Strong Buy' hoch. Rekordgewinne im nächsten Quartal erwartet.`, source: "Wall Street Journal", datetime: Date.now() / 1000 - 86400, url: "#" },
    { headline: `CEO von ${symbol} kündigt strategische Partnerschaft an. Expansion nach Europa geplant.`, source: "Bloomberg", datetime: Date.now() / 1000 - 172800, url: "#" },
    { headline: `${symbol} übertrifft Erwartungen der Wall Street. Umsatz steigt um 25%.`, source: "Reuters", datetime: Date.now() / 1000 - 259200, url: "#" }
  ];
  
  renderNews(fakeNews);
}

// Portfolio Simulation Logic
function executeTrade(action) {
  const qtyInput = document.getElementById("trade-qty");
  const qty = parseInt(qtyInput.value);
  if (isNaN(qty) || qty <= 0) {
    alert("Bitte geben Sie eine gültige Anzahl ein.");
    return;
  }

  const priceStr = document.getElementById("current-price").innerText.replace(/[^0-9.-]+/g,"");
  const currentPrice = parseFloat(priceStr);
  
  if (isNaN(currentPrice)) {
    alert("Aktueller Preis ist nicht verfügbar.");
    return;
  }

  const totalCost = currentPrice * qty;

  if (action === "BUY") {
    if (portfolio.balance >= totalCost) {
      portfolio.balance -= totalCost;
      
      if (portfolio.holdings[currentSymbol]) {
        const oldQty = portfolio.holdings[currentSymbol].qty;
        const oldAvg = portfolio.holdings[currentSymbol].avgPrice;
        portfolio.holdings[currentSymbol].qty += qty;
        portfolio.holdings[currentSymbol].avgPrice = ((oldQty * oldAvg) + totalCost) / (oldQty + qty);
      } else {
        portfolio.holdings[currentSymbol] = { qty: qty, avgPrice: currentPrice };
      }
    } else {
      alert("Nicht genügend Guthaben!");
      return;
    }
  } else if (action === "SELL") {
    if (portfolio.holdings[currentSymbol] && portfolio.holdings[currentSymbol].qty >= qty) {
      portfolio.balance += totalCost;
      portfolio.holdings[currentSymbol].qty -= qty;
      if (portfolio.holdings[currentSymbol].qty === 0) {
        delete portfolio.holdings[currentSymbol];
      }
    } else {
      alert("Nicht genügend Aktien im Portfolio!");
      return;
    }
  }

  updatePortfolioUI(currentPrice);
}

// Make executeTrade available globally for HTML onclick
window.executeTrade = executeTrade;

function updatePortfolioUI(currentActivePrice) {
  const balanceEl = document.getElementById("portfolio-balance");
  const plEl = document.getElementById("portfolio-pl");
  const listEl = document.getElementById("holdings-list");
  
  let totalValue = portfolio.balance;
  let totalCostBase = portfolio.balance; // To calculate total P&L
  
  listEl.innerHTML = "";
  
  for (const [sym, data] of Object.entries(portfolio.holdings)) {
    // We need the *current* price of holding. 
    // For simplicity in this demo, if it's the active symbol we use the exact tick, 
    // otherwise we use its last known watchlist price or avg if missing.
    let latestPrice = data.avgPrice;
    if (sym === currentSymbol && typeof currentActivePrice === 'number') {
      latestPrice = currentActivePrice;
    } else {
      const watchEl = document.getElementById(`watch-${sym}`);
      if (watchEl) {
        const watchVal = parseFloat(watchEl.innerText.replace(/[^0-9.-]+/g,""));
        if (!isNaN(watchVal)) latestPrice = watchVal;
      }
    }

    const holdingValue = latestPrice * data.qty;
    const holdingCost = data.avgPrice * data.qty;
    totalValue += holdingValue;
    totalCostBase += holdingCost; // Cash + cost basis of stocks

    const profit = holdingValue - holdingCost;
    const profitColor = profit >= 0 ? "price-up" : "price-down";

    listEl.innerHTML += `
      <div class="holding-item">
        <div>
          <div class="holding-symbol">${sym}</div>
          <div class="holding-qty">${data.qty} shares @ $${data.avgPrice.toFixed(2)}</div>
        </div>
        <div style="text-align: right">
          <div class="holding-value">$${holdingValue.toFixed(2)}</div>
          <div class="holding-qty ${profitColor}">${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}</div>
        </div>
      </div>
    `;
  }
  
  balanceEl.innerText = `$${totalValue.toFixed(2)}`;
  
  const startingBalance = 10000.00;
  const totalProfit = totalValue - startingBalance;
  const profitPct = (totalProfit / startingBalance) * 100;
  const finalProfitColor = totalProfit >= 0 ? "var(--accent-up)" : "var(--accent-down)";
  const sign = totalProfit >= 0 ? '+' : '';
  
  plEl.innerText = `${sign}$${totalProfit.toFixed(2)} (${sign}${profitPct.toFixed(2)}%)`;
  plEl.style.color = finalProfitColor;
}

// --- Alerts Logic ---
function toggleAlertMenu() {
  const menu = document.getElementById("alert-menu");
  menu.style.display = menu.style.display === "none" ? "block" : "none";
}

function setAlert() {
  const input = document.getElementById("alert-price");
  const targetPrice = parseFloat(input.value);
  
  if (isNaN(targetPrice) || targetPrice <= 0) {
    alert("Bitte gib einen gültigen Preis ein.");
    return;
  }
  
  const currentPrice = parseFloat(document.getElementById("current-price").innerText.replace(/[^0-9.-]+/g,""));
  if (isNaN(currentPrice)) {
    alert("Aktueller Preis ist nicht verfügbar.");
    return;
  }

  const type = targetPrice > currentPrice ? "UP" : "DOWN";
  
  activeAlerts.push({
    symbol: currentSymbol,
    targetPrice: targetPrice,
    type: type,
    triggered: false
  });
  
  showToast(`✅ Alert für ${currentSymbol} bei $${targetPrice} gesetzt.`);
  
  input.value = "";
  toggleAlertMenu();
}

function checkAlerts(symbol, currentPrice) {
  activeAlerts.forEach(alert => {
    if (alert.symbol === symbol && !alert.triggered) {
      if (alert.type === "UP" && currentPrice >= alert.targetPrice) {
        alert.triggered = true;
        showToast(`🚀 ${symbol} hat dein Ziel von $${alert.targetPrice} überschritten!`);
      } else if (alert.type === "DOWN" && currentPrice <= alert.targetPrice) {
        alert.triggered = true;
        showToast(`📉 ${symbol} ist unter dein Ziel von $${alert.targetPrice} gefallen!`);
      }
    }
  });
  
  // Cleanup triggered alerts
  activeAlerts = activeAlerts.filter(a => !a.triggered);
}

function showToast(message) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add("hiding");
    toast.addEventListener("animationend", () => {
      toast.remove();
    });
  }, 4000); // 4 seconds
}

window.toggleAlertMenu = toggleAlertMenu;
window.setAlert = setAlert;

// Demo Mode Logic
function enableDemoMode() {
  if (isDemoMode) return;
  console.log("Activating Demo Mode...");
  isDemoMode = true;
  
  const demoBtn = document.getElementById("demo-mode-btn");
  if (demoBtn) {
    demoBtn.style.display = "none";
  }

  document.querySelector(".live-badge").innerHTML = `
    <span class="dot" style="background: #ffcc00; box-shadow: 0 0 10px #ffcc00"></span>
    Demo Mode (No API)
  `;
  document.querySelector(".live-badge").style.color = "#ffcc00";

  setupDemoDataForSymbol(currentSymbol);
}

function setupDemoDataForSymbol(symbol) {
  const data = [];
  let price = 150 + Math.random() * 100;
  
  // Try to use a somewhat deterministic base price for known symbols
  const knownSymbol = COMMON_SYMBOLS.find(s => s.s === symbol);
  if (knownSymbol) {
     if (symbol === 'TSLA') price = 250;
     else if (symbol === 'AAPL') price = 180;
     else if (symbol === 'MSFT') price = 400;
  }

  const now = Math.floor(Date.now() / 1000);
  
  for (let i = 100; i >= 0; i--) {
    price += (Math.random() - 0.5) * 2;
    data.push({ time: now - i * 60, value: price });
  }
  lineSeries.setData(data);
  
  updateMetrics({
    h: (price + 5).toFixed(2),
    l: (price - 5).toFixed(2),
    o: (price - 2).toFixed(2),
    pc: (price - 1).toFixed(2),
    dp: 1.25,
    mock: true
  });
  updateUI(symbol, price);

  if (mockInterval) clearInterval(mockInterval);
  mockInterval = setInterval(() => {
    const change = (Math.random() - 0.5) * 1;
    price += change;
    updateUI(symbol, price);
    updateChart(price, Date.now());
    updatePortfolioUI(price); // Update portfolio on tick
    checkAlerts(symbol, price);
    
    // Update watchlist items
    const items = document.querySelectorAll(".stock-item .symbol");
    items.forEach(item => {
      const s = item.innerText;
      if (s !== symbol) {
         // Just visual jitter for non-active items in demo
         const currentWatchPriceObj = document.getElementById(`watch-${s}`);
         if (currentWatchPriceObj) {
            let pStr = currentWatchPriceObj.innerText.replace(/[^0-9.-]+/g,"");
            let p = parseFloat(pStr);
            if (isNaN(p)) p = 150 + Math.random() * 50;
            p += (Math.random() - 0.5) * 0.5;
            updateWatchlistPrice(s, p);
         }
      } else {
         updateWatchlistPrice(s, price);
      }
    });

  }, 2000);
}

// App Start
(async () => {
  try {
    initChart();
    initWatchlist();
    connectWebSocket();
    await fetchQuote(currentSymbol);
    await fetchHistoricalData(currentSymbol);
  } catch (err) {
    console.error("App start error:", err);
  }
})();
