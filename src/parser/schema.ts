// src/parser/schema.ts
// Single source of truth for frontmatter *value-list* whitelists.
//
// What goes here: any value-list whitelist the parser or one of the two
// scripts checks against. NOT here: structural / cross-reference checks
// (those live in frontmatter.ts and in validate.ts's edge-id phase 2) and
// the edge-type vocabulary (that lives in core/edge-types.ts).

import { EDGE_TYPES } from '../core/edge-types.js';

/** Canonical essence values (decide node shape). */
export const VALID_ESSENCE: readonly string[] = [
  // 当前规范类型（frontmatter.md §2.1）
  'module',          // 结构模块/入口 — round-rectangle
  'strict-class',    // 严格分类（细分类）— pentagon
  'umbrella-class',  // 伞形分类（粗分类）— hexagon
  'concept',         // 概念/术语 — rectangle（最接近正方形）
  'medication',      // 具体药物/制剂 — ellipse
  'illness',         // 疾病/病理状态 — diamond
  'notion',          // 学习性认知单元 — tag
  'mnemonic',        // 记忆口诀 — vee
  'summary',         // 总结/归纳 — octagon
  'table',           // 表格/对照表 — rectangle
  'note',            // 注意/提示/笔记 — tag
  // 历史兼容值（旧内容可能仍在使用，不再作为当前规范的固定视觉类型）
  'classification', 'section', 'route', 'substance', 'part', 'process',
  'drug', 'disease', 'ingredient', 'mechanism',
  'bridge', 'service', 'pathogen', 'pathway',
  'indicator', 'book', 'chapter',
] as const;

/** Canonical level values (decide node border color). */
export const VALID_LEVEL: readonly number[] = [1, 2, 3, 4, 5, 6] as const;

/** Canonical field / discipline values (decide node border colour). */
export const VALID_FIELD: readonly string[] = [
  'pharmaceutics',
  'pharmacokinetics',
  'medicinal_chemistry',
  'pharmacology',
  'toxicology',
  'biopharmaceutics',
  'clinical_pharmacy',
  'pharmacy_service',
  'cardiovascular',
  'respiratory',
  'digestive',
  'endocrine',
  'musculoskeletal',
  'anti_infective',
  'anti_tumor',
  'blood',
  'immunology',
  'dermatology',
  'antipyretic',
  'anti_rheumatic',
  'anti_gout',
  'nutrition',
  'diagnostic',
  'life_sciences',
  'biopharmaceutical',
  '药学专业知识二',
  'pharmacy_practice',
] as const;

/** Canonical tier / layer values (decide node fill colour). */
export const VALID_TIER: readonly string[] = [
  'basic',
  'drug',
  'disease',
  'management',
  'service',
  'legal',
  'foundation',
  'system',
  'clinical',
] as const;

/**
 * Canonical edge-type vocabulary. Re-exported from edge-types.ts
 * (single source of truth, issue #9).
 */
export const VALID_EDGE_TYPES: readonly string[] = EDGE_TYPES;

/** True iff `value` is one of the canonical essence literals. */
export function isValidEssence(value: string | undefined): boolean {
  return value !== undefined && (VALID_ESSENCE as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical level literals (1-6). */
export function isValidLevel(value: number | undefined): boolean {
  return value !== undefined && (VALID_LEVEL as readonly number[]).includes(value);
}

/** True iff `value` is one of the canonical field literals. */
export function isValidField(value: string | undefined): boolean {
  return value !== undefined && (VALID_FIELD as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical tier literals. */
export function isValidTier(value: string | undefined): boolean {
  return value !== undefined && (VALID_TIER as readonly string[]).includes(value);
}

/** True iff `value` is one of the canonical edge-type literals. */
export function isValidEdgeType(value: string | undefined): boolean {
  return value !== undefined && (VALID_EDGE_TYPES as readonly string[]).includes(value);
}
