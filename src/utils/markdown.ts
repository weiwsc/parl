interface MarkdownRenderOptions {
  leadDropCap?: boolean;
}

function decorateLeadDropCap(html: string): string {
  let index = 0;

  while (index < html.length) {
    const char = html[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === '<') {
      const end = html.indexOf('>', index);
      if (end === -1) break;
      index = end + 1;
      continue;
    }
    break;
  }

  if (index >= html.length) return html;

  const entity = html.slice(index).match(/^&(?:[a-zA-Z]+|#\d+|#x[\da-fA-F]+);/);
  const end = entity ? index + entity[0].length : index + Array.from(html.slice(index))[0].length;
  return `${html.slice(0, index)}<span class="md-dropcap">${html.slice(index, end)}</span>${html.slice(end)}`;
}

export function renderMarkdown(text: string, emptyText = 'No description.', options: MarkdownRenderOptions = {}): string {
  const esc = (s: string) =>
    s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  if (!text.trim()) return `<p class="md-empty">${esc(emptyText)}</p>`;
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>');

  const lines = text.split('\n');
  let html = '', inUL = false, depth = 0;
  let shouldDecorateLead = Boolean(options.leadDropCap);

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
      if (raw.trim()) {
        const body = inline(raw.trim());
        const className = shouldDecorateLead ? 'md-p md-p--lead' : 'md-p';
        html += `<p class="${className}">${shouldDecorateLead ? decorateLeadDropCap(body) : body}</p>`;
        shouldDecorateLead = false;
      }
    }
  }
  closeUL();
  return html;
}
