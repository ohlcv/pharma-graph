/**
 * BrandCarousel — 顶部文字渐变轮播模块
 *
 * 使用方式:
 *   import { brandCarousel } from './carousel';
 *   brandCarousel.start();   // 启动轮播
 *   brandCarousel.stop();    // 停止轮播
 *   brandCarousel.setMessages([...]); // 运行时切换词汇表（按层筛选）
 *   brandCarousel.setDiscipline(id); // 运行时只看某一学科
 *
 * 词汇表分层结构:
 *   DisciplineLayer[] → DisciplineNode[] → Term[]
 *   共 6 大层：形式科学 → 自然科学 → 工程与技术 → 生命科学 → 社会科学 → 人文与艺术
 *   每层下含若干子学科，每学科含 10–20 条代表术语。
 *   只需修改 MESSAGES 常量即可增删学科和术语，无需动其他代码。
 */

export interface Term {
  name: string;
  note?: string;
}

export interface DisciplineNode {
  id: string;
  label: string;
  parent: string | null;
  children?: DisciplineNode[];
  terms: Term[];
}

export interface DisciplineLayer {
  name: string;
  color?: string;
  disciplines: DisciplineNode[];
}

// 保留旧接口别名，便于 setMessages 签名兼容
export type CarouselMessage = DisciplineLayer;

export interface CarouselOptions {
  showMs?: number;
  fadeMs?: number;
  gradient?: string;
  textId?: string;
}

const DEFAULT_GRADIENT =
  'linear-gradient(90deg, #a78bfa 0%, #67e8f9 40%, #f9a8d4 70%, #a78bfa 100%)';

const DEFAULT_OPTIONS: Required<CarouselOptions> = {
  showMs: 3000,
  fadeMs: 450,
  gradient: DEFAULT_GRADIENT,
  textId: 'carousel-text',
};

// ─── 词汇表 — 修改这里即可定制轮播内容 ───────────────────────────────────────
// 学科分类：形式科学 → 自然科学 → 工程与技术 → 生命科学 → 社会科学 → 人文与艺术
const MESSAGES: DisciplineLayer[] = [

  // ═══════════════════════════════════════════════════════════════════
  // 1. 形式科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '形式科学',
    disciplines: [
      {
        id: 'logic', label: '逻辑学', parent: null,
        terms: [
          { name: '形式系统' }, { name: '公理' }, { name: '定理' }, { name: '推理规则' },
          { name: '完备性' }, { name: '哥德尔不完备' }, { name: '可判定性' },
          { name: '皮亚诺算术' }, { name: '一阶逻辑' }, { name: '二阶逻辑' },
          { name: '模态逻辑' }, { name: '时态逻辑' }, { name: '直觉主义逻辑' },
          { name: '四论' }, { name: '对角线法' },
        ],
      },
      {
        id: 'math', label: '数学', parent: null,
        terms: [
          { name: '极限' }, { name: '连续' }, { name: '微分' }, { name: '积分' },
          { name: '级数收敛' }, { name: '泰勒展开' }, { name: '傅里叶变换' },
          { name: '拉普拉斯变换' }, { name: '卷积' }, { name: '矩阵运算' },
          { name: '特征值' }, { name: '行列式' }, { name: '线性空间' },
          { name: '同构映射' }, { name: '群' }, { name: '环' }, { name: '域' },
          { name: '理想' }, { name: '同态' }, { name: '范畴' }, { name: '函子' },
          { name: '自然变换' }, { name: '拓扑空间' }, { name: '同伦群' },
          { name: '同调论' }, { name: '微分流形' }, { name: '黎曼度量' },
          { name: '高斯-博内' }, { name: '代数几何' }, { name: '概形' },
          { name: '椭圆曲线' }, { name: '数论' }, { name: '素数定理' },
          { name: '黎曼猜想' }, { name: '丢番图方程' }, { name: '密码学基础' },
          { name: '运筹学' }, { name: '线性规划' }, { name: '整数规划' },
          { name: '博弈论基础' }, { name: '决策论' },
        ],
      },
      {
        id: 'statistics', label: '统计学', parent: null,
        terms: [
          { name: '均值' }, { name: '方差' }, { name: '协方差' }, { name: '相关系数' },
          { name: '抽样分布' }, { name: '置信区间' }, { name: '假设检验' },
          { name: 'p值' }, { name: '功效分析' }, { name: 't检验' },
          { name: 'ANOVA' }, { name: '卡方检验' }, { name: '非参数检验' },
          { name: '最大似然估计' }, { name: '贝叶斯估计' }, { name: '最小二乘' },
          { name: '主成分分析' }, { name: '因子分析' }, { name: '聚类分析' },
          { name: '判别分析' }, { name: '回归分析' }, { name: '时间序列' },
          { name: '生存分析' }, { name: '因果推断' }, { name: '倾向得分' },
          { name: 'Bootstrap' }, { name: '蒙特卡洛' }, { name: 'MCMC' },
        ],
      },
      {
        id: 'infotheory', label: '信息论', parent: null,
        terms: [
          { name: '信息熵' }, { name: '联合熵' }, { name: '条件熵' }, { name: '互信息' },
          { name: 'KL散度' }, { name: '交叉熵' }, { name: '信息增益' },
          { name: '率失真理论' }, { name: '香农极限' }, { name: '信道容量' },
          { name: '最大熵原理' }, { name: '信源编码定理' }, { name: '信道编码定理' },
          { name: '渐近等分性' }, { name: '信息瓶颈' }, { name: '变分推断' },
        ],
      },
      {
        id: 'systems', label: '系统论', parent: null,
        terms: [
          { name: '反馈回路' }, { name: '涌现性' }, { name: '自组织' }, { name: '系统边界' },
          { name: '稳态收敛' }, { name: '相变临界' }, { name: '混沌边缘' },
          { name: '控制论' }, { name: '耗散结构' }, { name: '自相似' },
          { name: '分形' }, { name: '洛特卡-沃尔特拉' }, { name: '层级涌现' },
          { name: '自创生' }, { name: '系统动力学' }, { name: '系统辨识' },
        ],
      },
      {
        id: 'comptheory', label: '计算理论', parent: null,
        terms: [
          { name: '图灵机' }, { name: '可计算性' }, { name: '复杂度类' }, { name: 'P vs NP' },
          { name: 'NP完全' }, { name: 'NP难' }, { name: '近似算法' },
          { name: '概率算法' }, { name: '量子计算' }, { name: '电路复杂度' },
          { name: '自动机理论' }, { name: '形式语言' }, { name: '上下文无关文法' },
          { name: '丘奇-图灵论题' }, { name: '停机问题' }, { name: '归约' },
        ],
      },
      {
        id: 'graphtheory', label: '图论', parent: null,
        terms: [
          { name: '邻接矩阵' }, { name: '最短路径' }, { name: '谱半径' },
          { name: '介数中心性' }, { name: 'PageRank' }, { name: '社区检测' },
          { name: '团块分解' }, { name: '欧拉回路' }, { name: '哈密顿路径' },
          { name: '拓扑排序' }, { name: '生成树' }, { name: '强连通分量' },
          { name: 'Dijkstra算法' }, { name: 'Bellman-Ford' }, { name: 'Floyd-Warshall' },
          { name: '最大流最小割' }, { name: '匹配理论' }, { name: '平面图' },
        ],
      },
      {
        id: 'probability', label: '概率论', parent: null,
        terms: [
          { name: '贝叶斯推断' }, { name: '最大似然' }, { name: '后验分布' },
          { name: '共轭先验' }, { name: '大数定律' }, { name: '中心极限定理' },
          { name: '马尔可夫链' }, { name: '平稳分布' }, { name: '蒙特卡洛方法' },
          { name: '随机游走' }, { name: '布朗运动' }, { name: '鞅' },
          { name: '伊藤引理' }, { name: '泊松过程' }, { name: '更新过程' },
          { name: '重要性采样' }, { name: '粒子滤波' }, { name: '隐马尔可夫模型' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 2. 自然科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '自然科学',
    disciplines: [
      {
        id: 'physics', label: '物理学', parent: null,
        terms: [
          { name: '普朗克常数' }, { name: '波函数坍缩' }, { name: '量子隧穿' },
          { name: '熵增原理' }, { name: '相干态' }, { name: '不确定性原理' },
          { name: '对称性破缺' }, { name: '规范场论' }, { name: '哈密顿量' },
          { name: '拉格朗日量' }, { name: '诺特定理' }, { name: '路径积分' },
          { name: '薛定谔方程' }, { name: '狄拉克方程' }, { name: '朗道能级' },
          { name: '麦克斯韦方程组' }, { name: '洛伦兹变换' }, { name: '场论' },
          { name: '重整化群' }, { name: '临界现象' }, { name: '对称群' },
          { name: '超弦理论' }, { name: 'M理论' }, { name: '圈量子引力' },
        ],
      },
      {
        id: 'chemistry', label: '化学', parent: null,
        terms: [
          { name: '电子轨道' }, { name: '亲核取代' }, { name: '官能团转化' },
          { name: '分子轨道' }, { name: '配位键合' }, { name: '电离势' },
          { name: '反应活化能' }, { name: '酸碱共轭' }, { name: '热力学三定律' },
          { name: '反应级数' }, { name: '催化剂' }, { name: '可逆反应' },
          { name: '氧化还原' }, { name: '酯化水解' }, { name: '立体专一性' },
          { name: '手性碳' }, { name: '消除反应' }, { name: '加成反应' },
          { name: '缩合聚合' }, { name: '过渡态理论' }, { name: '分子间作用力' },
          { name: '晶体场论' }, { name: '配位场论' }, { name: '电化学势' },
        ],
      },
      {
        id: 'astronomy', label: '天文学', parent: null,
        terms: [
          { name: '引力透镜' }, { name: '红移效应' }, { name: '视星等' },
          { name: '宜居带' }, { name: '恒星演化' }, { name: '暗物质晕' },
          { name: '星系旋臂' }, { name: '宇宙微波背景' }, { name: '暗能量' },
          { name: '宇宙常数' }, { name: '原恒星' }, { name: '双星系统' },
          { name: '超新星' }, { name: '黑洞' }, { name: '霍金辐射' },
          { name: '中子星' }, { name: '脉冲星' }, { name: '引力波' },
          { name: '宇宙学原理' }, { name: '弗里德曼方程' }, { name: '暴胀理论' },
          { name: '暗物质' }, { name: '星系团' }, { name: '类星体' },
        ],
      },
      {
        id: 'geoscience', label: '地球科学', parent: null,
        terms: [
          { name: '板块构造' }, { name: '岩石圈' }, { name: '地幔对流' },
          { name: '俯冲带' }, { name: '造山运动' }, { name: '沉积盆地' },
          { name: '古地磁学' }, { name: '地层学' }, { name: '地震波' },
          { name: '震源机制' }, { name: '莫霍面' }, { name: '威尔逊旋回' },
          { name: '洋中脊' }, { name: '变质相' }, { name: '同位素测年' },
        ],
      },
      {
        id: 'biology', label: '生物学', parent: null,
        terms: [
          { name: '基因表达' }, { name: '自然选择' }, { name: '表观遗传' },
          { name: '神经编码' }, { name: '代谢通路' }, { name: '细胞凋亡' },
          { name: '共生协同' }, { name: '适应性辐射' }, { name: '有丝分裂' },
          { name: '减数分裂' }, { name: 'DNA复制' }, { name: '蛋白质折叠' },
          { name: '光合作用' }, { name: '酶动力学' }, { name: '遗传漂变' },
          { name: '中性理论' }, { name: '协同进化' }, { name: '生态位' },
          { name: '物质循环' }, { name: '生物多样性' }, { name: '热点地区' },
          { name: '适应性免疫' }, { name: '血脑屏障' }, { name: '细胞分化' },
          { name: '胚胎发育' }, { name: '再生医学' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 3. 工程与技术
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '工程与技术',
    disciplines: [
      {
        id: 'cs', label: '计算机科学', parent: null,
        terms: [
          { name: '复杂度类' }, { name: 'NP完全' }, { name: '近似算法' },
          { name: '贪心策略' }, { name: '动态规划' }, { name: '分布式共识' },
          { name: 'CAP定理' }, { name: '一致性哈希' }, { name: '递归分治' },
          { name: '回溯搜索' }, { name: '卷积神经网络' }, { name: '反向传播' },
          { name: '注意力机制' }, { name: '图神经网络' }, { name: '对抗样本' },
          { name: '大语言模型' }, { name: '嵌入向量' }, { name: 'Transformer' },
          { name: '强化学习' }, { name: '迁移学习' }, { name: '联邦学习' },
          { name: '量子机器学习' }, { name: '涌现计算' },
        ],
      },
      {
        id: 'mecheng', label: '机械工程', parent: null,
        terms: [
          { name: '静力学' }, { name: '动力学' }, { name: '材料力学' },
          { name: '弹性力学' }, { name: '塑性力学' }, { name: '断裂力学' },
          { name: '流体力学' }, { name: '传热学' }, { name: '热力学' },
          { name: '振动理论' }, { name: '模态分析' }, { name: '有限元法' },
          { name: '疲劳分析' }, { name: '机构学' }, { name: '机械制图' },
          { name: '加工工艺' }, { name: '数控技术' }, { name: '机器人学' },
          { name: '运动规划' }, { name: '逆运动学' }, { name: '传感融合' },
        ],
      },
      {
        id: 'ee', label: '电气工程', parent: null,
        terms: [
          { name: '基尔霍夫定律' }, { name: '麦克斯韦方程组' }, { name: '阻抗匹配' },
          { name: '谐振电路' }, { name: '滤波器设计' }, { name: '调制解调' },
          { name: '半导体物理' }, { name: 'PN结' }, { name: 'MOSFET' },
          { name: 'CMOS电路' }, { name: '时序逻辑' }, { name: '组合逻辑' },
          { name: '信号完整性' }, { name: '电磁兼容' }, { name: '功率器件' },
          { name: '电机原理' }, { name: '电力系统' }, { name: '输电网络' },
          { name: '配电系统' }, { name: '电力电子' }, { name: '逆变器' },
          { name: 'PID控制' }, { name: '状态空间' }, { name: '观测器设计' },
        ],
      },
      {
        id: 'nucleareng', label: '核工程', parent: null,
        terms: [
          { name: '核裂变' }, { name: '核聚变' }, { name: '链式反应' },
          { name: '临界质量' }, { name: '中子慢化' }, { name: '反应堆物理' },
          { name: '中子输运' }, { name: '反应堆热工' }, { name: '核辐射' },
          { name: '射线屏蔽' }, { name: '辐射剂量' }, { name: '核医学' },
          { name: '同位素分离' }, { name: '聚变等离子体' }, { name: '托卡马克' },
          { name: '惯性约束' }, { name: '聚变能' }, { name: 'ITER计划' },
        ],
      },
      {
        id: 'materialeng', label: '材料科学', parent: null,
        terms: [
          { name: '晶体结构' }, { name: '晶格缺陷' }, { name: '位错' },
          { name: '相图' }, { name: '相变' }, { name: '时效强化' },
          { name: '扩散机制' }, { name: '再结晶' }, { name: '烧结' },
          { name: '力学性能' }, { name: '硬度测试' }, { name: '疲劳寿命' },
          { name: '断裂韧性' }, { name: '纳米材料' }, { name: '复合材料' },
          { name: '高分子材料' }, { name: '半导体材料' }, { name: '超导材料' },
          { name: '磁性材料' }, { name: '生物材料' }, { name: '腐蚀与防护' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 4. 生命科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '生命科学',
    disciplines: [
      {
        id: 'basicmed', label: '基础医学', parent: null,
        terms: [
          { name: '解剖学' }, { name: '组织学' }, { name: '胚胎学' }, { name: '生理学' },
          { name: '生物化学' }, { name: '分子生物学' }, { name: '细胞生物学' },
          { name: '遗传学' }, { name: '微生物学' }, { name: '免疫学' },
          { name: '病理学' }, { name: '病理生理学' }, { name: '药理学' },
          { name: '毒理学' }, { name: '神经生物学' }, { name: '内分泌学' },
          { name: '血液学' }, { name: '生殖医学' }, { name: '发育生物学' },
          { name: '再生医学' }, { name: '系统生物学' },
        ],
      },
      {
        id: 'clinicalmed', label: '临床医学', parent: null,
        terms: [
          { name: '症状学' }, { name: '体征' }, { name: '鉴别诊断' }, { name: '诊断逻辑' },
          { name: '治疗原则' }, { name: '循证医学' }, { name: '临床路径' },
          { name: '药物相互作用' }, { name: '不良反应' }, { name: '药代动力学' },
          { name: '药效动力学' }, { name: '治疗窗' }, { name: '稳态血药浓度' },
          { name: '首过效应' }, { name: '生物利用度' }, { name: '表观分布容积' },
          { name: '清除率' }, { name: '半衰期' }, { name: '肝药酶' },
          { name: '个体化用药' }, { name: 'TDM监测' }, { name: 'DDI' },
          { name: '抗生素耐药' }, { name: '院内感染' }, { name: '多学科会诊' },
        ],
      },
      {
        id: 'pharmacy', label: '药学', parent: null,
        terms: [
          { name: '药物化学' }, { name: '构效关系' }, { name: '先导化合物' },
          { name: '药物设计' }, { name: 'ADMET' }, { name: '成药性' },
          { name: '手性药物' }, { name: '前药原理' }, { name: '晶型' },
          { name: '制剂学' }, { name: '固体制剂' }, { name: '液体制剂' },
          { name: '缓释制剂' }, { name: '控释制剂' }, { name: '靶向制剂' },
          { name: '生物药剂学' }, { name: '药物代谢' }, { name: '药物分析' },
          { name: '质量标准' }, { name: 'GMP' }, { name: '药品注册' },
          { name: 'ICH指南' }, { name: '专利策略' }, { name: '药物经济学' },
          { name: '临床试验' }, { name: 'GCP' }, { name: 'GVP' },
          { name: '药事管理' }, { name: '处方审核' }, { name: '用药教育' },
        ],
      },
      {
        id: 'agriculture', label: '农学', parent: null,
        terms: [
          { name: '土壤学' }, { name: '植物营养' }, { name: '作物学' },
          { name: '育种学' }, { name: '遗传育种' }, { name: '分子育种' },
          { name: '植物保护' }, { name: '病虫害防治' }, { name: '农药学' },
          { name: '农业气象' }, { name: '灌溉排水' }, { name: '农业生态' },
          { name: '有机农业' }, { name: '精准农业' }, { name: '园艺学' },
          { name: '畜牧学' }, { name: '兽医学' }, { name: '饲料学' },
          { name: '食品科学' }, { name: '食品安全' }, { name: '食品化学' },
        ],
      },
      {
        id: 'nursing', label: '护理学', parent: null,
        terms: [
          { name: '护理程序' }, { name: '护理评估' }, { name: '护理诊断' },
          { name: '护理计划' }, { name: '护理实施' }, { name: '护理评价' },
          { name: '整体护理' }, { name: '责任制护理' }, { name: '护理管理' },
          { name: '院内感染控制' }, { name: '无菌技术' }, { name: '静脉输液' },
          { name: '伤口护理' }, { name: '疼痛管理' }, { name: '临终护理' },
          { name: '护理伦理' }, { name: '知情同意' }, { name: '护理研究' },
          { name: '循证护理' }, { name: '护理教育' }, { name: 'OSCE考核' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 5. 社会科学
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '社会科学',
    disciplines: [
      {
        id: 'economics', label: '经济学', parent: null,
        terms: [
          { name: '供需均衡' }, { name: '弹性分析' }, { name: '消费者剩余' },
          { name: '生产者剩余' }, { name: '机会成本' }, { name: '边际效用' },
          { name: '规模经济' }, { name: '垄断定价' }, { name: '寡头博弈' },
          { name: '一般均衡' }, { name: '帕累托效率' }, { name: '外部性' },
          { name: '搭便车' }, { name: '逆向选择' }, { name: '道德风险' },
          { name: 'IS-LM模型' }, { name: 'AD-AS模型' }, { name: '菲利普斯曲线' },
          { name: '奥肯定律' }, { name: '索洛增长模型' }, { name: '内生增长理论' },
          { name: '货币数量论' }, { name: '流动性陷阱' }, { name: '汇率决定' },
          { name: '购买力平价' }, { name: '丁伯根法则' }, { name: '蒙代尔三元悖论' },
        ],
      },
      {
        id: 'politics', label: '政治学', parent: null,
        terms: [
          { name: '国家起源' }, { name: '社会契约' }, { name: '主权' },
          { name: '权力分立' }, { name: '三权分立' }, { name: '联邦制' },
          { name: '单一制' }, { name: '代议民主' }, { name: '直接民主' },
          { name: '公民投票' }, { name: '政党制度' }, { name: '选举制度' },
          { name: '公共选择' }, { name: '官僚制' }, { name: '治理理论' },
          { name: '国际关系' }, { name: '现实主义' }, { name: '自由主义' },
          { name: '建构主义' }, { name: '威斯特伐利亚' }, { name: '联合国' },
          { name: '地缘政治' }, { name: '软实力' }, { name: '战略三角' },
        ],
      },
      {
        id: 'law', label: '法学', parent: null,
        terms: [
          { name: '宪法' }, { name: '公民权利' }, { name: '基本人权' },
          { name: '违宪审查' }, { name: '民法' }, { name: '物权' },
          { name: '债权' }, { name: '合同法' }, { name: '侵权法' },
          { name: '知识产权' }, { name: '专利法' }, { name: '商标法' },
          { name: '著作权' }, { name: '刑法' }, { name: '犯罪构成' },
          { name: '正当防卫' }, { name: '紧急避险' }, { name: '诉讼法' },
          { name: '证据规则' }, { name: '无罪推定' }, { name: '程序正义' },
          { name: '国际法' }, { name: '条约法' }, { name: '海洋法' },
          { name: '战争法' }, { name: '国际人权法' }, { name: '比较法' },
        ],
      },
      {
        id: 'sociology', label: '社会学', parent: null,
        terms: [
          { name: '社会分层' }, { name: '社会流动' }, { name: '社会网络' },
          { name: '社会资本' }, { name: '社会整合' }, { name: '社会控制' },
          { name: '社会失范' }, { name: '社会变迁' }, { name: '现代化' },
          { name: '全球化' }, { name: '社会运动' }, { name: '集体行动' },
          { name: '社会制度' }, { name: '功能主义' }, { name: '冲突论' },
          { name: '符号互动论' }, { name: '社会唯名论' }, { name: '社会实在论' },
          { name: '社会调查' }, { name: '社会统计' }, { name: '民族志' },
          { name: '社会想象' }, { name: '公共社会学' },
        ],
      },
      {
        id: 'anthropology', label: '人类学', parent: null,
        terms: [
          { name: '文化相对主义' }, { name: '田野调查' }, { name: '民族志方法' },
          { name: '物质文化' }, { name: '亲属制度' }, { name: '婚姻制度' },
          { name: '仪式' }, { name: '图腾' }, { name: '巫术' },
          { name: '宗教人类学' }, { name: '象征人类学' }, { name: '结构人类学' },
          { name: '人类起源' }, { name: '南方古猿' }, { name: '能人' },
          { name: '直立人' }, { name: '智人' }, { name: '文化演化' },
          { name: '生物多样性' }, { name: '人类适应性' }, { name: '生物人类学' },
        ],
      },
      {
        id: 'psychology', label: '心理学', parent: null,
        terms: [
          { name: '注意分配' }, { name: '工作记忆' }, { name: '格式塔' },
          { name: '元认知' }, { name: '认知偏差' }, { name: '框架效应' },
          { name: '锚定启发' }, { name: '自我效能' }, { name: '心流状态' },
          { name: '认知失调' }, { name: '从众行为' }, { name: '基本归因' },
          { name: '社会认同' }, { name: '操作性条件反射' }, { name: '具身认知' },
          { name: '双过程理论' }, { name: '内隐学习' }, { name: '认知负荷' },
          { name: '元分析' }, { name: '敏感期' }, { name: '依恋理论' },
          { name: '社会学习' }, { name: '自我概念' }, { name: '情绪调节' },
          { name: '压力应对' }, { name: '正念' },
        ],
      },
      {
        id: 'education', label: '教育学', parent: null,
        terms: [
          { name: '教学设计' }, { name: '课程理论' }, { name: '教学法' },
          { name: '教育技术' }, { name: '教育心理学' }, { name: '学习动机' },
          { name: '建构主义' }, { name: '联通主义' }, { name: '行为主义学习' },
          { name: '认知主义学习' }, { name: '终身学习' }, { name: '学习迁移' },
          { name: '教学评价' }, { name: '形成性评价' }, { name: '终结性评价' },
          { name: '教育公平' }, { name: '教育政策' }, { name: '比较教育' },
          { name: '高等教育' }, { name: '职业教育' }, { name: '在线教育' },
        ],
      },
      {
        id: 'management', label: '管理学', parent: null,
        terms: [
          { name: '战略管理' }, { name: '组织行为' }, { name: '人力资源管理' },
          { name: '运营管理' }, { name: '营销战略' }, { name: '财务管理' },
          { name: '管理幅度' }, { name: '组织结构' }, { name: '权变理论' },
          { name: '领导力' }, { name: '激励机制' }, { name: '委托代理' },
          { name: '目标管理' }, { name: '精益管理' }, { name: '六西格玛' },
          { name: '供应链管理' }, { name: '客户关系管理' }, { name: '知识管理' },
          { name: '创新管理' }, { name: '变革管理' }, { name: '风险管理' },
        ],
      },
      {
        id: 'finance', label: '金融学', parent: null,
        terms: [
          { name: '货币时间价值' }, { name: '贴现现金流' }, { name: '资本资产定价' },
          { name: '有效市场假说' }, { name: '套利定价' }, { name: '期权定价' },
          { name: 'Black-Scholes' }, { name: '二叉树模型' }, { name: '希腊字母' },
          { name: '在险价值' }, { name: '久期' }, { name: '凸性' },
          { name: '免疫策略' }, { name: '债券定价' }, { name: '股票估值' },
          { name: '财务报表分析' }, { name: '杜邦分析' }, { name: 'WACC' },
          { name: '资本结构' }, { name: '股利政策' }, { name: '首次公开募股' },
          { name: '并购重组' }, { name: '公司治理' }, { name: '行为金融' },
        ],
      },
      {
        id: 'military', label: '军事学', parent: null,
        terms: [
          { name: '战略' }, { name: '战术' }, { name: '战役' },
          { name: '制海权' }, { name: '制空权' }, { name: '信息化战争' },
          { name: '网络战' }, { name: '电子战' }, { name: '混合战争' },
          { name: '非对称作战' }, { name: '精确打击' }, { name: '后勤保障' },
          { name: '军事地形学' }, { name: '军事气象' }, { name: '军事情报' },
          { name: '侦察监视' }, { name: 'C4ISR' }, { name: '联合作战' },
          { name: '全域作战' }, { name: '军事战略' }, { name: '军事思想' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 6. 人文与艺术
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '人文与艺术',
    disciplines: [
      {
        id: 'philosophy', label: '哲学', parent: null,
        terms: [
          { name: '本体论' }, { name: '认识论' }, { name: '形而上学' },
          { name: '伦理学' }, { name: '美学' }, { name: '逻辑学' },
          { name: '存在主义' }, { name: '现象学' }, { name: '结构主义' },
          { name: '解构主义' }, { name: '分析哲学' }, { name: '实用主义' },
          { name: '怀疑主义' }, { name: '虚无主义' }, { name: '唯物主义' },
          { name: '唯心主义' }, { name: '二元论' }, { name: '决定论' },
          { name: '自由意志' }, { name: '身心问题' }, { name: '休谟问题' },
          { name: '康德哲学' }, { name: '先验哲学' }, { name: '实践理性' },
        ],
      },
      {
        id: 'history', label: '历史学', parent: null,
        terms: [
          { name: '史料批判' }, { name: '历史编纂学' }, { name: '年鉴学派' },
          { name: '计量史学' }, { name: '历史唯物主义' }, { name: '文明史观' },
          { name: '全球史' }, { name: '环境史' }, { name: '社会史' },
          { name: '文化史' }, { name: '思想史' }, { name: '口述史' },
          { name: '历史人类学' }, { name: '比较史学' }, { name: '历史地理学' },
          { name: '断代史' }, { name: '专门史' }, { name: '历史哲学' },
        ],
      },
      {
        id: 'literature', label: '文学', parent: null,
        terms: [
          { name: '叙事学' }, { name: '文体学' }, { name: '修辞学' },
          { name: '文学理论' }, { name: '文学批评' }, { name: '原型批评' },
          { name: '接受美学' }, { name: '读者反应' }, { name: '结构主义文论' },
          { name: '后殖民批评' }, { name: '女性主义批评' }, { name: '精神分析批评' },
          { name: '文学类型' }, { name: '象征主义' }, { name: '现实主义' },
          { name: '现代主义' }, { name: '后现代主义' }, { name: '魔幻现实主义' },
        ],
      },
      {
        id: 'linguistics', label: '语言学', parent: null,
        terms: [
          { name: '音系学' }, { name: '形态学' }, { name: '句法学' },
          { name: '语义学' }, { name: '语用学' }, { name: '社会语言学' },
          { name: '心理语言学' }, { name: '神经语言学' }, { name: '历史语言学' },
          { name: '比较语言学' }, { name: '类型学' }, { name: '语料库语言学' },
          { name: '话语分析' }, { name: '语用预设' }, { name: '会话含义' },
          { name: '言语行为' }, { name: '礼貌原则' }, { name: '语法化' },
          { name: '词汇化' }, { name: '语言接触' }, { name: '濒危语言' },
        ],
      },
      {
        id: 'religion', label: '宗教学', parent: null,
        terms: [
          { name: '比较宗教学' }, { name: '宗教人类学' }, { name: '宗教社会学' },
          { name: '宗教心理学' }, { name: '宗教现象学' }, { name: '宗教哲学' },
          { name: '世俗化' }, { name: '宗教多元论' }, { name: '宗教排他论' },
          { name: '宗教包容论' }, { name: '神圣与凡俗' }, { name: '巫术与宗教' },
        ],
      },
      {
        id: 'buddhism', label: '佛教', parent: null,
        terms: [
          { name: '四谛' }, { name: '八正道' }, { name: '十二缘起' },
          { name: '五蕴' }, { name: '无常' }, { name: '空' }, { name: '无我' },
          { name: '三法印' }, { name: '业报轮回' }, { name: '戒定慧' },
          { name: '三十七道品' }, { name: '止观双运' }, { name: '唯识' },
          { name: '中观' }, { name: '如来藏' }, { name: '佛性' },
        ],
      },
      {
        id: 'chan', label: '禅宗', parent: 'buddhism',
        terms: [
          { name: '平常心' }, { name: '不住相' }, { name: '无所得' },
          { name: '应无所住' }, { name: '生其心' }, { name: '法尚应舍' },
          { name: '言语道断' }, { name: '心行处灭' }, { name: '看话禅' },
          { name: '默照禅' }, { name: '顿悟' }, { name: '即心即佛' },
          { name: '不立文字' }, { name: '活在当下' }, { name: '自性清净' },
          { name: '万法唯心' }, { name: '破三关' }, { name: '保任' },
        ],
      },
      {
        id: 'yogacara', label: '唯识宗', parent: 'buddhism',
        terms: [
          { name: '阿赖耶识' }, { name: '末那识' }, { name: '我法二执' },
          { name: '三能变' }, { name: '四分说' }, { name: '相见二分' },
          { name: '种现熏生' }, { name: '转识成智' }, { name: '万法唯识' },
          { name: '三界唯心' }, { name: '能所对立' }, { name: '遍计所执' },
          { name: '依他起性' }, { name: '圆成实性' }, { name: '法相' },
          { name: '五位百法' }, { name: '三自性' },
        ],
      },
      {
        id: 'pureland', label: '净土宗', parent: 'buddhism',
        terms: [
          { name: '信愿行' }, { name: '极乐净土' }, { name: '名号功德' },
          { name: '三辈九品' }, { name: '带业往生' }, { name: '不退转位' },
          { name: '临终助念' }, { name: '一念往生' }, { name: '往生咒' },
          { name: '阿弥陀佛' }, { name: '观想念佛' }, { name: '持名念佛' },
          { name: '感应道交' }, { name: '凡夫入报' }, { name: '易行道' },
          { name: '难行道' }, { name: '他力本愿' },
        ],
      },
      {
        id: 'daoism', label: '道教', parent: null,
        terms: [
          { name: '道法自然' }, { name: '无为而治' }, { name: '道生一' },
          { name: '返朴归真' }, { name: '性命双修' }, { name: '炼精化气' },
          { name: '炼气化神' }, { name: '炼神还虚' }, { name: '内丹' },
          { name: '外丹' }, { name: '符箓' }, { name: '斋醮' },
          { name: '天师道' }, { name: '全真道' }, { name: '正一道' },
          { name: '道教神仙' }, { name: '洞天福地' }, { name: '积功累德' },
        ],
      },
      {
        id: 'christianity', label: '基督教', parent: null,
        terms: [
          { name: '三位一体' }, { name: '原罪' }, { name: '救赎' },
          { name: '因信称义' }, { name: '预定论' }, { name: '恩典' },
          { name: '圣礼' }, { name: '洗礼' }, { name: '圣餐' },
          { name: '教会论' }, { name: '末世论' }, { name: '千禧年' },
          { name: '神正论' }, { name: '经院哲学' }, { name: '托马斯主义' },
          { name: '宗教改革' }, { name: '加尔文主义' }, { name: '路德主义' },
        ],
      },
      {
        id: 'islam', label: '伊斯兰教', parent: null,
        terms: [
          { name: '认主学' }, { name: '六大信仰' }, { name: '五功' },
          { name: '念功' }, { name: '礼功' }, { name: '斋功' },
          { name: '课功' }, { name: '朝功' }, { name: '古兰经' },
          { name: '圣训' }, { name: '沙里亚法' }, { name: '伊玛目' },
          { name: '逊尼派' }, { name: '什叶派' }, { name: '苏菲派' },
          { name: '吉哈德' }, { name: '乌玛' }, { name: '末日审判' },
        ],
      },
      {
        id: 'art', label: '艺术学', parent: null,
        terms: [
          { name: '艺术哲学' }, { name: '艺术自律' }, { name: '艺术他律' },
          { name: '审美经验' }, { name: '审美价值' }, { name: '形式美' },
          { name: '意境' }, { name: '气韵' }, { name: '留白' },
          { name: '肌理' }, { name: '构图' }, { name: '色彩学' },
          { name: '透视法' }, { name: '解构主义艺术' }, { name: '前卫艺术' },
          { name: '艺术市场' }, { name: '策展' }, { name: '艺术批评' },
        ],
      },
      {
        id: 'music', label: '音乐学', parent: null,
        terms: [
          { name: '和声学' }, { name: '对位法' }, { name: '曲式学' },
          { name: '配器法' }, { name: '音阶' }, { name: '调式' },
          { name: '节奏' }, { name: '旋律' }, { name: '织体' },
          { name: '动机发展' }, { name: '主题变形' }, { name: '奏鸣曲式' },
          { name: '赋格' }, { name: '无调性' }, { name: '十二音列' },
          { name: '序列音乐' }, { name: '电子音乐' }, { name: '民族音乐学' },
        ],
      },
      {
        id: 'film', label: '电影学', parent: null,
        terms: [
          { name: '场面调度' }, { name: '景别' }, { name: '镜头语言' },
          { name: '蒙太奇' }, { name: '长镜头' }, { name: '场面转换' },
          { name: '电影符号学' }, { name: '意识形态批评' }, { name: '作者论' },
          { name: '缝合体系' }, { name: '凝视理论' }, { name: '第三电影' },
          { name: '新好莱坞' }, { name: '电影叙事学' }, { name: '剪辑' },
          { name: '声音设计' }, { name: '视觉特效' }, { name: '电影产业' },
        ],
      },
      {
        id: 'journalism', label: '新闻传播学', parent: null,
        terms: [
          { name: '新闻价值' }, { name: '把关人理论' }, { name: '议程设置' },
          { name: '框架理论' }, { name: '舆论' }, { name: '新闻专业主义' },
          { name: '公共领域' }, { name: '媒介融合' }, { name: '融媒体' },
          { name: '短视频' }, { name: '算法推荐' }, { name: '信息茧房' },
          { name: '假新闻' }, { name: '后真相' }, { name: '健康传播' },
          { name: '危机传播' }, { name: '国际传播' }, { name: '跨文化传播' },
        ],
      },
      {
        id: 'archaeology', label: '考古学', parent: null,
        terms: [
          { name: '田野考古' }, { name: '地层学' }, { name: '类型学' },
          { name: '年代测定' }, { name: '碳14测年' }, { name: '热释光测年' },
          { name: '体质人类学' }, { name: '动物考古' }, { name: '植物考古' },
          { name: '环境考古' }, { name: '水下考古' }, { name: '科技考古' },
          { name: 'DNA考古' }, { name: '考古阐释' }, { name: '公众考古' },
          { name: '世界遗产' }, { name: '文物保护' }, { name: '考古伦理' },
        ],
      },
      {
        id: 'geography', label: '地理学', parent: null,
        terms: [
          { name: 'GIS' }, { name: '制图学' }, { name: '自然地理学' },
          { name: '人文地理学' }, { name: '人口地理学' }, { name: '城市地理学' },
          { name: '经济地理学' }, { name: '政治地理学' }, { name: '文化地理学' },
          { name: '行为地理学' }, { name: '空间分析' }, { name: '遥感' },
          { name: '气候变化' }, { name: '流域研究' }, { name: '冰川学' },
          { name: '荒漠化' }, { name: '海岸地貌' }, { name: '地貌学' },
        ],
      },
      {
        id: 'envstudy', label: '环境科学', parent: null,
        terms: [
          { name: '生态系统' }, { name: '生态足迹' }, { name: '生物圈' },
          { name: '可持续发展' }, { name: '碳循环' }, { name: '氮循环' },
          { name: '水循环' }, { name: '富营养化' }, { name: '生物多样性' },
          { name: '物种入侵' }, { name: '气候变化' }, { name: '温室效应' },
          { name: '辐射强迫' }, { name: '临界点' }, { name: '行星边界' },
          { name: '循环经济' }, { name: '生命周期评价' }, { name: '环境政策' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  // 7. 交叉学科
  // ═══════════════════════════════════════════════════════════════════
  {
    name: '交叉学科',
    disciplines: [
      {
        id: 'cognitivesci', label: '认知科学', parent: null,
        terms: [
          { name: '具身认知' }, { name: '扩展心灵' }, { name: '嵌入式认知' },
          { name: '生成认知' }, { name: '预测加工' }, { name: '主动推理' },
          { name: '执行功能' }, { name: '工作记忆容量' }, { name: '认知架构' },
          { name: '联结主义' }, { name: '符号主义' }, { name: '混合智能' },
          { name: '认知神经科学' }, { name: '计算认知科学' }, { name: '认知语言学' },
          { name: '认知哲学' }, { name: '心智理论' }, { name: '意向性' },
        ],
      },
      {
        id: 'compneurosci', label: '计算神经科学', parent: null,
        terms: [
          { name: '神经编码' }, { name: '神经振荡' }, { name: '同步爆发' },
          { name: '默认模式网络' }, { name: '神经群体编码' }, { name: '稀疏编码' },
          { name: '能量编码' }, { name: '时间编码' }, { name: '信息几何' },
          { name: '神经场论' }, { name: '平均场近似' }, { name: '相变分析' },
          { name: '临界大脑假说' }, { name: '神经形态计算' }, { name: '脉冲神经网络' },
          { name: '神经调制剂' }, { name: '神经可塑性' }, { name: '锋电位时序' },
        ],
      },
      {
        id: 'bioinfomatics', label: '生物信息学', parent: null,
        terms: [
          { name: '序列比对' }, { name: 'BLAST' }, { name: '序列比对' },
          { name: '基因注释' }, { name: '蛋白质结构预测' }, { name: 'AlphaFold' },
          { name: '系统发育树' }, { name: '基因组组装' }, { name: '转录组分析' },
          { name: '富集分析' }, { name: 'PPI网络' }, { name: '单细胞测序' },
          { name: '表观组学' }, { name: '宏基因组' }, { name: 'CRISPR' },
          { name: '基因编辑' }, { name: '精准医疗' }, { name: '药物重定位' },
        ],
      },
      {
        id: 'econophysics', label: '经济物理学', parent: null,
        terms: [
          { name: '幂律分布' }, { name: '临界现象' }, { name: '自相似性' },
          { name: '相变临界' }, { name: '风险价值' }, { name: '市场微观结构' },
          { name: '订单簿动力学' }, { name: '价格冲击' }, { name: '流动性' },
          { name: '羊群行为' }, { name: '意见动力学' }, { name: '渗流模型' },
          { name: '复杂网络' }, { name: '社团结构' }, { name: '系统风险' },
          { name: '金融危机' }, { name: '去相关' }, { name: '长程关联' },
        ],
      },
      {
        id: 'econometrics', label: '计量经济学', parent: null,
        terms: [
          { name: '回归分析' }, { name: '工具变量' }, { name: '两阶段最小二乘' },
          { name: '广义矩估计' }, { name: '极大似然估计' }, { name: '协整' },
          { name: '误差修正模型' }, { name: '面板数据' }, { name: '固定效应' },
          { name: '随机效应' }, { name: '双重差分' }, { name: '断点回归' },
          { name: '倾向得分匹配' }, { name: '合成控制' }, { name: '因果推断' },
          { name: '结构估计' }, { name: '动态规划' }, { name: '随机最优控制' },
        ],
      },
      {
        id: 'psycolinguistics', label: '心理语言学', parent: null,
        terms: [
          { name: '言语知觉' }, { name: '句子理解' }, { name: '词汇通达' },
          { name: '句子加工' }, { name: '语篇理解' }, { name: '心理词典' },
          { name: '语义网络' }, { name: '工作记忆与语言' }, { name: '双语加工' },
          { name: '第二语言习得' }, { name: '语言迁移' }, { name: '临界期' },
          { name: '阅读眼动' }, { name: 'ERP研究' }, { name: '失语症' },
          { name: '语言障碍' }, { name: '自闭症语言' }, { name: '语言演化' },
        ],
      },
      {
        id: 'quantuminfo', label: '量子信息', parent: null,
        terms: [
          { name: '量子比特' }, { name: '量子纠缠' }, { name: '量子门' },
          { name: '量子电路' }, { name: '量子隐形传态' }, { name: '量子密钥分发' },
          { name: '量子编码' }, { name: '量子纠错' }, { name: '容错量子计算' },
          { name: '量子算法' }, { name: 'Shor算法' }, { name: 'Grover算法' },
          { name: '量子模拟' }, { name: '量子机器学习' }, { name: '量子复杂性' },
          { name: '量子香农理论' }, { name: '量子互信息' }, { name: '量子资源理论' },
        ],
      },
      {
        id: 'synbio', label: '合成生物学', parent: null,
        terms: [
          { name: '基因线路' }, { name: '生物砖' }, { name: '模块化设计' },
          { name: '标准化' }, { name: '底盘生物' }, { name: 'CRISPR基因编辑' },
          { name: '蛋白质工程' }, { name: '酶工程' }, { name: '代谢工程' },
          { name: '系统代谢工程' }, { name: '定向进化' }, { name: '理性设计' },
          { name: '基因回路' }, { name: '布尔逻辑门' }, { name: '传感生物' },
          { name: '细胞疗法' }, { name: '活体药物' }, { name: '生物制造' },
        ],
      },
      {
        id: 'complexnetworks', label: '复杂网络', parent: null,
        terms: [
          { name: '小世界网络' }, { name: '无标度网络' }, { name: '网络鲁棒性' },
          { name: '级联失效' }, { name: '网络可控性' }, { name: '网络同步' },
          { name: '社团检测' }, { name: '链路预测' }, { name: '网络传播' },
          { name: '流行病传播' }, { name: '渗流相变' }, { name: '多层网络' },
          { name: '时变网络' }, { name: '网络几何学' }, { name: '网络信息论' },
          { name: '图神经网络' }, { name: '网络科学方法' }, { name: '涌现动力学' },
        ],
      },
      {
        id: 'climate', label: '气候科学', parent: null,
        terms: [
          { name: '辐射强迫' }, { name: '气候反馈' }, { name: '温室效应' },
          { name: '气候敏感度' }, { name: '碳预算' }, { name: '临界点' },
          { name: '厄尔尼诺' }, { name: '拉尼娜' }, { name: 'PDO' },
          { name: 'AMOC' }, { name: '海平面上升' }, { name: '北极放大效应' },
          { name: '气溶胶效应' }, { name: '云反馈' }, { name: '冰盖动力学' },
          { name: '古气候' }, { name: '气候预估' }, { name: '气候变化归因' },
          { name: '1.5度目标' }, { name: '净零排放' }, { name: '碳中和' },
        ],
      },
      {
        id: 'neuroeconomics', label: '神经经济学', parent: null,
        terms: [
          { name: '奖励预测误差' }, { name: '多巴胺信号' }, { name: '时间折扣' },
          { name: '眶额皮层' }, { name: '前额叶' }, { name: '伏隔核' },
          { name: '风险决策' }, { name: '损失厌恶' }, { name: '框架效应神经' },
          { name: '社会决策' }, { name: '信任博弈' }, { name: '最后通牒博弈' },
          { name: '理性选择神经基础' }, { name: '自由意志神经基础' }, { name: '成瘾神经机制' },
          { name: '认知控制' }, { name: '元认知神经机制' },
        ],
      },
    ],
  },
];
// ─────────────────────────────────────────────────────────────────────────────

function buildFlatList(): string[] {
  return MESSAGES.flatMap((l) =>
    l.disciplines.flatMap((d) => d.terms.map((t) => t.name))
  );
}

export const brandCarousel = (() => {
  let timer: ReturnType<typeof setInterval> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let opts: Required<CarouselOptions> = { ...DEFAULT_OPTIONS };
  let flat: string[] = [];
  let idx = 0;
  let running = false;

  function nextIdx(): number {
    if (flat.length <= 1) return 0;
    let next = Math.floor(Math.random() * flat.length);
    if (next === idx) next = (next + 1) % flat.length;
    return next;
  }

  function cycle(): void {
    const el = document.getElementById(opts.textId);
    if (!el) return;

    el.classList.add('is-hidden');
    if (fadeTimer !== null) clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => {
      idx = nextIdx();
      el.textContent = flat[idx];
      el.classList.remove('is-hidden');
    }, opts.fadeMs);
  }

  return {
    start(opt?: CarouselOptions): void {
      if (running) return;
      opts = { ...DEFAULT_OPTIONS, ...opt };
      flat = buildFlatList();

      const el = document.getElementById(opts.textId);
      if (!el) return;

      idx = nextIdx();
      el.textContent = flat[idx];
      el.classList.remove('is-hidden');

      el.style.background = opts.gradient;
      el.style.webkitBackgroundClip = 'text';
      el.style.backgroundClip = 'text';
      el.style.webkitTextFillColor = 'transparent';

      timer = setInterval(cycle, opts.showMs + opts.fadeMs);
      running = true;
    },

    stop(): void {
      if (timer !== null) { clearInterval(timer); timer = null; }
      if (fadeTimer !== null) { clearTimeout(fadeTimer); fadeTimer = null; }
      running = false;
    },

    setMessages(groups: DisciplineLayer[]): void {
      const newFlat = groups.flatMap((l) =>
        l.disciplines.flatMap((d) => d.terms.map((t) => t.name))
      );
      if (idx >= newFlat.length) idx = 0;
      flat = newFlat;
      const el = document.getElementById(opts.textId);
      if (el) el.textContent = flat[idx];
    },

    setDiscipline(id: string): void {
      const node = MESSAGES.flatMap((l) => l.disciplines).find((d) => d.id === id);
      if (node) {
        const newFlat = node.terms.map((t) => t.name);
        if (idx >= newFlat.length) idx = 0;
        flat = newFlat;
        const el = document.getElementById(opts.textId);
        if (el) el.textContent = flat[idx];
      }
    },

    setLayer(name: string): void {
      const layer = MESSAGES.find((l) => l.name === name);
      if (layer) this.setMessages([layer]);
    },

    isRunning(): boolean {
      return running;
    },

    getGroups(): DisciplineLayer[] {
      return MESSAGES;
    },
  };
})();
