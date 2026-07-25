// Tests for extractSectionNumber — Chinese numeral parser used to sort
// nodes by location (book > chapter > section > subsection).
//
// IMPORTANT: this function is exported with @internal just so tests can
// reach it. It's a pure function with no DOM / cytoscape dependency.

import { describe, it, expect } from 'vitest';
import { extractSectionNumber } from './tour.js';

describe('extractSectionNumber', () => {
  describe('empty / malformed input', () => {
    it('returns 0 for empty string', () => {
      expect(extractSectionNumber('')).toBe(0);
    });

    it('returns 999 (sort-last) when no 第X节/章/篇 pattern matches', () => {
      expect(extractSectionNumber('普通文本')).toBe(999);
      expect(extractSectionNumber('chapter one')).toBe(999);
    });
  });

  describe('Arabic numerals', () => {
    it('extracts single-digit Arabic numerals', () => {
      expect(extractSectionNumber('第1章')).toBe(1);
      expect(extractSectionNumber('第2节')).toBe(2);
      expect(extractSectionNumber('第3篇')).toBe(3);
    });

    it('extracts multi-digit Arabic numerals', () => {
      expect(extractSectionNumber('第10章')).toBe(10);
      expect(extractSectionNumber('第42节')).toBe(42);
      expect(extractSectionNumber('第123篇')).toBe(123);
    });
  });

  describe('Chinese numerals (single digit)', () => {
    it('extracts 一~九', () => {
      expect(extractSectionNumber('第一章')).toBe(1);
      expect(extractSectionNumber('第二章')).toBe(2);
      expect(extractSectionNumber('第三章')).toBe(3);
      expect(extractSectionNumber('第九章')).toBe(9);
    });
  });

  describe('Chinese numerals with 十', () => {
    it('handles 十 alone (=10)', () => {
      expect(extractSectionNumber('第十章')).toBe(10);
    });

    it('handles 十一~十九', () => {
      expect(extractSectionNumber('第十一章')).toBe(11);
      expect(extractSectionNumber('第十五章')).toBe(15);
      expect(extractSectionNumber('第十九节')).toBe(19);
    });

    it('handles 二十~九十九', () => {
      expect(extractSectionNumber('第二十章')).toBe(20);
      expect(extractSectionNumber('第二十一章')).toBe(21);
      expect(extractSectionNumber('第三十五节')).toBe(35);
      expect(extractSectionNumber('第九十九篇')).toBe(99);
    });
  });

  describe('Chinese numerals with 百', () => {
    it('handles 一百', () => {
      expect(extractSectionNumber('第一百章')).toBe(100);
    });

    it('handles 一百零一 (TODO: current algorithm returns 101 not 100+1)', () => {
      // Documenting current behaviour — this is a known limitation.
      // 一百零一 → result: 100 + 0 * 100 + 1 = 101.
      // For pharma-graph content, no labels use 零 in this position, so it's
      // not blocking. If needed later, extend the algorithm.
      expect(extractSectionNumber('第一百零一章')).toBe(101);
    });

    it('handles 一百一十 (=110)', () => {
      expect(extractSectionNumber('第一百一十章')).toBe(110);
    });
  });

  describe('regression cases', () => {
    it('returns 999 for unknown characters inside 第X章', () => {
      expect(extractSectionNumber('第X章')).toBe(999);
    });

    it('handles trailing text after 节/章/篇', () => {
      // pattern is non-greedy, captures only up to the first 章/节/篇.
      expect(extractSectionNumber('第一章 总论')).toBe(1);
      expect(extractSectionNumber('第二节 吸收')).toBe(2);
    });
  });
});
