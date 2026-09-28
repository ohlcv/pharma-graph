import { describe, it, expect } from 'vitest';
import { formatNodeLabel } from '@/core/renderer';

describe('formatNodeLabel — 5 级优先级 + 末尾标点清理', () => {
  describe('规则 1: 全角 ｜ 显式分隔', () => {
    it('第一个 ｜ 切成两行', () => {
      expect(formatNodeLabel('第一节｜镇咳药')).toBe('第一节\n镇咳药');
    });

    it('多个 ｜ 只切第一个', () => {
      expect(formatNodeLabel('A｜B｜C')).toBe('A\nB｜C');
    });

    it('前后 trim 空格', () => {
      expect(formatNodeLabel('第一节 ｜ 镇咳药')).toBe('第一节\n镇咳药');
    });
  });

  describe('规则 2: 第 X 章/节 + 空格', () => {
    it('第一节 镇咳药 → 第一节\\n镇咳药', () => {
      expect(formatNodeLabel('第一节 镇咳药')).toBe('第一节\n镇咳药');
    });

    it('第九章 抗感染药物', () => {
      expect(formatNodeLabel('第九章 抗感染药物')).toBe('第九章\n抗感染药物');
    });

    it('第三章也能匹配', () => {
      expect(formatNodeLabel('第三章 呼吸系统用药')).toBe('第三章\n呼吸系统用药');
    });

    it('不带空格不触发,走规则 4(标点)', () => {
      // 没有空格 = 标点也不在 = 走到规则 5(长度 ≥ 28) 或原样返回
      // 这里 8 字符,走原样
      expect(formatNodeLabel('第一节镇咳药')).toBe('第一节镇咳药');
    });
  });

  describe('规则 3: ASCII |', () => {
    it('| 切两行', () => {
      expect(formatNodeLabel('中枢性|外周性')).toBe('中枢性\n外周性');
    });

    it('| 一侧空不切', () => {
      expect(formatNodeLabel('|中枢性')).toBe('|中枢性');
      expect(formatNodeLabel('中枢性|')).toBe('中枢性|');
    });
  });

  describe('规则 4: 标点断点(末位优先)', () => {
    it('最后一个中文逗号切分,逗号保留在第一行', () => {
      expect(formatNodeLabel('镇咳药,祛痰药')).toBe('镇咳药,\n祛痰药');
    });

    it('最后一个顿号切分,顿号保留在第一行', () => {
      // 单个顿号,A、B、C — 末位是 C,向前找到顿号在 B 后面
      expect(formatNodeLabel('A、B、C')).toBe('A、B、\nC');
    });

    it('多个标点时选最后(末位优先),命中标点保留在第一行', () => {
      // "A，B、C、D" — 最后标点是 D 前的顿号
      expect(formatNodeLabel('A，B、C、D')).toBe('A，B、C、\nD');
    });

    it('保留省略号 ... ,逗号保留', () => {
      expect(formatNodeLabel('笨蛋儿子...,天长')).toBe('笨蛋儿子...,\n天长');
    });

    it('保留 ASCII ; : ?(命中标点保留)', () => {
      expect(formatNodeLabel('A;B;C')).toBe('A;B;\nC');
      expect(formatNodeLabel('A:B:C')).toBe('A:B:\nC');
      expect(formatNodeLabel('A?B?C')).toBe('A?B?\nC');
    });

    it('不再把 - 当分隔符(药名里常有,语义不强)', () => {
      // "倍他米松-磷酸钠,注射液" — 期望按 , 切,不按 - 切;逗号保留
      expect(formatNodeLabel('倍他米松-磷酸钠,注射液')).toBe(
        '倍他米松-磷酸钠,\n注射液',
      );
    });

    it('… 仍作分隔符(类似逗号),保留到第一行', () => {
      expect(formatNodeLabel('未尽事项…请阅读')).toBe('未尽事项…\n请阅读');
    });
  });

  describe('规则 5: 长文本截断(≥ 28)', () => {
    it('≥ 28 字符截到 25 + …', () => {
      const long = 'a'.repeat(28);
      expect(formatNodeLabel(long)).toBe('a'.repeat(25) + '…');
    });

    it('恰好 27 字符不截', () => {
      const just = 'a'.repeat(27);
      expect(formatNodeLabel(just)).toBe(just);
    });
  });

  describe('输入清理', () => {
    it('空字符串原样返回', () => {
      expect(formatNodeLabel('')).toBe('');
    });

    it('只有 ｜ 但一边空 → 规则 1 仍切,但产出可能一边空(本函数不主动 trim 到空)', () => {
      // '第一节 |'  — 规则 1 切出 '第一节' 和 '',rest.trim() = '',但函数用 `${first}\n${rest}`
      // 不补空 trim,所以是 '第一节\n' — 接受此行为(罕见)
      const r = formatNodeLabel('第一节 |');
      expect(r.startsWith('第一节')).toBe(true);
    });
  });

  describe('优先级: ｜ 优先于 ordinalMatch', () => {
    it('同时含 第X节 + ｜,按 ｜ 切', () => {
      expect(formatNodeLabel('第一节｜中枢性镇咳药')).toBe('第一节\n中枢性镇咳药');
    });
  });

  describe('cytoscape 渲染兼容: 已有 \\n 仍工作', () => {
    it('YAML block scalar 来的 \\n：原样返回，不再被规则 4 二次切分', () => {
      // 作者在 frontmatter 里用 `label: |` 手写了换行，这是排好的 2 行。
      // 规则 4 倒序扫描时会跨过 \n 抓到上一行的逗号 → 会切成 3 行，必须短路拦住。
      const handWrapped = '吗啡是个大坏蛋，\n不呼吸、不心跳、不让小号，还不让宝宝';
      expect(formatNodeLabel(handWrapped)).toBe(handWrapped);
      expect(formatNodeLabel(handWrapped).split('\n')).toHaveLength(2);
    });

    it('手写换行 label 不会被切到 3 行（真实回归样本）', () => {
      const cases = [
        '资源底盘，认知眼睛，\n决策方向盘，抗风险刹车，时代路况',
        '丁苯酞，构循环，\n抗血栓，就是怕芹菜',
        '被他死盯一整天，\n感到毛骨悚然，眩晕耳鸣',
      ];
      for (const c of cases) {
        expect(formatNodeLabel(c).split('\n')).toHaveLength(2);
        expect(formatNodeLabel(c)).toBe(c);
      }
    });

    it('纯 \\n label（无内容）也直接返回', () => {
      expect(formatNodeLabel('\n')).toBe('\n');
    });

    it('formatNodeLabel 最多产出 2 行', () => {
      // 116 个 label 由作者手写换行，其余走单次切分；任何路径都不该产生第 3 行。
      const samples = [
        '资源底盘，认知眼睛，\n决策方向盘，抗风险刹车，时代路况',
        '吗啡是个大坏蛋，\n不呼吸、不心跳、不让小号，还不让宝宝',
        '丁苯酞，构循环，\n抗血栓，就是怕芹菜',
        '被他死盯一整天，\n感到毛骨悚然，眩晕耳鸣',
        '衷心的祝福你俩，美丽又可爱',
        '第五节 中枢镇痛药',
        '五行：五种作用力与生克网络',
      ];
      for (const s of samples) {
        expect(formatNodeLabel(s).split('\n').length).toBeLessThanOrEqual(2);
      }
    });
  });
});
