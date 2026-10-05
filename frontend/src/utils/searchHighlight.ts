import type { NormalizedRect } from '../types';

export interface PageSearchMatch {
  matchIndex: number;
  rects: NormalizedRect[];
}

interface CharLocation {
  node: Text;
  offset: number;
}

/**
 * Searches for all occurrences of searchTerm inside the rendered PDF.js text layer of a page,
 * using DOM Ranges to calculate pixel-perfect normalized bounding rectangles.
 */
export function findMatchesInTextLayer(
  textLayerEl: HTMLElement,
  pageEl: HTMLElement,
  searchTerm: string
): PageSearchMatch[] {
  if (!textLayerEl || !pageEl || !searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const query = searchTerm.trim().toLowerCase();
  const pageRect = pageEl.getBoundingClientRect();
  if (pageRect.width === 0 || pageRect.height === 0) {
    return [];
  }

  // Traverse all Text nodes inside the textLayer in visual reading order
  const walker = document.createTreeWalker(
    textLayerEl,
    NodeFilter.SHOW_TEXT,
    null
  );

  const charMap: CharLocation[] = [];
  let fullText = '';
  let prevSpan: HTMLElement | null = null;

  let currentNode = walker.nextNode();
  while (currentNode) {
    const textNode = currentNode as Text;
    const parentSpan = textNode.parentElement;
    const text = textNode.nodeValue || '';

    // If switching between spans, check if we need an inferred separator space
    if (prevSpan && parentSpan && prevSpan !== parentSpan) {
      const prevRect = prevSpan.getBoundingClientRect();
      const currRect = parentSpan.getBoundingClientRect();
      const isSameLine = Math.abs(currRect.top - prevRect.top) < Math.max(currRect.height, prevRect.height) * 0.5;
      const isNewWord = isSameLine && (currRect.left - prevRect.right > 1.5);

      if ((isNewWord || !isSameLine) && !fullText.endsWith(' ') && !text.startsWith(' ')) {
        fullText += ' ';
        // Map this virtual space to the start of the current text node
        charMap.push({
          node: textNode,
          offset: 0,
        });
      }
    }

    for (let i = 0; i < text.length; i++) {
      charMap.push({
        node: textNode,
        offset: i,
      });
      fullText += text[i];
    }

    prevSpan = parentSpan;
    currentNode = walker.nextNode();
  }

  if (fullText.length === 0 || charMap.length === 0) {
    return [];
  }

  const lowerText = fullText.toLowerCase();
  const matches: PageSearchMatch[] = [];
  let matchIndex = 0;
  let startIndex = 0;

  while ((startIndex = lowerText.indexOf(query, startIndex)) !== -1) {
    const endIndex = startIndex + query.length;

    const startLoc = charMap[startIndex];
    const endLoc = charMap[Math.min(endIndex - 1, charMap.length - 1)];

    if (startLoc && endLoc) {
      try {
        const range = document.createRange();
        range.setStart(startLoc.node, startLoc.offset);
        // range.setEnd is exclusive offset into the end node
        range.setEnd(endLoc.node, Math.min(endLoc.offset + 1, endLoc.node.length));

        const clientRects = range.getClientRects();
        const rects: NormalizedRect[] = [];

        for (let r = 0; r < clientRects.length; r++) {
          const cr = clientRects[r];
          if (cr.width > 0.5 && cr.height > 0.5) {
            rects.push({
              x: (cr.left - pageRect.left) / pageRect.width,
              y: (cr.top - pageRect.top) / pageRect.height,
              width: cr.width / pageRect.width,
              height: cr.height / pageRect.height,
            });
          }
        }

        if (rects.length > 0) {
          matches.push({
            matchIndex: matchIndex++,
            rects,
          });
        }
      } catch (err) {
        console.warn('Error computing search match range:', err);
      }
    }

    startIndex += query.length;
  }

  return matches;
}
