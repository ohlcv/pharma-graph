import { describe, it, expect } from 'vitest';
import cytoscape from 'cytoscape';
import { isNodeInLevel, isKeyDrug, TOUR_DEPTH_CONFIG } from '@/core/tour';

/** 构造一个单节点的 headless cytoscape，data 走 data() 读取路径 */
function nodeWith(data: Record<string, unknown>) {
  const cy = cytoscape({ headless: true, styleEnabled: false });
  cy.add({ data: { id: 'n', ...data } });
  return cy.getElementById('n') as cytoscape.NodeSingular;
}

const STRUCTURE = () => nodeWith({ fill: 'cls-structure' });
const CLASSIFICATION = () => nodeWith({ fill: 'cls-classification' });
const KEY_DRUG = () => nodeWith({ fill: 'cls-drug', stroke: 'double' });
const NORMAL_DRUG = () => nodeWith({ fill: 'cls-drug' });
const MNEMONIC = () => nodeWith({ fill: 'cls-mnemonic' });
const SUMMARY = () => nodeWith({ fill: 'cls-summary' });
const ADVERSE = () => nodeWith({ fill: 'cls-adverse' });

describe('isNodeInLevel — 5 档累加式内容过滤', () => {
  describe('档 1 结构 = 只有 cls-structure', () => {
    it('章节节点可见', () => {
      expect(isNodeInLevel(STRUCTURE(), 1)).toBe(true);
    });

    it('其余全部不可见', () => {
      expect(isNodeInLevel(CLASSIFICATION(), 1)).toBe(false);
      expect(isNodeInLevel(KEY_DRUG(), 1)).toBe(false);
      expect(isNodeInLevel(NORMAL_DRUG(), 1)).toBe(false);
      expect(isNodeInLevel(MNEMONIC(), 1)).toBe(false);
      expect(isNodeInLevel(ADVERSE(), 1)).toBe(false);
    });
  });

  describe('档 2 概览 = 结构 + 分类', () => {
    it('章节和分类可见', () => {
      expect(isNodeInLevel(STRUCTURE(), 2)).toBe(true);
      expect(isNodeInLevel(CLASSIFICATION(), 2)).toBe(true);
    });

    it('药物和口诀不可见', () => {
      expect(isNodeInLevel(KEY_DRUG(), 2)).toBe(false);
      expect(isNodeInLevel(NORMAL_DRUG(), 2)).toBe(false);
      expect(isNodeInLevel(MNEMONIC(), 2)).toBe(false);
    });
  });

  describe('档 3 重点 = + 重点药（stroke: double）', () => {
    it('重点药可见', () => {
      expect(isNodeInLevel(KEY_DRUG(), 3)).toBe(true);
    });

    it('普通药不可见（这是档 3 与档 4 的唯一区别）', () => {
      expect(isNodeInLevel(NORMAL_DRUG(), 3)).toBe(false);
    });

    it('更低档的内容仍然可见（累加，不是替换）', () => {
      expect(isNodeInLevel(STRUCTURE(), 3)).toBe(true);
      expect(isNodeInLevel(CLASSIFICATION(), 3)).toBe(true);
    });

    it('非药物类型不可见', () => {
      expect(isNodeInLevel(MNEMONIC(), 3)).toBe(false);
      expect(isNodeInLevel(SUMMARY(), 3)).toBe(false);
    });
  });

  describe('档 4 全面 = + 全部 cls-drug（不区分 stroke）', () => {
    it('普通药和重点药都可见', () => {
      expect(isNodeInLevel(NORMAL_DRUG(), 4)).toBe(true);
      expect(isNodeInLevel(KEY_DRUG(), 4)).toBe(true);
    });

    it('stroke=double 不再是档 4 的必要条件', () => {
      // 回归锚点：档 4 若误加 stroke 限定，普通药会被过滤掉
      expect(isNodeInLevel(nodeWith({ fill: 'cls-drug', stroke: 'glow' }), 4)).toBe(true);
      expect(isNodeInLevel(nodeWith({ fill: 'cls-drug', stroke: undefined }), 4)).toBe(true);
    });

    it('章节/分类仍可见', () => {
      expect(isNodeInLevel(STRUCTURE(), 4)).toBe(true);
      expect(isNodeInLevel(CLASSIFICATION(), 4)).toBe(true);
    });

    it('总结/口诀/不良反应不可见（已移到档 5）', () => {
      expect(isNodeInLevel(SUMMARY(), 4)).toBe(false);
      expect(isNodeInLevel(MNEMONIC(), 4)).toBe(false);
      expect(isNodeInLevel(ADVERSE(), 4)).toBe(false);
    });
  });

  describe('档 5 全部 = 不过滤', () => {
    it('任何 fill 都可见', () => {
      for (const n of [STRUCTURE(), CLASSIFICATION(), KEY_DRUG(), NORMAL_DRUG(), MNEMONIC(), SUMMARY(), ADVERSE()]) {
        expect(isNodeInLevel(n, 5)).toBe(true);
      }
    });

    it('未知 fill 也可见（真正的"全部"）', () => {
      expect(isNodeInLevel(nodeWith({ fill: 'cls-some-future-type' }), 5)).toBe(true);
    });

    it('level > 5 也当作全部（防御 slider 越界）', () => {
      expect(isNodeInLevel(ADVERSE(), 6)).toBe(true);
      expect(isNodeInLevel(ADVERSE(), 99)).toBe(true);
    });
  });

  describe('档位严格单调包含', () => {
    const allNodes = [
      STRUCTURE(),
      CLASSIFICATION(),
      KEY_DRUG(),
      NORMAL_DRUG(),
      MNEMONIC(),
      SUMMARY(),
      ADVERSE(),
      nodeWith({ fill: 'cls-disease' }),
      nodeWith({ fill: 'cls-biomolecule' }),
      nodeWith({ fill: 'cls-feature' }),
      nodeWith({ fill: 'cls-concept' }),
    ];

    it('任意节点在档 5 可见', () => {
      for (const n of allNodes) expect(isNodeInLevel(n, 5)).toBe(true);
    });

    it('档 n 可见的节点在档 n+1 必然可见（无回退）', () => {
      for (const n of allNodes) {
        for (let lv = 1; lv <= 4; lv++) {
          if (isNodeInLevel(n, lv)) {
            expect(isNodeInLevel(n, lv + 1)).toBe(true);
          }
        }
      }
    });

    it('每档都比上一档严格多出至少一个节点', () => {
      for (let lv = 1; lv <= 4; lv++) {
        const added = allNodes.filter((n) => isNodeInLevel(n, lv + 1) && !isNodeInLevel(n, lv));
        expect(added.length, `档 ${lv} → ${lv + 1} 应该有新增节点`).toBeGreaterThan(0);
      }
    });
  });

  describe('isKeyDrug', () => {
    it('fill=cls-drug 且 stroke=double 才是重点药', () => {
      expect(isKeyDrug(KEY_DRUG())).toBe(true);
    });

    it('普通药不是重点药', () => {
      expect(isKeyDrug(NORMAL_DRUG())).toBe(false);
      expect(isKeyDrug(nodeWith({ fill: 'cls-drug', stroke: 'glow' }))).toBe(false);
    });

    it('其他 fill 即使 stroke=double 也不是重点药', () => {
      expect(isKeyDrug(nodeWith({ fill: 'cls-structure', stroke: 'double' }))).toBe(false);
    });
  });

  describe('TOUR_DEPTH_CONFIG', () => {
    it('5 档标签按新语义', () => {
      expect(TOUR_DEPTH_CONFIG.levels.map((l) => l.label)).toEqual([
        '结构',
        '概览',
        '重点',
        '全面',
        '全部',
      ]);
    });

    it('getLabel 对 1-5 返回对应标签', () => {
      expect(TOUR_DEPTH_CONFIG.getLabel(1)).toBe('结构');
      expect(TOUR_DEPTH_CONFIG.getLabel(2)).toBe('概览');
      expect(TOUR_DEPTH_CONFIG.getLabel(3)).toBe('重点');
      expect(TOUR_DEPTH_CONFIG.getLabel(4)).toBe('全面');
      expect(TOUR_DEPTH_CONFIG.getLabel(5)).toBe('全部');
    });

    it('getLabel 对越界值兜底到"全部"', () => {
      expect(TOUR_DEPTH_CONFIG.getLabel(0)).toBe('全部');
      expect(TOUR_DEPTH_CONFIG.getLabel(-1)).toBe('全部');
      expect(TOUR_DEPTH_CONFIG.getLabel(6)).toBe('全部');
    });

    it('level 字段与数组下标一致', () => {
      TOUR_DEPTH_CONFIG.levels.forEach((l, i) => expect(l.level).toBe(i + 1));
    });
  });
});
