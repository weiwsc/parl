export function renderMarkdown(text: string): string {
  if (!text.trim()) return '<p class="md-empty">No description.</p>';
  const esc = (s: string) =>
    s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');

  const lines = text.split('\n');
  let html = '', inUL = false, depth = 0;

  const closeUL = () => {
    while (depth > 0) { html += '</ul>'; depth--; }
    inUL = false;
  };

  for (const raw of lines) {
    const m = raw.match(/^(\s*)[-*•]\s(.+)$/);
    const h2 = raw.match(/^##\s(.+)$/);
    const h1 = raw.match(/^#\s(.+)$/);
    if (h2) { closeUL(); html += `<h4 class="md-h4">${inline(h2[1])}</h4>`; }
    else if (h1) { closeUL(); html += `<h3 class="md-h3">${inline(h1[1])}</h3>`; }
    else if (m) {
      const d = Math.min(3, Math.floor(m[1].length / 2));
      if (!inUL) { html += '<ul class="md-ul">'; inUL = true; depth = 0; }
      while (depth < d) { html += '<ul class="md-ul-nested">'; depth++; }
      while (depth > d) { html += '</ul>'; depth--; }
      html += `<li class="md-li">${inline(m[2])}</li>`;
    } else {
      closeUL();
      if (raw.trim()) html += `<p class="md-p">${inline(raw.trim())}</p>`;
    }
  }
  closeUL();
  return html;
}
