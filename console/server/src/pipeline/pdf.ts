// =============================================================================
// Renderer dei deliverable in PDF.
//
// Il modello produce markdown; questo modulo lo trasforma in un documento PDF
// professionale (A4, gerarchia dei titoli, elenchi, tabelle, blocchi di codice,
// allegati immagini, numeri di pagina e pie' di pagina con il brand Aethersy).
//
// Motore: pdfkit (JavaScript puro, nessun binario nativo, nessun headless).
// I font built-in (Helvetica/Times/Courier) sono WinAnsi: il testo italiano
// (accenti, euro) e' coperto; i glifi fuori WinAnsi vengono sostituiti.
// =============================================================================

import PDFDocument from "pdfkit";

/** Palette di brand (stessa del design system: ciano su indaco). */
const BRAND = {
  ink: "#12112B",
  indigo: "#1A0F4A",
  indigoSoft: "#2D1B6E",
  cyan: "#00A8CC",
  orange: "#E07B00",
  muted: "#5B5A73",
  line: "#D9D8E8",
  codeBg: "#F4F3FA",
  tableHead: "#1A0F4A",
  tableStripe: "#F4F3FA",
};

export interface PdfAttachment {
  name: string;
  mime: string;
  /** Byte grezzi dell'allegato (PNG/JPEG). */
  data: Buffer;
}

export interface PdfOptions {
  /** Titolo del deliverable (task). */
  title: string;
  /** Sottotitolo: droid / stadio. */
  subtitle?: string;
  /** Testo markdown del deliverable. */
  markdown: string;
  /** Data in formato leggibile (default: ora del server). */
  dateLabel?: string;
  /** Allegati (immagini prodotte dal pipeline). */
  attachments?: PdfAttachment[];
}

const PAGE = {
  size: "A4" as const,
  margin: 56,
  get width() {
    return 595.28;
  },
  get height() {
    return 841.89;
  },
};

const FOOTER_HEIGHT = 34;
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;

/** Sostituisce i caratteri fuori WinAnsi (il font built-in non li copre). */
function winAnsiSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, "-")
    .replace(/\u2014/g, "--")
    .replace(/\u2022/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2192/g, "->")
    .replace(/\u2713/g, "OK")
    .replace(/\u2717/g, "x")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x20-\x7e\u00a1-\u00ff\n]/g, "?");
}

/** Estrae i segmenti inline (grassetto, corsivo, codice) da una riga markdown. */
type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean };

function parseInline(input: string): Span[] {
  const spans: Span[] = [];
  let rest = input;
  const push = (text: string, style: Omit<Span, "text"> = {}) => {
    if (!text) return;
    spans.push({ text, ...style });
  };

  while (rest.length > 0) {
    const bold = rest.match(/^\*\*([^*]+)\*\*/);
    if (bold) {
      push(bold[1], { bold: true });
      rest = rest.slice(bold[0].length);
      continue;
    }
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      push(code[1], { code: true });
      rest = rest.slice(code[0].length);
      continue;
    }
    const italic = rest.match(/^\*([^*]+)\*/);
    if (italic) {
      push(italic[1], { italic: true });
      rest = rest.slice(italic[0].length);
      continue;
    }
    const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (link) {
      push(link[1], { italic: true });
      push(` (${link[2]})`, { code: true });
      rest = rest.slice(link[0].length);
      continue;
    }
    const next = rest.search(/\*\*|`|\*|\[/);
    if (next === -1) {
      push(rest);
      break;
    }
    push(rest.slice(0, next));
    rest = rest.slice(next);
  }
  return spans;
}

/** Riga markdown -> blocchi logici. */
type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string; ordered: boolean; marker: string }
  | { kind: "code"; lines: string[]; lang: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

function parseMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: "paragraph", text: paragraph.join(" ").trim() });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // Blocco di codice
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      blocks.push({ kind: "code", lines: code, lang: fence[1] ?? "" });
      continue;
    }

    // Tabella pipe
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const cells = (row: string) =>
        row
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
      const header = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ kind: "quote", text: quote[1] });
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      blocks.push({ kind: "bullet", text: bullet[1], ordered: false, marker: "-" });
      continue;
    }

    const ordered = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (ordered) {
      flushParagraph();
      blocks.push({
        kind: "bullet",
        text: ordered[2],
        ordered: true,
        marker: `${ordered[1]}.`,
      });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

/** Larghezza delle colonne di una tabella, proporzionale al contenuto. */
function columnWidths(header: string[], rows: string[][]): number[] {
  const weights = header.map((cell, index) => {
    const longest = Math.max(
      cell.length,
      ...rows.map((row) => (row[index] ?? "").length),
      4,
    );
    return Math.min(longest, 42);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map((weight) => Math.max((weight / total) * CONTENT_WIDTH, 48));
}

/**
 * Genera il PDF del deliverable. Restituisce i byte completi del documento.
 */
export async function renderDeliverablePdf(options: PdfOptions): Promise<Buffer> {
  const doc = new PDFDocument({
    size: PAGE.size,
    margins: {
      top: PAGE.margin,
      bottom: PAGE.margin + FOOTER_HEIGHT,
      left: PAGE.margin,
      right: PAGE.margin,
    },
    info: {
      Title: options.title,
      Author: "Aethersy",
      Subject: options.subtitle ?? "Deliverable Aethersy",
      Creator: "Aethersy",
    },
    autoFirstPage: true,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));

  const dateLabel = options.dateLabel ?? new Date().toLocaleDateString("it-IT");

  // --- Testata della prima pagina ------------------------------------------
  const titleTop = doc.y;
  doc
    .save()
    .fillColor(BRAND.indigo)
    .roundedRect(PAGE.margin, titleTop, 6, 46, 3)
    .fill()
    .restore();

  doc
    .fillColor(BRAND.indigo)
    .font("Helvetica-Bold")
    .fontSize(22)
    .text(winAnsiSafe(options.title), PAGE.margin + 18, titleTop + 2, {
      width: CONTENT_WIDTH - 18,
      lineGap: 2,
    });

  let metaLine = "Aethersy";
  if (options.subtitle) metaLine += `  |  ${options.subtitle}`;
  metaLine += `  |  ${dateLabel}`;
  doc
    .fillColor(BRAND.muted)
    .font("Helvetica")
    .fontSize(9.5)
    .text(winAnsiSafe(metaLine), PAGE.margin + 18, doc.y + 4, { width: CONTENT_WIDTH - 18 });

  doc
    .moveDown(0.8)
    .moveTo(PAGE.margin, doc.y)
    .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y)
    .strokeColor(BRAND.line)
    .lineWidth(1)
    .stroke();
  doc.moveDown(1);

  // --- Corpo ---------------------------------------------------------------
  const blocks = parseMarkdown(options.markdown);

  const fontFor = (span: Span) =>
    span.code
      ? "Courier"
      : span.bold
        ? "Helvetica-Bold"
        : span.italic
          ? "Helvetica-Oblique"
          : "Helvetica";

  /**
   * Scrive i segmenti inline usando il flusso di pdfkit: il testo va a capo
   * da solo e i segmenti restano sulla stessa riga (grassetto/corsivo/codice).
   */
  const drawInline = (spans: Span[], x: number, width: number) => {
    if (!spans.length) return;
    const startX = doc.x;
    doc.x = x;
    spans.forEach((span, index) => {
      doc
        .font(fontFor(span))
        .fontSize(span.code ? 9.5 : 10.5)
        .fillColor(span.code ? BRAND.indigoSoft : BRAND.ink)
        .text(winAnsiSafe(span.text), {
          width,
          lineGap: 3,
          continued: index < spans.length - 1,
          align: "left",
        });
    });
    doc.x = startX;
    doc.moveDown(0.3);
  };

  for (const [blockIndex, block] of blocks.entries()) {
    // Il titolo e' gia' nella testata: se il markdown ricomincia con lo stesso
    // H1 non lo si ripete.
    if (
      blockIndex === 0 &&
      block.kind === "heading" &&
      block.level === 1 &&
      block.text.trim().toLowerCase() === options.title.trim().toLowerCase()
    ) {
      continue;
    }
    // Non spezzare i blocchi: salto pagina se non c'e' spazio.
    const ensureSpace = (needed: number) => {
      if (doc.y + needed > PAGE.height - PAGE.margin - FOOTER_HEIGHT) doc.addPage();
    };

    if (block.kind === "heading") {
      const size = block.level <= 1 ? 16 : block.level === 2 ? 13.5 : 11.5;
      ensureSpace(size + 26);
      doc.moveDown(block.level <= 2 ? 0.6 : 0.4);
      doc
        .fillColor(block.level <= 2 ? BRAND.indigo : BRAND.indigoSoft)
        .font("Helvetica-Bold")
        .fontSize(size)
        .text(winAnsiSafe(block.text), PAGE.margin, doc.y, { width: CONTENT_WIDTH, lineGap: 2 });
      if (block.level <= 2) {
        doc
          .moveTo(PAGE.margin, doc.y + 4)
          .lineTo(PAGE.margin + 42, doc.y + 4)
          .strokeColor(BRAND.cyan)
          .lineWidth(2)
          .stroke();
        doc.y += 10;
      }
      doc.moveDown(0.35);
      continue;
    }

    if (block.kind === "paragraph") {
      ensureSpace(34);
      drawInline(parseInline(block.text), PAGE.margin, CONTENT_WIDTH);
      continue;
    }

    if (block.kind === "bullet") {
      ensureSpace(24);
      const indent = 16;
      const markerY = doc.y;
      doc.font("Helvetica-Bold").fontSize(10.5).fillColor(BRAND.cyan);
      doc.text(winAnsiSafe(block.marker), PAGE.margin, markerY, {
        width: indent,
        lineBreak: false,
      });
      doc.y = markerY;
      drawInline(parseInline(block.text), PAGE.margin + indent, CONTENT_WIDTH - indent);
      continue;
    }

    if (block.kind === "quote") {
      ensureSpace(40);
      const top = doc.y;
      const height = 18;
      doc.save().fillColor(BRAND.codeBg).rect(PAGE.margin, top, CONTENT_WIDTH, height).fill().restore();
      doc
        .fillColor(BRAND.indigo)
        .font("Helvetica-Oblique")
        .fontSize(10.5)
        .text(winAnsiSafe(block.text), PAGE.margin + 10, top + 4, {
          width: CONTENT_WIDTH - 20,
          height: height,
          ellipsis: true,
        });
      doc.y = top + height + 8;
      continue;
    }

    if (block.kind === "rule") {
      ensureSpace(18);
      doc
        .moveTo(PAGE.margin, doc.y + 4)
        .lineTo(PAGE.margin + CONTENT_WIDTH, doc.y + 4)
        .strokeColor(BRAND.line)
        .lineWidth(1)
        .stroke();
      doc.y += 14;
      continue;
    }

    if (block.kind === "code") {
      const text = winAnsiSafe(block.lines.join("\n"));
      const lines = text.split("\n");
      const truncated = lines.length > 40;
      const shown = truncated ? `${lines.slice(0, 40).join("\n")}\n...` : text;
      doc.font("Courier").fontSize(9.5);
      const textHeight = doc.heightOfString(shown, { width: CONTENT_WIDTH - 24 });
      const boxHeight = textHeight + 16;
      ensureSpace(Math.min(boxHeight, 220) + 16);
      const top = doc.y;
      doc
        .save()
        .fillColor(BRAND.codeBg)
        .roundedRect(PAGE.margin, top, CONTENT_WIDTH, boxHeight, 6)
        .fill()
        .restore();
      doc
        .fillColor(BRAND.indigo)
        .font("Courier")
        .fontSize(9.5)
        .text(shown, PAGE.margin + 12, top + 8, {
          width: CONTENT_WIDTH - 24,
          lineBreak: true,
        });
      doc.y = top + boxHeight + 10;
      continue;
    }

    if (block.kind === "table") {
      const widths = columnWidths(block.header, block.rows);
      const drawRow = (cells: string[], header: boolean) => {
        const cellTexts = cells.map((cell, index) => winAnsiSafe(cell));
        doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(9);
        const heights = cellTexts.map((text, index) =>
          doc.heightOfString(text, { width: widths[index] - 12 }),
        );
        const rowHeight = Math.max(...heights, 16) + 10;
        ensureSpace(rowHeight);
        const top = doc.y;
        if (header) {
          doc.save().fillColor(BRAND.tableHead).rect(PAGE.margin, top, CONTENT_WIDTH, rowHeight).fill().restore();
        }
        let x = PAGE.margin;
        cellTexts.forEach((text, index) => {
          doc
            .fillColor(header ? "#FFFFFF" : BRAND.ink)
            .font(header ? "Helvetica-Bold" : "Helvetica")
            .fontSize(9)
            .text(text, x + 6, top + 5, { width: widths[index] - 12 });
          x += widths[index];
        });
        doc
          .moveTo(PAGE.margin, top + rowHeight)
          .lineTo(PAGE.margin + CONTENT_WIDTH, top + rowHeight)
          .strokeColor(BRAND.line)
          .lineWidth(0.5)
          .stroke();
        doc.y = top + rowHeight;
      };
      ensureSpace(40);
      drawRow(block.header, true);
      for (const row of block.rows) drawRow(row, false);
      doc.moveDown(0.5);
      continue;
    }
  }

  // --- Allegati ------------------------------------------------------------
  const attachments = (options.attachments ?? []).filter((item) =>
    item.mime.includes("png") || item.mime.includes("jpeg") || item.mime.includes("jpg"),
  );
  if (attachments.length) {
    doc.addPage();
    doc
      .fillColor(BRAND.indigo)
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("Allegati", PAGE.margin, doc.y);
    doc.moveDown(0.8);
    for (const attachment of attachments) {
      try {
        doc.image(attachment.data, {
          fit: [CONTENT_WIDTH, 380],
          align: "center",
          valign: "center",
        });
        doc
          .fillColor(BRAND.muted)
          .font("Helvetica")
          .fontSize(9)
          .text(winAnsiSafe(attachment.name), PAGE.margin, doc.y + 4, {
            width: CONTENT_WIDTH,
            align: "center",
          });
      } catch {
        // Allegato non incorporabile: si segnala a testo.
        doc
          .fillColor(BRAND.muted)
          .font("Helvetica-Oblique")
          .fontSize(9.5)
          .text(`Allegato non incorporabile: ${attachment.name}`);
      }
      doc.moveDown(1);
    }
  }

  // --- Pie' di pagina con numerazione --------------------------------------
  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const y = PAGE.height - PAGE.margin + 8;
    // Il pie' sta sotto il margine inferiore: senza azzerare il margine
    // pdfkit aggiungerebbe una pagina vuota per ogni footer scritto.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .moveTo(PAGE.margin, y - 8)
      .lineTo(PAGE.margin + CONTENT_WIDTH, y - 8)
      .strokeColor(BRAND.line)
      .lineWidth(0.5)
      .stroke();
    doc
      .fillColor(BRAND.muted)
      .font("Helvetica")
      .fontSize(8.5)
      .text(
        winAnsiSafe(`Aethersy  |  ${options.title}  |  pagina ${index + 1} di ${range.count}`),
        PAGE.margin,
        y,
        { width: CONTENT_WIDTH, align: "center", lineBreak: false },
      );
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}
