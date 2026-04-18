"use client";

import { jsPDF } from "jspdf";

import type { ItineraryMapDay } from "@/app/components/ItineraryMap";

/** Content pages: margin and vertical bounds (mm). */
const MARGIN = 20;
const Y_START = 20;
const Y_BREAK = 270;

const COL = {
  darkTeal: [13, 61, 86] as [number, number, number],
  mint: [42, 181, 160] as [number, number, number],
  coral: [232, 99, 74] as [number, number, number],
  /** Lines that used `**markdown**` — #0B7A8C */
  tealBold: [11, 122, 140] as [number, number, number],
  body: [26, 46, 56] as [number, number, number],
  muted: [140, 155, 168] as [number, number, number],
  watermark: [100, 140, 150] as [number, number, number],
};

const FONT_OVERVIEW = 12;

function stripEmojis(str: string): string {
  return str
    .replace(
      /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u2194-\u21AA\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u25B6\u25C0\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u267F\u2693\u26A1\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u26CE\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u26F5\u{26FA}\u{26FD}\u2702\u2705\u{2708}-\u{270D}\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u{2733}-\u{2734}\u2744\u2747\u274C\u274E\u{2753}-\u{2755}\u2757\u{2763}-\u{2764}\u{2795}-\u{2797}\u27A1\u27B0\u27BF\u{2934}-\u{2935}\u{2B05}-\u{2B07}\u{2B1B}-\u{2B1C}\u2B50\u2B55\u3030\u303D\u3297\u3299]/gu,
      ""
    )
    .replace(/[\uD83C-\uDBFF][\uDC00-\uDFFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function maxTextWidth(doc: jsPDF): number {
  return pageWidth(doc) - MARGIN * 2;
}

/** If current y is past break threshold, new page and return Y_START. */
function ensureYPosition(
  doc: jsPDF,
  y: number,
  contentStartY: number = Y_START
): number {
  if (y > Y_BREAK) {
    doc.addPage();
    return contentStartY;
  }
  return y;
}

/** Before drawing `lines.length` lines at `lineHeight` each, ensure they fit; may add page and reset y. */
function ensureSpaceForLines(
  doc: jsPDF,
  y: number,
  linesCount: number,
  lineHeight: number,
  contentStartY: number
): number {
  const blockHeight = linesCount * lineHeight;
  if (y + blockHeight > Y_BREAK) {
    doc.addPage();
    return contentStartY;
  }
  return y;
}

function isTipLine(line: string): boolean {
  const t = line.trim();
  if (t.startsWith(">")) return true;
  if (t.includes("\uD83D\uDCA1")) return true;
  if (/^\*?\*?\s*(Wandr\s+)?tip\b/i.test(t)) return true;
  if (/^\*\s*(Wandr\s+)?tip\b/i.test(t)) return true;
  return false;
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*[-*•]\s+/, "").trim();
}

/** Cover line: separate vibes with commas so "Wine & Food + …" does not read as one awkward chain. */
function formatVibesForCover(vibe: string): string {
  return vibe
    .split(/\s*\+\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}

/** Strip `#` … `######` headings at line start (after trim). */
function stripHeadingPrefix(line: string): string {
  return line.replace(/^\s*#{1,6}\s+/, "").trim();
}

/** Remove `**`, paired `*italic*`, collapse spaces (per-line). */
function cleanInlineMarkdown(text: string): string {
  let s = text;
  while (s.includes("**")) {
    s = s.replace(/\*\*/g, "");
  }
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  return s.replace(/\s+/g, " ").trim();
}

function lineHadBoldMarkers(line: string): boolean {
  return /\*\*/.test(line);
}

function drawWatermark(doc: jsPDF): void {
  doc.setFont("times", "italic");
  doc.setFontSize(9);
  doc.setTextColor(...COL.watermark);
  const label = stripEmojis("WANDR");
  const w = doc.getTextWidth(label);
  doc.text(label, pageWidth(doc) - MARGIN - w, Y_START - 4);
}

function drawPageNumber(doc: jsPDF, pageIndex: number, totalPages: number): void {
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...COL.muted);
  const text = stripEmojis(`Page ${pageIndex} of ${totalPages}`);
  doc.text(text, pageWidth(doc) / 2, pageHeight(doc) - 18, {
    align: "center",
  });
}

function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function drawLastPageFooter(doc: jsPDF): void {
  const yLine = pageHeight(doc) - 12;
  doc.setDrawColor(...COL.coral);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, yLine, pageWidth(doc) - MARGIN, yLine);

  doc.setFont("times", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...COL.muted);
  doc.text(
    stripEmojis("Created with Wandr — wandr-bay.vercel.app"),
    pageWidth(doc) / 2,
    pageHeight(doc) - 8,
    { align: "center" }
  );
}

/** Body / list line: normal weight; teal if `accentSource` (default `rawLine`) had `**`. */
function drawBodyParagraph(
  doc: jsPDF,
  rawLine: string,
  x: number,
  y: number,
  maxW: number,
  lineHeight: number,
  contentStartY: number,
  fontSize: number = 11,
  accentSource?: string
): number {
  const useAccent = lineHadBoldMarkers(accentSource ?? rawLine);
  const text = stripEmojis(cleanInlineMarkdown(rawLine));
  if (!text) return y;
  doc.setFont("times", "normal");
  doc.setFontSize(fontSize);
  doc.setTextColor(...(useAccent ? COL.tealBold : COL.body));
  const lines = doc.splitTextToSize(text, maxW);
  let cy = ensureSpaceForLines(doc, y, lines.length, lineHeight, contentStartY);
  for (let i = 0; i < lines.length; i++) {
    cy = ensureYPosition(doc, cy, contentStartY);
    doc.text(lines[i] as string, x, cy);
    cy += lineHeight;
  }
  return cy;
}

function drawCover(
  doc: jsPDF,
  destination: string,
  vibe: string,
  duration: string
): void {
  const w = pageWidth(doc);
  const h = pageHeight(doc);
  const textMax = w - MARGIN * 2;

  doc.setFillColor(...COL.darkTeal);
  doc.rect(0, 0, w, h, "F");

  let y = 72;
  const lineTitle = 8;
  const lineSub = 7;

  doc.setFont("times", "normal");
  doc.setFontSize(36);
  doc.setTextColor(255, 255, 255);
  doc.setCharSpace(1.2);
  const brand = stripEmojis("WANDR");
  const brandLines = doc.splitTextToSize(brand, textMax);
  for (const bl of brandLines) {
    doc.text(bl as string, w / 2, y, { align: "center" });
    y += lineTitle + 2;
  }
  doc.setCharSpace(0);

  y += 10;
  doc.setFontSize(22);
  const destLines = doc.splitTextToSize(
    stripEmojis(destination || "Your trip"),
    textMax
  );
  for (const dl of destLines) {
    doc.text(dl as string, w / 2, y, { align: "center" });
    y += lineSub + 3;
  }

  y += 6;
  doc.setFont("times", "italic");
  doc.setFontSize(13);
  doc.setTextColor(...COL.mint);
  const meta = stripEmojis(
    [formatVibesForCover(vibe), duration].filter(Boolean).join(" · ")
  );
  const metaLines = doc.splitTextToSize(meta, textMax);
  for (const ml of metaLines) {
    doc.text(ml as string, w / 2, y, { align: "center" });
    y += 6;
  }

  y += 8;
  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COL.muted);
  const tag = stripEmojis("Your personal itinerary");
  const tagLines = doc.splitTextToSize(tag, textMax);
  for (const tl of tagLines) {
    doc.text(tl as string, w / 2, y, { align: "center" });
    y += 6;
  }

  y += 10;
  doc.setDrawColor(...COL.coral);
  doc.setLineWidth(0.6);
  const lineW = 72;
  doc.line(w / 2 - lineW / 2, y, w / 2 + lineW / 2, y);

  const dateStr = stripEmojis(
    new Date().toLocaleDateString("en-US", { dateStyle: "long" })
  );
  doc.setFontSize(9);
  doc.setTextColor(160, 175, 188);
  const dateLines = doc.splitTextToSize(dateStr, textMax);
  let dy = h - 28;
  for (const dline of dateLines) {
    doc.text(dline as string, w / 2, dy, { align: "center" });
    dy += 5;
  }
}

function renderItineraryBody(
  doc: jsPDF,
  itinerary: string,
  contentStartY: number
): number {
  const maxW = maxTextWidth(doc);
  let y = contentStartY;
  const x = MARGIN;
  const LINE_BODY = 5.5;
  const LINE_HEAD = 7;
  const lines = itinerary.split(/\n/);

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === "") {
      y += 4;
      continue;
    }

    const t = line.trim();
    if (t === "---" || t === "***" || t === "___") {
      y = ensureYPosition(doc, y, contentStartY);
      doc.setDrawColor(200, 210, 220);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y, pageWidth(doc) - MARGIN, y);
      y += 10;
      continue;
    }

    if (/^#{3,6}\s/.test(line)) {
      const para = stripEmojis(
        cleanInlineMarkdown(stripHeadingPrefix(line))
      );
      if (!para) {
        y += 4;
        continue;
      }
      doc.setFont("times", "normal");
      doc.setFontSize(FONT_OVERVIEW);
      doc.setTextColor(...COL.body);
      const wrapped = doc.splitTextToSize(para, maxW);
      y = ensureSpaceForLines(doc, y, wrapped.length, LINE_BODY + 0.5, contentStartY);
      for (let i = 0; i < wrapped.length; i++) {
        y = ensureYPosition(doc, y, contentStartY);
        doc.text(wrapped[i] as string, x, y);
        y += LINE_BODY + 0.5;
      }
      y += 4;
      continue;
    }

    if (/^#{2}\s/.test(line)) {
      const title = stripEmojis(
        cleanInlineMarkdown(stripHeadingPrefix(line))
      );
      const wrapped = doc.splitTextToSize(title, maxW - 6);
      y = ensureSpaceForLines(doc, y, wrapped.length, LINE_HEAD, contentStartY);
      doc.setFont("times", "bold");
      doc.setFontSize(15);
      doc.setTextColor(...COL.darkTeal);
      for (let i = 0; i < wrapped.length; i++) {
        y = ensureYPosition(doc, y, contentStartY);
        if (i === 0) {
          doc.setFillColor(...COL.coral);
          doc.rect(MARGIN, y - 5, 2, 9, "F");
        }
        doc.text(wrapped[i] as string, MARGIN + 6, y);
        y += LINE_HEAD;
      }
      y += 4;
      continue;
    }

    if (isTipLine(line)) {
      const tipText = stripEmojis(
        cleanInlineMarkdown(line.replace(/^\s*>\s*/, "").trim())
      );
      const tipAccent = lineHadBoldMarkers(line);
      doc.setFont("times", "italic");
      doc.setFontSize(10);
      doc.setTextColor(...(tipAccent ? COL.tealBold : COL.mint));
      const wrapped = doc.splitTextToSize(tipText, maxW);
      y = ensureSpaceForLines(doc, y, wrapped.length, LINE_BODY, contentStartY);
      for (let i = 0; i < wrapped.length; i++) {
        y = ensureYPosition(doc, y, contentStartY);
        doc.text(wrapped[i] as string, x, y);
        y += LINE_BODY;
      }
      y += 3;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const item = stripEmojis(cleanInlineMarkdown(stripListMarker(line)));
      const useAccent = lineHadBoldMarkers(line);
      doc.setFont("times", "normal");
      doc.setFontSize(11);
      doc.setTextColor(...(useAccent ? COL.tealBold : COL.body));
      const bulletW = 5;
      y = ensureYPosition(doc, y, contentStartY);
      doc.text("•", x, y);
      const subLines = doc.splitTextToSize(item, maxW - bulletW);
      y = ensureSpaceForLines(doc, y, subLines.length, LINE_BODY, contentStartY);
      let ly = y;
      for (let i = 0; i < subLines.length; i++) {
        ly = ensureYPosition(doc, ly, contentStartY);
        doc.text(subLines[i] as string, x + bulletW, ly);
        ly += LINE_BODY;
      }
      y = ly + 4;
      continue;
    }

    const bodyLine = stripHeadingPrefix(line);
    y = drawBodyParagraph(
      doc,
      bodyLine,
      x,
      y,
      maxW,
      LINE_BODY,
      contentStartY,
      11,
      line
    );
    y += 2;
  }

  return y;
}

function renderPlacesSection(
  doc: jsPDF,
  places: ItineraryMapDay[],
  yStart: number,
  contentStartY: number
): void {
  if (!places.length) return;

  const maxW = maxTextWidth(doc);
  let y = yStart + 8;
  const LINE_DAY = 6;
  const LINE_STOP = 5;

  y = ensureYPosition(doc, y, contentStartY);
  doc.setFillColor(...COL.coral);
  doc.rect(MARGIN, y - 5, 2, 9, "F");
  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...COL.darkTeal);
  const sectionTitle = stripEmojis("Places & addresses");
  const secLines = doc.splitTextToSize(sectionTitle, maxW - 6);
  y = ensureSpaceForLines(doc, y, secLines.length, LINE_DAY, contentStartY);
  for (const sl of secLines) {
    y = ensureYPosition(doc, y, contentStartY);
    doc.text(sl as string, MARGIN + 6, y);
    y += LINE_DAY;
  }
  y += 6;

  for (const day of places) {
    if (!day || typeof day.day !== "number") continue;
    const theme =
      typeof day.theme === "string" && day.theme.trim()
        ? day.theme.trim()
        : "";
    const dayTitle = stripEmojis(
      theme ? `Day ${day.day} — ${theme}` : `Day ${day.day}`
    );
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...COL.tealBold);
    const dtLines = doc.splitTextToSize(dayTitle, maxW);
    y = ensureSpaceForLines(doc, y, dtLines.length, LINE_DAY, contentStartY);
    for (const dtl of dtLines) {
      y = ensureYPosition(doc, y, contentStartY);
      doc.text(dtl as string, MARGIN, y);
      y += LINE_DAY;
    }

    const stops = Array.isArray(day.stops) ? day.stops : [];
    for (const stop of stops) {
      if (!stop) continue;
      const name =
        typeof stop.name === "string" ? stop.name.trim() : "Stop";
      const addr =
        typeof stop.address === "string" ? stop.address.trim() : "";
      const line = stripEmojis(addr ? `${name} — ${addr}` : name);
      doc.setFont("times", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...COL.body);
      const wrapped = doc.splitTextToSize(line, maxW - 4);
      y = ensureSpaceForLines(doc, y, wrapped.length, LINE_STOP, contentStartY);
      for (const wline of wrapped) {
        y = ensureYPosition(doc, y, contentStartY);
        doc.text(wline as string, MARGIN + 4, y);
        y += LINE_STOP;
      }
      y += 2;
    }
    y += 4;
  }
}

export function exportToPDF(
  destination: string,
  vibe: string,
  duration: string,
  itinerary: string,
  places: ItineraryMapDay[]
): void {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });

  drawCover(doc, destination, vibe, duration);

  doc.addPage();
  const contentStartY = Y_START;
  const yAfterItinerary = renderItineraryBody(
    doc,
    itinerary,
    contentStartY
  );
  renderPlacesSection(doc, places, yAfterItinerary, contentStartY);

  const totalPages = doc.getNumberOfPages();

  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    drawWatermark(doc);
    drawPageNumber(doc, p, totalPages);
  }

  doc.setPage(totalPages);
  drawLastPageFooter(doc);

  const slug = (destination || "trip")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "trip";
  doc.save(`wandr-${slug}.pdf`);
}
