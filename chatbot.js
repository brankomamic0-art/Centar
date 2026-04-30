(() => {
  if (document.querySelector(".chatbot-launcher")) return;

  const history = [];
  const suggestions = [
    "Koje usluge nudite?",
    "Terapija nakon prometne nezgode",
    "Tko je Antonela Pavić?",
    "Kako naručiti termin?",
  ];

  const launcher = document.createElement("button");
  launcher.className = "chatbot-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>
    Pitaj Duju
  `;

  const panel = document.createElement("section");
  panel.className = "chatbot-panel";
  panel.setAttribute("aria-label", "SUPERIOR chat asistent");
  panel.innerHTML = `
    <div class="chatbot-head">
      <div>
        <span class="chatbot-title">SUPERIOR asistent</span>
        <span class="chatbot-subtitle">Informacije o centru i uslugama</span>
      </div>
      <button class="chatbot-close" type="button" aria-label="Zatvori chat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="chatbot-log" aria-live="polite"></div>
    <div>
      <div class="chatbot-suggestions"></div>
      <form class="chatbot-form">
        <div class="chatbot-input-row">
          <input class="chatbot-input" name="message" type="text" maxlength="900" autocomplete="off" placeholder="Upišite pitanje..." aria-label="Poruka" />
          <button class="chatbot-send" type="submit" aria-label="Pošalji">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7Z"/></svg>
          </button>
        </div>
        <p class="chatbot-note">Asistent daje samo opće informacije. Za medicinski savjet ili termin kontaktirajte centar.</p>
      </form>
    </div>
  `;

  document.body.append(launcher, panel);

  const close = panel.querySelector(".chatbot-close");
  const log = panel.querySelector(".chatbot-log");
  const form = panel.querySelector(".chatbot-form");
  const input = panel.querySelector(".chatbot-input");
  const suggestionWrap = panel.querySelector(".chatbot-suggestions");

  const addMessage = (role, text) => {
    const message = document.createElement("div");
    message.className = `chatbot-msg ${role}`;
    message.textContent = text;
    log.append(message);
    log.scrollTop = log.scrollHeight;
    return message;
  };

  const setOpen = (open) => {
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  };

  suggestions.forEach((text) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", () => sendMessage(text));
    suggestionWrap.append(button);
  });

  const sendMessage = async (text) => {
    const message = String(text || input.value || "").trim();
    if (!message) return;

    input.value = "";
    addMessage("user", message);
    const loading = addMessage("bot", "Pišem odgovor...");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json();
      const answer = data.answer || "Trenutno ne mogu odgovoriti. Molimo nazovite +385 99 855 6105.";
      loading.textContent = answer;
      history.push({ role: "user", content: message }, { role: "assistant", content: answer });
      while (history.length > 8) history.shift();
    } catch {
      loading.textContent = "Trenutno ne mogu odgovoriti. Molimo nazovite +385 99 855 6105.";
    }
  };

  addMessage(
    "bot",
    "Duje kaže: pozdrav. Mogu odgovoriti na kratka pitanja o uslugama, centru, Antoneli Pavić, terminima i oporavku nakon nezgoda.",
  );

  launcher.addEventListener("click", () => setOpen(!panel.classList.contains("open")));
  close.addEventListener("click", () => setOpen(false));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });
})();
