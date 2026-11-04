(() => {
  "use strict";

  const CJK = /[\u3400-\u9fff]/;
  const SENTENCE_STARTERS = new Set([
    "a", "an", "the", "i", "he", "she", "it", "we", "they", "you",
    "this", "that", "these", "those", "there", "here"
  ]);
  const PARTS_OF_SPEECH = new Set([
    "n", "v", "vi", "vt", "adj", "adv", "prep", "pron", "conj", "num", "art", "aux", "modal"
  ]);
  const MARKER_PATTERN = /(?:^|[,，;；\s])(?:例句?|搭(?:配)?|助记|记(?:忆)?|派生|拓展|近义|反义|用法|词组)\s*[\]】):：0-9]?/i;
  const MEMORY_MARKER_PATTERN = /(?:^|[,，;；\s])(?:助记|记(?:忆)?)\s*[\]】):：0-9]?/i;

  function normalizeLine(value) {
    return String(value || "")
      .replace(/[|•·]/g, " ")
      .replace(/[“”]/g, '"')
      .replace(/[’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanHeadword(raw) {
    let headword = String(raw || "").replace(/[.,;:]+$/g, "").trim();
    const words = headword.split(/\s+/).filter(Boolean);
    while (words.length && PARTS_OF_SPEECH.has(words.at(-1).replace(/\./g, "").toLowerCase())) words.pop();
    headword = words.join(" ");
    headword = headword.replace(/(?:adj|adv|prep|pron|conj|noun|verb)$/i, "");
    return headword.trim();
  }

  function extractHeadword(line) {
    const withoutBullet = line.replace(/^\s*(?:\d{1,3}\s*[.)、]|[-–—*])\s*/, "");
    const match = withoutBullet.match(/^([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})/);
    if (!match) return null;
    const headword = cleanHeadword(match[1]);
    const words = headword.split(/\s+/).filter(Boolean);
    const compact = headword.replace(/[^A-Za-z]/g, "");
    if (!headword || compact.length < 2 || compact.length > 32 || words.length > 4) return null;
    if (words.length > 1 && SENTENCE_STARTERS.has(words[0].toLowerCase())) return null;
    return { headword, start: withoutBullet, after: withoutBullet.slice(match[0].length) };
  }

  function cleanMeaning(value) {
    let meaning = String(value || "").replace(/^\s*[,，;；:：)）\]}】-]+\s*/, "");
    const chineseAt = meaning.search(CJK);
    if (chineseAt < 0) return "";
    meaning = meaning.slice(chineseAt)
      .replace(/\s+/g, "")
      .replace(/[（(]?\d+[)）]?$/g, "")
      .replace(/^[例搭记][\]】):：0-9]*/g, "")
      .trim();
    if (!CJK.test(meaning) || meaning.length > 50) return "";
    return meaning;
  }

  function parseEntry(line) {
    const marker = line.match(MARKER_PATTERN);
    let usable = marker ? line.slice(0, marker.index) : line;
    let entry = extractHeadword(usable);
    let meaning = entry ? cleanMeaning(entry.after) : "";

    // Some OCR results merge a mnemonic label with a repeated real entry,
    // for example: "wild, 记1wild adj. 野生的". Recover that safely.
    if (!meaning && marker && MEMORY_MARKER_PATTERN.test(marker[0])) {
      const tail = line.slice((marker.index || 0) + marker[0].length).replace(/^\d+/, "");
      const repeated = extractHeadword(tail);
      if (entry && repeated && repeated.headword.toLowerCase().startsWith(entry.headword.toLowerCase())) {
        meaning = cleanMeaning(repeated.after);
      }
    }

    if (!entry || !meaning) return null;
    const first = entry.headword.split(/\s+/)[0].toLowerCase();
    if (SENTENCE_STARTERS.has(first) && marker) return null;
    return `${entry.headword}, ${meaning}`;
  }

  function looksLikeStandaloneHeadword(line) {
    const entry = extractHeadword(line);
    if (!entry || CJK.test(line)) return "";
    const rest = entry.after.replace(/[\s/\[\]().,:;'-]/g, "");
    if (rest || SENTENCE_STARTERS.has(entry.headword.toLowerCase())) return "";
    return entry.headword;
  }

  function looksLikeStandaloneMeaning(line) {
    if (!CJK.test(line) || /[A-Za-z]/.test(line) || MARKER_PATTERN.test(line)) return "";
    const meaning = cleanMeaning(line);
    return meaning && meaning.length <= 30 ? meaning : "";
  }

  function parse(text) {
    const lines = String(text || "").split(/\n/).map(normalizeLine).filter(Boolean);
    const rows = [];
    let filtered = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const row = parseEntry(lines[index]);
      if (row) {
        rows.push(row);
        continue;
      }

      // Tencent OCR may occasionally split one entry into two adjacent boxes.
      // Pair only immediate, simple "English then Chinese" lines—never global lists.
      const headword = looksLikeStandaloneHeadword(lines[index]);
      const meaning = index + 1 < lines.length ? looksLikeStandaloneMeaning(lines[index + 1]) : "";
      if (headword && meaning) {
        rows.push(`${headword}, ${meaning}`);
        index += 1;
        continue;
      }
      filtered += 1;
    }

    return {
      rows: [...new Set(rows)].join("\n"),
      count: new Set(rows).size,
      filtered
    };
  }

  window.WordBuddyOcr = { parse };
})();
